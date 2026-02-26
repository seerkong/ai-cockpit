import { OpenCodeClient } from './opencode-client'
import { spawnOpenCodeServer, type OpenCodeServerInfo } from './opencode-server'
import { OpenCodeLocalProvider } from './providers/opencode-local'
import { OpenCodeLocalPortProvider } from './providers/opencode-local-port'
import type { WorkspaceProvider } from './providers/types'
import { SqliteStore } from './storage/sqlite'
import { ulid } from './ulid'

export type WorkspaceState = {
  id: string
  token: string
  directory: string
  createdAt: number
  connectionSeq?: number
  connectionMode: 'spawn' | 'port'
  serverPort?: number
  provider: WorkspaceProvider
  server?: OpenCodeServerInfo
  client: OpenCodeClient
  eventControllers: Set<AbortController>
}

export type ConnectionInstanceState = {
  id: string
  workspaceId: string
  directory: string
  label: string
  mode: 'spawn' | 'port'
  status: 'idle' | 'busy'
  serverPort?: number
}

export class WorkspaceRegistry {
  constructor(private store?: SqliteStore) {}

  private byId = new Map<string, WorkspaceState>()
  private byToken = new Map<string, WorkspaceState>()
  private nextConnectionSeq = 0
  private sessionBindingsByDirectory = new Map<string, Map<string, string>>()

  // Session runtime status is derived from OpenCode SSE events.
  // We track this per workspace directory group so connection status can reflect
  // "dialogue in progress" instead of simply "bound".
  private sessionStatusByDirectory = new Map<string, Map<string, 'idle' | 'busy' | 'retry' | 'error'>>()
  private directoryStatusStream = new Map<string, AbortController>()

  private bindingsForDirectory(directory: string): Map<string, string> {
    let map = this.sessionBindingsByDirectory.get(directory)
    if (!map) {
      map = new Map<string, string>()
      this.sessionBindingsByDirectory.set(directory, map)
    }
    return map
  }

  private sessionStatusForDirectory(directory: string): Map<string, 'idle' | 'busy' | 'retry' | 'error'> {
    let map = this.sessionStatusByDirectory.get(directory)
    if (!map) {
      map = new Map<string, 'idle' | 'busy' | 'retry' | 'error'>()
      this.sessionStatusByDirectory.set(directory, map)
    }
    return map
  }

  private extractSessionIdFromSseEvent(evt: unknown): string | null {
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) return null
    const rec = evt as Record<string, unknown>
    const type = typeof rec.type === 'string' ? rec.type : ''
    if (!type.startsWith('session.')) return null
    const props = rec.properties
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null
    const sessionId = (props as Record<string, unknown>).sessionID
    return typeof sessionId === 'string' && sessionId ? sessionId : null
  }

  private applySessionStatusEvent(directory: string, evt: unknown) {
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) return
    const rec = evt as Record<string, unknown>
    const type = typeof rec.type === 'string' ? rec.type : ''
    const sessionId = this.extractSessionIdFromSseEvent(evt)
    if (!sessionId) return

    const props = rec.properties
    const statusMap = this.sessionStatusForDirectory(directory)

    if (type === 'session.status') {
      if (!props || typeof props !== 'object' || Array.isArray(props)) return
      const status = (props as Record<string, unknown>).status
      if (!status || typeof status !== 'object' || Array.isArray(status)) return
      const statusType = (status as Record<string, unknown>).type
      const next = typeof statusType === 'string' ? statusType : ''
      if (next === 'busy' || next === 'retry') {
        statusMap.set(sessionId, next)
      }
      return
    }

    if (type === 'session.idle') {
      statusMap.set(sessionId, 'idle')
      return
    }

    if (type === 'session.error') {
      statusMap.set(sessionId, 'error')
      return
    }
  }

  private async runDirectoryStatusStream(directory: string, provider: WorkspaceProvider, signal: AbortSignal) {
    const headers = new Headers()
    headers.set('Accept', 'text/event-stream')
    const decoder = new TextDecoder()

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    while (!signal.aborted) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      try {
        const proxyReqUrl = new URL('http://realtime.local/event')
        proxyReqUrl.searchParams.set('directory', directory)
        const upstreamReq = new Request(proxyReqUrl.toString(), {
          method: 'GET',
          headers,
          signal,
        })

        const upstreamResp = await provider.proxy(upstreamReq, '/event').catch(() => null)
        if (!upstreamResp || !upstreamResp.ok || !upstreamResp.body) {
          await sleep(250)
          continue
        }

        reader = upstreamResp.body.getReader()
        let buffer = ''
        let eventData = ''

        while (!signal.aborted) {
          let done = false
          let value: Uint8Array | undefined
          try {
            const read = await reader.read()
            done = read.done
            value = read.value
          } catch {
            done = true
            value = undefined
          }

          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              eventData += line.slice('data: '.length)
              continue
            }
            if (line === '' && eventData) {
              let parsed: unknown | null = null
              try {
                parsed = JSON.parse(eventData)
              } catch {
                parsed = null
              }
              eventData = ''
              if (!parsed) continue
              this.applySessionStatusEvent(directory, parsed)
            }
          }
        }
      } catch {
        // ignore and retry
      } finally {
        try {
          await reader?.cancel()
        } catch {
          // ignore
        }
        try {
          reader?.releaseLock()
        } catch {
          // ignore
        }
      }

      await sleep(250)
    }
  }

  private ensureDirectoryStatusStream(directory: string) {
    if (this.directoryStatusStream.has(directory)) return
    const anchor = this.listDirectoryConnections(directory)[0]
    if (!anchor) return

    const abortController = new AbortController()
    this.directoryStatusStream.set(directory, abortController)

    void this
      .runDirectoryStatusStream(directory, anchor.provider, abortController.signal)
      .finally(() => {
        const current = this.directoryStatusStream.get(directory)
        if (current === abortController) {
          this.directoryStatusStream.delete(directory)
        }
      })
  }

  private removeConnectionBindings(directory: string, connectionId: string) {
    const map = this.sessionBindingsByDirectory.get(directory)
    if (!map) return
    for (const [sessionId, boundConnectionId] of map.entries()) {
      if (boundConnectionId === connectionId) {
        map.delete(sessionId)
      }
    }
    if (map.size === 0) {
      this.sessionBindingsByDirectory.delete(directory)
    }
  }

  private ensureConnectionSeq(entry: WorkspaceState): number {
    const seq = Number(entry.connectionSeq)
    if (Number.isInteger(seq) && seq > 0) {
      if (seq > this.nextConnectionSeq) this.nextConnectionSeq = seq
      return seq
    }
    this.nextConnectionSeq += 1
    entry.connectionSeq = this.nextConnectionSeq
    return this.nextConnectionSeq
  }

  private listDirectoryConnections(directory: string): WorkspaceState[] {
    return Array.from(this.byId.values())
      .filter((entry) => entry.directory === directory)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  private listSpawnConnections(directory: string): WorkspaceState[] {
    return Array.from(this.byId.values())
      .filter((entry) => entry.connectionMode === 'spawn' && entry.directory === directory)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  private listPortConnections(serverPort: number): WorkspaceState[] {
    return Array.from(this.byId.values())
      .filter((entry) => entry.connectionMode === 'port' && entry.serverPort === serverPort)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async connectLocal(directory: string, options?: { autoApprove?: boolean; forceNew?: boolean }) {
    const trimmed = directory.trim()
    if (!trimmed) {
      throw new Error('workspace required')
    }

    // Reuse existing spawn connection by workspace directory.
    // This keeps connect idempotent and prevents duplicate runtime connections
    // when users click create multiple times or reconnect without clearing state.
    if (!options?.forceNew) {
      const existing = this.listSpawnConnections(trimmed)
      if (existing.length > 0) {
        const primary = existing[0]
        for (const duplicate of existing.slice(1)) {
          this.disconnect(duplicate.id)
        }
        this.ensureConnectionSeq(primary)
        this.ensureDirectoryStatusStream(primary.directory)
        return primary
      }
    }

    if (this.store) {
      // Preserve workspace directory in persistence while each live connection keeps its own runtime id.
      this.store.upsertWorkspace(trimmed)
    }
    const id = ulid()
    const token = ulid()
    const connectionSeq = ++this.nextConnectionSeq

    const server = await spawnOpenCodeServer(trimmed, { autoApprove: options?.autoApprove })
    const client = new OpenCodeClient({
      baseUrl: server.baseUrl,
      directory: trimmed,
      serverPassword: server.serverPassword,
    })

    const healthy = await client.waitForHealth(300000)
    if (!healthy) {
      try {
        server.process.kill()
      } catch {
        // ignore cleanup errors
      }
      throw new Error('OpenCode server failed health check')
    }

    const provider = new OpenCodeLocalProvider({ directory: trimmed, server })
    const ws: WorkspaceState = {
      id,
      token,
      directory: trimmed,
      createdAt: Date.now(),
      connectionSeq,
      connectionMode: 'spawn',
      provider,
      server,
      client,
      eventControllers: new Set(),
    }

    this.byId.set(id, ws)
    this.byToken.set(token, ws)
    this.ensureDirectoryStatusStream(ws.directory)
    return ws
  }

  async connectLocalPort(directory: string, port: number, options?: { forceNew?: boolean }) {
    const trimmed = directory.trim()
    if (!trimmed) {
      throw new Error('workspace required')
    }
    const p = Number(port)
    if (!Number.isInteger(p) || p <= 0 || p > 65535) {
      throw new Error('invalid server port')
    }

    // Reuse existing port connection by endpoint (127.0.0.1:port).
    // This avoids duplicate runtime connections for the same OpenCode server.
    if (!options?.forceNew) {
      const existing = this.listPortConnections(p)
      if (existing.length > 0) {
        const primary = existing[0]
        for (const duplicate of existing.slice(1)) {
          this.disconnect(duplicate.id)
        }
        this.ensureConnectionSeq(primary)
        this.ensureDirectoryStatusStream(primary.directory)
        return primary
      }
    }

    if (this.store) {
      this.store.upsertWorkspace(trimmed)
    }
    const id = ulid()
    const token = ulid()
    const connectionSeq = ++this.nextConnectionSeq

    const baseUrl = `http://127.0.0.1:${p}`
    const client = new OpenCodeClient({ baseUrl, directory: trimmed, serverPassword: '' })
    const healthy = await client.waitForHealth()
    if (!healthy) {
      throw new Error('OpenCode server failed health check')
    }

    const provider = new OpenCodeLocalPortProvider({ directory: trimmed, baseUrl })
    const ws: WorkspaceState = {
      id,
      token,
      directory: trimmed,
      createdAt: Date.now(),
      connectionSeq,
      connectionMode: 'port',
      serverPort: p,
      provider,
      client,
      eventControllers: new Set(),
    }

    this.byId.set(id, ws)
    this.byToken.set(token, ws)
    this.ensureDirectoryStatusStream(ws.directory)
    return ws
  }

  list() {
    return Array.from(this.byId.values()).sort((a, b) => a.createdAt - b.createdAt)
  }

  listConnections(workspaceId: string): ConnectionInstanceState[] {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return []

    // Keep a lightweight status stream running so we can expose connection "Active" only
    // while a bound session is actually processing.
    this.ensureDirectoryStatusStream(anchor.directory)

    const byDirectory = this.listDirectoryConnections(anchor.directory)
    const bindings = this.bindingsForDirectory(anchor.directory)
    const status = this.sessionStatusByDirectory.get(anchor.directory)
    const busyConnectionIds = new Set<string>()
    if (status && bindings.size > 0) {
      for (const [sessionId, connectionId] of bindings.entries()) {
        const s = status.get(sessionId)
        if (s === 'busy' || s === 'retry') {
          busyConnectionIds.add(connectionId)
        }
      }
    }

    return byDirectory.map((conn) => ({
      id: conn.id,
      workspaceId: conn.id,
      directory: conn.directory,
      label: `conn-${this.ensureConnectionSeq(conn)}`,
      mode: conn.connectionMode,
      status: busyConnectionIds.has(conn.id) ? 'busy' : 'idle',
      serverPort: conn.serverPort,
    }))
  }

  async createConnection(
    workspaceId: string,
    input: { mode: 'spawn' | 'port'; autoApprove?: boolean; serverPort?: number },
  ): Promise<WorkspaceState> {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) throw new Error('workspace not found')

    if (input.mode === 'port') {
      const serverPort = Number(input.serverPort)
      if (!Number.isInteger(serverPort) || serverPort <= 0 || serverPort > 65535) {
        throw new Error('invalid server port')
      }
      return this.connectLocalPort(anchor.directory, serverPort, { forceNew: true })
    }

    return this.connectLocal(anchor.directory, { autoApprove: input.autoApprove, forceNew: true })
  }

  disconnectConnection(workspaceId: string, connectionId: string): boolean {
    const anchor = this.byId.get(workspaceId)
    const target = this.byId.get(connectionId)
    if (!anchor || !target) return false
    if (anchor.directory !== target.directory) return false
    this.removeConnectionBindings(anchor.directory, connectionId)
    return this.disconnect(connectionId)
  }

  bindSession(workspaceId: string, sessionId: string, connectionId: string): { ok: boolean; error?: string } {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return { ok: false, error: 'workspace not found' }
    const target = this.byId.get(connectionId)
    if (!target || target.directory !== anchor.directory) {
      return { ok: false, error: 'connection not found in workspace group' }
    }
    if (!sessionId) return { ok: false, error: 'sessionId required' }

    const bindings = this.bindingsForDirectory(anchor.directory)
    bindings.set(sessionId, connectionId)
    return { ok: true }
  }

  unbindSession(workspaceId: string, sessionId: string): boolean {
    const anchor = this.byId.get(workspaceId)
    if (!anchor || !sessionId) return false

    const bindings = this.bindingsForDirectory(anchor.directory)
    const removed = bindings.delete(sessionId)
    if (bindings.size === 0) {
      this.sessionBindingsByDirectory.delete(anchor.directory)
    }
    return removed
  }

  getSessionBindings(workspaceId: string): Record<string, string> {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return {}
    const bindings = this.bindingsForDirectory(anchor.directory)
    return Object.fromEntries(bindings.entries())
  }

  resolveSessionWorkspace(workspaceId: string, sessionId: string): WorkspaceState | null {
    const anchor = this.byId.get(workspaceId)
    if (!anchor || !sessionId) return null

    const bindings = this.bindingsForDirectory(anchor.directory)
    const connectionId = bindings.get(sessionId)
    if (!connectionId) return null

    const target = this.byId.get(connectionId)
    if (!target || target.directory !== anchor.directory) return null
    return target
  }

  getById(id: string) {
    return this.byId.get(id)
  }

  getByToken(token: string) {
    return this.byToken.get(token)
  }

  disconnect(id: string) {
    const ws = this.byId.get(id)
    if (!ws) return false

    const directory = ws.directory

    // Abort any in-flight SSE proxy streams.
    try {
      for (const ctrl of ws.eventControllers) {
        ctrl.abort()
      }
      ws.eventControllers.clear()
    } catch {
      // ignore
    }

    try {
      ws.client.stopEventStream()
    } catch {
      // ignore cleanup errors
    }
    try {
      ws.provider.dispose()
    } catch {
      // ignore cleanup errors
    }

    this.byId.delete(id)
    this.byToken.delete(ws.token)
    this.removeConnectionBindings(ws.directory, id)

    // If this is the last live connection in the directory group, stop the status stream.
    const stillHasDirectoryConnections = Array.from(this.byId.values()).some((entry) => entry.directory === directory)
    if (!stillHasDirectoryConnections) {
      const ctrl = this.directoryStatusStream.get(directory)
      if (ctrl) {
        try {
          ctrl.abort()
        } catch {
          // ignore
        }
      }
      this.directoryStatusStream.delete(directory)
      this.sessionStatusByDirectory.delete(directory)
    }
    return true
  }

  cleanupExpired(maxAgeMs: number) {
    const now = Date.now()
    for (const ws of this.byId.values()) {
      const ageMs = now - ws.createdAt
      if (ageMs > maxAgeMs) {
        this.disconnect(ws.id)
      }
    }
  }
}

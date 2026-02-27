import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createFetchHandler, getSessionToken, type WorkspaceRecord, type WorkspaceRegistryLike } from './app'
import type { ProviderCapabilities, WorkspaceProvider } from './providers/types'

type StubProxyCall = { method: string; targetPath: string; url: string; bodyText?: string }
type StubProvider = WorkspaceProvider & { calls: StubProxyCall[] }

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createStubProvider(directory: string, overrides: Partial<ProviderCapabilities> = {}): StubProvider {
  const calls: StubProxyCall[] = []
  const capabilities: ProviderCapabilities = {
    chat: true,
    events: true,
    reviewDiffs: true,
    inlineComments: true,
    fileRead: true,
    fileSearch: true,
    commands: true,
    agents: true,
    models: true,
    permissions: true,
    questions: true,
    ...overrides,
  }

  return {
    providerType: 'opencode.local',
    directory,
    capabilities,
    calls,
    async request() {
      return new Response('not-implemented', { status: 501 })
    },
    async proxy(req: Request, targetPath: string) {
      const method = req.method.toUpperCase()
      const bodyText = method === 'GET' || method === 'HEAD' ? undefined : await req.text().catch(() => '')
      calls.push({ method, targetPath, url: req.url, bodyText })

      if (targetPath === '/session' && req.method === 'GET') return jsonOk([{ id: 'sess_1' }, { id: 'sess_2' }])
      if (targetPath === '/session' && req.method === 'POST') return jsonOk({ id: 'sess_new' })

      const messageListMatch = targetPath.match(/^\/session\/([^/]+)\/message$/)
      if (messageListMatch) {
        const sessionId = messageListMatch[1] ?? ''
        if (req.method === 'GET') {
          return jsonOk([
            {
              info: {
                id: 'msg_1',
                sessionID: sessionId,
                role: 'assistant',
                time: { created: Date.now() },
              },
              parts: [{ id: 'part_1', type: 'text', text: 'hello' }],
            },
          ])
        }
        if (req.method === 'POST') {
          return jsonOk({
            info: {
              id: 'msg_new',
              sessionID: sessionId,
              role: 'assistant',
              time: { created: Date.now() },
            },
            parts: [],
          })
        }
      }

      const abortMatch = targetPath.match(/^\/session\/([^/]+)\/abort$/)
      if (abortMatch && req.method === 'POST') {
        return jsonOk(true)
      }

      const commandMatch = targetPath.match(/^\/session\/([^/]+)\/command$/)
      if (commandMatch && req.method === 'POST') {
        const sessionId = commandMatch[1] ?? ''
        return jsonOk({
          info: {
            id: 'msg_cmd',
            sessionID: sessionId,
            role: 'assistant',
            time: { created: Date.now() },
          },
          parts: [],
        })
      }

      const shellMatch = targetPath.match(/^\/session\/([^/]+)\/shell$/)
      if (shellMatch && req.method === 'POST') {
        const sessionId = shellMatch[1] ?? ''
        return jsonOk({
          id: 'msg_shell',
          sessionID: sessionId,
          role: 'assistant',
          time: { created: Date.now() },
        })
      }

      const permissionMatch = targetPath.match(/^\/session\/([^/]+)\/permissions\/([^/]+)$/)
      if (permissionMatch && req.method === 'POST') {
        let body = {}
        try {
          body = bodyText ? JSON.parse(bodyText) : {}
        } catch {
          body = {}
        }
        return jsonOk(body)
      }

      if (targetPath === '/permission' && req.method === 'GET') {
        return jsonOk([])
      }

      if (targetPath === '/question' && req.method === 'GET') {
        return jsonOk([])
      }

      if (targetPath === '/provider' && req.method === 'GET') {
        return jsonOk({ all: [] })
      }

      if (targetPath === '/agent' && req.method === 'GET') {
        return jsonOk([])
      }

      if (targetPath === '/command' && req.method === 'GET') {
        return jsonOk([])
      }

      const questionReplyMatch = targetPath.match(/^\/question\/([^/]+)\/reply$/)
      if (questionReplyMatch && req.method === 'POST') {
        let body = {}
        try {
          body = bodyText ? JSON.parse(bodyText) : {}
        } catch {
          body = {}
        }
        return jsonOk(body)
      }

      const questionRejectMatch = targetPath.match(/^\/question\/([^/]+)\/reject$/)
      if (questionRejectMatch && req.method === 'POST') {
        return jsonOk(true)
      }

      if (targetPath === '/event' && req.method === 'GET') {
        // Minimal SSE stream: multiple message.part.updated events that should be coalesced.
        const body =
          'data: ' +
          JSON.stringify({
            type: 'message.part.updated',
            properties: { part: { id: 'part_1', messageID: 'msg_1', text: 'h' }, delta: 'a' },
          }) +
          '\n\n' +
          'data: ' +
          JSON.stringify({
            type: 'message.part.updated',
            properties: { part: { id: 'part_1', messageID: 'msg_1', text: 'he' }, delta: 'b' },
          }) +
          '\n\n' +
          'data: ' +
          JSON.stringify({ type: 'session.idle', properties: { sessionID: 'sess_123' } }) +
          '\n\n'

        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      const diffMatch = targetPath.match(/^\/session\/([^/]+)\/diff$/)
      if (diffMatch && req.method === 'GET') {
        const sessionId = diffMatch[1] ?? ''
        return jsonOk([
          {
            file: 'src/a.ts',
            before: 'old',
            after: 'new',
            additions: 1,
            deletions: 0,
            sessionId,
          },
        ])
      }

      if (targetPath === '/file' && req.method === 'GET') {
        const url = new URL(req.url)
        const path = url.searchParams.get('path') || ''
        return jsonOk([
          { name: 'src', path: `${path.replace(/\/$/, '')}/src`, type: 'dir' },
          { name: 'README.md', path: `${path.replace(/\/$/, '')}/README.md`, type: 'file' },
        ])
      }

      if (targetPath === '/file/content' && req.method === 'GET') {
        const url = new URL(req.url)
        const path = url.searchParams.get('path') || ''
        return jsonOk({ path, content: 'hello', encoding: 'text', mimeType: 'text/plain' })
      }

      if (targetPath === '/find' && req.method === 'GET') {
        const url = new URL(req.url)
        const pattern = url.searchParams.get('pattern') || ''
        return jsonOk([{ path: 'src/a.ts', lines: ['match'], line_number: 1, absolute_offset: 0, submatches: [], pattern }])
      }

      if (targetPath === '/find/file' && req.method === 'GET') {
        return jsonOk(['src/a.ts', 'src/b.ts'])
      }

      const sessionMatch = targetPath.match(/^\/session\/([^/]+)$/)
      if (sessionMatch) {
        const id = sessionMatch[1] ?? ''
        if (req.method === 'GET') return jsonOk({ id })

        if (req.method === 'PATCH') {
          let body = {}
          try {
            body = bodyText ? JSON.parse(bodyText) : {}
          } catch {
            body = {}
          }
          return jsonOk({ id, ...body })
        }

        if (req.method === 'DELETE') return jsonOk(true)
      }

      const forkMatch = targetPath.match(/^\/session\/([^/]+)\/fork$/)
      if (forkMatch && req.method === 'POST') {
        const id = forkMatch[1] ?? ''
        return jsonOk({ id: `${id}_forked` })
      }

      const shareMatch = targetPath.match(/^\/session\/([^/]+)\/share$/)
      if (shareMatch) {
        const id = shareMatch[1] ?? ''
        if (req.method === 'POST') return jsonOk({ id, shared: true })
        if (req.method === 'DELETE') return jsonOk({ id, shared: false })
      }

      const actionMatch = targetPath.match(/^\/session\/([^/]+)\/(revert|unrevert|summarize)$/)
      if (actionMatch && req.method === 'POST') {
        const id = actionMatch[1] ?? ''
        const action = actionMatch[2] ?? ''
        return jsonOk({ id, action })
      }

      const todoMatch = targetPath.match(/^\/session\/([^/]+)\/todo$/)
      if (todoMatch && req.method === 'GET') {
        const id = todoMatch[1] ?? ''
        return jsonOk({ sessionId: id, items: [] })
      }

      return new Response('not-implemented', { status: 501 })
    },
    dispose() {
      // no-op
    },
  }
}

type StubWorkspaceRecord = Omit<WorkspaceRecord, 'provider'> & {
  provider: StubProvider
  connectionSeq: number
}

class FakeWorkspaceRegistry implements WorkspaceRegistryLike {
  constructor(private providerOverrides: Partial<ProviderCapabilities> = {}) {}

  private seq = 0
  private byId = new Map<string, StubWorkspaceRecord>()
  private byToken = new Map<string, StubWorkspaceRecord>()
  private sessionBindingsByDirectory = new Map<string, Map<string, string>>()

  lastConnectOptions: { autoApprove?: boolean } | undefined
  lastConnectPort: number | undefined

  private bindingsForDirectory(directory: string): Map<string, string> {
    let map = this.sessionBindingsByDirectory.get(directory)
    if (!map) {
      map = new Map<string, string>()
      this.sessionBindingsByDirectory.set(directory, map)
    }
    return map
  }

  private removeConnectionBindings(directory: string, connectionId: string) {
    const map = this.sessionBindingsByDirectory.get(directory)
    if (!map) return
    for (const [sessionId, boundConnectionId] of map.entries()) {
      if (boundConnectionId === connectionId) {
        map.delete(sessionId)
      }
    }
    if (map.size === 0) this.sessionBindingsByDirectory.delete(directory)
  }

  async connectLocal(directory: string, options?: { autoApprove?: boolean }): Promise<StubWorkspaceRecord> {
    const trimmed = directory.trim()
    if (!trimmed) throw new Error('workspace required')

    this.lastConnectOptions = options

    this.seq += 1
    const id = `ws_${this.seq}`
    const token = `tok_${this.seq}`

    const provider = createStubProvider(trimmed, this.providerOverrides)
    const ws: StubWorkspaceRecord = {
      id,
      token,
      directory: trimmed,
      createdAt: Date.now(),
      connectionSeq: this.seq,
      provider,
    }

    this.byId.set(id, ws)
    this.byToken.set(token, ws)
    return ws
  }

  async connectLocalPort(directory: string, port: number): Promise<StubWorkspaceRecord> {
    const trimmed = directory.trim()
    if (!trimmed) throw new Error('workspace required')

    this.lastConnectPort = port

    this.seq += 1
    const id = `ws_${this.seq}`
    const token = `tok_${this.seq}`

    const provider = createStubProvider(trimmed, this.providerOverrides)
    const ws: StubWorkspaceRecord = {
      id,
      token,
      directory: trimmed,
      createdAt: Date.now(),
      connectionSeq: this.seq,
      provider,
    }

    this.byId.set(id, ws)
    this.byToken.set(token, ws)
    return ws
  }

  list(): WorkspaceRecord[] {
    return Array.from(this.byId.values())
  }

  listConnections(workspaceId: string) {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return []

    const peers = Array.from(this.byId.values())
      .filter((entry) => entry.directory === anchor.directory)
      .sort((a, b) => a.createdAt - b.createdAt)

    const bindings = this.bindingsForDirectory(anchor.directory)
    const busy = new Set(bindings.values())

    return peers.map((entry) => ({
      id: entry.id,
      workspaceId: entry.id,
      directory: entry.directory,
      label: `conn-${entry.connectionSeq}`,
      mode: 'spawn' as const,
      status: busy.has(entry.id) ? ('busy' as const) : ('idle' as const),
    }))
  }

  async createConnection(
    workspaceId: string,
    input: { mode: 'spawn' | 'port'; autoApprove?: boolean; serverPort?: number },
  ): Promise<StubWorkspaceRecord> {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) throw new Error('workspace not found')
    if (input.mode === 'port') {
      const p = Number(input.serverPort)
      if (!Number.isInteger(p)) throw new Error('invalid server port')
      return this.connectLocalPort(anchor.directory, p)
    }
    return this.connectLocal(anchor.directory, { autoApprove: input.autoApprove })
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
    const target = this.byId.get(connectionId)
    if (!anchor) return { ok: false, error: 'workspace not found' }
    if (!target || target.directory !== anchor.directory) return { ok: false, error: 'connection not found' }
    if (!sessionId) return { ok: false, error: 'sessionId required' }
    this.bindingsForDirectory(anchor.directory).set(sessionId, connectionId)
    return { ok: true }
  }

  unbindSession(workspaceId: string, sessionId: string): boolean {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return false
    return this.bindingsForDirectory(anchor.directory).delete(sessionId)
  }

  getSessionBindings(workspaceId: string): Record<string, string> {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return {}
    return Object.fromEntries(this.bindingsForDirectory(anchor.directory).entries())
  }

  resolveSessionWorkspace(workspaceId: string, sessionId: string): WorkspaceRecord | null {
    const anchor = this.byId.get(workspaceId)
    if (!anchor) return null
    const connectionId = this.bindingsForDirectory(anchor.directory).get(sessionId)
    if (!connectionId) return null
    return this.byId.get(connectionId) ?? null
  }

  getByToken(token: string): WorkspaceRecord | undefined {
    return this.byToken.get(token)
  }

  disconnect(id: string): boolean {
    const ws = this.byId.get(id)
    if (!ws) return false
    this.removeConnectionBindings(ws.directory, id)
    this.byId.delete(id)
    this.byToken.delete(ws.token)
    return true
  }

  cleanupExpired(_maxAgeMs: number): void {
    // no-op for tests
  }
}

describe('getSessionToken', () => {
  test('prefers Authorization Bearer', () => {
    const req = new Request('http://localhost/api/opencode/foo', {
      headers: { Authorization: 'Bearer abc' },
    })
    expect(getSessionToken(req)).toBe('abc')
  })

  test('falls back to x-proto-session', () => {
    const req = new Request('http://localhost/api/opencode/foo', {
      headers: { 'x-proto-session': 'tok' },
    })
    expect(getSessionToken(req)).toBe('tok')
  })

  test('falls back to query token', () => {
    const req = new Request('http://localhost/api/opencode/foo?token=q')
    expect(getSessionToken(req)).toBe('q')
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/messages', () => {
  test('lists messages for session (passes query + directory)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/messages?limit=10&before=msg_9`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/session/sess_123/message')

    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('before')).toBe('msg_9')
  })

  test('maps cursor to before for upstream compatibility', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/messages?limit=10&cursor=msg_9`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/session/sess_123/message')

    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('before')).toBe('msg_9')
    expect(url.searchParams.get('cursor')).toBe(null)
  })

  test('returns 501 when chat capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ chat: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/messages`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('chat')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/prompt', () => {
  test('sends prompt (proxies to upstream message)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    registry.bindSession(ws.id, 'sess_123', ws.id)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ parts: [{ type: 'text', text: 'hi' }] }),
      })
    )

    expect(res.status).toBe(200)
    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.targetPath).toBe('/session/sess_123/message')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('blocks prompt execution when session is not bound', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ parts: [{ type: 'text', text: 'hi' }] }),
      })
    )

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('session not bound to connection')
  })
})

describe('/api/v1/workspaces/{workspaceId}/connections + session bindings', () => {
  test('lists connections, binds/unbinds session, and lists bindings', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const listRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/connections`, {
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(listRes.status).toBe(200)
    const listData = await listRes.json()
    expect(Array.isArray(listData.connections)).toBe(true)
    expect(listData.connections[0]?.id).toBe(ws.id)

    const bindRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ connectionId: ws.id }),
      })
    )
    expect(bindRes.status).toBe(200)
    const bindData = await bindRes.json()
    expect(bindData.boundConnectionId).toBe(ws.id)

    const bindingsRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/session-bindings`, {
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(bindingsRes.status).toBe(200)
    const bindingsData = await bindingsRes.json()
    expect(bindingsData.bindings.sess_123).toBe(ws.id)

    const unbindRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/unbind`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(unbindRes.status).toBe(200)

    const bindingsResAfter = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/session-bindings`, {
        headers: { 'x-proto-session': ws.token },
      })
    )
    const bindingsAfter = await bindingsResAfter.json()
    expect(bindingsAfter.bindings.sess_123).toBeUndefined()
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/abort', () => {
  test('aborts a session', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/abort`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBe(true)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/abort')
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/command', () => {
  test('invokes a command', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    registry.bindSession(ws.id, 'sess_123', ws.id)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ command: 'help', arguments: '' }),
      })
    )

    expect(res.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/command')
  })

  test('returns 501 when commands capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ commands: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    registry.bindSession(ws.id, 'sess_123', ws.id)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/command`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('commands')
  })

  test('routes concurrent session commands to their bound connections', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const primary = await registry.connectLocal('C:/repo', { autoApprove: false })
    const secondary = await registry.createConnection?.(primary.id, { mode: 'spawn' })
    if (!secondary) throw new Error('secondary connection should be created')

    registry.bindSession(primary.id, 'sess_a', primary.id)
    registry.bindSession(primary.id, 'sess_b', secondary.id)

    const aRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${primary.id}/sessions/sess_a/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': primary.token },
        body: JSON.stringify({ command: 'help', arguments: '' }),
      })
    )
    expect(aRes.status).toBe(200)
    expect(primary.provider.calls.at(-1)?.targetPath).toBe('/session/sess_a/command')

    const bRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${primary.id}/sessions/sess_b/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': primary.token },
        body: JSON.stringify({ command: 'help', arguments: '' }),
      })
    )
    expect(bRes.status).toBe(200)
    expect(secondary?.provider.calls.at(-1)?.targetPath).toBe('/session/sess_b/command')
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/shell', () => {
  test('runs shell-mode command', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    registry.bindSession(ws.id, 'sess_123', ws.id)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/shell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ agent: 'Sisyphus', command: 'ls' }),
      })
    )

    expect(res.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/shell')
  })
})

describe('/api/v1/workspaces/{workspaceId}/permissions/respond', () => {
  test('responds to a permission request (proxies to upstream session permissions)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/permissions/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ sessionID: 'sess_123', permissionID: 'perm_1', response: 'once' }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.response).toBe('once')

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.targetPath).toBe('/session/sess_123/permissions/perm_1')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when permissions capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ permissions: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/permissions/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ sessionID: 'sess_123', permissionID: 'perm_1', response: 'once' }),
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('permissions')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/permissions', () => {
  test('lists pending permissions (proxies to upstream permission list)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/permissions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('GET')
    expect(call?.targetPath).toBe('/permission')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when permissions capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ permissions: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/permissions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('permissions')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/questions', () => {
  test('lists pending questions (proxies to upstream question list)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/questions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('GET')
    expect(call?.targetPath).toBe('/question')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when questions capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ questions: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/questions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('questions')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/models', () => {
  test('lists available models (proxies to upstream provider list)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/models`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ all: [] })

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('GET')
    expect(call?.targetPath).toBe('/provider')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when models capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ models: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/models`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('models')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/agents', () => {
  test('lists available agents (proxies to upstream agent list)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/agents`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('GET')
    expect(call?.targetPath).toBe('/agent')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when agents capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ agents: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/agents`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('agents')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/commands', () => {
  test('lists available commands (proxies to upstream command list)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/commands`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('GET')
    expect(call?.targetPath).toBe('/command')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when commands capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ commands: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/commands`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('commands')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/questions/reply', () => {
  test('replies to a question request (proxies to upstream question reply)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/questions/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({
          requestID: 'q_1',
          answers: [['a'], ['b', 'c']],
        }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.answers)).toBe(true)
    expect(data.answers.length).toBe(2)

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.targetPath).toBe('/question/q_1/reply')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('returns 501 when questions capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ questions: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/questions/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ requestID: 'q_1', answers: [['a']] }),
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('questions')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/questions/reject', () => {
  test('rejects a question request (proxies to upstream question reject)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/questions/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ requestID: 'q_2' }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.targetPath).toBe('/question/q_2/reject')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })
})

describe('/api/v1/workspaces/{workspaceId}/events', () => {
  function parseSseData(raw: string) {
    return raw
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const line = chunk
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data: '))
        if (!line) throw new Error(`missing data line: ${chunk}`)
        return JSON.parse(line.slice('data: '.length)) as { type: string; properties?: Record<string, unknown> }
      })
  }

  test('relays SSE events and coalesces high-frequency part updates', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/events?foo=1`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')?.includes('text/event-stream')).toBe(true)

    const text = await res.text()
    const events = parseSseData(text)

    // We expect two events: one coalesced message.part.updated + session.idle.
    expect(events.length).toBe(2)
    expect(events[0]?.type).toBe('message.part.updated')
    expect((events[0]?.properties?.delta as string) ?? '').toBe('ab')
    expect(events[1]?.type).toBe('session.idle')

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/event')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('foo')).toBe('1')
  })

  test('returns 501 when events capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ events: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/events`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('events')
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/diffs', () => {
  test('lists session diffs', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/diffs?messageID=msg_1`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/session/sess_123/diff')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('messageID')).toBe('msg_1')
  })

  test('returns 501 when reviewDiffs capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ reviewDiffs: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/diffs`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('reviewDiffs')
    expect(ws.provider.calls.length).toBe(0)
  })
})

describe('/api/v1/workspaces/{workspaceId}/files', () => {
  test('lists files and directories', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/files?path=src`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/file')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('path')).toBe('src')
  })

  test('returns 501 when fileRead capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ fileRead: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/files?path=.`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('fileRead')
  })
})

describe('/api/v1/workspaces/{workspaceId}/files/content', () => {
  test('reads file content', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/files/content?path=README.md`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(typeof data.content).toBe('string')

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/file/content')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('path')).toBe('README.md')
  })
})

describe('/api/v1/workspaces/{workspaceId}/files/search', () => {
  test('searches file contents (ripgrep-like)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/files/search?pattern=foo`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/find')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('pattern')).toBe('foo')
  })

  test('returns 501 when fileSearch capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ fileSearch: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/files/search?pattern=foo`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('fileSearch')
  })
})

describe('/api/v1/workspaces/{workspaceId}/paths/search', () => {
  test('searches paths (maps kind to upstream type)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/paths/search?query=sr&kind=file&limit=10`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)

    const call = ws.provider.calls.at(-1)
    expect(call?.targetPath).toBe('/find/file')
    const url = new URL(call?.url ?? 'http://localhost/invalid')
    expect(url.searchParams.get('directory')).toBe('C:/repo')
    expect(url.searchParams.get('query')).toBe('sr')
    expect(url.searchParams.get('type')).toBe('file')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('kind')).toBe(null)
  })

  test('returns 501 when fileSearch capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ fileSearch: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/paths/search?query=sr&kind=both`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('fileSearch')
  })
})

describe('/api/v1/workspaces', () => {
  test('connect + list + disconnect', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const connectRes1 = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: 'C:/repo' }),
      })
    )
    expect(connectRes1.status).toBe(200)
    const connectData1 = await connectRes1.json()
    expect(connectData1.workspace.provider).toBe('opencode.local')
    expect(typeof connectData1.workspace.id).toBe('string')
    expect(typeof connectData1.token).toBe('string')
    expect(registry.lastConnectOptions).toEqual({ autoApprove: false })

    const connectRes2 = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: 'D:/repo2' }),
      })
    )
    expect(connectRes2.status).toBe(200)

    const listRes = await fetchHandler(new Request('http://localhost/api/v1/workspaces'))
    expect(listRes.status).toBe(200)
    const listData = await listRes.json()
    expect(Array.isArray(listData.workspaces)).toBe(true)
    expect(listData.workspaces.length).toBe(2)

    const deleteRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${connectData1.workspace.id}`, {
        method: 'DELETE',
      })
    )
    expect(deleteRes.status).toBe(200)
    const deleteData = await deleteRes.json()
    expect(deleteData.ok).toBe(true)

    const listResAfter = await fetchHandler(new Request('http://localhost/api/v1/workspaces'))
    const listDataAfter = await listResAfter.json()
    expect(listDataAfter.workspaces.length).toBe(1)
  })

  test('connect supports serverPort (connect to running server)', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const connectRes = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: 'C:/repo', serverPort: 3009 }),
      })
    )
    expect(connectRes.status).toBe(200)
    const data = await connectRes.json()
    expect(typeof data.workspace?.id).toBe('string')
    expect(typeof data.token).toBe('string')
    expect(registry.lastConnectPort).toBe(3009)
    expect(registry.lastConnectOptions).toBe(undefined)
  })

  test('connect rejects unsupported provider', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const res = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.remote', directory: 'C:/repo' }),
      })
    )
    expect(res.status).toBe(400)
  })

  test('connect rejects missing directory', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const res = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: '   ' }),
      })
    )
    expect(res.status).toBe(400)
  })

  test('test-connection validates connectivity without persisting runtime workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const testRes = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: 'C:/repo', mode: 'spawn' }),
      })
    )

    expect(testRes.status).toBe(200)
    const data = await testRes.json()
    expect(data.ok).toBe(true)

    const listRes = await fetchHandler(new Request('http://localhost/api/v1/workspaces'))
    const listData = await listRes.json()
    expect(Array.isArray(listData.workspaces)).toBe(true)
    expect(listData.workspaces.length).toBe(0)
  })

  test('test-connection supports port mode', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const testRes = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opencode.local', directory: 'C:/repo', mode: 'port', serverPort: 3009 }),
      })
    )

    expect(testRes.status).toBe(200)
    const data = await testRes.json()
    expect(data.ok).toBe(true)
    expect(registry.lastConnectPort).toBe(3009)
  })

  test('disconnect returns 404 for unknown workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const res = await fetchHandler(new Request('http://localhost/api/v1/workspaces/ws_missing', { method: 'DELETE' }))
    expect(res.status).toBe(404)
  })
})

describe('/api/v1/workspaces/{workspaceId}/sessions', () => {
  test('requires token', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const res = await fetchHandler(new Request('http://localhost/api/v1/workspaces/ws_1/sessions'))
    expect(res.status).toBe(401)
  })

  test('lists sessions for workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(2)

    const call = ws.provider.calls.at(-1)
    expect(call).toBeTruthy()
    expect(call?.targetPath).toBe('/session')
    expect(new URL(call?.url ?? 'http://localhost/invalid').searchParams.get('directory')).toBe('C:/repo')
  })

  test('includes boundConnectionId in session list when binding exists', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    registry.bindSession(ws.id, 'sess_1', ws.id)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    const first = data.find((session: { id?: string }) => session.id === 'sess_1')
    expect(first?.boundConnectionId).toBe(ws.id)
  })

  test('rejects workspace/token mismatch', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws1 = await registry.connectLocal('C:/repo', { autoApprove: false })
    const ws2 = await registry.connectLocal('D:/repo2', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws2.id}/sessions`, {
        headers: { 'x-proto-session': ws1.token },
      })
    )

    expect(res.status).toBe(403)
  })

  test('creates session for workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({}),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('sess_new')

    const call = ws.provider.calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.targetPath).toBe('/session')
  })

  test('gets a session for workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('sess_123')
  })

  test('updates a session for workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-proto-session': ws.token },
        body: JSON.stringify({ title: 'New Title' }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('sess_123')
    expect(data.title).toBe('New Title')
  })

  test('deletes a session for workspace', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123`, {
        method: 'DELETE',
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBe(true)
  })

  test('fork/share/unshare actions proxy correctly', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const forkRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/fork`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(forkRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/fork')

    const shareRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/share`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(shareRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.method).toBe('POST')
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/share')

    const unshareRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/unshare`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(unshareRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.method).toBe('DELETE')
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/share')
  })

  test('revert/unrevert/summarize actions proxy correctly', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const revertRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/revert`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(revertRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/revert')

    const unrevertRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/unrevert`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(unrevertRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/unrevert')

    const summarizeRes = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/summarize`, {
        method: 'POST',
        headers: { 'x-proto-session': ws.token },
      })
    )
    expect(summarizeRes.status).toBe(200)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/summarize')
  })

  test('proxies todo endpoint', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions/sess_123/todo`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    expect(ws.provider.calls.at(-1)?.targetPath).toBe('/session/sess_123/todo')
  })

  test('returns 501 when chat capability is disabled', async () => {
    const registry = new FakeWorkspaceRegistry({ chat: false })
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/sessions`, {
        headers: { 'x-proto-session': ws.token },
      })
    )

    expect(res.status).toBe(501)
    const data = await res.json()
    expect(data.capability).toBe('chat')
  })
})

describe('fetch handler basics', () => {
  test('OPTIONS returns CORS headers', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(new Request('http://localhost/any', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('/api/health returns healthy', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(new Request('http://localhost/api/health'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.healthy).toBe(true)
  })

  test('/api/config validates body', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(
      new Request('http://localhost/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: '' }),
      })
    )
    expect(res.status).toBe(400)
  })

  test('/api/opencode rejects missing token', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(new Request('http://localhost/api/opencode/session'))
    expect(res.status).toBe(401)
  })

  test('/api/opencode rejects invalid token', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(
      new Request('http://localhost/api/opencode/session', {
        headers: { 'x-proto-session': 'does-not-exist' },
      })
    )
    expect(res.status).toBe(401)
  })

  test('/api/opencode proxies when token is valid and injects CORS', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)

    const ws = await registry.connectLocal('C:/repo', { autoApprove: false })
    const token = ws.token

    const res = await fetchHandler(
      new Request('http://localhost/api/opencode/foo?x=1', {
        headers: { 'x-proto-session': token },
      })
    )

    expect(res.status).toBe(501)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('unknown routes return 404 with CORS', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const res = await fetchHandler(new Request('http://localhost/unknown'))
    expect(res.status).toBe(404)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

// ---------------------------------------------------------------------------
// Codument API tests
// ---------------------------------------------------------------------------

function makeCodumentFixture() {
  const root = path.join(tmpdir(), `codument-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const codumentDir = path.join(root, 'codument')
  const tracksDir = path.join(codumentDir, 'tracks')

  // track-alpha: completed, track-beta: in_progress, track-gamma: in_progress
  mkdirSync(path.join(tracksDir, 'track-alpha'), { recursive: true })
  mkdirSync(path.join(tracksDir, 'track-beta'), { recursive: true })
  mkdirSync(path.join(tracksDir, 'track-gamma'), { recursive: true })

  // tracks.md — track-beta is [~] first, track-gamma is [~] last → defaultTrackId = track-gamma
  const tracksMd = [
    '| Track ID | Track Name | Status | Description |',
    '| --- | --- | --- | --- |',
    '| track-alpha | Alpha Feature | [x] Completed | done |',
    '| track-beta | Beta Feature | [~] In Progress | wip |',
    '| track-gamma | Gamma Feature | [~] In Progress | wip2 |',
  ].join('\n')
  writeFileSync(path.join(codumentDir, 'tracks.md'), tracksMd)

  // plan.xml for track-alpha (completed)
  writeFileSync(
    path.join(tracksDir, 'track-alpha', 'plan.xml'),
    `<plan>
  <track_name>Alpha Feature</track_name>
  <status>completed</status>
  <phase id="p1" name="Setup">
    <task id="t1" name="Init repo" status="DONE">
      <subtask id="s1" name="Clone" status="DONE" />
    </task>
  </phase>
</plan>`,
  )

  // plan.xml for track-beta (in_progress, with mixed statuses)
  writeFileSync(
    path.join(tracksDir, 'track-beta', 'plan.xml'),
    `<plan>
  <track_name>Beta Feature</track_name>
  <status>in_progress</status>
  <phase id="p1" name="Design">
    <task id="t1" name="Write spec" status="DONE">
      <subtask id="s1" name="Draft" status="DONE" />
      <subtask id="s2" name="Review" status="DONE" />
    </task>
    <task id="t2" name="Implement" status="IN_PROGRESS">
      <subtask id="s3" name="Code" status="IN_PROGRESS" />
      <subtask id="s4" name="Test" status="TODO" />
    </task>
  </phase>
  <phase id="p2" name="Deploy">
    <task id="t3" name="Release" status="TODO">
      <subtask id="s5" name="Tag" status="TODO" />
    </task>
  </phase>
</plan>`,
  )

  // plan.xml for track-gamma
  writeFileSync(
    path.join(tracksDir, 'track-gamma', 'plan.xml'),
    `<plan>
  <track_name>Gamma Feature</track_name>
  <status>in_progress</status>
  <phase id="p1" name="Research">
    <task id="t1" name="Spike" status="TODO">
      <subtask id="s1" name="Explore" status="TODO" />
    </task>
  </phase>
</plan>`,
  )

  return root
}

const codumentFixtureRoot = makeCodumentFixture()
afterAll(() => {
  rmSync(codumentFixtureRoot, { recursive: true, force: true })
})

describe('GET /api/v1/workspaces/{workspaceId}/codument/tracks', () => {
  test('returns tracks list with defaultTrackId being last [~] track with plan.xml', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      tracks: Array<{ trackId: string; trackName: string; status: string; statusSymbol: string }>
      defaultTrackId: string
    }

    // defaultTrackId should be track-gamma (last [~] in tracks.md that has plan.xml)
    expect(data.defaultTrackId).toBe('track-gamma')

    expect(Array.isArray(data.tracks)).toBe(true)
    expect(data.tracks.length).toBe(3)

    // Verify each track has required fields
    for (const track of data.tracks) {
      expect(typeof track.trackId).toBe('string')
      expect(typeof track.trackName).toBe('string')
      expect(typeof track.status).toBe('string')
      expect(typeof track.statusSymbol).toBe('string')
      expect(['[x]', '[~]', '[ ]']).toContain(track.statusSymbol)
    }

    // Verify ordering follows tracks.md row order
    expect(data.tracks[0]!.trackId).toBe('track-alpha')
    expect(data.tracks[1]!.trackId).toBe('track-beta')
    expect(data.tracks[2]!.trackId).toBe('track-gamma')

    // Verify status symbols
    const alpha = data.tracks.find((t) => t.trackId === 'track-alpha')!
    expect(alpha.statusSymbol).toBe('[x]')
    expect(alpha.status).toBe('completed')

    const beta = data.tracks.find((t) => t.trackId === 'track-beta')!
    expect(beta.statusSymbol).toBe('[~]')
    expect(beta.status).toBe('in_progress')
  })

  test('returns 401 without token', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    await registry.connectLocal(codumentFixtureRoot)

    const res = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/ws_1/codument/tracks'),
    )
    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/workspaces/{workspaceId}/codument/tracks/{trackId}/tree', () => {
  test('returns phase-task-subtask three-level structure', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks/track-beta/tree`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      tree: {
        trackId: string
        trackName: string
        status: string
        statusSymbol: string
        phases: Array<{
          id: string
          name: string
          status: string
          statusSymbol: string
          tasks: Array<{
            id: string
            name: string
            status: string
            statusSymbol: string
            subtasks: Array<{
              id: string
              name: string
              status: string
              statusSymbol: string
            }>
          }>
        }>
      }
    }

    const tree = data.tree
    expect(tree.trackId).toBe('track-beta')
    expect(tree.trackName).toBe('Beta Feature')
    expect(Array.isArray(tree.phases)).toBe(true)
    expect(tree.phases.length).toBe(2)

    // Phase 1: Design — has DONE + IN_PROGRESS tasks → IN_PROGRESS
    const phase1 = tree.phases[0]!
    expect(phase1.id).toBe('p1')
    expect(phase1.name).toBe('Design')
    expect(phase1.status).toBe('IN_PROGRESS')
    expect(phase1.statusSymbol).toBe('[~]')
    expect(phase1.tasks.length).toBe(2)

    // Task t1: Write spec — DONE
    const task1 = phase1.tasks[0]!
    expect(task1.status).toBe('DONE')
    expect(task1.statusSymbol).toBe('[x]')
    expect(task1.subtasks.length).toBe(2)
    expect(task1.subtasks[0]!.status).toBe('DONE')
    expect(task1.subtasks[0]!.statusSymbol).toBe('[x]')

    // Task t2: Implement — IN_PROGRESS
    const task2 = phase1.tasks[1]!
    expect(task2.status).toBe('IN_PROGRESS')
    expect(task2.statusSymbol).toBe('[~]')
    expect(task2.subtasks.length).toBe(2)
    expect(task2.subtasks[0]!.statusSymbol).toBe('[~]') // IN_PROGRESS
    expect(task2.subtasks[1]!.statusSymbol).toBe('[ ]') // TODO

    // Phase 2: Deploy — all TODO
    const phase2 = tree.phases[1]!
    expect(phase2.id).toBe('p2')
    expect(phase2.status).toBe('TODO')
    expect(phase2.statusSymbol).toBe('[ ]')
  })

  test('statusSymbol mapping: DONE=>[x], IN_PROGRESS=>[~], TODO=>[ ]', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks/track-alpha/tree`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as { tree: { statusSymbol: string; phases: Array<{ tasks: Array<{ statusSymbol: string; subtasks: Array<{ statusSymbol: string }> }> }> } }
    // track-alpha is completed, all DONE
    expect(data.tree.statusSymbol).toBe('[x]')
    expect(data.tree.phases[0]!.tasks[0]!.statusSymbol).toBe('[x]')
    expect(data.tree.phases[0]!.tasks[0]!.subtasks[0]!.statusSymbol).toBe('[x]')
  })

  test('returns 400 for trackId containing / after decoding', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const encodedTrackId = encodeURIComponent('evil/path')
    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks/${encodedTrackId}/tree`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toBe('invalid track id')
  })

  test('returns 400 for trackId containing ..', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const encodedTrackId = encodeURIComponent('..%2Fetc')
    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks/${encodedTrackId}/tree`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toBe('invalid track id')
  })

  test('returns 400 for trackId containing backslash', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    const ws = await registry.connectLocal(codumentFixtureRoot)

    const encodedTrackId = encodeURIComponent('evil\\path')
    const res = await fetchHandler(
      new Request(`http://localhost/api/v1/workspaces/${ws.id}/codument/tracks/${encodedTrackId}/tree`, {
        headers: { 'x-proto-session': ws.token },
      }),
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toBe('invalid track id')
  })

  test('returns 401 without token', async () => {
    const registry = new FakeWorkspaceRegistry()
    const fetchHandler = createFetchHandler(registry)
    await registry.connectLocal(codumentFixtureRoot)

    const res = await fetchHandler(
      new Request('http://localhost/api/v1/workspaces/ws_1/codument/tracks/track-beta/tree'),
    )
    expect(res.status).toBe(401)
  })
})

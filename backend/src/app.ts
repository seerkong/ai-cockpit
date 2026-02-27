import type { OpenCodeServerInfo } from './opencode-server'
import type { WorkspaceProvider } from './providers/types'
import type { SqliteStore } from './storage/sqlite'
import { listCodumentTracks, loadCodumentTrackTree } from './codument'

export type WorkspaceRecord = {
  id: string
  token: string
  directory: string
  createdAt: number
  connectionMode?: 'spawn' | 'port'
  serverPort?: number
  provider: WorkspaceProvider
  server?: OpenCodeServerInfo
}

export type ConnectionInstance = {
  id: string
  workspaceId: string
  directory: string
  label: string
  mode: 'spawn' | 'port'
  status: 'idle' | 'busy'
  serverPort?: number
}

export interface WorkspaceRegistryLike {
  connectLocal(directory: string, options?: { autoApprove?: boolean }): Promise<WorkspaceRecord>
  connectLocalPort?(directory: string, port: number): Promise<WorkspaceRecord>
  createConnection?(
    workspaceId: string,
    input: { mode: 'spawn' | 'port'; autoApprove?: boolean; serverPort?: number },
  ): Promise<WorkspaceRecord>
  listConnections?(workspaceId: string): ConnectionInstance[]
  disconnectConnection?(workspaceId: string, connectionId: string): boolean
  bindSession?(workspaceId: string, sessionId: string, connectionId: string): { ok: boolean; error?: string }
  unbindSession?(workspaceId: string, sessionId: string): boolean
  getSessionBindings?(workspaceId: string): Record<string, string>
  resolveSessionWorkspace?(workspaceId: string, sessionId: string): WorkspaceRecord | null
  list(): WorkspaceRecord[]
  getByToken(token: string): WorkspaceRecord | undefined
  disconnect(id: string): boolean
  cleanupExpired(maxAgeMs: number): void
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Proto-Session, Authorization',
  }
}

export function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...extraHeaders,
    },
  })
}

export function getSessionToken(req: Request) {
  const url = new URL(req.url)
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token) return token
  }
  return req.headers.get('x-proto-session') || url.searchParams.get('token')
}

export function workspaceResponse(ws: WorkspaceRecord) {
  return {
    id: ws.id,
    provider: ws.provider.providerType,
    directory: ws.directory,
    status: 'ready',
    createdAt: ws.createdAt,
    connectionMode: ws.connectionMode,
    serverPort: ws.serverPort,
    capabilities: ws.provider.capabilities,
  }
}

function getSessionOrResponse(registry: WorkspaceRegistryLike, req: Request) {
  const token = getSessionToken(req)
  if (!token) {
    return jsonResponse({ error: 'missing session token' }, 401)
  }
  const ws = registry.getByToken(token)
  if (!ws) {
    return jsonResponse({ error: 'invalid session token' }, 401)
  }
  return ws
}

function getWorkspaceOrResponse(registry: WorkspaceRegistryLike, req: Request, workspaceId: string) {
  const sessionOrResp = getSessionOrResponse(registry, req)
  if (sessionOrResp instanceof Response) {
    return sessionOrResp
  }
  if (sessionOrResp.id !== workspaceId) {
    return jsonResponse({ error: 'workspace mismatch' }, 403)
  }
  return sessionOrResp
}

function requireCapability(ws: WorkspaceRecord, capability: keyof WorkspaceProvider['capabilities']) {
  if (!ws.provider.capabilities[capability]) {
    return jsonResponse({ error: 'capability not supported', capability }, 501)
  }
  return null
}

function resolveExecutionWorkspaceOrResponse(
  registry: WorkspaceRegistryLike,
  workspaceId: string,
  sessionId: string,
): WorkspaceRecord | Response {
  if (!registry.resolveSessionWorkspace) {
    return jsonResponse({ error: 'session binding not supported' }, 501)
  }
  const target = registry.resolveSessionWorkspace(workspaceId, sessionId)
  if (!target) {
    return jsonResponse({ error: 'session not bound to connection' }, 409)
  }
  return target
}

function ensureDirectoryQuery(req: Request, directory: string) {
  const url = new URL(req.url)
  if (!url.searchParams.has('directory')) {
    url.searchParams.set('directory', directory)
  }
  return url
}

async function proxyWorkspace(ws: WorkspaceRecord, req: Request, targetPath: string): Promise<Response> {
  const url = ensureDirectoryQuery(req, ws.directory)
  const upstreamReq = new Request(url.toString(), req)

  const response = await ws.provider.proxy(upstreamReq, targetPath)
  const proxyHeaders = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    proxyHeaders.set(key, value)
  })
  return new Response(response.body, {
    status: response.status,
    headers: proxyHeaders,
  })
}

async function withBoundConnectionIds(
  response: Response,
  registry: WorkspaceRegistryLike,
  workspaceId: string,
): Promise<Response> {
  if (!registry.getSessionBindings) return response

  const bindings = registry.getSessionBindings(workspaceId)
  if (!bindings || Object.keys(bindings).length === 0) return response

  let payload: unknown = null
  try {
    payload = await response.clone().json()
  } catch {
    return response
  }

  if (!Array.isArray(payload)) return response

  const merged = payload.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const session = item as Record<string, unknown>
    const sessionId = typeof session.id === 'string' ? session.id : ''
    const boundConnectionId = sessionId ? bindings[sessionId] : ''
    if (!boundConnectionId) return item
    return {
      ...session,
      boundConnectionId,
    }
  })

  return jsonResponse(merged, response.status)
}

async function proxyRequest(registry: WorkspaceRegistryLike, req: Request, targetPath: string): Promise<Response> {
  const sessionOrResp = getSessionOrResponse(registry, req)
  if (sessionOrResp instanceof Response) {
    return sessionOrResp
  }

  const ws = sessionOrResp
  const response = await ws.provider.proxy(req, targetPath)

  const proxyHeaders = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    proxyHeaders.set(key, value)
  })

  return new Response(response.body, {
    status: response.status,
    headers: proxyHeaders,
  })
}

function sseHeaders() {
  return {
    ...corsHeaders(),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }
}

function formatSseData(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

type SseEvent = {
  type: string
  properties?: Record<string, unknown>
}

function extractEventSessionId(evt: SseEvent): string | null {
  const type = typeof evt.type === 'string' ? evt.type : ''
  const props = evt.properties
  if (!props) return null

  if (type.startsWith('session.')) {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  if (type === 'message.updated') {
    const info = props.info as Record<string, unknown> | undefined
    return typeof info?.sessionID === 'string' ? (info.sessionID as string) : null
  }
  if (type === 'message.part.updated') {
    const part = props.part as Record<string, unknown> | undefined
    return typeof part?.sessionID === 'string' ? (part.sessionID as string) : null
  }
  if (type === 'message.removed' || type === 'message.part.removed') {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  if (type === 'permission.asked' || type === 'question.asked') {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  return null
}

async function relaySseWithCoalescing(ws: WorkspaceRecord, req: Request, store?: SqliteStore): Promise<Response> {
  const url = ensureDirectoryQuery(req, ws.directory)
  const abortController = new AbortController()

  // If this workspace is backed by WorkspaceRegistry, it will abort these controllers on disconnect.
  const wsAny = ws as unknown as { eventControllers?: Set<AbortController> }
  wsAny.eventControllers?.add(abortController)

  const upstreamReq = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    signal: abortController.signal,
  })
  const upstreamResp = await ws.provider.proxy(upstreamReq, '/event')

  if (!upstreamResp.ok || !upstreamResp.body) {
    const text = await upstreamResp.text().catch(() => '')
    return jsonResponse({ error: 'upstream event stream failed', status: upstreamResp.status, body: text }, 502)
  }

  const reader = upstreamResp.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Coalesce message.part.updated deltas for the same part id.
  let pendingEvent: SseEvent | null = null
  let pendingPartId: string | null = null
  let pendingDelta = ''

  let buffer = ''
  let eventData = ''

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
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
        if (done) {
          if (pendingEvent) {
            if (store) {
              try {
                store.insertEvent({
                  workspaceId: ws.id,
                  sessionId: extractEventSessionId(pendingEvent),
                  type: pendingEvent.type,
                  data: pendingEvent,
                })
              } catch {
                // Do not fail the SSE stream on persistence errors.
              }
            }
            controller.enqueue(encoder.encode(formatSseData(pendingEvent)))
            pendingEvent = null
          }
          wsAny.eventControllers?.delete(abortController)
          controller.close()
          return
        }

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
              // If upstream emits non-JSON frames, drop them.
              parsed = null
            }
            eventData = ''

            if (!parsed) continue

            const raw = parsed as { type?: unknown; properties?: Record<string, unknown> }
            const type = typeof raw.type === 'string' ? raw.type : ''
            const evt: SseEvent = { type, properties: raw.properties }

            if (type === 'message.part.updated') {
              const part = (evt.properties?.part as Record<string, unknown> | undefined) ?? undefined
              const partId = typeof part?.id === 'string' ? (part.id as string) : null
              const delta = typeof evt.properties?.delta === 'string' ? (evt.properties.delta as string) : ''

              if (partId) {
                if (pendingEvent && pendingPartId === partId) {
                  pendingDelta += delta
                  pendingEvent = {
                    ...evt,
                    properties: {
                      ...(evt.properties ?? {}),
                      delta: pendingDelta,
                    },
                  }
                  continue
                }

                // Flush previous pending event before starting a new part id.
                if (pendingEvent) {
                  if (store) {
                    try {
                      store.insertEvent({
                        workspaceId: ws.id,
                        sessionId: extractEventSessionId(pendingEvent),
                        type: pendingEvent.type,
                        data: pendingEvent,
                      })
                    } catch {
                      // ignore persistence errors
                    }
                  }
                  controller.enqueue(encoder.encode(formatSseData(pendingEvent)))
                }
                pendingEvent = evt
                pendingPartId = partId
                pendingDelta = delta
                continue
              }
            }

            // Non-coalescable event: flush pending first, then emit this event.
            if (pendingEvent) {
              if (store) {
                try {
                  store.insertEvent({
                    workspaceId: ws.id,
                    sessionId: extractEventSessionId(pendingEvent),
                    type: pendingEvent.type,
                    data: pendingEvent,
                  })
                } catch {
                  // ignore persistence errors
                }
              }
              controller.enqueue(encoder.encode(formatSseData(pendingEvent)))
              pendingEvent = null
              pendingPartId = null
              pendingDelta = ''
            }

            if (store) {
              try {
                store.insertEvent({
                  workspaceId: ws.id,
                  sessionId: extractEventSessionId(evt),
                  type: evt.type,
                  data: evt,
                })
              } catch {
                // ignore persistence errors
              }
            }
            controller.enqueue(encoder.encode(formatSseData(evt)))
            return
          }
        }
      }
    },
    async cancel() {
      try {
        abortController.abort()
      } catch {
        // ignore
      }
      try {
        await reader.cancel()
        reader.releaseLock()
      } catch {
        // ignore
      }

      wsAny.eventControllers?.delete(abortController)
    },
  })

  const headers = new Headers(upstreamResp.headers)
  Object.entries(sseHeaders()).forEach(([key, value]) => {
    headers.set(key, value)
  })
  return new Response(stream, { status: 200, headers })
}

async function handleConfig(registry: WorkspaceRegistryLike, req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.workspace !== 'string' || !body.workspace.trim()) {
    return jsonResponse({ error: 'workspace required' }, 400)
  }

  try {
    const ws = await registry.connectLocal(body.workspace.trim(), { autoApprove: true })
    return jsonResponse({ token: ws.token, baseUrl: ws.server?.baseUrl })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'failed to connect workspace' }, 500)
  }
}

async function handleWorkspacesConnect(registry: WorkspaceRegistryLike, req: Request) {
  const body = await req.json().catch(() => null)
  const provider = body?.provider
  const directory = body?.directory
  const autoApprove = Boolean(body?.autoApprove)
  const serverPortRaw = body?.serverPort

  if (provider !== 'opencode.local') {
    return jsonResponse({ error: 'unsupported provider' }, 400)
  }
  if (typeof directory !== 'string' || !directory.trim()) {
    return jsonResponse({ error: 'directory required' }, 400)
  }

  let serverPort: number | null = null
  if (typeof serverPortRaw === 'number' && Number.isFinite(serverPortRaw)) {
    serverPort = Math.floor(serverPortRaw)
  } else if (typeof serverPortRaw === 'string' && serverPortRaw.trim()) {
    const parsed = Number(serverPortRaw)
    if (Number.isFinite(parsed)) serverPort = Math.floor(parsed)
  }

  try {
    const ws =
      serverPort !== null
        ? await (registry.connectLocalPort
            ? registry.connectLocalPort(directory.trim(), serverPort)
            : Promise.reject(new Error('connectLocalPort not supported')))
        : await registry.connectLocal(directory.trim(), { autoApprove })
    return jsonResponse({ workspace: workspaceResponse(ws), token: ws.token })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'failed to connect workspace' }, 500)
  }
}

async function handleWorkspacesTestConnection(registry: WorkspaceRegistryLike, req: Request) {
  const body = await req.json().catch(() => null)
  const provider = body?.provider
  const directory = body?.directory
  const mode = body?.mode === 'port' ? 'port' : 'spawn'
  const autoApprove = Boolean(body?.autoApprove)
  const serverPortRaw = body?.serverPort

  if (provider !== 'opencode.local') {
    return jsonResponse({ ok: false, error: 'unsupported provider' }, 400)
  }
  if (typeof directory !== 'string' || !directory.trim()) {
    return jsonResponse({ ok: false, error: 'directory required' }, 400)
  }

  let serverPort: number | null = null
  if (typeof serverPortRaw === 'number' && Number.isFinite(serverPortRaw)) {
    serverPort = Math.floor(serverPortRaw)
  } else if (typeof serverPortRaw === 'string' && serverPortRaw.trim()) {
    const parsed = Number(serverPortRaw)
    if (Number.isFinite(parsed)) serverPort = Math.floor(parsed)
  }

  let ws: WorkspaceRecord | null = null
  try {
    if (mode === 'port') {
      if (serverPort === null) {
        return jsonResponse({ ok: false, error: 'serverPort required for port mode' }, 400)
      }
      ws = await (registry.connectLocalPort
        ? registry.connectLocalPort(directory.trim(), serverPort)
        : Promise.reject(new Error('connectLocalPort not supported')))
    } else {
      ws = await registry.connectLocal(directory.trim(), { autoApprove })
    }
    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : 'test connection failed' }, 200)
  } finally {
    if (ws) {
      try {
        registry.disconnect(ws.id)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export function createFetchHandler(registry: WorkspaceRegistryLike, store?: SqliteStore) {
  return async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({ healthy: true })
    }

    if (url.pathname === '/api/config' && req.method === 'POST') {
      return handleConfig(registry, req)
    }

    if (url.pathname === '/api/v1/workspaces/connect' && req.method === 'POST') {
      return handleWorkspacesConnect(registry, req)
    }

    if (url.pathname === '/api/v1/workspaces/test-connection' && req.method === 'POST') {
      return handleWorkspacesTestConnection(registry, req)
    }

    if (url.pathname === '/api/v1/workspaces' && req.method === 'GET') {
      return jsonResponse({ workspaces: registry.list().map(workspaceResponse) })
    }

    const eventsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/events$/)
    if (eventsMatch && req.method === 'GET') {
      const wsOrResp = getWorkspaceOrResponse(registry, req, eventsMatch[1] ?? '')
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'events')
      if (capabilityResp) return capabilityResp

      return relaySseWithCoalescing(wsOrResp, req, store)
    }

    const sessionsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions$/)
    if (sessionsMatch) {
      const wsOrResp = getWorkspaceOrResponse(registry, req, sessionsMatch[1] ?? '')
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        const proxied = await proxyWorkspace(wsOrResp, req, '/session')
        return withBoundConnectionIds(proxied, registry, wsOrResp.id)
      }
      if (req.method === 'POST') {
        return proxyWorkspace(wsOrResp, req, '/session')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const connectionsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/connections$/)
    if (connectionsMatch) {
      const wsOrResp = getWorkspaceOrResponse(registry, req, connectionsMatch[1] ?? '')
      if (wsOrResp instanceof Response) return wsOrResp

      if (req.method === 'GET') {
        const connections = registry.listConnections ? registry.listConnections(wsOrResp.id) : []
        return jsonResponse({ connections })
      }

      if (req.method === 'POST') {
        if (!registry.createConnection) {
          return jsonResponse({ error: 'connection instances not supported' }, 501)
        }
        const body = await req.json().catch(() => null)
        const mode = body?.mode === 'port' ? 'port' : 'spawn'
        const autoApprove = Boolean(body?.autoApprove)

        let serverPort: number | undefined
        if (typeof body?.serverPort === 'number' && Number.isFinite(body.serverPort)) {
          serverPort = Math.floor(body.serverPort)
        } else if (typeof body?.serverPort === 'string' && body.serverPort.trim()) {
          const parsed = Number(body.serverPort)
          if (Number.isFinite(parsed)) serverPort = Math.floor(parsed)
        }

        try {
          const created = await registry.createConnection(wsOrResp.id, { mode, autoApprove, serverPort })
          return jsonResponse({ workspace: workspaceResponse(created), token: created.token })
        } catch (err) {
          return jsonResponse({ error: err instanceof Error ? err.message : 'failed to create connection' }, 500)
        }
      }

      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const connectionDeleteMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/connections\/([^/]+)$/)
    if (connectionDeleteMatch && req.method === 'DELETE') {
      const workspaceId = connectionDeleteMatch[1] ?? ''
      const connectionId = connectionDeleteMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      if (!registry.disconnectConnection) {
        return jsonResponse({ error: 'connection instances not supported' }, 501)
      }

      const ok = registry.disconnectConnection(workspaceId, connectionId)
      if (!ok) return jsonResponse({ error: 'connection not found' }, 404)
      return jsonResponse({ ok: true })
    }

    const bindingsListMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/session-bindings$/)
    if (bindingsListMatch && req.method === 'GET') {
      const workspaceId = bindingsListMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp
      const bindings = registry.getSessionBindings ? registry.getSessionBindings(workspaceId) : {}
      return jsonResponse({ bindings })
    }

    const codumentTracksMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/codument\/tracks$/)
    if (codumentTracksMatch && req.method === 'GET') {
      const workspaceId = codumentTracksMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      try {
        const { tracks, defaultTrackId } = await listCodumentTracks(wsOrResp.directory)
        return jsonResponse({ tracks, defaultTrackId })
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : 'failed to load codument tracks' }, 500)
      }
    }

    const codumentTrackTreeMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/codument\/tracks\/([^/]+)\/tree$/)
    if (codumentTrackTreeMatch && req.method === 'GET') {
      const workspaceId = codumentTrackTreeMatch[1] ?? ''
      const rawTrackId = codumentTrackTreeMatch[2] ?? ''
      const trackId = decodeURIComponent(rawTrackId)
      if (!trackId || trackId.includes('/') || trackId.includes('\\') || trackId.includes('..')) {
        return jsonResponse({ error: 'invalid track id' }, 400)
      }

      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      try {
        const tree = await loadCodumentTrackTree(wsOrResp.directory, trackId)
        return jsonResponse({ tree })
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : 'failed to load codument track tree' }, 500)
      }
    }

    const bindMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/bind$/)
    if (bindMatch && req.method === 'POST') {
      const workspaceId = bindMatch[1] ?? ''
      const sessionId = bindMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      if (!registry.bindSession) {
        return jsonResponse({ error: 'session binding not supported' }, 501)
      }

      const body = await req.json().catch(() => null)
      const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : ''
      if (!connectionId) return jsonResponse({ error: 'connectionId required' }, 400)

      const result = registry.bindSession(workspaceId, sessionId, connectionId)
      if (!result.ok) {
        return jsonResponse({ error: result.error || 'bind failed' }, 400)
      }

      const bindings = registry.getSessionBindings ? registry.getSessionBindings(workspaceId) : {}
      return jsonResponse({ ok: true, sessionId, boundConnectionId: connectionId, bindings })
    }

    const unbindMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/unbind$/)
    if (unbindMatch && req.method === 'POST') {
      const workspaceId = unbindMatch[1] ?? ''
      const sessionId = unbindMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      if (!registry.unbindSession) {
        return jsonResponse({ error: 'session binding not supported' }, 501)
      }

      const ok = registry.unbindSession(workspaceId, sessionId)
      if (!ok) return jsonResponse({ error: 'binding not found' }, 404)

      const bindings = registry.getSessionBindings ? registry.getSessionBindings(workspaceId) : {}
      return jsonResponse({ ok: true, sessionId, bindings })
    }

    const sessionForkMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/fork$/)
    if (sessionForkMatch && req.method === 'POST') {
      const workspaceId = sessionForkMatch[1] ?? ''
      const sessionId = sessionForkMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp
      return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/fork`)
    }

    const sessionShareMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/(share|unshare)$/)
    if (sessionShareMatch) {
      const workspaceId = sessionShareMatch[1] ?? ''
      const sessionId = sessionShareMatch[2] ?? ''
      const action = sessionShareMatch[3]
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (action === 'share' && req.method === 'POST') {
        return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/share`)
      }
      if (action === 'unshare' && req.method === 'POST') {
        const urlWithDir = ensureDirectoryQuery(req, wsOrResp.directory)
        const upstreamReq = new Request(urlWithDir.toString(), { method: 'DELETE', headers: req.headers })
        return proxyWorkspace(wsOrResp, upstreamReq, `/session/${sessionId}/share`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const sessionActionMatch = url.pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/(revert|unrevert|summarize)$/
    )
    if (sessionActionMatch && req.method === 'POST') {
      const workspaceId = sessionActionMatch[1] ?? ''
      const sessionId = sessionActionMatch[2] ?? ''
      const action = sessionActionMatch[3]
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp
      return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/${action}`)
    }

    const sessionTodoMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/todo$/)
    if (sessionTodoMatch && req.method === 'GET') {
      const workspaceId = sessionTodoMatch[1] ?? ''
      const sessionId = sessionTodoMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp
      return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/todo`)
    }

    const messagesMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/messages$/)
    if (messagesMatch) {
      const workspaceId = messagesMatch[1] ?? ''
      const sessionId = messagesMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        // Support cursor pagination while keeping compatibility with upstream "before".
        const urlWithDir = ensureDirectoryQuery(req, wsOrResp.directory)
        const upstreamUrl = new URL(urlWithDir.toString())
        const cursor = upstreamUrl.searchParams.get('cursor')
        const before = upstreamUrl.searchParams.get('before')
        if (cursor && !before) {
          upstreamUrl.searchParams.set('before', cursor)
        }
        upstreamUrl.searchParams.delete('cursor')

        const upstreamReq = new Request(upstreamUrl.toString(), req)
        return proxyWorkspace(wsOrResp, upstreamReq, `/session/${sessionId}/message`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const promptMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/prompt$/)
    if (promptMatch) {
      const workspaceId = promptMatch[1] ?? ''
      const sessionId = promptMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const executionWsOrResp = resolveExecutionWorkspaceOrResponse(registry, workspaceId, sessionId)
      if (executionWsOrResp instanceof Response) return executionWsOrResp

      const capabilityResp = requireCapability(executionWsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (req.method === 'POST') {
        return proxyWorkspace(executionWsOrResp, req, `/session/${sessionId}/message`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const abortMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/abort$/)
    if (abortMatch) {
      const workspaceId = abortMatch[1] ?? ''
      const sessionId = abortMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (req.method === 'POST') {
        return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/abort`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const commandMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/command$/)
    if (commandMatch) {
      const workspaceId = commandMatch[1] ?? ''
      const sessionId = commandMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const executionWsOrResp = resolveExecutionWorkspaceOrResponse(registry, workspaceId, sessionId)
      if (executionWsOrResp instanceof Response) return executionWsOrResp

      const capabilityResp = requireCapability(executionWsOrResp, 'commands')
      if (capabilityResp) return capabilityResp

      if (req.method === 'POST') {
        return proxyWorkspace(executionWsOrResp, req, `/session/${sessionId}/command`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const shellMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/shell$/)
    if (shellMatch) {
      const workspaceId = shellMatch[1] ?? ''
      const sessionId = shellMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const executionWsOrResp = resolveExecutionWorkspaceOrResponse(registry, workspaceId, sessionId)
      if (executionWsOrResp instanceof Response) return executionWsOrResp

      const capabilityResp = requireCapability(executionWsOrResp, 'commands')
      if (capabilityResp) return capabilityResp

      if (req.method === 'POST') {
        return proxyWorkspace(executionWsOrResp, req, `/session/${sessionId}/shell`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const permissionsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/permissions$/)
    if (permissionsMatch) {
      const workspaceId = permissionsMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'permissions')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/permission')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const questionsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/questions$/)
    if (questionsMatch) {
      const workspaceId = questionsMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'questions')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/question')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const permissionRespondMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/permissions\/respond$/)
    if (permissionRespondMatch && req.method === 'POST') {
      const workspaceId = permissionRespondMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'permissions')
      if (capabilityResp) return capabilityResp

      const body = await req.clone().json().catch(() => null)
      const sessionID = typeof body?.sessionID === 'string' ? body.sessionID : ''
      const permissionID = typeof body?.permissionID === 'string' ? body.permissionID : ''
      const response = body?.response

      if (!sessionID || !permissionID) {
        return jsonResponse({ error: 'sessionID and permissionID required' }, 400)
      }
      if (typeof response !== 'string' || !['once', 'always', 'reject'].includes(response)) {
        return jsonResponse({ error: 'invalid response' }, 400)
      }
      if (sessionID.includes('/') || permissionID.includes('/')) {
        return jsonResponse({ error: 'invalid id' }, 400)
      }

      // Upstream expects only { response } with IDs in the path.
      const upstreamReq = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify({ response }),
      })
      return proxyWorkspace(wsOrResp, upstreamReq, `/session/${sessionID}/permissions/${permissionID}`)
    }

    const questionReplyMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/questions\/reply$/)
    if (questionReplyMatch && req.method === 'POST') {
      const workspaceId = questionReplyMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'questions')
      if (capabilityResp) return capabilityResp

      const body = await req.clone().json().catch(() => null)
      const requestID = typeof body?.requestID === 'string' ? body.requestID : ''
      const answers = body?.answers

      if (!requestID) {
        return jsonResponse({ error: 'requestID required' }, 400)
      }
      if (!Array.isArray(answers)) {
        return jsonResponse({ error: 'answers required' }, 400)
      }
      if (requestID.includes('/')) {
        return jsonResponse({ error: 'invalid id' }, 400)
      }

      const upstreamReq = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify({ answers }),
      })
      return proxyWorkspace(wsOrResp, upstreamReq, `/question/${requestID}/reply`)
    }

    const questionRejectMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/questions\/reject$/)
    if (questionRejectMatch && req.method === 'POST') {
      const workspaceId = questionRejectMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'questions')
      if (capabilityResp) return capabilityResp

      const body = await req.clone().json().catch(() => null)
      const requestID = typeof body?.requestID === 'string' ? body.requestID : ''

      if (!requestID) {
        return jsonResponse({ error: 'requestID required' }, 400)
      }
      if (requestID.includes('/')) {
        return jsonResponse({ error: 'invalid id' }, 400)
      }

      const upstreamReq = new Request(req.url, { method: 'POST', headers: req.headers })
      return proxyWorkspace(wsOrResp, upstreamReq, `/question/${requestID}/reject`)
    }

    const diffsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)\/diffs$/)
    if (diffsMatch && req.method === 'GET') {
      const workspaceId = diffsMatch[1] ?? ''
      const sessionId = diffsMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'reviewDiffs')
      if (capabilityResp) return capabilityResp

      return proxyWorkspace(wsOrResp, req, `/session/${sessionId}/diff`)
    }

    const filesMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/files$/)
    if (filesMatch) {
      const workspaceId = filesMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'fileRead')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/file')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const fileContentMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/files\/content$/)
    if (fileContentMatch) {
      const workspaceId = fileContentMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'fileRead')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/file/content')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const fileSearchMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/files\/search$/)
    if (fileSearchMatch) {
      const workspaceId = fileSearchMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'fileSearch')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/find')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const pathSearchMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/paths\/search$/)
    if (pathSearchMatch) {
      const workspaceId = pathSearchMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'fileSearch')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        const urlWithDir = ensureDirectoryQuery(req, wsOrResp.directory)
        const upstreamUrl = new URL(urlWithDir.toString())
        const kind = upstreamUrl.searchParams.get('kind')
        if (kind) {
          if (kind === 'file') {
            upstreamUrl.searchParams.set('type', 'file')
          } else if (kind === 'dir' || kind === 'directory') {
            upstreamUrl.searchParams.set('type', 'directory')
          } else {
            upstreamUrl.searchParams.delete('type')
          }
          upstreamUrl.searchParams.delete('kind')
        }

        const upstreamReq = new Request(upstreamUrl.toString(), req)
        return proxyWorkspace(wsOrResp, upstreamReq, '/find/file')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const modelsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/models$/)
    if (modelsMatch) {
      const workspaceId = modelsMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'models')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        // Upstream "models" are exposed via provider list.
        return proxyWorkspace(wsOrResp, req, '/provider')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const agentsMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/agents$/)
    if (agentsMatch) {
      const workspaceId = agentsMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'agents')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/agent')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const commandsListMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/commands$/)
    if (commandsListMatch) {
      const workspaceId = commandsListMatch[1] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'commands')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET') {
        return proxyWorkspace(wsOrResp, req, '/command')
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const sessionMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions\/([^/]+)$/)
    if (sessionMatch) {
      const workspaceId = sessionMatch[1] ?? ''
      const sessionId = sessionMatch[2] ?? ''
      const wsOrResp = getWorkspaceOrResponse(registry, req, workspaceId)
      if (wsOrResp instanceof Response) return wsOrResp

      const capabilityResp = requireCapability(wsOrResp, 'chat')
      if (capabilityResp) return capabilityResp

      if (req.method === 'GET' || req.method === 'PATCH' || req.method === 'DELETE') {
        return proxyWorkspace(wsOrResp, req, `/session/${sessionId}`)
      }
      return jsonResponse({ error: 'method not allowed' }, 405)
    }

    const wsDeleteMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)$/)
    if (wsDeleteMatch && req.method === 'DELETE') {
      const ok = registry.disconnect(wsDeleteMatch[1] ?? '')
      if (!ok) return jsonResponse({ error: 'workspace not found' }, 404)
      return jsonResponse({ ok: true })
    }

    if (url.pathname.startsWith('/api/opencode')) {
      const targetPath = url.pathname.replace('/api/opencode', '') || '/'
      return proxyRequest(registry, req, targetPath)
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders() })
  }
}

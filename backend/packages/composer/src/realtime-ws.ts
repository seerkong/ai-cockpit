import {
  getSessionToken,
  jsonResponse,
  type WorkspaceRecord,
  type WorkspaceRegistryLike,
} from './app'
import type { SqliteStore } from '@backend/core'

import {
  parseRealtimeWsClientMessage,
  type JsonPatchOperation,
  type RealtimeStateV1,
  type RealtimeWsClientMessage,
  type RealtimeWsServerMessage,
} from 'shared'

import { applyOpencodeEventToRealtimeState, createRealtimeStateV1 } from '@backend/organ'

type UpgradeableServer<T> = {
  upgrade(req: Request, options: { data: T }): boolean
}

export type RealtimeWsData = {
  workspace: WorkspaceRecord
  store?: SqliteStore
  subscriptions: Set<string>
}

type ServerWebSocketLike<T> = {
  data: T
  send(payload: string): unknown
  close(code?: number, reason?: string): void
}

type WorkspaceHub = {
  workspace: WorkspaceRecord
  store?: SqliteStore
  state: RealtimeStateV1
  sockets: Set<ServerWebSocketLike<RealtimeWsData>>
  streaming: boolean
  streamAbort?: AbortController
  pendingOpsBySessionId: Map<string, JsonPatchOperation[]>
  flushTimer: ReturnType<typeof setTimeout> | null
}

const hubsByWorkspaceId = new Map<string, WorkspaceHub>()

function wsPathMatch(pathname: string): { workspaceId: string } | null {
  const match = pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/stream\/ws$/)
  if (!match) return null
  const workspaceId = match[1] ?? ''
  return workspaceId ? { workspaceId } : null
}

function sendServerMessage(ws: ServerWebSocketLike<RealtimeWsData>, msg: RealtimeWsServerMessage) {
  ws.send(JSON.stringify(msg))
}

function getOrCreateHub(workspace: WorkspaceRecord, store?: SqliteStore): WorkspaceHub {
  const existing = hubsByWorkspaceId.get(workspace.id)
  if (existing) return existing
  const hub: WorkspaceHub = {
    workspace,
    store,
    state: createRealtimeStateV1({ workspaceId: workspace.id }),
    sockets: new Set(),
    streaming: false,
    pendingOpsBySessionId: new Map(),
    flushTimer: null,
  }
  hubsByWorkspaceId.set(workspace.id, hub)
  return hub
}

function snapshotFor(ws: ServerWebSocketLike<RealtimeWsData>, hub: WorkspaceHub): RealtimeStateV1 {
  return {
    ...hub.state,
    subscriptions: { sessionIds: Array.from(ws.data.subscriptions) },
  }
}

function registerSocket(ws: ServerWebSocketLike<RealtimeWsData>, hub: WorkspaceHub) {
  hub.sockets.add(ws)
}

function unregisterSocket(ws: ServerWebSocketLike<RealtimeWsData>, hub: WorkspaceHub) {
  hub.sockets.delete(ws)
  if (hub.sockets.size === 0) {
    if (hub.flushTimer) { clearTimeout(hub.flushTimer); hub.flushTimer = null }
    try { hub.streamAbort?.abort() } catch { /* ignore */ }
    hubsByWorkspaceId.delete(hub.workspace.id)
  }
}

const PATCH_FLUSH_INTERVAL_MS = 25
const IMMEDIATE_FLUSH_EVENT_TYPES = new Set(['message.part.updated'])

function broadcastPatch(hub: WorkspaceHub, sessionId: string, ops: JsonPatchOperation[]) {
  if (ops.length === 0) return
  if (hub.sockets.size === 0) return
  const msg: RealtimeWsServerMessage = { type: 'patch', payload: { ops } }
  const payload = JSON.stringify(msg)
  for (const sock of hub.sockets) {
    if (!sock.data.subscriptions.has(sessionId)) continue
    sock.send(payload)
  }
}

function flushQueuedPatches(hub: WorkspaceHub) {
  if (hub.flushTimer) { clearTimeout(hub.flushTimer); hub.flushTimer = null }
  const entries = Array.from(hub.pendingOpsBySessionId.entries())
  hub.pendingOpsBySessionId.clear()
  for (const [sessionId, ops] of entries) {
    broadcastPatch(hub, sessionId, ops)
  }
}

function enqueuePatch(hub: WorkspaceHub, sessionId: string, ops: JsonPatchOperation[], options?: { immediate?: boolean }) {
  if (ops.length === 0) return
  const existing = hub.pendingOpsBySessionId.get(sessionId)
  if (existing) existing.push(...ops)
  else hub.pendingOpsBySessionId.set(sessionId, [...ops])
  if (options?.immediate) { flushQueuedPatches(hub); return }
  if (!hub.flushTimer) {
    hub.flushTimer = setTimeout(() => flushQueuedPatches(hub), PATCH_FLUSH_INTERVAL_MS)
  }
}

function startWorkspaceEventStream(hub: WorkspaceHub) {
  if (hub.streaming) return
  hub.streaming = true
  const abortController = new AbortController()
  hub.streamAbort = abortController
  const wsAny = hub.workspace as unknown as { eventControllers?: Set<AbortController> }
  wsAny.eventControllers?.add(abortController)

  void (async () => {
    const headers = new Headers()
    headers.set('Accept', 'text/event-stream')
    const proxyReqUrl = new URL('http://realtime.local/event')
    proxyReqUrl.searchParams.set('directory', hub.workspace.directory)
    const upstreamReq = new Request(proxyReqUrl.toString(), { method: 'GET', headers, signal: abortController.signal })
    const upstreamResp = await hub.workspace.provider.proxy(upstreamReq, '/event').catch(() => null)
    if (!upstreamResp || !upstreamResp.ok || !upstreamResp.body) {
      hub.streaming = false
      wsAny.eventControllers?.delete(abortController)
      return
    }
    const reader = upstreamResp.body.getReader()
    abortController.signal.addEventListener('abort', () => { try { void reader.cancel() } catch { /* ignore */ } }, { once: true })
    const decoder = new TextDecoder()
    let buffer = ''
    let eventData = ''
    try {
      while (!abortController.signal.aborted) {
        let done = false
        let value: Uint8Array | undefined
        try { const read = await reader.read(); done = read.done; value = read.value } catch { done = true; value = undefined }
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) { eventData += line.slice('data: '.length); continue }
          if (line === '' && eventData) {
            let parsed: unknown | null = null
            try { parsed = JSON.parse(eventData) } catch { parsed = null }
            eventData = ''
            if (!parsed) continue
            const raw = parsed as { type?: unknown; properties?: Record<string, unknown> }
            const type = typeof raw.type === 'string' ? raw.type : ''
            if (!type) continue
            const evt = { type, properties: raw.properties } satisfies { type: string; properties?: Record<string, unknown> }
            const mapped = applyOpencodeEventToRealtimeState(hub.state, evt)
            if (hub.store) {
              try { hub.store.insertEvent({ workspaceId: hub.workspace.id, sessionId: mapped.sessionId, type: evt.type, data: evt }) } catch { /* ignore */ }
            }
            if (mapped.ops.length === 0 || !mapped.sessionId) continue
            enqueuePatch(hub, mapped.sessionId, mapped.ops, { immediate: IMMEDIATE_FLUSH_EVENT_TYPES.has(evt.type) })
          }
        }
      }
    } finally {
      flushQueuedPatches(hub)
      try { await reader.cancel() } catch { /* ignore */ }
      try { reader.releaseLock() } catch { /* ignore */ }
      wsAny.eventControllers?.delete(abortController)
      hub.streaming = false
    }
  })()
}

async function handleClientMessage(ws: ServerWebSocketLike<RealtimeWsData>, hub: WorkspaceHub, msg: RealtimeWsClientMessage) {
  if (msg.type === 'subscribe') {
    ws.data.subscriptions = new Set(msg.payload.sessionIds)
    sendServerMessage(ws, { type: 'snapshot', payload: { state: snapshotFor(ws, hub) } })
    startWorkspaceEventStream(hub)
    return
  }
  if (msg.type === 'unsubscribe') {
    for (const id of msg.payload.sessionIds) ws.data.subscriptions.delete(id)
    sendServerMessage(ws, { type: 'snapshot', payload: { state: snapshotFor(ws, hub) } })
    return
  }
}

export function tryUpgradeRealtimeWs(
  req: Request,
  server: UpgradeableServer<RealtimeWsData>,
  registry: WorkspaceRegistryLike,
  store?: SqliteStore,
): Response | null | undefined {
  const url = new URL(req.url)
  const match = wsPathMatch(url.pathname)
  if (!match) return null
  const handshake = resolveRealtimeWsHandshake(req, registry, match.workspaceId)
  if ('response' in handshake) return handshake.response
  const workspace = handshake.workspace
  const ok = server.upgrade(req, { data: { workspace, store, subscriptions: new Set<string>() } })
  if (!ok) return jsonResponse({ error: 'websocket upgrade failed' }, 400)
  return undefined
}

export function resolveRealtimeWsHandshake(
  req: Request,
  registry: WorkspaceRegistryLike,
  workspaceId: string,
): { workspace: WorkspaceRecord } | { response: Response } {
  if (req.method !== 'GET') return { response: jsonResponse({ error: 'method not allowed' }, 405) }
  const token = getSessionToken(req)
  if (!token) return { response: jsonResponse({ error: 'missing session token' }, 401) }
  const workspace = registry.getByToken(token)
  if (!workspace) return { response: jsonResponse({ error: 'invalid session token' }, 401) }
  if (workspace.id !== workspaceId) return { response: jsonResponse({ error: 'workspace mismatch' }, 403) }
  return { workspace }
}

export function createRealtimeWsHandler() {
  return {
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true,
    open(ws: ServerWebSocketLike<RealtimeWsData>) {
      ws.data.subscriptions = new Set<string>()
      const hub = getOrCreateHub(ws.data.workspace, ws.data.store)
      registerSocket(ws, hub)
    },
    async message(ws: ServerWebSocketLike<RealtimeWsData>, message: string | ArrayBuffer | Uint8Array) {
      const text = typeof message === 'string' ? message : message instanceof ArrayBuffer ? new TextDecoder().decode(message) : new TextDecoder().decode(message)
      let parsedJson: unknown
      try { parsedJson = JSON.parse(text) } catch {
        sendServerMessage(ws, { type: 'error', payload: { message: 'invalid json' } })
        return
      }
      const parsed = parseRealtimeWsClientMessage(parsedJson)
      if (!parsed) {
        sendServerMessage(ws, { type: 'error', payload: { message: 'invalid message' } })
        return
      }
      const hub = getOrCreateHub(ws.data.workspace, ws.data.store)
      await handleClientMessage(ws, hub, parsed)
    },
    close(ws: ServerWebSocketLike<RealtimeWsData>) {
      const hub = hubsByWorkspaceId.get(ws.data.workspace.id)
      if (!hub) return
      unregisterSocket(ws, hub)
    },
  }
}

import { parseRealtimeWsServerMessage } from 'shared'

import type { WorkspaceRecord, WorkspaceRegistryLike } from '../src/app'
import type { WorkspaceProvider } from '@backend/core'
import { createRealtimeWsHandler, tryUpgradeRealtimeWs } from '../src/realtime-ws'

function createStubProvider(directory: string, eventStreamBody?: string | ReadableStream<Uint8Array>): WorkspaceProvider {
  return {
    providerType: 'opencode.local',
    directory,
    capabilities: {
      chat: true, events: true, reviewDiffs: true, inlineComments: true,
      fileRead: true, fileSearch: true, commands: true, agents: true,
      models: true, permissions: true, questions: true,
    },
    async request() { return new Response('not-implemented', { status: 501 }) },
    async proxy(req: Request, targetPath: string) {
      if (targetPath === '/event' && req.method === 'GET' && eventStreamBody) {
        return new Response(eventStreamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }
      return new Response('not-implemented', { status: 501 })
    },
    dispose() {},
  }
}

function createRegistry(ws: WorkspaceRecord): WorkspaceRegistryLike {
  return {
    async connectLocal() { throw new Error('not implemented') },
    list() { return [ws] },
    getByToken(token: string) { return token === ws.token ? ws : undefined },
    disconnect() { return false },
    cleanupExpired() {},
  }
}

function wsUrl(port: number, path: string) {
  return `ws://localhost:${port}${path}`
}

describe('realtime ws endpoint', () => {
  test('handshake + subscribe yields snapshot', async () => {
    const wsRecord: WorkspaceRecord = {
      id: 'ws_1', token: 'tok_1', directory: 'C:/repo', createdAt: Date.now(),
      provider: createStubProvider('C:/repo'),
    }
    const registry = createRegistry(wsRecord)
    const server = Bun.serve({
      port: 0, idleTimeout: 0,
      fetch(req, server) {
        const upgradedOrResponse = tryUpgradeRealtimeWs(req, server, registry)
        if (upgradedOrResponse === null) return new Response('Not Found', { status: 404 })
        return upgradedOrResponse
      },
      websocket: createRealtimeWsHandler(),
    })
    const client = new WebSocket(
      wsUrl(server.port, `/api/v1/workspaces/${wsRecord.id}/stream/ws?token=${encodeURIComponent(wsRecord.token)}`),
    )
    const result = await new Promise<{ stateVersion: number; workspaceId: string; sessionIds: string[] }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 1000)
      client.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
      client.onopen = () => { client.send(JSON.stringify({ type: 'subscribe', payload: { sessionIds: ['sess_123'] } })) }
      client.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : ''
        const parsed = parseRealtimeWsServerMessage(JSON.parse(raw))
        if (!parsed || parsed.type !== 'snapshot') return
        const state = parsed.payload.state
        clearTimeout(timer)
        client.close()
        resolve({ stateVersion: state.schemaVersion, workspaceId: state.workspaceId, sessionIds: state.subscriptions.sessionIds })
      }
    })
    expect(result.stateVersion).toBe(1)
    expect(result.workspaceId).toBe('ws_1')
    expect(result.sessionIds).toEqual(['sess_123'])
    server.stop(true)
  })

  test('subscribed clients receive patch updates from upstream events', async () => {
    const bodyText =
      'data: ' + JSON.stringify({ type: 'message.part.updated', properties: { part: { id: 'part_1', type: 'text', sessionID: 'sess_123', messageID: 'msg_1', text: 'h' }, delta: 'a' } }) + '\n\n' +
      'data: ' + JSON.stringify({ type: 'message.part.updated', properties: { part: { id: 'part_1', type: 'text', sessionID: 'sess_123', messageID: 'msg_1', text: 'he' }, delta: 'b' } }) + '\n\n'
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(bodyText)) } })
    const wsRecord: WorkspaceRecord = {
      id: 'ws_1', token: 'tok_1', directory: 'C:/repo', createdAt: Date.now(),
      provider: createStubProvider('C:/repo', body),
    }
    const registry = createRegistry(wsRecord)
    const server = Bun.serve({
      port: 0, idleTimeout: 0,
      fetch(req, server) {
        const upgradedOrResponse = tryUpgradeRealtimeWs(req, server, registry)
        if (upgradedOrResponse === null) return new Response('Not Found', { status: 404 })
        return upgradedOrResponse
      },
      websocket: createRealtimeWsHandler(),
    })
    const client = new WebSocket(
      wsUrl(server.port, `/api/v1/workspaces/${wsRecord.id}/stream/ws?token=${encodeURIComponent(wsRecord.token)}`),
    )
    const got = await new Promise<{ patchFrameCount: number; hasPartUpdate: boolean; hasLatestText: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for incremental patches')), 1000)
      let patchFrameCount = 0
      let hasPartUpdate = false
      let hasLatestText = false
      client.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
      client.onopen = () => { client.send(JSON.stringify({ type: 'subscribe', payload: { sessionIds: ['sess_123'] } })) }
      client.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : ''
        const parsed = parseRealtimeWsServerMessage(JSON.parse(raw))
        if (!parsed) return
        if (parsed.type !== 'patch') return
        const ops = parsed.payload.ops
        patchFrameCount += 1
        hasPartUpdate = hasPartUpdate || ops.some((op) => op.path.startsWith('/parts/byId/part_1'))
        const isJsonRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
        hasLatestText = hasLatestText || ops.some((op) => { if (op.op !== 'add') return false; if (op.path !== '/parts/byId/part_1') return false; if (!isJsonRecord(op.value)) return false; return op.value.text === 'he' })
        if (patchFrameCount < 2 || !hasLatestText) return
        clearTimeout(timer)
        client.close()
        resolve({ patchFrameCount, hasPartUpdate, hasLatestText })
      }
    })
    expect(got.patchFrameCount).toBeGreaterThanOrEqual(2)
    expect(got.hasPartUpdate).toBe(true)
    expect(got.hasLatestText).toBe(true)
    server.stop(true)
  })
})

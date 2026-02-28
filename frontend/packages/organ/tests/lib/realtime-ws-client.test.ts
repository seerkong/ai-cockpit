import { describe, expect, test } from 'bun:test'

import { realtimeWsExamplePatch, realtimeWsExampleSnapshot } from 'shared'

import { buildWorkspaceRealtimeWsUrl, createRealtimeWsClient } from '../../src/lib/realtime-ws-client'

class FakeWebSocket {
  readyState = 0
  sent: string[] = []

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  private closedEventFired = false

  send(data: string) {
    this.sent.push(data)
  }

  close(code?: number, reason?: string) {
    if (this.readyState === 3) return
    this.readyState = 3
    if (this.closedEventFired) return
    this.closedEventFired = true
    this.onclose?.({ code, reason } as unknown as CloseEvent)
  }

  triggerOpen() {
    this.readyState = 1
    this.onopen?.({} as Event)
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data } as unknown as MessageEvent)
  }

  triggerClose(ev: { code?: number; reason?: string } = { code: 1006, reason: 'abnormal' }) {
    this.close(ev.code, ev.reason)
  }
}

function createManualScheduler() {
  let nextId = 1
  const fns = new Map<number, () => void>()
  return {
    schedule(fn: () => void, _delayMs: number) {
      const id = nextId++
      fns.set(id, fn)
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clear(id: ReturnType<typeof setTimeout>) {
      fns.delete(id as unknown as number)
    },
    runAll() {
      const pending = Array.from(fns.values())
      fns.clear()
      for (const fn of pending) fn()
    },
    pendingCount() {
      return fns.size
    },
  }
}

describe('realtime ws client', () => {
  test('buildWorkspaceRealtimeWsUrl uses ws/wss and token query param', () => {
    const prevWindow = (globalThis as any).window

    try {
      ;(globalThis as any).window = { location: { protocol: 'http:', href: 'http://localhost:3000/x' } }
      const wsUrl = buildWorkspaceRealtimeWsUrl({ workspaceId: 'ws_1', token: 't' })
      expect(wsUrl.startsWith('ws:')).toBe(true)
      expect(wsUrl).toContain('/api/v1/workspaces/ws_1/stream/ws')
      expect(wsUrl).toContain('token=t')

      ;(globalThis as any).window = { location: { protocol: 'https:', href: 'https://localhost:3000/x' } }
      const wssUrl = buildWorkspaceRealtimeWsUrl({ workspaceId: 'ws_1', token: 't' })
      expect(wssUrl.startsWith('wss:')).toBe(true)
    } finally {
      ;(globalThis as any).window = prevWindow
    }
  })

  test('sends subscribe on open', () => {
    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
    })

    client.start()
    expect(sockets.length).toBe(1)
    sockets[0]!.triggerOpen()

    expect(sockets[0]!.sent.length).toBe(1)
    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({ type: 'subscribe', payload: { sessionIds: ['sess_123'] } })
  })

  test('applies snapshot then patch and emits updated state', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')
    if (realtimeWsExamplePatch.type !== 'patch') throw new Error('expected patch example')

    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()
    const seen: any[] = []

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
      callbacks: {
        onState: (s) => seen.push(s),
      },
    })

    client.start()
    sockets[0]!.triggerOpen()
    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExampleSnapshot))
    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExamplePatch))

    expect(seen.length).toBe(2)
    expect(seen[0]!.sessions.byId.sess_123?.status).toBe('idle')
    expect(seen[1]!.sessions.byId.sess_123?.status).toBe('busy')
    expect(seen[1]!.parts.byId.part_1?.text).toBe('hi there')
  })

  test('calls onPatch with received ops', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')
    if (realtimeWsExamplePatch.type !== 'patch') throw new Error('expected patch example')

    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()
    const seenOpsCounts: number[] = []

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
      callbacks: {
        onPatch: (ops) => seenOpsCounts.push(ops.length),
      },
    })

    client.start()
    sockets[0]!.triggerOpen()
    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExampleSnapshot))
    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExamplePatch))

    expect(seenOpsCounts).toEqual([realtimeWsExamplePatch.payload.ops.length])
  })

  test('patch before snapshot triggers resubscribe', () => {
    if (realtimeWsExamplePatch.type !== 'patch') throw new Error('expected patch example')

    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
    })

    client.start()
    sockets[0]!.triggerOpen()
    expect(sockets[0]!.sent.length).toBe(1)

    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExamplePatch))
    expect(sockets[0]!.sent.length).toBe(2)
  })

  test('patch apply failure triggers resubscribe', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')

    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
    })

    client.start()
    sockets[0]!.triggerOpen()
    sockets[0]!.triggerMessage(JSON.stringify(realtimeWsExampleSnapshot))
    expect(sockets[0]!.sent.length).toBe(1)

    const badPatchMsg = {
      type: 'patch',
      payload: {
        ops: [{ op: 'replace', path: '/nope', value: 1 }],
      },
    }
    sockets[0]!.triggerMessage(JSON.stringify(badPatchMsg))
    expect(sockets[0]!.sent.length).toBe(2)
  })

  test('close after open schedules reconnect', () => {
    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      reconnectBaseDelayMs: 1,
      reconnectMaxDelayMs: 1,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
    })

    client.start()
    sockets[0]!.triggerOpen()
    sockets[0]!.triggerClose({ code: 1006, reason: 'abnormal' })
    expect(scheduler.pendingCount()).toBe(1)

    scheduler.runAll()
    expect(sockets.length).toBe(2)
  })

  test('repeated initial failures trigger fallback to SSE', () => {
    const sockets: FakeWebSocket[] = []
    const scheduler = createManualScheduler()
    const fallbackReasons: string[] = []

    const client = createRealtimeWsClient({
      url: 'ws://example.test',
      sessionIds: ['sess_123'],
      reconnectJitterMs: 0,
      reconnectBaseDelayMs: 1,
      reconnectMaxDelayMs: 1,
      maxInitialFailuresBeforeFallback: 2,
      createWebSocket: () => {
        const ws = new FakeWebSocket()
        sockets.push(ws)
        return ws
      },
      schedule: scheduler.schedule,
      clearSchedule: scheduler.clear,
      callbacks: {
        onFallbackToSse: (reason) => fallbackReasons.push(reason),
      },
    })

    client.start()
    expect(sockets.length).toBe(1)

    sockets[0]!.triggerClose({ code: 1006, reason: 'abnormal' })
    expect(scheduler.pendingCount()).toBe(1)
    scheduler.runAll()
    expect(sockets.length).toBe(2)

    sockets[1]!.triggerClose({ code: 1006, reason: 'abnormal' })
    expect(fallbackReasons.length).toBe(1)
    expect(scheduler.pendingCount()).toBe(0)
    scheduler.runAll()
    expect(sockets.length).toBe(2)
  })
})

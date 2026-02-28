import { parseRealtimeWsServerMessage, type JsonPatchOperation, type RealtimeStateV1 } from 'shared'

import { applyJsonPatch } from '@frontend/core'

type RealtimeWsClientCallbacks = {
  onConnected?: () => void
  onDisconnected?: (info: { code?: number; reason?: string }) => void
  onState?: (state: RealtimeStateV1) => void
  onPatch?: (ops: JsonPatchOperation[]) => void
  onFallbackToSse?: (reason: string) => void
  onError?: (message: string) => void
}

type WebSocketLike = {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void

  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
}

type WebSocketFactory = (url: string) => WebSocketLike
type Schedule = (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>
type ClearSchedule = (id: ReturnType<typeof setTimeout>) => void

export type RealtimeWsClientOptions = {
  url: string
  sessionIds: string[]
  maxInitialFailuresBeforeFallback?: number
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
  reconnectJitterMs?: number
  createWebSocket?: WebSocketFactory
  schedule?: Schedule
  clearSchedule?: ClearSchedule
  callbacks?: RealtimeWsClientCallbacks
}

export type RealtimeWsClient = {
  start(): void
  stop(): void
  setSessionIds(sessionIds: string[]): void
  getState(): RealtimeStateV1 | null
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url)
}

export function buildWorkspaceRealtimeWsUrl(input: { workspaceId: string; token: string }): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(window.location.href)
  url.protocol = proto
  url.pathname = `/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/stream/ws`
  url.search = ''
  url.searchParams.set('token', input.token)
  return url.toString()
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function nextReconnectDelayMs(attempt: number, base: number, max: number, jitter: number): number {
  const exp = base * Math.pow(2, Math.max(0, attempt))
  const delay = clamp(exp, base, max)
  const jitterAmount = jitter > 0 ? Math.floor(Math.random() * jitter) : 0
  return delay + jitterAmount
}

function stringifySubscribe(sessionIds: string[]): string {
  return JSON.stringify({ type: 'subscribe', payload: { sessionIds } })
}

export function createRealtimeWsClient(options: RealtimeWsClientOptions): RealtimeWsClient {
  const createWebSocket = options.createWebSocket ?? defaultWebSocketFactory
  const schedule = options.schedule ?? setTimeout
  const clearSchedule = options.clearSchedule ?? clearTimeout

  const callbacks = options.callbacks ?? {}

  const maxInitialFailuresBeforeFallback = options.maxInitialFailuresBeforeFallback ?? 3
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 250
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 5000
  const reconnectJitterMs = options.reconnectJitterMs ?? 250

  let desiredSessionIds = [...options.sessionIds]
  let ws: WebSocketLike | null = null
  let stopped = false
  let hasEverOpened = false
  let initialFailures = 0
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let state: RealtimeStateV1 | null = null

  function clearReconnectTimer() {
    if (!reconnectTimer) return
    clearSchedule(reconnectTimer)
    reconnectTimer = null
  }

  function stopInternal(reason?: string) {
    stopped = true
    clearReconnectTimer()
    try {
      ws?.close(1000, reason)
    } catch {
      // ignore
    }
    ws = null
  }

  function resubscribe() {
    if (!ws) return
    if (ws.readyState !== 1) return
    ws.send(stringifySubscribe(desiredSessionIds))
  }

  function scheduleReconnect() {
    if (stopped) return
    clearReconnectTimer()
    const delay = nextReconnectDelayMs(reconnectAttempt, reconnectBaseDelayMs, reconnectMaxDelayMs, reconnectJitterMs)
    reconnectAttempt += 1
    reconnectTimer = schedule(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function handleMessage(data: unknown) {
    if (typeof data !== 'string') return

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }

    const msg = parseRealtimeWsServerMessage(parsed)
    if (!msg) return

    if (msg.type === 'error') {
      callbacks.onError?.(msg.payload.message)
      return
    }

    if (msg.type === 'snapshot') {
      state = msg.payload.state
      callbacks.onState?.(state)
      return
    }

    // patch
    const ops = msg.payload.ops
    callbacks.onPatch?.(ops)
    if (!state) {
      callbacks.onError?.('received patch before snapshot; requesting resync')
      resubscribe()
      return
    }

    const res = applyJsonPatch(state, ops as JsonPatchOperation[])
    if (!res.ok) {
      callbacks.onError?.(`patch apply failed; requesting resync: ${res.error}`)
      resubscribe()
      return
    }

    state = res.state
    callbacks.onState?.(state)
  }

  function connect() {
    if (stopped) return

    // Avoid leaking handlers from previous sockets.
    try {
      ws?.close(1000, 'reconnect')
    } catch {
      // ignore
    }

    const next = createWebSocket(options.url)
    ws = next

    next.onopen = () => {
      if (stopped) return
      hasEverOpened = true
      initialFailures = 0
      reconnectAttempt = 0
      callbacks.onConnected?.()
      resubscribe()
    }

    next.onmessage = (ev) => {
      if (stopped) return
      handleMessage(ev.data)
    }

    next.onerror = () => {
      // onclose is responsible for reconnection/fallback.
    }

    next.onclose = (ev) => {
      if (stopped) return
      callbacks.onDisconnected?.({ code: ev.code, reason: ev.reason })

      // If WS is consistently unavailable (e.g. proxy blocks upgrades), fall back quickly.
      if (!hasEverOpened) {
        initialFailures += 1
        if (initialFailures >= maxInitialFailuresBeforeFallback) {
          callbacks.onFallbackToSse?.('websocket unavailable; falling back to SSE')
          stopInternal('fallback')
          return
        }
      }

      scheduleReconnect()
    }
  }

  return {
    start() {
      stopped = false
      connect()
    },
    stop() {
      stopInternal('stop')
    },
    setSessionIds(sessionIds: string[]) {
      desiredSessionIds = [...sessionIds]
      resubscribe()
    },
    getState() {
      return state
    },
  }
}

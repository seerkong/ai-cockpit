import { Elysia, t } from 'elysia'

import { createFetchHandler, type WorkspaceRegistryLike } from './app'
import {
  createRealtimeWsHandler,
  resolveRealtimeWsHandshake,
  tryUpgradeRealtimeWs,
  type RealtimeWsData,
} from './realtime-ws'
import type { SqliteStore } from './storage/sqlite'

export type BackendRuntimeMode = 'elysia' | 'legacy'

type BackendServerHandle = {
  mode: BackendRuntimeMode
  port: number
  stop(force?: boolean): void | Promise<void>
}

type StartBackendServerOptions = {
  mode: BackendRuntimeMode
  port: number
  registry: WorkspaceRegistryLike
  store: SqliteStore
}

type ElysiaSocketContext = {
  request?: Request
  params?: { workspaceId?: string }
} & Partial<RealtimeWsData>

type RealtimeWsSocket = {
  data: RealtimeWsData
  send(payload: string): unknown
  close(code?: number, reason?: string): void
}

export function resolveBackendRuntime(raw = process.env.BACKEND_RUNTIME): BackendRuntimeMode {
  return raw?.toLowerCase() === 'legacy' ? 'legacy' : 'elysia'
}

function normalizeWsMessage(message: unknown): string | ArrayBuffer | Uint8Array {
  if (typeof message === 'string') return message
  if (message instanceof ArrayBuffer) return message
  if (message instanceof Uint8Array) return message
  return JSON.stringify(message)
}

function startLegacyServer(port: number, registry: WorkspaceRegistryLike, store: SqliteStore): BackendServerHandle {
  const fetchHandler = createFetchHandler(registry, store)
  const server = Bun.serve({
    port,
    idleTimeout: 0,
    fetch(req, bunServer) {
      const upgradedOrResponse = tryUpgradeRealtimeWs(req, bunServer, registry, store)
      if (upgradedOrResponse === null) {
        return fetchHandler(req)
      }
      return upgradedOrResponse
    },
    websocket: createRealtimeWsHandler(),
  })

  return {
    mode: 'legacy',
    port: server.port ?? port,
    stop(force?: boolean) {
      server.stop(force)
    },
  }
}

function startElysiaServer(port: number, registry: WorkspaceRegistryLike, store: SqliteStore): BackendServerHandle {
  const fetchHandler = createFetchHandler(registry, store)
  const legacyWsHandler = createRealtimeWsHandler()

  const app = new Elysia()
    .ws('/api/v1/workspaces/:workspaceId/stream/ws', {
      params: t.Object({ workspaceId: t.String() }),
      beforeHandle({ request, params }) {
        const handshake = resolveRealtimeWsHandshake(request, registry, params.workspaceId)
        if ('response' in handshake) return handshake.response
      },
      open(ws) {
        const data = ws.data as unknown as ElysiaSocketContext
        const request = data.request
        const workspaceId = data.params?.workspaceId
        if (!(request instanceof Request) || typeof workspaceId !== 'string') {
          ws.close(1008, 'invalid websocket context')
          return
        }

        const handshake = resolveRealtimeWsHandshake(request, registry, workspaceId)
        if ('response' in handshake) {
          ws.close(1008, 'unauthorized')
          return
        }

        data.workspace = handshake.workspace
        data.store = store
        data.subscriptions = new Set<string>()
        legacyWsHandler.open(ws as unknown as RealtimeWsSocket)
      },
      async message(ws, message) {
        const data = ws.data as unknown as ElysiaSocketContext
        if (!data.workspace || !data.subscriptions) return
        await legacyWsHandler.message(ws as unknown as RealtimeWsSocket, normalizeWsMessage(message))
      },
      close(ws) {
        const data = ws.data as unknown as ElysiaSocketContext
        if (!data.workspace || !data.subscriptions) return
        legacyWsHandler.close(ws as unknown as RealtimeWsSocket)
      },
    })
    .all('/', ({ request }) => fetchHandler(request))
    .all('/*', ({ request }) => fetchHandler(request))

  app.listen({
    port,
    idleTimeout: 0,
  })

  const bunServer = app.server
  if (!bunServer) {
    throw new Error('elysia server failed to start')
  }

  return {
    mode: 'elysia',
    port: bunServer.port ?? port,
    stop(force?: boolean) {
      bunServer.stop(force)
    },
  }
}

export function startBackendServer(options: StartBackendServerOptions): BackendServerHandle {
  if (options.mode === 'legacy') {
    return startLegacyServer(options.port, options.registry, options.store)
  }
  return startElysiaServer(options.port, options.registry, options.store)
}

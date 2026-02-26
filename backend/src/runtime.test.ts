import { describe, expect, test } from 'bun:test'

import { parseRealtimeWsServerMessage } from 'shared'

import type { WorkspaceRecord, WorkspaceRegistryLike } from './app'
import type { WorkspaceProvider } from './providers/types'
import { resolveBackendRuntime, startBackendServer } from './runtime'

function createProvider(directory: string): WorkspaceProvider {
  return {
    providerType: 'opencode.local',
    directory,
    capabilities: {
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
    },
    async request() {
      return new Response('not-implemented', { status: 501 })
    },
    async proxy() {
      return new Response('not-implemented', { status: 501 })
    },
    dispose() {
      // no-op
    },
  }
}

function createRegistry(workspace: WorkspaceRecord): WorkspaceRegistryLike {
  return {
    async connectLocal() {
      throw new Error('not implemented')
    },
    list() {
      return [workspace]
    },
    getByToken(token: string) {
      return token === workspace.token ? workspace : undefined
    },
    disconnect() {
      return false
    },
    cleanupExpired() {
      // no-op
    },
  }
}

async function stopServer(server: { stop(force?: boolean): void | Promise<void> }) {
  await server.stop(true)
}

describe('resolveBackendRuntime', () => {
  test('defaults to elysia when value missing', () => {
    expect(resolveBackendRuntime(undefined)).toBe('elysia')
  })

  test('uses legacy when BACKEND_RUNTIME=legacy', () => {
    expect(resolveBackendRuntime('legacy')).toBe('legacy')
  })

  test('falls back to elysia for unknown values', () => {
    expect(resolveBackendRuntime('anything-else')).toBe('elysia')
  })
})

describe('startBackendServer', () => {
  test('starts health endpoint in legacy mode', async () => {
    const workspace: WorkspaceRecord = {
      id: 'runtime_ws_legacy',
      token: 'runtime_tok_legacy',
      directory: 'C:/repo',
      createdAt: Date.now(),
      provider: createProvider('C:/repo'),
    }
    const registry = createRegistry(workspace)

    const server = startBackendServer({
      mode: 'legacy',
      port: 0,
      registry,
      store: undefined as never,
    })

    try {
      const res = await fetch(`http://localhost:${server.port}/api/health`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.healthy).toBe(true)
    } finally {
      await stopServer(server)
    }
  })

  test('starts health endpoint in elysia mode', async () => {
    const workspace: WorkspaceRecord = {
      id: 'runtime_ws_elysia',
      token: 'runtime_tok_elysia',
      directory: 'C:/repo',
      createdAt: Date.now(),
      provider: createProvider('C:/repo'),
    }
    const registry = createRegistry(workspace)

    const server = startBackendServer({
      mode: 'elysia',
      port: 0,
      registry,
      store: undefined as never,
    })

    try {
      const res = await fetch(`http://localhost:${server.port}/api/health`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.healthy).toBe(true)
    } finally {
      await stopServer(server)
    }
  })

  test('elysia ws endpoint returns snapshot after subscribe', async () => {
    const workspace: WorkspaceRecord = {
      id: 'runtime_ws_snapshot',
      token: 'runtime_tok_snapshot',
      directory: 'C:/repo',
      createdAt: Date.now(),
      provider: createProvider('C:/repo'),
    }
    const registry = createRegistry(workspace)

    const server = startBackendServer({
      mode: 'elysia',
      port: 0,
      registry,
      store: undefined as never,
    })

    const client = new WebSocket(
      `ws://localhost:${server.port}/api/v1/workspaces/${workspace.id}/stream/ws?token=${encodeURIComponent(workspace.token)}`,
    )

    try {
      const snapshot = await new Promise<{ workspaceId: string; sessionIds: string[] }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for snapshot')), 1200)

        client.onerror = () => {
          clearTimeout(timer)
          reject(new Error('ws error'))
        }

        client.onopen = () => {
          client.send(JSON.stringify({ type: 'subscribe', payload: { sessionIds: ['sess_1'] } }))
        }

        client.onmessage = (event) => {
          const raw = typeof event.data === 'string' ? event.data : ''
          const parsed = parseRealtimeWsServerMessage(JSON.parse(raw))
          if (!parsed || parsed.type !== 'snapshot') return
          clearTimeout(timer)
          resolve({
            workspaceId: parsed.payload.state.workspaceId,
            sessionIds: parsed.payload.state.subscriptions.sessionIds,
          })
        }
      })

      expect(snapshot.workspaceId).toBe(workspace.id)
      expect(snapshot.sessionIds).toEqual(['sess_1'])
    } finally {
      client.close()
      await stopServer(server)
    }
  })
})

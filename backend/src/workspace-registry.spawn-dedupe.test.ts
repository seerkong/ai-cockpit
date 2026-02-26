import { describe, expect, test } from 'bun:test'
import type { WorkspaceProvider } from './providers/types'
import type { WorkspaceState } from './workspace-registry'
import { WorkspaceRegistry } from './workspace-registry'

function makeProvider(directory: string): WorkspaceProvider {
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
      return new Response('ok')
    },
    async proxy() {
      return new Response('ok')
    },
    dispose() {
      // no-op
    },
  }
}

function makeSpawnWorkspace(input: {
  id: string
  token: string
  directory: string
  createdAt: number
}): WorkspaceState {
  return {
    id: input.id,
    token: input.token,
    directory: input.directory,
    createdAt: input.createdAt,
    connectionMode: 'spawn',
    provider: makeProvider(input.directory),
    client: { stopEventStream() {} } as any,
    eventControllers: new Set(),
  }
}

describe('WorkspaceRegistry.connectLocal', () => {
  test('reuses and dedupes existing spawn connections by directory', async () => {
    const registry = new WorkspaceRegistry()
    const ws1 = makeSpawnWorkspace({
      id: 'ws_spawn_1',
      token: 'tok_spawn_1',
      directory: 'C:/repo-a',
      createdAt: 100,
    })
    const ws2 = makeSpawnWorkspace({
      id: 'ws_spawn_2',
      token: 'tok_spawn_2',
      directory: 'C:/repo-a',
      createdAt: 200,
    })

    ;(registry as any).byId.set(ws1.id, ws1)
    ;(registry as any).byToken.set(ws1.token, ws1)
    ;(registry as any).byId.set(ws2.id, ws2)
    ;(registry as any).byToken.set(ws2.token, ws2)

    const reused = await registry.connectLocal('C:/repo-a', { autoApprove: true })

    expect(reused.id).toBe('ws_spawn_1')
    expect(registry.getById('ws_spawn_1')).toBeTruthy()
    expect(registry.getById('ws_spawn_2')).toBeUndefined()
  })

  test('createConnection forces a new spawn connection for same workspace directory', async () => {
    const registry = new WorkspaceRegistry()
    const anchor = makeSpawnWorkspace({
      id: 'ws_anchor',
      token: 'tok_anchor',
      directory: 'C:/repo-a',
      createdAt: 100,
    })

    ;(registry as any).byId.set(anchor.id, anchor)
    ;(registry as any).byToken.set(anchor.token, anchor)

    let capturedOptions: { autoApprove?: boolean; forceNew?: boolean } | undefined
    ;(registry as any).connectLocal = async (
      directory: string,
      options?: { autoApprove?: boolean; forceNew?: boolean },
    ) => {
      expect(directory).toBe('C:/repo-a')
      capturedOptions = options
      return anchor
    }

    await registry.createConnection(anchor.id, { mode: 'spawn', autoApprove: true })

    expect(capturedOptions).toEqual({ autoApprove: true, forceNew: true })
  })
})

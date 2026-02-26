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
      // noop
    },
  }
}

function makePortWorkspace(input: {
  id: string
  token: string
  directory: string
  createdAt: number
  serverPort: number
}): WorkspaceState {
  return {
    id: input.id,
    token: input.token,
    directory: input.directory,
    createdAt: input.createdAt,
    connectionMode: 'port',
    serverPort: input.serverPort,
    provider: makeProvider(input.directory),
    client: { stopEventStream() {} } as any,
    eventControllers: new Set(),
  }
}

describe('WorkspaceRegistry.connectLocalPort', () => {
  test('reuses and dedupes existing connections by port', async () => {
    const registry = new WorkspaceRegistry()
    const ws1 = makePortWorkspace({
      id: 'ws_port_1',
      token: 'tok_port_1',
      directory: 'C:/repo-a',
      createdAt: 100,
      serverPort: 3009,
    })
    const ws2 = makePortWorkspace({
      id: 'ws_port_2',
      token: 'tok_port_2',
      directory: 'C:/repo-b',
      createdAt: 200,
      serverPort: 3009,
    })

    ;(registry as any).byId.set(ws1.id, ws1)
    ;(registry as any).byToken.set(ws1.token, ws1)
    ;(registry as any).byId.set(ws2.id, ws2)
    ;(registry as any).byToken.set(ws2.token, ws2)

    const reused = await registry.connectLocalPort('C:/repo-new', 3009)

    expect(reused.id).toBe('ws_port_1')
    expect(registry.getById('ws_port_1')).toBeTruthy()
    expect(registry.getById('ws_port_2')).toBeUndefined()
  })

  test('createConnection forces a new port connection for same workspace directory', async () => {
    const registry = new WorkspaceRegistry()
    const anchor = makePortWorkspace({
      id: 'ws_anchor',
      token: 'tok_anchor',
      directory: 'C:/repo-a',
      createdAt: 100,
      serverPort: 3009,
    })

    ;(registry as any).byId.set(anchor.id, anchor)
    ;(registry as any).byToken.set(anchor.token, anchor)

    let capturedDirectory = ''
    let capturedPort = 0
    let capturedOptions: { forceNew?: boolean } | undefined
    ;(registry as any).connectLocalPort = async (
      directory: string,
      port: number,
      options?: { forceNew?: boolean },
    ) => {
      capturedDirectory = directory
      capturedPort = port
      capturedOptions = options
      return anchor
    }

    await registry.createConnection(anchor.id, { mode: 'port', serverPort: 3009 })

    expect(capturedDirectory).toBe('C:/repo-a')
    expect(capturedPort).toBe(3009)
    expect(capturedOptions).toEqual({ forceNew: true })
  })
})

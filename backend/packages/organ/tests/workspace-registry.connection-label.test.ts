import { describe, expect, test } from 'bun:test'
import type { WorkspaceProvider } from '@backend/core'
import type { WorkspaceState } from '../src/workspace-registry'
import { WorkspaceRegistry } from '../src/workspace-registry'

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

function makeWorkspace(input: {
  id: string
  token: string
  directory: string
  createdAt: number
  connectionSeq: number
}): WorkspaceState {
  return {
    id: input.id,
    token: input.token,
    directory: input.directory,
    createdAt: input.createdAt,
    connectionSeq: input.connectionSeq,
    connectionMode: 'spawn',
    provider: makeProvider(input.directory),
    client: { stopEventStream() {} } as any,
    eventControllers: new Set(),
  }
}

describe('WorkspaceRegistry connection labels', () => {
  test('uses global connection sequence for conn-* labels', () => {
    const registry = new WorkspaceRegistry()
    const wsA = makeWorkspace({
      id: 'ws_a',
      token: 'tok_a',
      directory: 'C:/repo-a',
      createdAt: 100,
      connectionSeq: 1,
    })
    const wsB = makeWorkspace({
      id: 'ws_b',
      token: 'tok_b',
      directory: 'D:/repo-b',
      createdAt: 200,
      connectionSeq: 2,
    })

    ;(registry as any).byId.set(wsA.id, wsA)
    ;(registry as any).byToken.set(wsA.token, wsA)
    ;(registry as any).byId.set(wsB.id, wsB)
    ;(registry as any).byToken.set(wsB.token, wsB)

    const listA = registry.listConnections(wsA.id)
    const listB = registry.listConnections(wsB.id)

    expect(listA[0]?.label).toBe('conn-1')
    expect(listB[0]?.label).toBe('conn-2')
  })
})

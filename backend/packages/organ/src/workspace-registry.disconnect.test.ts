import { describe, expect, test } from 'bun:test';
import type { WorkspaceProvider } from '@backend/core';
import type { WorkspaceState } from './workspace-registry';
import { WorkspaceRegistry } from './workspace-registry';

function makeProvider(): WorkspaceProvider {
  return {
    providerType: 'opencode.local',
    directory: 'C:/repo',
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
      return new Response('not-implemented', { status: 501 });
    },
    async proxy() {
      return new Response('not-implemented', { status: 501 });
    },
    dispose() {
      // no-op
    },
  } satisfies WorkspaceProvider;
}

describe('WorkspaceRegistry.disconnect', () => {
  test('aborts active event controllers', () => {
    const registry = new WorkspaceRegistry();

    // Inject a fake workspace state to validate disconnect cleanup.
    const ws = {
      id: 'ws_test',
      token: 'tok_test',
      directory: 'C:/repo',
      createdAt: Date.now(),
      connectionMode: 'spawn',
      provider: makeProvider(),
      client: { stopEventStream() {} } as any,
      eventControllers: new Set<AbortController>(),
    } satisfies WorkspaceState;

    const ctrl = new AbortController();
    ws.eventControllers.add(ctrl);

    (registry as any).byId.set(ws.id, ws);
    (registry as any).byToken.set(ws.token, ws);

    const ok = registry.disconnect(ws.id);
    expect(ok).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
  });
});

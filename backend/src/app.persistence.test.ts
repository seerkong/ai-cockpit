import { describe, expect, test } from 'bun:test';

import { createFetchHandler, type WorkspaceRecord, type WorkspaceRegistryLike } from './app';
import type { WorkspaceProvider } from './providers/types';
import { SqliteStore } from './storage/sqlite';
import { ulid } from './ulid';

function createSseProvider(): WorkspaceProvider {
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
    async proxy(req: Request, targetPath: string): Promise<Response> {
      if (targetPath === '/event' && req.method === 'GET') {
        const body =
          'data: ' +
          JSON.stringify({
            type: 'message.part.updated',
            properties: {
              part: {
                id: 'part_1',
                type: 'text',
                sessionID: 'sess_123',
                messageID: 'msg_1',
                text: 'h',
              },
              delta: 'a',
            },
          }) +
          '\n\n' +
          'data: ' +
          JSON.stringify({
            type: 'message.part.updated',
            properties: {
              part: {
                id: 'part_1',
                type: 'text',
                sessionID: 'sess_123',
                messageID: 'msg_1',
                text: 'he',
              },
              delta: 'b',
            },
          }) +
          '\n\n' +
          'data: ' +
          JSON.stringify({ type: 'session.idle', properties: { sessionID: 'sess_123' } }) +
          '\n\n';

        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response('not-implemented', { status: 501 });
    },
    dispose() {
      // no-op
    },
  } satisfies WorkspaceProvider;
}

class StoreBackedRegistry implements WorkspaceRegistryLike {
  private byId = new Map<string, WorkspaceRecord>();
  private byToken = new Map<string, WorkspaceRecord>();

  constructor(private store: SqliteStore) {}

  async connectLocal(directory: string): Promise<WorkspaceRecord> {
    const wsRow = this.store.upsertWorkspace(directory);
    const ws: WorkspaceRecord = {
      id: wsRow.id,
      token: ulid(),
      directory: wsRow.directory,
      createdAt: wsRow.createdAt,
      provider: createSseProvider(),
    };
    this.byId.set(ws.id, ws);
    this.byToken.set(ws.token, ws);
    return ws;
  }

  list(): WorkspaceRecord[] {
    return Array.from(this.byId.values());
  }

  getByToken(token: string): WorkspaceRecord | undefined {
    return this.byToken.get(token);
  }

  disconnect(id: string): boolean {
    const ws = this.byId.get(id);
    if (!ws) return false;
    this.byId.delete(id);
    this.byToken.delete(ws.token);
    return true;
  }

  cleanupExpired(_maxAgeMs: number): void {
    // no-op
  }
}

describe('SSE persistence', () => {
  test('stores coalesced SSE events into SQLite event log', async () => {
    const store = new SqliteStore(':memory:');
    try {
      const registry = new StoreBackedRegistry(store);
      const ws = await registry.connectLocal('C:/repo');

      const fetchHandler = createFetchHandler(registry, store);
      const res = await fetchHandler(
        new Request(`http://localhost/api/v1/workspaces/${ws.id}/events`, {
          headers: { 'x-proto-session': ws.token },
        }),
      );

      expect(res.status).toBe(200);
      await res.text();

      const events = store.listEvents({ workspaceId: ws.id, sessionId: 'sess_123', afterSeq: 0, limit: 10 });
      expect(events.length).toBe(2);
      expect(events[0]?.type).toBe('message.part.updated');
      expect(events[1]?.type).toBe('session.idle');
      expect(events[1]?.seq).toBeGreaterThan(events[0]?.seq ?? 0);
    } finally {
      store.close();
    }
  });
});

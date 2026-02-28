import { describe, expect, test } from 'bun:test';
import { SqliteStore } from '../../src/storage/sqlite';

describe('SqliteStore', () => {
  test('upsertWorkspace is stable per directory', () => {
    const store = new SqliteStore(':memory:');
    try {
      const a = store.upsertWorkspace('C:/repo');
      const b = store.upsertWorkspace('  C:/repo  ');
      expect(a.id).toBe(b.id);
      expect(a.directory).toBe('C:/repo');
      expect(typeof a.createdAt).toBe('number');
    } finally {
      store.close();
    }
  });

  test('insertEvent writes a stable cursor (seq) and can be queried', () => {
    const store = new SqliteStore(':memory:');
    try {
      const ws = store.upsertWorkspace('C:/repo');
      const e1 = store.insertEvent({ workspaceId: ws.id, sessionId: 'sess_1', type: 'session.status', data: { a: 1 } });
      const e2 = store.insertEvent({ workspaceId: ws.id, sessionId: 'sess_1', type: 'session.idle', data: { b: 2 } });

      expect(e2.seq).toBeGreaterThan(e1.seq);

      const all = store.listEvents({ workspaceId: ws.id, sessionId: 'sess_1', afterSeq: 0, limit: 10 });
      expect(all.length).toBe(2);
      expect(all[0]?.type).toBe('session.status');
      expect(all[1]?.type).toBe('session.idle');

      const after = store.listEvents({ workspaceId: ws.id, sessionId: 'sess_1', afterSeq: e1.seq, limit: 10 });
      expect(after.length).toBe(1);
      expect(after[0]?.type).toBe('session.idle');
    } finally {
      store.close();
    }
  });
});

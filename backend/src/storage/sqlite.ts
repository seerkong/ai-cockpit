import { Database } from 'bun:sqlite';
import { ulid } from '../ulid';

export type StoredWorkspace = {
  id: string;
  directory: string;
  createdAt: number;
};

export type StoredEvent = {
  seq: number;
  id: string;
  workspaceId: string;
  sessionId: string | null;
  type: string;
  data: unknown;
  createdAt: number;
};

export type ListEventsOptions = {
  workspaceId: string;
  sessionId?: string | null;
  afterSeq?: number;
  limit?: number;
};

export class SqliteStore {
  private db: Database;

  constructor(filename: string) {
    this.db = new Database(filename, { strict: true });
    this.init();
  }

  close(): void {
    this.db.close(true);
  }

  private init(): void {
    // WAL gives better read concurrency for typical app workloads.
    try {
      this.db.run('PRAGMA journal_mode = WAL;');
    } catch {
      // ignore (e.g. in-memory DB)
    }
    this.db.run('PRAGMA foreign_keys = ON;');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        directory TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);

    // Full event log (source of truth). seq is the stable cursor.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_events_workspace_session_seq
      ON events(workspace_id, session_id, seq);
    `);
  }

  /**
   * Workspaces are persisted as an independent table.
   * Connection method (spawn vs port) is not stored.
   */
  upsertWorkspace(directory: string): StoredWorkspace {
    const trimmed = directory.trim();
    if (!trimmed) throw new Error('directory required');

    const existing = this.db
      .query('SELECT id, directory, created_at as createdAt FROM workspaces WHERE directory = $directory')
      .get({ directory: trimmed }) as StoredWorkspace | null;
    if (existing) return existing;

    const id = ulid();
    const createdAt = Date.now();
    this.db
      .query('INSERT OR IGNORE INTO workspaces (id, directory, created_at) VALUES ($id, $directory, $createdAt)')
      .run({ id, directory: trimmed, createdAt });

    const row = this.db
      .query('SELECT id, directory, created_at as createdAt FROM workspaces WHERE directory = $directory')
      .get({ directory: trimmed }) as StoredWorkspace | null;
    if (!row) throw new Error('failed to upsert workspace');
    return row;
  }

  insertEvent(input: { workspaceId: string; sessionId?: string | null; type: string; data: unknown }): StoredEvent {
    const workspaceId = input.workspaceId;
    const sessionId = typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : null;
    const type = input.type;
    if (!workspaceId) throw new Error('workspaceId required');
    if (!type) throw new Error('type required');

    const id = ulid();
    const createdAt = Date.now();
    const dataJson = JSON.stringify(input.data ?? null);

    const result = this.db
      .query(
        'INSERT INTO events (id, workspace_id, session_id, type, data_json, created_at) VALUES ($id, $workspaceId, $sessionId, $type, $dataJson, $createdAt)'
      )
      .run({
        id,
        workspaceId,
        sessionId,
        type,
        dataJson,
        createdAt,
      });

    const seq = Number(result.lastInsertRowid);
    return { seq, id, workspaceId, sessionId, type, data: input.data, createdAt };
  }

  listEvents(options: ListEventsOptions): StoredEvent[] {
    const workspaceId = options.workspaceId;
    if (!workspaceId) throw new Error('workspaceId required');

    const limit = Math.max(1, Math.min(1000, options.limit ?? 200));
    const afterSeq = options.afterSeq ?? 0;
    const sessionId = typeof options.sessionId === 'string' && options.sessionId ? options.sessionId : null;

    const whereSession = sessionId ? 'AND session_id = $sessionId' : '';

    const rows = this.db
      .query(
        `SELECT seq, id, workspace_id as workspaceId, session_id as sessionId, type, data_json as dataJson, created_at as createdAt
         FROM events
         WHERE workspace_id = $workspaceId ${whereSession} AND seq > $afterSeq
         ORDER BY seq ASC
         LIMIT $limit`
      )
      .all({ workspaceId, sessionId, afterSeq, limit }) as Array<{
      seq: number;
      id: string;
      workspaceId: string;
      sessionId: string | null;
      type: string;
      dataJson: string;
      createdAt: number;
    }>;

    return rows.map((r) => {
      let data: unknown = null;
      try {
        data = JSON.parse(r.dataJson);
      } catch {
        data = null;
      }
      return {
        seq: r.seq,
        id: r.id,
        workspaceId: r.workspaceId,
        sessionId: r.sessionId,
        type: r.type,
        data,
        createdAt: r.createdAt,
      } satisfies StoredEvent;
    });
  }

  // Retention hook (policy decided elsewhere).
  pruneEvents(input: { workspaceId: string; beforeSeq: number }): number {
    const workspaceId = input.workspaceId;
    const beforeSeq = Math.max(0, Math.floor(input.beforeSeq));
    if (!workspaceId) throw new Error('workspaceId required');

    const result = this.db
      .query('DELETE FROM events WHERE workspace_id = $workspaceId AND seq < $beforeSeq')
      .run({ workspaceId, beforeSeq });
    return result.changes;
  }
}

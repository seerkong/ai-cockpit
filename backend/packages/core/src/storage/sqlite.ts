import { Database } from 'bun:sqlite';
import { ulid } from '../ulid';

export type StoredWorkspace = {
  id: string;
  directory: string;
  createdAt: number;
};

export type StoredConnection = {
  id: string;
  token: string;
  directory: string;
  connectionMode: 'spawn' | 'port';
  serverPort: number | null;
  autoApprove: boolean;
  createdAt: number;
  lastUsedAt: number | null;
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

    // Persisted connection credentials so local sessions can survive backend restarts.
    // Note: tokens are sensitive; keep the sqlite file local.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        directory TEXT NOT NULL,
        connection_mode TEXT NOT NULL,
        server_port INTEGER,
        auto_approve INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_connections_directory_created_at
      ON connections(directory, created_at);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_connections_last_used_at
      ON connections(last_used_at);
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

  upsertConnection(input: {
    id: string;
    token: string;
    directory: string;
    connectionMode: 'spawn' | 'port';
    serverPort?: number | null;
    autoApprove?: boolean;
    createdAt?: number;
    lastUsedAt?: number | null;
  }): StoredConnection {
    const id = input.id;
    const token = input.token;
    const directory = input.directory.trim();
    const connectionMode = input.connectionMode;
    const serverPort = typeof input.serverPort === 'number' && Number.isFinite(input.serverPort)
      ? Math.floor(input.serverPort)
      : null;
    const autoApprove = Boolean(input.autoApprove);
    const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? Math.floor(input.createdAt)
      : Date.now();
    const lastUsedAt = typeof input.lastUsedAt === 'number' && Number.isFinite(input.lastUsedAt)
      ? Math.floor(input.lastUsedAt)
      : null;

    if (!id) throw new Error('connection id required');
    if (!token) throw new Error('connection token required');
    if (!directory) throw new Error('connection directory required');

    this.db
      .query(
        `INSERT INTO connections (
           id, token, directory, connection_mode, server_port, auto_approve, created_at, last_used_at
         ) VALUES (
           $id, $token, $directory, $connectionMode, $serverPort, $autoApprove, $createdAt, $lastUsedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           token = excluded.token,
           directory = excluded.directory,
           connection_mode = excluded.connection_mode,
           server_port = excluded.server_port,
           auto_approve = excluded.auto_approve,
           last_used_at = excluded.last_used_at
        `,
      )
      .run({
        id,
        token,
        directory,
        connectionMode,
        serverPort,
        autoApprove: autoApprove ? 1 : 0,
        createdAt,
        lastUsedAt,
      });

    const row = this.getConnectionById(id);
    if (!row) throw new Error('failed to upsert connection');
    return row;
  }

  getConnectionById(id: string): StoredConnection | null {
    if (!id) return null;
    const row = this.db
      .query(
        `SELECT
           id,
           token,
           directory,
           connection_mode as connectionMode,
           server_port as serverPort,
           auto_approve as autoApprove,
           created_at as createdAt,
           last_used_at as lastUsedAt
         FROM connections
         WHERE id = $id`,
      )
      .get({ id }) as (Omit<StoredConnection, 'connectionMode' | 'autoApprove'> & {
      connectionMode: string;
      autoApprove: number;
    }) | null;
    if (!row) return null;
    return {
      id: row.id,
      token: row.token,
      directory: row.directory,
      connectionMode: row.connectionMode === 'port' ? 'port' : 'spawn',
      serverPort: typeof row.serverPort === 'number' ? row.serverPort : null,
      autoApprove: Boolean(row.autoApprove),
      createdAt: row.createdAt,
      lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    } satisfies StoredConnection;
  }

  getConnectionByToken(token: string): StoredConnection | null {
    if (!token) return null;
    const row = this.db
      .query(
        `SELECT
           id,
           token,
           directory,
           connection_mode as connectionMode,
           server_port as serverPort,
           auto_approve as autoApprove,
           created_at as createdAt,
           last_used_at as lastUsedAt
         FROM connections
         WHERE token = $token`,
      )
      .get({ token }) as (Omit<StoredConnection, 'connectionMode' | 'autoApprove'> & {
      connectionMode: string;
      autoApprove: number;
    }) | null;
    if (!row) return null;
    return {
      id: row.id,
      token: row.token,
      directory: row.directory,
      connectionMode: row.connectionMode === 'port' ? 'port' : 'spawn',
      serverPort: typeof row.serverPort === 'number' ? row.serverPort : null,
      autoApprove: Boolean(row.autoApprove),
      createdAt: row.createdAt,
      lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    } satisfies StoredConnection;
  }

  listConnectionsByDirectory(directory: string): StoredConnection[] {
    const trimmed = directory.trim();
    if (!trimmed) return [];
    const rows = this.db
      .query(
        `SELECT
           id,
           token,
           directory,
           connection_mode as connectionMode,
           server_port as serverPort,
           auto_approve as autoApprove,
           created_at as createdAt,
           last_used_at as lastUsedAt
         FROM connections
         WHERE directory = $directory
         ORDER BY created_at ASC`,
      )
      .all({ directory: trimmed }) as Array<Omit<StoredConnection, 'connectionMode' | 'autoApprove'> & {
      connectionMode: string;
      autoApprove: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      token: row.token,
      directory: row.directory,
      connectionMode: row.connectionMode === 'port' ? 'port' : 'spawn',
      serverPort: typeof row.serverPort === 'number' ? row.serverPort : null,
      autoApprove: Boolean(row.autoApprove),
      createdAt: row.createdAt,
      lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    } satisfies StoredConnection));
  }

  listConnections(): StoredConnection[] {
    const rows = this.db
      .query(
        `SELECT
           id,
           token,
           directory,
           connection_mode as connectionMode,
           server_port as serverPort,
           auto_approve as autoApprove,
           created_at as createdAt,
           last_used_at as lastUsedAt
         FROM connections
         ORDER BY created_at ASC`,
      )
      .all() as Array<Omit<StoredConnection, 'connectionMode' | 'autoApprove'> & {
      connectionMode: string;
      autoApprove: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      token: row.token,
      directory: row.directory,
      connectionMode: row.connectionMode === 'port' ? 'port' : 'spawn',
      serverPort: typeof row.serverPort === 'number' ? row.serverPort : null,
      autoApprove: Boolean(row.autoApprove),
      createdAt: row.createdAt,
      lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    } satisfies StoredConnection));
  }

  getConnectionByEndpoint(input: {
    directory: string;
    connectionMode: 'spawn' | 'port';
    serverPort?: number | null;
    autoApprove?: boolean;
  }): StoredConnection | null {
    const directory = input.directory.trim();
    if (!directory) return null;
    const mode = input.connectionMode;
    const serverPort = typeof input.serverPort === 'number' && Number.isFinite(input.serverPort)
      ? Math.floor(input.serverPort)
      : null;
    const autoApprove = input.autoApprove == null ? null : (Boolean(input.autoApprove) ? 1 : 0);

    const wherePort = mode === 'port'
      ? 'AND server_port = $serverPort'
      : 'AND server_port IS NULL';
    const whereAutoApprove = autoApprove == null
      ? ''
      : 'AND auto_approve = $autoApprove';

    const row = this.db
      .query(
        `SELECT
           id,
           token,
           directory,
           connection_mode as connectionMode,
           server_port as serverPort,
           auto_approve as autoApprove,
           created_at as createdAt,
           last_used_at as lastUsedAt
         FROM connections
         WHERE directory = $directory AND connection_mode = $connectionMode
           ${wherePort}
           ${whereAutoApprove}
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .get({ directory, connectionMode: mode, serverPort, autoApprove }) as (Omit<StoredConnection, 'connectionMode' | 'autoApprove'> & {
      connectionMode: string;
      autoApprove: number;
    }) | null;
    if (!row) return null;
    return {
      id: row.id,
      token: row.token,
      directory: row.directory,
      connectionMode: row.connectionMode === 'port' ? 'port' : 'spawn',
      serverPort: typeof row.serverPort === 'number' ? row.serverPort : null,
      autoApprove: Boolean(row.autoApprove),
      createdAt: row.createdAt,
      lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : null,
    } satisfies StoredConnection;
  }

  touchConnectionLastUsedAt(id: string, lastUsedAt: number = Date.now()): void {
    if (!id) return;
    const ts = Math.floor(lastUsedAt);
    this.db.query('UPDATE connections SET last_used_at = $lastUsedAt WHERE id = $id').run({ id, lastUsedAt: ts });
  }

  deleteConnection(id: string): void {
    if (!id) return;
    this.db.query('DELETE FROM connections WHERE id = $id').run({ id });
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

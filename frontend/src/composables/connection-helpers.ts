import type { ConnectionInstance } from './connection-types';

export const CREATE_CONNECTION_TIMEOUT_MS = 300000;

export function connectionEndpointKey(conn: Pick<ConnectionInstance, 'directory' | 'mode' | 'serverPort'>): string {
  const path = conn.directory.trim();
  const port = conn.mode === 'port' ? String(conn.serverPort ?? '') : '';
  return `${path}|${conn.mode}|${port}`;
}

export function buildConnectionSingleflightKey(input: {
  directory: string;
  mode: 'spawn' | 'port';
  serverPort?: number;
}): string {
  const directory = input.directory.trim();
  const portPart = input.mode === 'port' ? `:${String(input.serverPort ?? '')}` : '';
  return `${directory}|${input.mode}${portPart}`;
}

export function normalizeConnections(
  list: ConnectionInstance[],
  _hasStoredToken: (id: string) => boolean,
): ConnectionInstance[] {
  const dedup = new Map<string, ConnectionInstance>();
  for (const conn of list) {
    if (!conn?.id || conn.id.startsWith('pending-')) continue;
    dedup.set(conn.id, conn);
  }
  return Array.from(dedup.values());
}

export function mergeConnectionsForAnchor(input: {
  current: ConnectionInstance[];
  incoming: ConnectionInstance[];
  anchorId: string;
  anchorDirectory?: string;
}): ConnectionInstance[] {
  const targetDirectory =
    input.incoming[0]?.directory
    || input.current.find((conn) => conn.id === input.anchorId)?.directory
    || input.anchorDirectory?.trim()
    || '';

  if (!targetDirectory) {
    if (input.incoming.length === 0) return input.current;
    const byId = new Map<string, ConnectionInstance>();
    for (const conn of input.current) byId.set(conn.id, conn);
    for (const conn of input.incoming) byId.set(conn.id, conn);
    return Array.from(byId.values());
  }

  let inserted = false;
  const merged: ConnectionInstance[] = [];
  for (const conn of input.current) {
    if (conn.directory === targetDirectory) {
      if (!inserted) {
        merged.push(...input.incoming);
        inserted = true;
      }
      continue;
    }
    merged.push(conn);
  }

  if (!inserted) {
    merged.push(...input.incoming);
  }

  return merged;
}

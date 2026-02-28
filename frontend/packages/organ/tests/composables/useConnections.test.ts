import { describe, expect, test } from 'bun:test';
import {
  normalizeConnections,
  mergeConnectionsForAnchor,
  connectionEndpointKey,
  buildConnectionSingleflightKey,
  type ConnectionInstance,
} from '../../src/composables/useConnections';

function makeConn(overrides: Partial<ConnectionInstance> = {}): ConnectionInstance {
  return {
    id: 'c1',
    workspaceId: 'w1',
    directory: '/home/user/project',
    label: 'project',
    mode: 'spawn',
    status: 'idle',
    ...overrides,
  };
}

describe('normalizeConnections', () => {
  test('keeps multiple runtime connections for same endpoint', () => {
    const list: ConnectionInstance[] = [
      makeConn({ id: 'c1' }),
      makeConn({ id: 'c2' }),
    ];

    const result = normalizeConnections(list, () => false);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id).sort()).toEqual(['c1', 'c2']);
  });

  test('filters out pending connections', () => {
    const list: ConnectionInstance[] = [
      makeConn({ id: 'pending-123' }),
      makeConn({ id: 'c1' }),
    ];

    const result = normalizeConnections(list, () => false);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');
  });

  test('keeps connections with different endpoint keys', () => {
    const list: ConnectionInstance[] = [
      makeConn({ id: 'c1', directory: '/path/a' }),
      makeConn({ id: 'c2', directory: '/path/b' }),
    ];

    const result = normalizeConnections(list, () => false);

    expect(result).toHaveLength(2);
  });

  test('deduplicates duplicate entries by id', () => {
    const list: ConnectionInstance[] = [
      makeConn({ id: 'c1', label: 'first' }),
      makeConn({ id: 'c1', label: 'latest' }),
    ];

    const result = normalizeConnections(list, () => false);

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe('latest');
  });
});

describe('connectionEndpointKey', () => {
  test('generates key from directory, mode, and port', () => {
    const key = connectionEndpointKey({
      directory: '/home/user/project',
      mode: 'port',
      serverPort: 4096,
    });
    expect(key).toBe('/home/user/project|port|4096');
  });

  test('ignores port for spawn mode', () => {
    const key = connectionEndpointKey({
      directory: '/home/user/project',
      mode: 'spawn',
      serverPort: 4096,
    });
    expect(key).toBe('/home/user/project|spawn|');
  });

  test('trims directory whitespace', () => {
    const key = connectionEndpointKey({
      directory: '  /path  ',
      mode: 'spawn',
    });
    expect(key).toBe('/path|spawn|');
  });
});

describe('buildConnectionSingleflightKey', () => {
  test('builds key for spawn mode', () => {
    const key = buildConnectionSingleflightKey({
      directory: '/home/user/project',
      mode: 'spawn',
    });
    expect(key).toBe('/home/user/project|spawn');
  });

  test('builds key for port mode with port', () => {
    const key = buildConnectionSingleflightKey({
      directory: '/home/user/project',
      mode: 'port',
      serverPort: 8080,
    });
    expect(key).toBe('/home/user/project|port:8080');
  });
});

describe('mergeConnectionsForAnchor', () => {
  test('merges incoming connections without replacing other directories', () => {
    const current: ConnectionInstance[] = [
      makeConn({ id: 'a1', directory: '/path/a', workspaceId: 'wa' }),
      makeConn({ id: 'b1', directory: '/path/b', workspaceId: 'wb' }),
    ];

    const merged = mergeConnectionsForAnchor({
      current,
      incoming: [makeConn({ id: 'b2', directory: '/path/b', workspaceId: 'wb' })],
      anchorId: 'wb',
    });

    expect(merged.map((item) => item.id).sort()).toEqual(['a1', 'b2']);
  });

  test('removes stale directory connections when incoming is empty', () => {
    const current: ConnectionInstance[] = [
      makeConn({ id: 'a1', directory: '/path/a', workspaceId: 'wa' }),
      makeConn({ id: 'b1', directory: '/path/b', workspaceId: 'wb' }),
    ];

    const merged = mergeConnectionsForAnchor({
      current,
      incoming: [],
      anchorId: 'wb',
      anchorDirectory: '/path/b',
    });

    expect(merged.map((item) => item.id)).toEqual(['a1']);
  });

  test('keeps target directory block in original position', () => {
    const current: ConnectionInstance[] = [
      makeConn({ id: 'a1', directory: '/path/a', workspaceId: 'wa' }),
      makeConn({ id: 'b1', directory: '/path/b', workspaceId: 'wb' }),
      makeConn({ id: 'c1', directory: '/path/c', workspaceId: 'wc' }),
    ];

    const merged = mergeConnectionsForAnchor({
      current,
      incoming: [
        makeConn({ id: 'b2', directory: '/path/b', workspaceId: 'wb' }),
        makeConn({ id: 'b3', directory: '/path/b', workspaceId: 'wb' }),
      ],
      anchorId: 'wb',
    });

    expect(merged.map((item) => item.id)).toEqual(['a1', 'b2', 'b3', 'c1']);
  });
});

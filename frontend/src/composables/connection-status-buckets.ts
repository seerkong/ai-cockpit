import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';

export type ConnectionStatusBucketId = 'idle' | 'waiting' | 'active' | 'other';

export type ConnectionStatusLike = string | null | undefined;

export type BucketedConnections<T> = Record<ConnectionStatusBucketId, T[]>;

export const CONNECTION_STATUS_BUCKETS: Array<{ id: ConnectionStatusBucketId; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'active', label: 'Active' },
  { id: 'other', label: 'Other' },
];

export function bucketIdForConnectionStatus(status: ConnectionStatusLike): ConnectionStatusBucketId {
  switch (status) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'waiting';
    case 'busy':
      return 'active';
    default:
      return 'other';
  }
}

export function bucketConnections<T extends { status?: ConnectionStatusLike }>(connections: T[]): BucketedConnections<T> {
  const out: BucketedConnections<T> = {
    idle: [],
    waiting: [],
    active: [],
    other: [],
  };

  for (const conn of connections) {
    const bucketId = bucketIdForConnectionStatus(conn.status);
    out[bucketId].push(conn);
  }

  return out;
}

export function useConnectionStatusBuckets<T extends { status?: ConnectionStatusLike }>(
  connections: MaybeRefOrGetter<T[]>,
): ComputedRef<BucketedConnections<T>> {
  return computed(() => bucketConnections(toValue(connections) ?? []));
}

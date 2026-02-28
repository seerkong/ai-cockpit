import { describe, expect, test } from 'bun:test';
import { bucketConnections, bucketIdForConnectionStatus } from '../../src/composables/connection-status-buckets';

describe('connection-status-buckets', () => {
  test('bucketIdForConnectionStatus maps known statuses', () => {
    expect(bucketIdForConnectionStatus('idle')).toBe('idle');
    expect(bucketIdForConnectionStatus('connecting')).toBe('waiting');
    expect(bucketIdForConnectionStatus('busy')).toBe('active');
  });

  test('bucketIdForConnectionStatus falls back to other', () => {
    expect(bucketIdForConnectionStatus('unknown')).toBe('other');
    expect(bucketIdForConnectionStatus('')).toBe('other');
    expect(bucketIdForConnectionStatus(undefined)).toBe('other');
    expect(bucketIdForConnectionStatus(null)).toBe('other');
  });

  test('bucketConnections groups connections and preserves order', () => {
    const list = [
      { id: 'c1', status: 'busy' },
      { id: 'c2', status: 'idle' },
      { id: 'c3', status: 'connecting' },
      { id: 'c4', status: 'busy' },
      { id: 'c5', status: 'weird' },
    ] as Array<{ id: string; status: string }>;

    const buckets = bucketConnections(list);

    expect(buckets.active.map((c) => c.id)).toEqual(['c1', 'c4']);
    expect(buckets.idle.map((c) => c.id)).toEqual(['c2']);
    expect(buckets.waiting.map((c) => c.id)).toEqual(['c3']);
    expect(buckets.other.map((c) => c.id)).toEqual(['c5']);
  });
});

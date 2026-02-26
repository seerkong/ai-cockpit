import { describe, expect, test } from 'bun:test';
import { toConnectionStatusBadge } from './connection-status-badge';

describe('toConnectionStatusBadge', () => {
  test('parses session label', () => {
    expect(toConnectionStatusBadge('Session: abcdef12...')).toEqual({
      kind: 'session',
      text: 'session',
      raw: 'Session: abcdef12...',
    });
  });

  test('parses status label', () => {
    expect(toConnectionStatusBadge('Status: busy')).toEqual({
      kind: 'busy',
      text: 'busy',
      raw: 'Status: busy',
    });
    expect(toConnectionStatusBadge('Status: connected')).toEqual({
      kind: 'connected',
      text: 'connected',
      raw: 'Status: connected',
    });
  });

  test('falls back for unknown label', () => {
    expect(toConnectionStatusBadge('')).toEqual({ kind: 'unknown', text: 'unknown', raw: '' });
    expect(toConnectionStatusBadge(undefined)).toEqual({ kind: 'unknown', text: 'unknown', raw: '' });
    expect(toConnectionStatusBadge('Something else')).toEqual({
      kind: 'unknown',
      text: 'Something else',
      raw: 'Something else',
    });
  });
});

import { describe, expect, test } from 'bun:test';
import { sessionTitleFor } from '../../src/lib/session-title';

describe('sessionTitleFor', () => {
  test('returns empty string when sessionId is missing', () => {
    expect(sessionTitleFor([{ id: 's1', title: 'Hello' }], '')).toBe('');
  });

  test('returns title for matching session', () => {
    expect(sessionTitleFor([{ id: 's1', title: 'Hello' }], 's1')).toBe('Hello');
  });

  test('returns empty string when session not found', () => {
    expect(sessionTitleFor([{ id: 's1', title: 'Hello' }], 's2')).toBe('');
  });
});

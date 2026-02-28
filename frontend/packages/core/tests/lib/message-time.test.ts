import { describe, expect, test } from 'bun:test';
import { computeAssistantTurnDurationMs, formatHHMM, normalizeEpochMs, readMessageCompletedAtMs, readMessageCreatedAtMs } from '../../src/lib/message-time';

describe('message-time', () => {
  test('normalizeEpochMs treats seconds vs milliseconds', () => {
    expect(normalizeEpochMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test('readMessageCreatedAtMs and readMessageCompletedAtMs read info.time fields', () => {
    expect(readMessageCreatedAtMs({ time: { created: 1_700_000_000 } })).toBe(1_700_000_000_000);
    expect(readMessageCompletedAtMs({ time: { completed: 1_700_000_100_000 } })).toBe(1_700_000_100_000);
    expect(readMessageCreatedAtMs({})).toBeNull();
  });

  test('formatHHMM returns HH:mm', () => {
    expect(formatHHMM(new Date('2026-01-01T05:06:00Z').getTime())).toMatch(/\d\d:\d\d/);
  });

  test('computeAssistantTurnDurationMs uses previous user created time', () => {
    const messages = [
      { info: { role: 'user', time: { created: 1_700_000_000 } } },
      { info: { role: 'assistant', time: { created: 1_700_000_001, completed: 1_700_000_010 } } },
    ];
    const ms = computeAssistantTurnDurationMs(messages as any, 1, 1_700_000_020_000);
    expect(ms).toBe(10_000);
  });

  test('computeAssistantTurnDurationMs uses nowMs when assistant not completed', () => {
    const messages = [
      { info: { role: 'user', time: { created: 1_700_000_000 } } },
      { info: { role: 'assistant', time: { created: 1_700_000_001 } } },
    ];
    const ms = computeAssistantTurnDurationMs(messages as any, 1, 1_700_000_005_000);
    expect(ms).toBe(5_000);
  });
});

import { describe, expect, test } from 'bun:test';
import { formatDurationMs, formatDurationSeconds } from './format-duration';

describe('formatDurationSeconds', () => {
  test('formats seconds under a minute', () => {
    expect(formatDurationSeconds(0)).toBe('0s');
    expect(formatDurationSeconds(5)).toBe('5s');
    expect(formatDurationSeconds(59)).toBe('59s');
  });

  test('formats minutes and seconds at/over a minute', () => {
    expect(formatDurationSeconds(60)).toBe('1m 0s');
    expect(formatDurationSeconds(61)).toBe('1m 1s');
    expect(formatDurationSeconds(125)).toBe('2m 5s');
  });

  test('clamps negative values', () => {
    expect(formatDurationSeconds(-1)).toBe('0s');
  });
});

describe('formatDurationMs', () => {
  test('converts ms to seconds', () => {
    expect(formatDurationMs(0)).toBe('0s');
    expect(formatDurationMs(999)).toBe('0s');
    expect(formatDurationMs(1000)).toBe('1s');
    expect(formatDurationMs(61_000)).toBe('1m 1s');
  });
});

import { describe, expect, test } from 'bun:test';
import { newConnectionRequested, requestNewConnection } from './toolbar-actions';

describe('toolbar-actions', () => {
  test('requestNewConnection increments request counter', () => {
    const before = newConnectionRequested.value;
    requestNewConnection();
    expect(newConnectionRequested.value).toBe(before + 1);
  });
});

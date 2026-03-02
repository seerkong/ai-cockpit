import { describe, expect, test } from 'bun:test';
import { computeMessagesFingerprint, hasRunningToolPart } from '../../src/lib/message-fingerprint';

describe('message fingerprint', () => {
  test('empty list yields stable value', () => {
    expect(computeMessagesFingerprint([])).toBe('empty');
  });

  test('fingerprint changes when last text length changes (streaming)', () => {
    const m1 = [{ info: { id: 'm1', role: 'assistant' }, parts: [{ id: 'p1', type: 'text', text: 'h' }] }];
    const m2 = [{ info: { id: 'm1', role: 'assistant' }, parts: [{ id: 'p1', type: 'text', text: 'he' }] }];
    expect(computeMessagesFingerprint(m1)).not.toBe(computeMessagesFingerprint(m2));
  });

  test('fingerprint changes when tool status changes', () => {
    const a = [{ info: { id: 'm1', role: 'assistant' }, parts: [{ id: 't1', type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'pending', output: '' } }] }];
    const b = [{ info: { id: 'm1', role: 'assistant' }, parts: [{ id: 't1', type: 'tool', tool: 'bash', callID: 'c1', state: { status: 'completed', output: '' } }] }];
    expect(computeMessagesFingerprint(a)).not.toBe(computeMessagesFingerprint(b));
  });

  test('detects running tool part in last message', () => {
    const msgs = [{ info: { id: 'm1', role: 'assistant' }, parts: [{ id: 't1', type: 'tool', state: { status: 'pending' } }] }];
    expect(hasRunningToolPart(msgs)).toBe(true);
  });
});

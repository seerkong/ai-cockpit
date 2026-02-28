import { describe, expect, test } from 'bun:test';
import { extractRawMessagePreview, extractRawMessageAgent, sortRawMessagesByCreated } from './raw-message-list';

describe('raw-message-list', () => {
  test('extractRawMessageAgent reads info.agent', () => {
    expect(extractRawMessageAgent({ agent: 'coder' })).toBe('coder');
    expect(extractRawMessageAgent({})).toBeNull();
  });

  test('extractRawMessagePreview uses first text part', () => {
    const msg = {
      info: { id: 'm1', role: 'user' },
      parts: [{ type: 'text', text: 'hello world from user' }],
    };
    expect(extractRawMessagePreview(msg, 20)).toBe('hello world from use…');
  });

  test('extractRawMessagePreview collapses whitespace and newlines', () => {
    const msg = {
      info: { id: 'm1', role: 'assistant' },
      parts: [{ type: 'text', text: 'line1\n\nline2   line3' }],
    };
    expect(extractRawMessagePreview(msg, 12)).toBe('line1 line2 …');
  });

  test('extractRawMessagePreview falls back to tool name or part type', () => {
    const msg = {
      info: { id: 'm1', role: 'assistant' },
      parts: [{ type: 'tool', tool: 'read_file' }],
    };
    expect(extractRawMessagePreview(msg, 20)).toBe('read_file');
  });

  test('sortRawMessagesByCreated defaults missing timestamps last', () => {
    const messages = [
      { info: { id: 'a', time: { created: 1_700_000_000 } }, parts: [] }, // seconds
      { info: { id: 'b', time: { created: 1_700_000_010_000 } }, parts: [] }, // ms
      { info: { id: 'c' }, parts: [] },
    ];

    const desc = sortRawMessagesByCreated(messages as any, 'desc').map((m: any) => m.info.id);
    expect(desc).toEqual(['b', 'a', 'c']);

    const asc = sortRawMessagesByCreated(messages as any, 'asc').map((m: any) => m.info.id);
    expect(asc).toEqual(['a', 'b', 'c']);
  });
});

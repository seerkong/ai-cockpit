import { describe, expect, test } from 'bun:test';
import { questionHeader, questionMultiple, questionOptions, questionPrompt } from '../../src/lib/question-dock';

describe('question-dock', () => {
  test('questionPrompt picks a reasonable string', () => {
    expect(questionPrompt({ question: 'What?' })).toBe('What?');
    expect(questionPrompt({ prompt: 'Say hi' })).toBe('Say hi');
    expect(questionPrompt({})).toBe('Question');
  });

  test('questionHeader returns header when provided', () => {
    expect(questionHeader({ header: 'H' })).toBe('H');
    expect(questionHeader({})).toBe('');
  });

  test('questionOptions supports string and object options', () => {
    expect(questionOptions({ options: ['a', 'b'] }).map((o) => o.label)).toEqual(['a', 'b']);
    expect(questionOptions({ options: [{ label: 'x', description: 'd' }] })[0]).toEqual({ label: 'x', description: 'd' });
    expect(questionOptions({ options: [{ nope: true }] })).toEqual([]);
  });

  test('questionMultiple reads multiple flag', () => {
    expect(questionMultiple({ multiple: true })).toBe(true);
    expect(questionMultiple({ multiple: false })).toBe(false);
    expect(questionMultiple({})).toBe(false);
  });
});

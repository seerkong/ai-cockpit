import { describe, expect, test } from 'bun:test';
import { normalizeQuestionList, questionId, questionSessionId } from './questions';

describe('questions', () => {
  test('questionId and questionSessionId read string fields', () => {
    expect(questionId({ id: 'q1' })).toBe('q1');
    expect(questionId({ requestID: 'r1' })).toBe('r1');
    expect(questionSessionId({ sessionID: 's1' })).toBe('s1');
    expect(questionSessionId({})).toBe('');
  });

  test('normalizeQuestionList supports array and object payloads', () => {
    expect(normalizeQuestionList([{ id: 'a' }]).length).toBe(1);
    expect(normalizeQuestionList({ questions: [{ id: 'b' }] }).length).toBe(1);
    expect(normalizeQuestionList({ questions: 'nope' })).toEqual([]);
  });
});

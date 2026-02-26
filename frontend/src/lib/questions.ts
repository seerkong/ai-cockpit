export type QuestionRequest = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function questionId(question: QuestionRequest): string {
  const obj = question as Record<string, unknown>;
  return asString(obj.id) || asString(obj.requestID);
}

export function questionSessionId(question: QuestionRequest): string {
  const obj = question as Record<string, unknown>;
  return asString(obj.sessionID);
}

export function normalizeQuestionList(payload: unknown): QuestionRequest[] {
  if (Array.isArray(payload)) return payload as QuestionRequest[];
  const root = asObject(payload);
  const list = Array.isArray(root?.questions) ? root.questions : [];
  return list as QuestionRequest[];
}

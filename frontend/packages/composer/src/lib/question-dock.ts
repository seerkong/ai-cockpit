import type { QuestionRequest } from '@frontend/core';

export type QuestionOption = { label: string; description?: string };

export function questionHeader(q: QuestionRequest): string {
  const o = q as Record<string, unknown>;
  return typeof o.header === 'string' ? o.header : '';
}

export function questionPrompt(q: QuestionRequest): string {
  const o = q as Record<string, unknown>;
  const candidates = [o.question, o.text, o.prompt, o.title, o.label];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return 'Question';
}

export function questionOptions(q: QuestionRequest): QuestionOption[] {
  const o = q as Record<string, unknown>;
  const raw = o.options;
  if (!Array.isArray(raw)) return [];
  const out: QuestionOption[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item) out.push({ label: item });
      continue;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label : '';
      if (!label) continue;
      out.push({ label, description: typeof row.description === 'string' ? row.description : undefined });
    }
  }
  return out;
}

export function questionMultiple(q: QuestionRequest): boolean {
  const o = q as Record<string, unknown>;
  return Boolean(o.multiple);
}

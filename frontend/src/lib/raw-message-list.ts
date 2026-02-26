import { readMessageCreatedAtMs } from './message-time';

type SortOrder = 'asc' | 'desc';

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function extractRawMessageAgent(info: unknown): string | null {
  const obj = asObject(info);
  if (!obj) return null;
  return asString(obj.agent);
}

export function extractRawMessagePreview(
  msg: unknown,
  maxChars = 20,
): string {
  const obj = asObject(msg);
  const parts = obj ? obj.parts : null;
  const arr = Array.isArray(parts) ? parts : [];

  for (const p of arr) {
    const part = asObject(p);
    if (!part) continue;

    const type = asString(part.type) || '';
    const text = asString(part.text);

    if ((type === 'text' || type === 'reasoning') && text) {
      const collapsed = collapseWhitespace(text);
      if (!collapsed) continue;
      return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}…` : collapsed;
    }
  }

  // Fallback: tool name or part type.
  for (const p of arr) {
    const part = asObject(p);
    if (!part) continue;
    const tool = asString(part.tool);
    if (tool) return tool;
    const type = asString(part.type);
    if (type) return type;
  }

  return '';
}

export function sortRawMessagesByCreated<T extends { info: unknown }>(
  messages: T[],
  order: SortOrder,
): T[] {
  const copy = [...messages];
  copy.sort((a, b) => {
    const ta = readMessageCreatedAtMs(a?.info);
    const tb = readMessageCreatedAtMs(b?.info);

    const aMissing = ta == null;
    const bMissing = tb == null;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    return order === 'asc' ? ta - tb : tb - ta;
  });
  return copy;
}

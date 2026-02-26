function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizePathSearchResults(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  const out: string[] = [];
  for (const row of payload) {
    if (typeof row === 'string') {
      if (row) out.push(row);
      continue;
    }
    const obj = asObject(row);
    if (!obj) continue;
    const path = asString(obj.path) || asString(obj.file) || asString(obj.value);
    if (path) out.push(path);
  }
  return out;
}

export function fileUrlForPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\\/g, '/');

  // Windows drive absolute path: C:/...
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  // POSIX absolute path: /...
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`;
  }

  // Fallback: treat as a relative file path.
  return `file://${encodeURI(normalized)}`;
}

export function basenameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  const base = idx === -1 ? normalized : normalized.slice(idx + 1);
  return base || normalized || '(file)';
}

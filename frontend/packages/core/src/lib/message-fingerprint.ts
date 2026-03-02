type MessagePartLike = {
  id?: string;
  type?: unknown;
  text?: unknown;
  tool?: unknown;
  callID?: unknown;
  state?: { status?: unknown; output?: unknown } | null;
};

type MessageInfoLike = {
  id?: unknown;
  role?: unknown;
};

type MessageLike = {
  info?: MessageInfoLike;
  parts?: unknown;
};

export type MessageWithPartsLike = {
  info?: MessageInfoLike;
  parts?: unknown;
};

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function partKey(p: unknown): string {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return '';
  const part = p as MessagePartLike;
  const type = asString(part.type);
  const id = asString(part.id);

  if (type === 'text' || type === 'reasoning') {
    const text = typeof part.text === 'string' ? part.text : '';
    return `${type}:${id}:${text.length}`;
  }

  if (type === 'tool') {
    const tool = asString(part.tool);
    const callID = asString(part.callID);
    const status = asString(part.state?.status);
    const outputLen = typeof part.state?.output === 'string' ? part.state.output.length : 0;
    return `${type}:${id}:${tool}:${callID}:${status}:${outputLen}`;
  }

  // Fallback: we only include stable identifiers and type.
  return `${type}:${id}`;
}

/**
 * Computes a stable fingerprint that changes when there is meaningful message progress.
 * This is intentionally lightweight (metadata-only) and avoids hashing full content.
 */
export function computeMessagesFingerprint(messages: unknown): string {
  const list = asArray(messages);
  if (!list.length) return 'empty';
  const last = list[list.length - 1];
  if (!last || typeof last !== 'object' || Array.isArray(last)) return 'invalid';
  const msg = last as MessageLike;
  const msgId = asString(msg.info?.id);
  const role = asString(msg.info?.role);
  const parts = asArray(msg.parts);
  const lastPart = parts.length ? parts[parts.length - 1] : null;
  const key = lastPart ? partKey(lastPart) : '';
  return `m:${msgId}:${role}:p:${parts.length}:${key}`;
}

export function hasRunningToolPart(messages: unknown): boolean {
  const list = asArray(messages);
  if (!list.length) return false;
  const last = list[list.length - 1];
  if (!last || typeof last !== 'object' || Array.isArray(last)) return false;
  const msg = last as MessageLike;
  const parts = asArray(msg.parts);
  for (const p of parts) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const part = p as MessagePartLike;
    if (asString(part.type) !== 'tool') continue;
    const status = asString(part.state?.status);
    if (status === 'pending' || status === 'running') return true;
  }
  return false;
}

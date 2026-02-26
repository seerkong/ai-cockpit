function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeEpochMs(value: number): number {
  // Heuristic: seconds are ~1e9, ms are ~1e12.
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1e12 ? value * 1000 : value;
}

export function readMessageCreatedAtMs(info: unknown): number | null {
  const obj = asObject(info);
  const time = obj ? asObject(obj.time) : null;
  const created = time ? time.created : null;
  if (typeof created !== 'number' || !Number.isFinite(created) || created <= 0) return null;
  return normalizeEpochMs(created);
}

export function readMessageCompletedAtMs(info: unknown): number | null {
  const obj = asObject(info);
  const time = obj ? asObject(obj.time) : null;
  const completed = time ? time.completed : null;
  if (typeof completed !== 'number' || !Number.isFinite(completed) || completed <= 0) return null;
  return normalizeEpochMs(completed);
}

export function formatHHMM(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export type MessageInfoLike = { role?: string; time?: { created?: number; completed?: number } };
export type MessageLike = { info: MessageInfoLike };

export function computeAssistantTurnDurationMs(messages: MessageLike[], assistantIndex: number, nowMs: number): number | null {
  const msg = messages[assistantIndex];
  if (!msg || msg.info?.role !== 'assistant') return null;

  // Find nearest previous user message.
  let userCreated: number | null = null;
  for (let i = assistantIndex - 1; i >= 0; i--) {
    const prev = messages[i];
    if (prev?.info?.role === 'user') {
      const created = prev.info?.time?.created;
      if (typeof created === 'number' && Number.isFinite(created) && created > 0) {
        userCreated = normalizeEpochMs(created);
      }
      break;
    }
  }
  if (userCreated == null) return null;

  const completedRaw = msg.info?.time?.completed;
  const end = typeof completedRaw === 'number' && Number.isFinite(completedRaw) && completedRaw > 0
    ? normalizeEpochMs(completedRaw)
    : nowMs;

  const ms = end - userCreated;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

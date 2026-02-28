export type SessionLike = { id: string; title?: string };

export function sessionTitleFor(sessions: SessionLike[], sessionId: string): string {
  if (!sessionId) return '';
  return sessions.find((s) => s.id === sessionId)?.title || '';
}

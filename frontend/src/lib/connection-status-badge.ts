export type ConnectionStatusBadgeKind =
  | 'session'
  | 'busy'
  | 'connecting'
  | 'connected'
  | 'init'
  | 'unknown';

export type ConnectionStatusBadge = {
  kind: ConnectionStatusBadgeKind;
  text: string;
  raw: string;
};

export function toConnectionStatusBadge(label: string | null | undefined): ConnectionStatusBadge {
  const raw = (label ?? '').trim();
  if (!raw) return { kind: 'unknown', text: 'unknown', raw: '' };

  const lower = raw.toLowerCase();
  if (lower.startsWith('session:')) {
    return { kind: 'session', text: 'session', raw };
  }

  if (lower.startsWith('status:')) {
    const status = raw.slice(raw.indexOf(':') + 1).trim().toLowerCase();
    if (status === 'busy') return { kind: 'busy', text: 'busy', raw };
    if (status === 'connecting') return { kind: 'connecting', text: 'connecting', raw };
    if (status === 'connected') return { kind: 'connected', text: 'connected', raw };
    if (status === 'init') return { kind: 'init', text: 'init', raw };
    return { kind: 'unknown', text: status || 'unknown', raw };
  }

  return { kind: 'unknown', text: raw, raw };
}

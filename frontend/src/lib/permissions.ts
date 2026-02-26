export type PermissionRequest = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function permissionId(permission: PermissionRequest): string {
  return asString((permission as Record<string, unknown>).id);
}

export function permissionSessionId(permission: PermissionRequest): string {
  return asString((permission as Record<string, unknown>).sessionID);
}

export function normalizePermissionList(payload: unknown): PermissionRequest[] {
  if (Array.isArray(payload)) return payload as PermissionRequest[];
  const root = asObject(payload);
  const list = Array.isArray(root?.permissions) ? root.permissions : [];
  return list as PermissionRequest[];
}

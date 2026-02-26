import { describe, expect, test } from 'bun:test';
import { normalizePermissionList, permissionId, permissionSessionId } from './permissions';

describe('permissions', () => {
  test('permissionId and permissionSessionId read string fields', () => {
    expect(permissionId({ id: 'p1' })).toBe('p1');
    expect(permissionSessionId({ sessionID: 's1' })).toBe('s1');
    expect(permissionSessionId({})).toBe('');
  });

  test('normalizePermissionList supports array and object payloads', () => {
    expect(normalizePermissionList([{ id: 'a' }]).length).toBe(1);
    expect(normalizePermissionList({ permissions: [{ id: 'b' }] }).length).toBe(1);
    expect(normalizePermissionList({ permissions: 'nope' })).toEqual([]);
  });
});

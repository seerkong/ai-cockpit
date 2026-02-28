import { describe, expect, test } from 'bun:test';

import { routes } from '../src/router';

describe('router', () => {
  test('defines core routes', () => {
    const names = new Set(routes.map((r) => String(r.name)));
    expect(names.has('workspace')).toBe(true);
    expect(names.has('work')).toBe(true);

    const paths = routes.map((r) => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/workspace');
    expect(paths).toContain('/work');
  });
});

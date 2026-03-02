import { describe, expect, test } from 'bun:test';

import { dockviewPanelComponents } from '../src/pages/session-dockview-panels';

describe('session dockview panels', () => {
  test('exports right-settings panel component mapping', () => {
    expect(Object.prototype.hasOwnProperty.call(dockviewPanelComponents, 'right-settings')).toBe(true);
  });
});

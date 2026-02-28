import { describe, expect, test } from 'bun:test';
import { filterModelOptions, groupModelOptions } from './model-picker';

describe('model-picker', () => {
  test('filters by providerID and modelID', () => {
    const opts = [
      { providerID: 'a', modelID: 'm1' },
      { providerID: 'b', modelID: 'glm-4.7' },
      { providerID: 'b', modelID: 'glm-4.5' },
    ];
    expect(filterModelOptions(opts, 'glm').length).toBe(2);
    expect(filterModelOptions(opts, 'a').length).toBe(1);
  });

  test('groups by provider and sorts models', () => {
    const opts = [
      { providerID: 'b', modelID: 'm2' },
      { providerID: 'a', modelID: 'm1' },
      { providerID: 'b', modelID: 'm1' },
    ];

    const groups = groupModelOptions(opts);
    expect(groups.map((g) => g.providerID)).toEqual(['a', 'b']);
    expect(groups[1]?.models.map((m) => m.modelID)).toEqual(['m1', 'm2']);
  });
});

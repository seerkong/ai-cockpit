import { describe, expect, test } from 'bun:test';
import { flattenModelGroups, modelKey } from '../../src/lib/model-selector-popover';

describe('model-selector-popover', () => {
  test('modelKey joins provider and model id', () => {
    expect(modelKey('openai', 'gpt-4.1')).toBe('openai:gpt-4.1');
  });

  test('flattenModelGroups returns flat ordered items', () => {
    const items = flattenModelGroups([
      { providerID: 'a', models: [{ providerID: 'a', modelID: 'm1' }] },
      { providerID: 'b', models: [{ providerID: 'b', modelID: 'm2' }, { providerID: 'b', modelID: 'm3' }] },
    ]);
    expect(items.map((i) => i.key)).toEqual(['a:m1', 'b:m2', 'b:m3']);
  });
});

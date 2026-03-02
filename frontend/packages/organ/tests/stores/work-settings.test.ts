import { beforeEach, describe, expect, test } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';

import { useWorkSettingsStore } from '../../src/stores/work-settings';

type StorageMap = Record<string, string>;

function createMemoryStorage() {
  const store: StorageMap = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
});

describe('work settings store', () => {
  test('defaults are enabled=true and timeoutMinutes=5', () => {
    const s = useWorkSettingsStore();
    expect(s.stalledAutoRecoverEnabled).toBe(true);
    expect(s.stalledAutoRecoverTimeoutMinutes).toBe(5);
  });

  test('hydrate restores persisted settings', () => {
    const first = useWorkSettingsStore();
    first.setStalledAutoRecoverEnabled(false);
    first.setStalledAutoRecoverTimeoutMinutes(12);

    const second = useWorkSettingsStore();
    // Ensure we simulate a fresh store instance.
    second.$reset();
    second.hydrate();

    expect(second.stalledAutoRecoverEnabled).toBe(false);
    expect(second.stalledAutoRecoverTimeoutMinutes).toBe(12);
  });

  test('clamps timeout minutes to 1..60', () => {
    const s = useWorkSettingsStore();
    s.setStalledAutoRecoverTimeoutMinutes(0);
    expect(s.stalledAutoRecoverTimeoutMinutes).toBe(1);
    s.setStalledAutoRecoverTimeoutMinutes(999);
    expect(s.stalledAutoRecoverTimeoutMinutes).toBe(60);
  });
});

import { beforeEach, describe, expect, test } from 'bun:test';
import type { DockviewApi } from 'dockview-core';
import { useDockviewLayout } from './useDockviewLayout';

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

function createDockApiStub() {
  const addPanelCalls: string[] = [];
  const sizedPanels = new Set<string>();
  const panelSizes = new Map<string, { width?: number; height?: number }>();
  let layoutChangeHandler: (() => void) | null = null;
  let restored: unknown = null;

  const api = {
    width: 1200,
    height: 900,
    addPanel(config: { id: string }) {
      addPanelCalls.push(config.id);
    },
    getPanel(id: string) {
      return {
        api: {
          setSize(size?: { width?: number; height?: number }) {
            sizedPanels.add(id);
            if (size) {
              panelSizes.set(id, { ...panelSizes.get(id), ...size });
            }
          },
          setActive() {
            // no-op for tests
          },
        },
      };
    },
    toJSON() {
      return { panels: ['connections'] };
    },
    fromJSON(layout: unknown) {
      restored = layout;
    },
    onDidLayoutChange(handler: () => void) {
      layoutChangeHandler = handler;
    },
  };

  return {
    api: api as unknown as DockviewApi,
    addPanelCalls,
    sizedPanels,
    getPanelSize(id: string) {
      return panelSizes.get(id);
    },
    triggerLayoutChange() {
      layoutChangeHandler?.();
    },
    getRestored() {
      return restored;
    },
  };
}

beforeEach(() => {
  const memoryStorage = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    value: (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    },
    configurable: true,
  });
});

describe('useDockviewLayout', () => {
  test('saves and restores layout', () => {
    const { saveLayout, restoreLayout, dockApi } = useDockviewLayout();
    const first = createDockApiStub();
    dockApi.value = first.api;

    saveLayout();

    const second = createDockApiStub();
    const restored = restoreLayout(second.api);
    expect(restored).toBe(true);
    expect(second.getRestored()).toEqual({ panels: ['connections'] });
  });

  test('onReady creates default layout and wires change persistence', () => {
    const { onReady } = useDockviewLayout();
    const stub = createDockApiStub();

    onReady({ api: stub.api } as { api: DockviewApi });

    expect(stub.addPanelCalls).toEqual([
      'connections',
      'chat',
      'right-todo',
      'right-context',
      'right-review',
      'right-files',
      'right-codument',
      'bottom-terminal',
      'bottom-console',
    ]);
    expect(stub.sizedPanels.has('connections')).toBe(true);
    stub.triggerLayoutChange();
    expect(localStorage.getItem('session-dockview-layout-v4')).toBeTruthy();
  });

  test('toggleBottomPanel collapses and restores height', () => {
    const layout = useDockviewLayout() as unknown as { onReady: (e: { api: DockviewApi }) => void; toggleBottomPanel: () => void };
    const stub = createDockApiStub();

    layout.onReady({ api: stub.api });

    // Default layout sizes bottom-terminal to 25% of height = 225
    expect(stub.getPanelSize('bottom-terminal')?.height).toBe(225);

    layout.toggleBottomPanel();
    expect(stub.getPanelSize('bottom-terminal')?.height).toBe(32);

    layout.toggleBottomPanel();
    expect(stub.getPanelSize('bottom-terminal')?.height).toBe(225);
  });
});

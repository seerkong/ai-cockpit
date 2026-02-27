import { markRaw, ref } from 'vue';
import type { DockviewApi, SerializedDockview } from 'dockview-core';
import type { DockviewReadyEvent } from 'dockview-vue';

const LAYOUT_STORAGE_KEY = 'session-dockview-layout-v4';

export function useDockviewLayout() {
  const dockApi = ref<DockviewApi | null>(null);
  const bottomPanelOpen = ref(true);

  const COLLAPSED_BOTTOM_HEIGHT = 32;
  let bottomExpandedHeight = 0;

  function setBottomPanelHeight(height: number) {
    if (!dockApi.value) return;
    const panel = dockApi.value.getPanel('bottom-terminal') ?? dockApi.value.getPanel('bottom-console');
    panel?.api.setSize({ height });
  }

  function toggleBottomPanel() {
    if (bottomPanelOpen.value) {
      setBottomPanelHeight(COLLAPSED_BOTTOM_HEIGHT);
      bottomPanelOpen.value = false;
      return;
    }

    const target = bottomExpandedHeight || 200;
    setBottomPanelHeight(target);
    bottomPanelOpen.value = true;
  }

  function saveLayout() {
    if (!dockApi.value) return;
    try {
      const layout = dockApi.value.toJSON();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
      console.warn('Failed to save layout:', e);
    }
  }

  function restoreLayout(api: DockviewApi): boolean {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!saved) return false;

    try {
      const layout = JSON.parse(saved) as SerializedDockview;
      api.fromJSON(layout);
      return true;
    } catch (e) {
      console.warn('Failed to restore layout:', e);
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      return false;
    }
  }

  function createDefaultLayout(api: DockviewApi) {
    const sideWidth = Math.max(240, Math.floor(api.width * 0.25));
    const centerTopHeight = Math.max(220, Math.floor(api.height * 0.75));
    const centerBottomHeight = Math.max(120, Math.floor(api.height * 0.25));

    bottomExpandedHeight = centerBottomHeight;
    bottomPanelOpen.value = true;

    api.addPanel({
      id: 'connections',
      component: 'connections',
      title: 'Connections',
      initialWidth: sideWidth,
    });

    api.addPanel({
      id: 'chat',
      component: 'chat',
      title: 'Chat',
      position: { referencePanel: 'connections', direction: 'right' },
      initialHeight: centerTopHeight,
    });

    // Right panel tab order: Todo -> Context -> Review -> Files -> Codument
    api.addPanel({
      id: 'right-todo',
      component: 'right-todo',
      title: 'Todo',
      position: { referencePanel: 'chat', direction: 'right' },
      initialWidth: sideWidth,
    });

    api.addPanel({
      id: 'right-context',
      component: 'right-context',
      title: 'Context',
      position: { referencePanel: 'right-todo', direction: 'within' },
    });

    api.addPanel({
      id: 'right-review',
      component: 'right-review',
      title: 'Review',
      position: { referencePanel: 'right-todo', direction: 'within' },
    });

    api.addPanel({
      id: 'right-files',
      component: 'right-files',
      title: 'Files',
      position: { referencePanel: 'right-todo', direction: 'within' },
    });

    api.addPanel({
      id: 'right-codument',
      component: 'right-codument',
      title: 'Codument',
      position: { referencePanel: 'right-todo', direction: 'within' },
    });

    api.addPanel({
      id: 'bottom-terminal',
      component: 'bottom-terminal',
      title: 'Terminal',
      position: { referencePanel: 'chat', direction: 'below' },
      initialHeight: centerBottomHeight,
    });

    api.addPanel({
      id: 'bottom-console',
      component: 'bottom-console',
      title: 'Console',
      position: { referencePanel: 'bottom-terminal', direction: 'within' },
    });

    requestAnimationFrame(() => {
      api.getPanel('connections')?.api.setSize({ width: sideWidth });
      api.getPanel('right-todo')?.api.setSize({ width: sideWidth });
      api.getPanel('right-todo')?.api.setActive();
      api.getPanel('chat')?.api.setSize({ height: centerTopHeight });
      api.getPanel('bottom-terminal')?.api.setSize({ height: centerBottomHeight });
    });
  }

  const onReady = (event: DockviewReadyEvent) => {
    dockApi.value = markRaw(event.api);

    const restored = restoreLayout(event.api);
    if (!restored) {
      createDefaultLayout(event.api);
    }

    event.api.onDidLayoutChange(() => {
      saveLayout();
    });
  };

  return {
    dockApi,
    bottomPanelOpen,
    toggleBottomPanel,
    saveLayout,
    restoreLayout,
    createDefaultLayout,
    onReady,
  };
}

<template>
  <section class="bottom-panel">
    <header class="panel-header">
      <div class="panel-title">{{ mode === 'terminal' ? 'Terminal' : 'Console' }}</div>
      <button
        class="toggle"
        type="button"
        :title="bottomPanelOpen ? 'Collapse bottom panel' : 'Expand bottom panel'"
        @click="onToggleBottomPanel"
      >
        {{ bottomPanelOpen ? 'Collapse' : 'Expand' }}
      </button>
    </header>

    <div v-if="bottomPanelOpen" class="panel-content">
      <div v-if="mode === 'terminal'" class="terminal-placeholder">
        <div class="muted">Terminal (placeholder)</div>
        <div class="muted">Terminal functionality will be implemented in a future update.</div>
      </div>
      <div v-else class="console-placeholder">
        <div class="muted">Console (placeholder)</div>
        <div class="muted">Console output will be displayed here.</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface Props {
  mode: 'terminal' | 'console';
  bottomPanelOpen?: boolean;
  onToggleBottomPanel?: () => void;
}

withDefaults(defineProps<Props>(), {
  mode: 'terminal',
  bottomPanelOpen: true,
  onToggleBottomPanel: () => {},
});
</script>

<style scoped>
.bottom-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
  border-top: 1px solid var(--border);
  min-height: 0;
}

.panel-header {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 12px;
  color: var(--text);
  opacity: 0.9;
}

.toggle {
  font-size: 12px;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.toggle:hover {
  background: color-mix(in srgb, var(--panel) 80%, var(--text) 20%);
  border-color: var(--border);
  color: var(--text);
}

.panel-content {
  flex: 1;
  padding: 12px;
  overflow: auto;
  min-height: 0;
}

.terminal-placeholder,
.console-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>

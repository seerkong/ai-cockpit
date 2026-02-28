<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceConfigsStore } from '@frontend/organ';
import { useWorkspaceSelectionStore } from '@frontend/organ';

/**
 * AppStatusBar - 底部状态栏组件
 * 显示当前选中 connection 对应的 workspace 完整路径
 */

const configsStore = useWorkspaceConfigsStore();
const selectionStore = useWorkspaceSelectionStore();
configsStore.hydrate();

const workspacePath = computed(() => {
  const selectedId = selectionStore.selectedWorkspaceId;
  if (!selectedId) return '';
  return configsStore.byId[selectedId]?.path || '';
});
</script>

<template>
  <footer class="app-status-bar">
    <div class="status-items">
      <span v-if="workspacePath" class="status-item workspace-path" :title="workspacePath">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span class="path-text">{{ workspacePath }}</span>
      </span>
    </div>
    <div class="status-spacer"></div>
  </footer>
</template>

<style scoped>
.app-status-bar {
  display: flex;
  align-items: center;
  height: 22px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  padding: 0 8px;
  font-size: 12px;
  color: var(--muted);
  user-select: none;
}

.status-items {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.workspace-path {
  max-width: 400px;
  overflow: hidden;
}

.workspace-path .path-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-spacer {
  flex: 1;
}
</style>

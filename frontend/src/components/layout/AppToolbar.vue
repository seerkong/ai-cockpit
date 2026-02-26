<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { requestNewConnection } from '../../lib/toolbar-actions';

const connectionMenuOpen = ref(false);
const connectionMenuEl = ref<HTMLElement | null>(null);

function toggleConnectionMenu() {
  connectionMenuOpen.value = !connectionMenuOpen.value;
}

function closeConnectionMenu() {
  connectionMenuOpen.value = false;
}

function handleDocumentMouseDown(ev: MouseEvent) {
  const el = connectionMenuEl.value;
  if (!el) return;
  if (ev.target instanceof Node && el.contains(ev.target)) return;
  closeConnectionMenu();
}

function onClickNewConnection() {
  requestNewConnection();
  closeConnectionMenu();
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
});
</script>

<template>
  <header class="app-toolbar">
    <div class="toolbar-menu">
      <div ref="connectionMenuEl" class="toolbar-dropdown">
        <button class="toolbar-menu-item" type="button" @click.stop="toggleConnectionMenu">
          Connection
        </button>
        <div v-if="connectionMenuOpen" class="toolbar-dropdown-menu" @mousedown.prevent>
          <button class="toolbar-dropdown-item" type="button" @click="onClickNewConnection">New Connection</button>
        </div>
      </div>
      <button class="toolbar-menu-item">Help</button>
    </div>
    <div class="toolbar-spacer"></div>
  </header>
</template>

<style scoped>
.app-toolbar {
  display: flex;
  align-items: center;
  height: 30px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
  user-select: none;
  -webkit-app-region: drag;
}

.toolbar-menu {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.toolbar-dropdown {
  position: relative;
}

.toolbar-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  z-index: 20;
}

.toolbar-dropdown-item {
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
}

.toolbar-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.toolbar-menu-item {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.toolbar-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.toolbar-spacer {
  flex: 1;
}
</style>

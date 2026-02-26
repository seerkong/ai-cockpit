<template>
  <div class="home-page">
    <section class="panel">
      <h2>Workspace path config</h2>
      <div class="workspace">
        <input v-model="pathInput" placeholder="Local directory path" />
        <button :disabled="!canSave" @click="saveConfig">{{ editingId ? 'Update' : 'Add' }}</button>
      </div>

      <div v-if="error" class="muted" style="margin-top: 10px">{{ error }}</div>
    </section>

    <section class="panel">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px">
        <h2 style="margin-bottom: 0">Configured workspaces</h2>
      </div>
      <div v-if="configs.length" class="sessions" style="max-height: 360px">
        <div
          v-for="cfg in configs"
          :key="cfg.id"
          :class="['session-item', selectionStore.selectedWorkspaceId === cfg.id ? 'active' : '']"
          style="display: flex; align-items: center; justify-content: space-between; gap: 12px"
          @click="toggleSelection(cfg.id)"
        >
          <div>
            <div>{{ cfg.path }}</div>
          </div>
          <div style="display: flex; gap: 8px">
            <button class="secondary" @click.stop="editConfig(cfg.id)">Edit</button>
            <button class="secondary" @click.stop="removeConfig(cfg.id)">Delete</button>
          </div>
        </div>
      </div>
      <div v-else class="muted">No workspace paths configured.</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useWorkspaceConfigsStore } from '../stores/workspace-configs'
import { useWorkspaceSelectionStore } from '../stores/workspace-selection'

const configsStore = useWorkspaceConfigsStore()
const selectionStore = useWorkspaceSelectionStore()
configsStore.hydrate()

const pathInput = ref('')
const editingId = ref('')
const error = ref<string | null>(null)
const configs = computed(() => configsStore.list)

const canSave = computed(() => {
  return !!pathInput.value.trim()
})

function cancelEdit() {
  editingId.value = ''
  pathInput.value = ''
  error.value = null
}

function toggleSelection(id: string) {
  if (selectionStore.selectedWorkspaceId === id) {
    selectionStore.clearWorkspace()
    return
  }
  selectionStore.setWorkspaceId(id)
}

function editConfig(id: string) {
  const cfg = configsStore.byId[id]
  if (!cfg) return
  editingId.value = id
  pathInput.value = cfg.path
}

function saveConfig() {
  error.value = null
  if (!canSave.value) {
    error.value = 'Invalid workspace path or port'
    return
  }
  if (editingId.value) {
    configsStore.update({
      id: editingId.value,
      path: pathInput.value,
    })
  } else {
    configsStore.add({
      path: pathInput.value,
    })
  }
  cancelEdit()
}

function removeConfig(id: string) {
  configsStore.remove(id)
  if (selectionStore.selectedWorkspaceId === id) selectionStore.clearWorkspace()
  if (editingId.value === id) cancelEdit()
}
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.panel {
  background: var(--panel);
  border-radius: 8px;
  padding: 16px;
}

.panel h2 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.workspace {
  display: flex;
  gap: 8px;
}

.workspace input {
  flex: 1;
  padding: 8px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 13px;
}

.workspace input::placeholder {
  color: var(--muted);
}

.workspace input:focus {
  outline: none;
  border-color: var(--accent);
}

.sessions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.session-item {
  padding: 10px 12px;
  background: var(--panel-2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.session-item.active {
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid var(--accent);
}

button {
  padding: 8px 16px;
  background: var(--accent);
  border: none;
  border-radius: 4px;
  color: var(--bg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.secondary {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
}

button.secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>

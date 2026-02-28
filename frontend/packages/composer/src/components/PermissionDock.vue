<script setup lang="ts">
import { computed } from 'vue';

export type PermissionRequest = Record<string, unknown>;

export interface Props {
  permission: PermissionRequest;
}

const props = defineProps<Props>();

const typeLabel = computed(() => (typeof props.permission.type === 'string' ? props.permission.type : 'permission'));
const titleLabel = computed(() => (typeof props.permission.title === 'string' ? props.permission.title : 'Permission required'));
const patternLabel = computed(() => {
  const p = props.permission.pattern;
  if (typeof p === 'string') return p;
  if (Array.isArray(p)) return p.filter((x) => typeof x === 'string').join(', ');
  return '';
});

const emit = defineEmits<{
  deny: [];
  allowOnce: [];
  allowAlways: [];
}>();
</script>

<template>
  <div class="dock">
    <div class="dock-header">
      <div class="dock-title">Permission</div>
      <div class="dock-type">{{ typeLabel }}</div>
    </div>

    <div class="dock-body">
      <div class="dock-main">{{ titleLabel }}</div>
      <div v-if="patternLabel" class="dock-sub muted">{{ patternLabel }}</div>
    </div>

    <div class="dock-actions">
      <button class="secondary danger" type="button" @click="emit('deny')">Deny</button>
      <div class="spacer"></div>
      <button class="secondary" type="button" @click="emit('allowOnce')">Allow once</button>
      <button class="secondary" type="button" @click="emit('allowAlways')">Always</button>
    </div>
  </div>
</template>

<style scoped>
.dock {
  border: 1px solid var(--border);
  background: rgba(31, 41, 55, 0.55);
  border-radius: 10px;
  padding: 10px;
}

.dock-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.dock-title {
  font-size: 12px;
  color: var(--muted);
}

.dock-type {
  font-size: 12px;
  color: var(--text);
}

.dock-body {
  margin-top: 8px;
}

.dock-main {
  font-size: 13px;
  color: var(--text);
}

.dock-sub {
  margin-top: 4px;
  font-size: 12px;
  word-break: break-word;
}

.dock-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spacer {
  flex: 1;
}

.muted {
  color: var(--muted);
}

button.secondary.danger {
  border-color: rgba(239, 68, 68, 0.7);
  color: #fecaca;
}

button.secondary.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
}
</style>

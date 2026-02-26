<template>
  <footer class="status-bar">
    <div class="left">
      <span class="label">Connection</span>
      <span class="value" :title="connectionId || '—'">{{ connectionId || '—' }}</span>
      <span class="sep">|</span>
      <span class="label">Session</span>
      <span class="value" :title="sessionId || '—'">{{ sessionId || '—' }}</span>
    </div>

    <div class="right">
      <span class="label">Context</span>
      <span class="value" :title="contextTitle || ''">{{ contextLabel || '—' }}</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
export interface Props {
  connectionId?: string;
  sessionId?: string;
  contextLabel?: string;
  contextTitle?: string;
}

withDefaults(defineProps<Props>(), {
  connectionId: '',
  sessionId: '',
  contextLabel: '',
  contextTitle: '',
});
</script>

<style scoped>
.status-bar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px;
  border-top: 1px solid var(--border);
  background: var(--panel);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.label {
  font-size: 11px;
  color: var(--muted);
}

.value {
  font-size: 11px;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.sep {
  font-size: 11px;
  color: var(--border);
}

@media (max-width: 640px) {
  .value {
    max-width: 120px;
  }
}
</style>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import type { IPaneviewVuePanelProps } from 'dockview-vue';
import type { ConnectionInstance } from '../../composables/connection-types';
import type { ConnectionStatusBucketId } from '../../composables/connection-status-buckets';
import { toConnectionStatusBadge } from '../../lib/connection-status-badge';
import { formatDurationMs } from '../../lib/format-duration';

type BucketPaneParams = {
  bucketId: ConnectionStatusBucketId;
  connections: ConnectionInstance[];
  activeConnectionId: string;
  processingStartedAt?: (connectionId: string) => number | null;
  sessionStatusLabel?: (connectionId: string) => string;
  onSelectConnection?: (connectionId: string) => void;
  onContextMenu?: (event: MouseEvent, connectionId: string) => void;
};

const props = defineProps<IPaneviewVuePanelProps<BucketPaneParams>>();

const items = computed<ConnectionInstance[]>(() => {
  const list = props.params?.connections;
  return Array.isArray(list) ? list : [];
});
const activeId = computed(() => {
  const id = props.params?.activeConnectionId;
  return typeof id === 'string' ? id : '';
});

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
if (props.params?.bucketId === 'active') {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 15_000);
}
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});

function compactConnectionPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '(no path)';
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return trimmed;
  return `.../${parts.slice(-2).join('/')}`;
}

function sessionStatusLabelFor(connectionId: string): string {
  if (props.params?.sessionStatusLabel) return props.params.sessionStatusLabel(connectionId);
  return 'No session bound';
}

function statusBadgeFor(connectionId: string) {
  return toConnectionStatusBadge(sessionStatusLabelFor(connectionId));
}

function handleSelect(connectionId: string) {
  props.params?.onSelectConnection?.(connectionId);
}

function handleContextMenu(ev: MouseEvent, connectionId: string) {
  props.params?.onContextMenu?.(ev, connectionId);
}

function processingLabelFor(conn: ConnectionInstance): string {
  if (props.params?.bucketId !== 'active') return '';
  if (conn.status !== 'busy') return '';
  const startedAt = props.params.processingStartedAt?.(conn.id) ?? null;
  if (!startedAt) return '';
  const ms = Math.max(0, now.value - startedAt);
  return `Processing: ${formatDurationMs(ms)}`;
}
</script>

<template>
  <section class="bucket-body">
    <div class="bucket-meta">
      <span class="muted">{{ items.length }} connections</span>
    </div>

    <div
      v-for="conn in items"
      :key="conn.id"
      :class="['session-item', conn.id === activeId ? 'active' : '']"
      @click.stop="handleSelect(conn.id)"
      @contextmenu.prevent.stop="handleContextMenu($event, conn.id)"
    >
      <div class="session-item-top">
        <div class="connection-title" :title="conn.directory">{{ compactConnectionPath(conn.directory) }}</div>
        <span
          class="status-badge"
          :class="'status-badge--' + statusBadgeFor(conn.id).kind"
          :title="statusBadgeFor(conn.id).raw"
        >
          {{ statusBadgeFor(conn.id).text }}
        </span>
      </div>
      <div class="muted session-item-sub">
        <span>{{ conn.label }} &middot; {{ conn.mode }}</span>
        <span v-if="processingLabelFor(conn)" class="processing">{{ processingLabelFor(conn) }}</span>
      </div>
    </div>

    <div v-if="!items.length" class="muted bucket-empty">No connections</div>
  </section>
</template>

<style scoped>
.bucket-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bucket-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 2px 2px 0 2px;
}

.bucket-empty {
  padding: 4px 2px;
}

.session-item {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  font-size: 12px;
  cursor: pointer;
}

.session-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.session-item-sub {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.processing {
  flex: 0 0 auto;
}

.session-item.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.connection-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-badge {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
  background: var(--panel);
  text-transform: lowercase;
}

.status-badge--busy,
.status-badge--session {
  border-color: var(--accent);
  color: var(--text);
}

.status-badge--connecting {
  border-color: var(--accent);
  color: var(--text);
  opacity: 0.9;
}
</style>

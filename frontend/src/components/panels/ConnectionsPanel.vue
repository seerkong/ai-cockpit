<template>
  <section class="connections-panel">
    <div class="paneview-host">
      <PaneviewVue
        class="dockview-theme-abyss connections-paneview"
        :disableDnd="true"
        @ready="onPaneReady"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, markRaw, ref, watch } from 'vue';
import { PaneviewVue, type PaneviewApi, type PaneviewReadyEvent } from 'dockview-vue';
import type { ConnectionInstance } from '../../composables/connection-types';
import {
  CONNECTION_STATUS_BUCKETS,
  bucketIdForConnectionStatus,
  type ConnectionStatusBucketId,
  useConnectionStatusBuckets,
} from '../../composables/connection-status-buckets';

export interface Props {
  connections: ConnectionInstance[];
  activeConnectionId: string;
  sessionStatusLabel?: (connectionId: string) => string;
  onSelectConnection?: (connectionId: string) => void;
  onContextMenu?: (event: MouseEvent, connectionId: string) => void;
}

const props = withDefaults(defineProps<Props>(), {
  connections: () => [],
  activeConnectionId: '',
  sessionStatusLabel: undefined,
  onSelectConnection: undefined,
  onContextMenu: undefined,
});

type BucketPaneParams = {
  bucketId: ConnectionStatusBucketId;
  connections: ConnectionInstance[];
  activeConnectionId: string;
  processingStartedAt?: (connectionId: string) => number | null;
  sessionStatusLabel?: (connectionId: string) => string;
  onSelectConnection: (connectionId: string) => void;
  onContextMenu: (event: MouseEvent, connectionId: string) => void;
};

const paneApi = ref<PaneviewApi | null>(null);
const buckets = useConnectionStatusBuckets(() => props.connections);
const processingStartedAtById = ref<Record<string, number>>({});
const lastBucketCounts = ref<Record<ConnectionStatusBucketId, number>>({
  idle: 0,
  waiting: 0,
  active: 0,
  other: 0,
});
const defaultSizingApplied = ref(false);

function buildBucketParams(bucketId: ConnectionStatusBucketId): BucketPaneParams {
  return {
    bucketId,
    connections: buckets.value[bucketId] ?? [],
    activeConnectionId: props.activeConnectionId,
    processingStartedAt: (connectionId: string) => processingStartedAtById.value[connectionId] ?? null,
    sessionStatusLabel: props.sessionStatusLabel,
    onSelectConnection: (connectionId: string) => props.onSelectConnection?.(connectionId),
    onContextMenu: (ev: MouseEvent, connectionId: string) => props.onContextMenu?.(ev, connectionId),
  };
}

watch(
  () => props.connections,
  (next, prev) => {
    const prevById = new Map<string, ConnectionInstance>();
    for (const c of prev ?? []) prevById.set(c.id, c);

    const nextById = new Map<string, ConnectionInstance>();
    for (const c of next ?? []) nextById.set(c.id, c);

    const out: Record<string, number> = { ...processingStartedAtById.value };

    for (const conn of next ?? []) {
      const prevStatus = prevById.get(conn.id)?.status;
      const nextStatus = conn.status;
      if (nextStatus === 'busy') {
        if (prevStatus !== 'busy' || !out[conn.id]) {
          out[conn.id] = Date.now();
        }
      } else if (out[conn.id]) {
        delete out[conn.id];
      }
    }

    for (const id of Object.keys(out)) {
      if (!nextById.has(id)) delete out[id];
    }

    processingStartedAtById.value = out;
  },
  { immediate: true },
);

const activeBucketId = computed<ConnectionStatusBucketId | null>(() => {
  const activeId = props.activeConnectionId;
  if (!activeId) return null;
  const conn = props.connections.find((c) => c.id === activeId);
  if (!conn) return null;
  return bucketIdForConnectionStatus(conn.status);
});

function maybeExpandBucket(bucketId: ConnectionStatusBucketId | null) {
  if (!bucketId) return;
  const api = paneApi.value;
  if (!api) return;

  const panel = api.getPanel(`connections_${bucketId}`);
  if (!panel) return;
  panel.setExpanded(true);
}

watch(activeBucketId, (next) => {
  maybeExpandBucket(next);
});

function onPaneReady(event: PaneviewReadyEvent) {
  paneApi.value = markRaw(event.api);

  for (const bucket of CONNECTION_STATUS_BUCKETS) {
    const id = `connections_${bucket.id}`;
    if (event.api.getPanel(id)) continue;

    event.api.addPanel({
      id,
      component: 'connectionsBucketPane',
      params: buildBucketParams(bucket.id),
      title: bucket.label,
      // Default: show Idle/Waiting/Active bodies; keep Other collapsed.
      isExpanded: bucket.id !== 'other',
      // Paneview panels default to header-only without an explicit size.
      // Provide a reasonable initial body size so expanded sections are usable.
      size: bucket.id === 'active' ? 220 : 160,
      minimumBodySize: 64,
    });
  }

  // Seed counts and keep expected default expansions on first render.
  for (const bucket of CONNECTION_STATUS_BUCKETS) {
    const count = buckets.value[bucket.id]?.length ?? 0;
    lastBucketCounts.value[bucket.id] = count;
    const panel = event.api.getPanel(`connections_${bucket.id}`);
    if (!panel) continue;
    if (bucket.id !== 'other') panel.setExpanded(true);
    else panel.setExpanded(false);
  }

  // Apply default sizing once: Idle/Waiting each ~1/4, Active takes remaining, Other collapsed.
  if (!defaultSizingApplied.value) {
    defaultSizingApplied.value = true;
    requestAnimationFrame(() => {
      const api = paneApi.value;
      if (!api) return;
      const total = api.height;
      if (!Number.isFinite(total) || total <= 0) return;

      const headerSize = 22; // dockview-core PaneviewComponent HEADER_SIZE
      const minExpanded = headerSize + 64;

      const otherPanel = api.getPanel('connections_other');
      const idlePanel = api.getPanel('connections_idle');
      const waitingPanel = api.getPanel('connections_waiting');
      const activePanel = api.getPanel('connections_active');

      const otherSize = headerSize;
      const remaining = Math.max(0, total - otherSize);

      let idleSize = Math.max(minExpanded, Math.floor(remaining * 0.25));
      let waitingSize = Math.max(minExpanded, Math.floor(remaining * 0.25));
      let activeSize = Math.max(minExpanded, total - otherSize - idleSize - waitingSize);

      // If we overflow the container, shrink Idle/Waiting first (but keep minimum).
      const overflow = otherSize + idleSize + waitingSize + activeSize - total;
      if (overflow > 0) {
        const shrinkableIdle = Math.max(0, idleSize - minExpanded);
        const shrinkableWaiting = Math.max(0, waitingSize - minExpanded);
        const totalShrinkable = shrinkableIdle + shrinkableWaiting;
        if (totalShrinkable > 0) {
          const shrink = Math.min(overflow, totalShrinkable);
          const idleShare = shrinkableIdle / totalShrinkable;
          const shrinkIdle = Math.min(shrinkableIdle, Math.round(shrink * idleShare));
          const shrinkWaiting = Math.min(shrinkableWaiting, shrink - shrinkIdle);
          idleSize -= shrinkIdle;
          waitingSize -= shrinkWaiting;
          activeSize = Math.max(minExpanded, total - otherSize - idleSize - waitingSize);
        }
      }

      otherPanel?.setExpanded(false);
      idlePanel?.setExpanded(true);
      waitingPanel?.setExpanded(true);
      activePanel?.setExpanded(true);

      // Pane sizes are total sizes along the vertical axis (header + body).
      idlePanel?.api.setSize({ size: idleSize });
      waitingPanel?.api.setSize({ size: waitingSize });
      activePanel?.api.setSize({ size: activeSize });
    });
  }

  maybeExpandBucket(activeBucketId.value);
}

// Paneview panel params are snapshotted; keep them updated when data changes.
watch([
  buckets,
  () => props.activeConnectionId,
  () => props.sessionStatusLabel,
], () => {
  const api = paneApi.value;
  if (!api) return;

  for (const bucket of CONNECTION_STATUS_BUCKETS) {
    const id = `connections_${bucket.id}`;
    const panel = api.getPanel(id);
    if (!panel) continue;
    panel.api.updateParameters(buildBucketParams(bucket.id));
  }

  // If a bucket transitions from empty -> non-empty, auto-expand it once.
  for (const bucket of CONNECTION_STATUS_BUCKETS) {
    if (bucket.id === 'other') continue;
    const nextCount = buckets.value[bucket.id]?.length ?? 0;
    const prevCount = lastBucketCounts.value[bucket.id] ?? 0;
    lastBucketCounts.value[bucket.id] = nextCount;
    if (prevCount === 0 && nextCount > 0) {
      api.getPanel(`connections_${bucket.id}`)?.setExpanded(true);
    }
  }
});
</script>

<script lang="ts">
import ConnectionsBucketPane from './ConnectionsBucketPane.vue';

export default {
  components: {
    connectionsBucketPane: ConnectionsBucketPane,
  },
};
</script>

<style scoped>
.connections-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 10px;
  padding: 12px;
  overflow: hidden;
  height: 100%;
  min-height: 0;
}

.paneview-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.connections-paneview {
  width: 100%;
  height: 100%;
}

:deep(.dv-paneview) {
  height: 100%;
}

</style>

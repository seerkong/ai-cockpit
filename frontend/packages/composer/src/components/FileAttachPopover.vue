<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { basenameFromPath, normalizePathSearchResults } from '@frontend/core';

export interface Props {
  connectionId: string;
  apiFetchForConnection?: (cid: string, url: string, opts?: RequestInit) => Promise<Response>;
  limit?: number;
}

const props = withDefaults(defineProps<Props>(), {
  connectionId: '',
  apiFetchForConnection: undefined,
  limit: 20,
});

const emit = defineEmits<{
  attachPath: [path: string];
  close: [];
}>();

const query = ref('');
const results = ref<string[]>([]);
const loading = ref(false);
const error = ref('');
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function close() {
  emit('close');
}

async function runSearch(q: string) {
  const cid = props.connectionId;
  const apiFetch = props.apiFetchForConnection;
  if (!cid || !apiFetch) return;

  loading.value = true;
  error.value = '';
  try {
    const url = `/api/v1/workspaces/${cid}/paths/search?query=${encodeURIComponent(q)}&kind=file&limit=${props.limit}`;
    const resp = await apiFetch(cid, url);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Search failed (${resp.status})`);
    }
    const payload = await resp.json().catch(() => []);
    results.value = normalizePathSearchResults(payload);
    activeIndex.value = 0;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Search failed.';
    results.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  query,
  (next) => {
    const q = next.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;

    if (!q) {
      results.value = [];
      error.value = '';
      loading.value = false;
      activeIndex.value = 0;
      return;
    }

    debounceTimer = setTimeout(() => {
      void runSearch(q);
    }, 150);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
});

onMounted(async () => {
  await nextTick();
  inputEl.value?.focus();
});

function selectIndex(idx: number) {
  activeIndex.value = Math.max(0, Math.min(idx, results.value.length - 1));
}

function attach(path: string) {
  emit('attachPath', path);
  close();
}

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    close();
    ev.preventDefault();
    return;
  }
  if (ev.key === 'ArrowDown') {
    if (results.value.length > 0) selectIndex(activeIndex.value + 1);
    ev.preventDefault();
    return;
  }
  if (ev.key === 'ArrowUp') {
    if (results.value.length > 0) selectIndex(activeIndex.value - 1);
    ev.preventDefault();
    return;
  }
  if (ev.key === 'Enter') {
    const pick = results.value[activeIndex.value];
    if (pick) attach(pick);
    ev.preventDefault();
  }
}

function isActive(idx: number) {
  return idx === activeIndex.value;
}
</script>

<template>
  <div class="header">Attach file</div>
  <input
    ref="inputEl"
    v-model="query"
    class="search"
    placeholder="Search files..."
    type="text"
    autocomplete="off"
    @keydown="onKeyDown"
  />

  <div v-if="error" class="muted" style="margin-top: 8px">{{ error }}</div>
  <div v-else-if="loading" class="muted" style="margin-top: 8px">Searching...</div>
  <div v-else-if="query.trim() && !results.length" class="muted" style="margin-top: 8px">No files found</div>

  <div v-if="results.length" class="list">
    <button
      v-for="(p, idx) in results"
      :key="p"
      class="secondary item"
      :class="{ active: isActive(idx) }"
      type="button"
      @click="attach(p)"
      @mouseenter="selectIndex(idx)"
    >
      <div class="name">{{ basenameFromPath(p) }}</div>
      <div class="path muted">{{ p }}</div>
    </button>
  </div>
</template>

<style scoped>
.header {
  color: var(--muted);
  font-size: 12px;
}

.search {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
}

.search:focus {
  outline: none;
  border-color: var(--accent);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.item {
  text-align: left;
  padding: 8px;
}

.item.active {
  background: var(--accent);
  color: var(--bg);
  border-color: transparent;
}

.item.active .muted {
  color: rgba(15, 23, 42, 0.75);
}

.name {
  font-size: 12px;
}

.path {
  font-size: 11px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>

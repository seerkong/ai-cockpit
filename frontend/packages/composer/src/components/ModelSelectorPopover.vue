<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { filterModelOptions, groupModelOptions } from '../lib/model-picker';
import { flattenModelGroups } from '../lib/model-selector-popover';

export type ModelOption = {
  providerID: string;
  providerName?: string;
  modelID: string;
  modelName?: string;
  label: string;
};

export interface Props {
  options: ModelOption[];
  selectedKey: string;
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  selectedKey: '',
});

const emit = defineEmits<{
  select: [key: string];
  close: [];
}>();

const query = ref('');
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const filtered = computed(() => filterModelOptions(props.options, query.value));
const groups = computed(() => groupModelOptions(filtered.value));
const flat = computed(() => flattenModelGroups(groups.value));

function close() {
  emit('close');
}

function selectByFlatIndex(idx: number) {
  const item = flat.value[idx];
  if (!item) return;
  emit('select', item.key);
  close();
}

function isSelected(key: string) {
  return key === props.selectedKey;
}

function onKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    close();
    ev.preventDefault();
    return;
  }
  if (ev.key === 'ArrowDown') {
    if (flat.value.length > 0) activeIndex.value = (activeIndex.value + 1) % flat.value.length;
    ev.preventDefault();
    return;
  }
  if (ev.key === 'ArrowUp') {
    if (flat.value.length > 0) activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length;
    ev.preventDefault();
    return;
  }
  if (ev.key === 'Enter') {
    selectByFlatIndex(activeIndex.value);
    ev.preventDefault();
  }
}

onMounted(async () => {
  await nextTick();
  inputEl.value?.focus();
});
</script>

<template>
  <div class="header">Select model</div>
  <input
    ref="inputEl"
    v-model="query"
    class="search"
    placeholder="Search models..."
    type="text"
    autocomplete="off"
    @keydown="onKeyDown"
  />

  <div v-if="!flat.length" class="muted" style="margin-top: 8px">No models</div>

  <div v-if="flat.length" class="list">
    <template v-for="g in groups" :key="g.providerID">
      <div class="group">{{ g.providerID }}</div>
      <button
        v-for="m in g.models"
        :key="m.providerID + ':' + m.modelID"
        class="secondary item"
        :class="{ selected: isSelected(m.providerID + ':' + m.modelID) }"
        type="button"
        @click="$emit('select', m.providerID + ':' + m.modelID)"
      >
        <div class="name">{{ m.modelID }}</div>
      </button>
    </template>
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
  max-height: 260px;
  overflow: auto;
}

.group {
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}

.item {
  text-align: left;
  padding: 8px;
}

.item.selected {
  border-color: var(--accent);
}

.name {
  font-size: 12px;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>

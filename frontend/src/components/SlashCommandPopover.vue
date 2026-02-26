<script setup lang="ts">
export type SlashCommandPopoverOption = {
  key: string;
  title: string;
  description?: string;
  hint?: string;
};

export interface Props {
  options: SlashCommandPopoverOption[];
  activeIndex: number;
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  activeIndex: 0,
});

const emit = defineEmits<{
  select: [index: number];
}>();

function onSelect(idx: number) {
  emit('select', idx);
}

function isActive(idx: number) {
  return idx === props.activeIndex;
}
</script>

<template>
  <div class="muted">/ Commands</div>

  <div class="composer-popover-list">
    <button
      v-for="(opt, idx) in options"
      :key="opt.key"
      class="secondary"
      :class="{ 'popover-active': isActive(idx) }"
      @click="onSelect(idx)"
    >
      <div style="display: flex; justify-content: space-between; gap: 8px">
        <span>{{ opt.title }}</span>
        <span v-if="opt.hint" class="muted">{{ opt.hint }}</span>
      </div>
      <div v-if="opt.description" class="muted" style="margin-top: 4px">{{ opt.description }}</div>
    </button>
  </div>
</template>

<style scoped>
.composer-popover-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.composer-popover-list button {
  text-align: left;
  padding: 8px;
  font-size: 12px;
}

.composer-popover-list button.popover-active {
  background: var(--accent);
  color: var(--bg);
}

.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>

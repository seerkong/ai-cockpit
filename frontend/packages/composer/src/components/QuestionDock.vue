<script setup lang="ts">
import { computed, ref } from 'vue';
import { questionId, type QuestionRequest } from '@frontend/core';
import { questionHeader, questionMultiple, questionOptions, questionPrompt } from '../lib/question-dock';

export interface Props {
  questions: QuestionRequest[];
  drafts: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  questions: () => [],
  drafts: () => ({}),
});

const emit = defineEmits<{
  updateAnswer: [questionId: string, answer: string];
  reply: [question: QuestionRequest];
  reject: [question: QuestionRequest];
  submitAll: [];
}>();

const page = ref(0);

const pages = computed(() => props.questions.length);
const current = computed<QuestionRequest | null>(() => props.questions[page.value] ?? null);
const currentId = computed(() => (current.value ? questionId(current.value) : ''));

const currentOptions = computed(() => (current.value ? questionOptions(current.value) : []));
const currentMultiple = computed(() => (current.value ? questionMultiple(current.value) : false));
const currentHeader = computed(() => (current.value ? questionHeader(current.value) : ''));
const currentPrompt = computed(() => (current.value ? questionPrompt(current.value) : ''));

const answerText = computed(() => {
  const id = currentId.value;
  if (!id) return '';
  return props.drafts[id] || '';
});

function setAnswer(next: string) {
  const id = currentId.value;
  if (!id) return;
  emit('updateAnswer', id, next);
}

function selectedSet(): Set<string> {
  return new Set(answerText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
}

function toggleOption(label: string) {
  const set = selectedSet();
  if (set.has(label)) set.delete(label);
  else set.add(label);
  setAnswer(Array.from(set.values()).join('\n'));
}

function selectSingle(label: string) {
  setAnswer(label);
}

function back() {
  page.value = Math.max(0, page.value - 1);
}

function next() {
  page.value = Math.min(pages.value - 1, page.value + 1);
}

function rejectCurrent() {
  if (!current.value) return;
  emit('reject', current.value);
}

function replyCurrent() {
  if (!current.value) return;
  emit('reply', current.value);
}

function submitAll() {
  emit('submitAll');
}
</script>

<template>
  <div class="dock">
    <div class="dock-header">
      <div class="dock-title">Question</div>
      <div class="dock-pager" v-if="pages > 1">{{ page + 1 }} / {{ pages }}</div>
    </div>

    <div class="dock-body">
      <div v-if="currentHeader" class="dock-sub muted">{{ currentHeader }}</div>
      <div class="dock-main">{{ currentPrompt }}</div>

      <div v-if="currentOptions.length" class="dock-options">
        <label v-for="opt in currentOptions" :key="opt.label" class="option">
          <input
            v-if="currentMultiple"
            type="checkbox"
            :checked="selectedSet().has(opt.label)"
            @change="toggleOption(opt.label)"
          />
          <input
            v-else
            type="radio"
            :name="currentId"
            :checked="answerText === opt.label"
            @change="selectSingle(opt.label)"
          />
          <span class="opt-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="muted opt-desc">{{ opt.description }}</span>
        </label>
      </div>

      <textarea
        v-else
        class="dock-input"
        rows="3"
        placeholder="Type your answer..."
        :value="answerText"
        @input="setAnswer(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>

    <div class="dock-actions">
      <button v-if="pages > 1" class="secondary" type="button" :disabled="page <= 0" @click="back">Back</button>
      <button v-if="pages > 1" class="secondary" type="button" :disabled="page >= pages - 1" @click="next">Next</button>

      <div class="spacer"></div>

      <button class="secondary danger" type="button" @click="rejectCurrent">Reject</button>
      <button v-if="pages > 1" class="secondary" type="button" @click="submitAll">Submit</button>
      <button v-else class="secondary" type="button" @click="replyCurrent">Reply</button>
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

.dock-pager {
  font-size: 12px;
  color: var(--muted);
}

.dock-body {
  margin-top: 8px;
}

.dock-main {
  font-size: 13px;
  color: var(--text);
}

.dock-sub {
  margin-bottom: 4px;
  font-size: 12px;
}

.dock-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.option {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.opt-label {
  color: var(--text);
}

.opt-desc {
  margin-left: 4px;
}

.dock-input {
  width: 100%;
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  resize: vertical;
}

.dock-input:focus {
  outline: none;
  border-color: var(--accent);
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

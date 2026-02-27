<template>
  <section class="right-panel">
    <div class="panel-scroll">
    <!-- Review Tab -->
    <div v-if="mode === 'review'" class="panel-content">
      <div class="review-toolbar">
        <button class="secondary" :disabled="!capabilities?.reviewDiffs" @click="$emit('refresh-diffs')">Refresh</button>
        <button class="secondary" :disabled="diffViewMode === 'unified'" @click="$emit('update:diffViewMode', 'unified')">Unified</button>
        <button class="secondary" :disabled="diffViewMode === 'split'" @click="$emit('update:diffViewMode', 'split')">Split</button>
        <button class="secondary" :disabled="!selectedDiff" @click="$emit('toggle-diff-expanded')">
          {{ diffExpanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>

      <div v-if="!capabilities?.reviewDiffs" class="muted">Diffs not supported by this provider.</div>
      <div v-else-if="diffsLoading" class="muted">Loading diffs…</div>
      <div v-else-if="diffsError" class="muted">{{ diffsError }}</div>
      <div v-else>
        <div class="review-files">
          <div
            v-for="(d, idx) in diffs"
            :key="d.file"
            :class="['session-item', idx === selectedDiffIndex ? 'active' : '']"
            @click="$emit('select-diff', idx)"
          >
            <div>{{ d.file }}</div>
            <div class="muted">+{{ d.additions ?? 0 }} / -{{ d.deletions ?? 0 }}</div>
          </div>
        </div>

        <div v-if="selectedDiff" class="review-diff">
          <div class="review-diff-header">
            <strong>{{ selectedDiff.file }}</strong>
            <button class="secondary" @click="$emit('open-diff-file', selectedDiff.file)">Open file</button>
          </div>

          <div v-if="diffExpanded">
            <pre v-if="diffViewMode === 'unified'" class="tool-block diff-block">
              <template v-for="(line, idx) in unifiedDiffLines" :key="line.key">
                <div :class="[line.kind]">{{ line.text }}</div>
              </template>
            </pre>

            <div v-else class="diff-split">
              <div class="diff-split-col">
                <div class="muted">Before</div>
                <pre class="tool-block diff-block">
                  <template v-for="row in splitDiffRows" :key="row.key">
                    <div :class="row.leftKind">{{ row.leftText }}</div>
                  </template>
                </pre>
              </div>
              <div class="diff-split-col">
                <div class="muted">After</div>
                <pre class="tool-block diff-block">
                  <template v-for="row in splitDiffRows" :key="row.key">
                    <div :class="row.rightKind">{{ row.rightText }}</div>
                  </template>
                </pre>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="muted">No diffs.</div>
      </div>
    </div>

    <!-- Context Tab -->
    <div v-else-if="mode === 'context'" class="panel-content">
      <div class="context-summary">
        <div class="muted">Messages: {{ rawMessages.length }}</div>
        <div v-if="totalCost" class="muted">Total cost: {{ totalCost.toFixed(6) }}</div>
        <div v-if="lastAgent" class="muted">Last agent: {{ lastAgent }}</div>
        <div v-if="lastModelLabel" class="muted">Last model: {{ lastModelLabel }}</div>
      </div>

      <details open class="context-details">
        <summary>Raw messages</summary>

        <div class="raw-msg-header">
          <div class="muted">{{ rawMessages.length }} messages</div>
          <button class="secondary raw-msg-sort-btn" type="button" :disabled="rawMessages.length <= 1" @click="toggleRawSort">
            {{ rawSortOrder === 'desc' ? '↓ Newest' : '↑ Oldest' }}
          </button>
        </div>

        <div v-if="!rawMessages.length" class="muted">No messages.</div>
        <div v-else class="raw-msg-list">
          <div
            v-for="msg in sortedRawMessages"
            :key="msg.info.id"
            class="raw-msg-row"
            :class="{ 'raw-msg-row--open': expandedRawMessageId === msg.info.id }"
          >
            <button
              class="raw-msg-row-summary"
              type="button"
              :title="String(msg.info.id)"
              @click="toggleRawExpand(msg.info.id)"
            >
              <span class="raw-msg-role-badge" :class="`badge--${String(msg.info.role || 'unknown')}`">
                {{ String(msg.info.role || 'unknown') }}
              </span>
              <span class="raw-msg-time muted">{{ rawMessageTimeLabel(msg.info) }}</span>
              <span v-if="extractRawMessageAgent(msg.info)" class="raw-msg-agent muted">{{ extractRawMessageAgent(msg.info) }}</span>
              <span v-else class="raw-msg-agent muted">—</span>
              <span class="raw-msg-preview">{{ extractRawMessagePreview(msg, 20) }}</span>
              <span class="raw-msg-chevron" aria-hidden="true">{{ expandedRawMessageId === msg.info.id ? '▾' : '▸' }}</span>
            </button>

            <div v-if="expandedRawMessageId === msg.info.id" class="raw-msg-detail" @mousedown.stop>
              <pre class="tool-block"><code class="hljs" v-html="highlight(JSON.stringify(msg, null, 2), 'json')"></code></pre>
            </div>
          </div>
        </div>
      </details>

      <div class="context-section">
        <div class="context-section-header">
          <strong>Permissions</strong>
          <button class="secondary" :disabled="!capabilities?.permissions" @click="$emit('refresh-permissions')">Refresh</button>
        </div>

        <label class="toggle">
          <input type="checkbox" :checked="autoAcceptPermissions" :disabled="!capabilities?.permissions" @change="$emit('update:autoAcceptPermissions', ($event.target as HTMLInputElement).checked)" />
          <span>Auto-accept</span>
        </label>

        <div v-if="!capabilities?.permissions" class="muted">Permissions not supported by this provider.</div>
        <div v-else-if="permissionsLoading" class="muted">Loading permissions…</div>
        <div v-else-if="permissionsError" class="muted">{{ permissionsError }}</div>
        <div v-else-if="!permissions.length" class="muted">No pending permissions.</div>
        <div v-else class="context-list">
          <div v-for="p in permissions" :key="getPermissionId(p)" class="context-item">
            <pre class="tool-block"><code class="hljs" v-html="highlight(JSON.stringify(p, null, 2), 'json')"></code></pre>
            <div class="context-item-actions">
              <button class="secondary" @click="$emit('grant-permission', p, 'once')">Once</button>
              <button class="secondary" @click="$emit('grant-permission', p, 'always')">Always</button>
              <button class="secondary" @click="$emit('deny-permission', p)">Reject</button>
            </div>
          </div>
        </div>
      </div>

      <div class="context-section">
        <div class="context-section-header">
          <strong>Questions</strong>
          <button class="secondary" :disabled="!capabilities?.questions" @click="$emit('refresh-questions')">Refresh</button>
        </div>

        <div v-if="!capabilities?.questions" class="muted">Questions not supported by this provider.</div>
        <div v-else-if="questionsLoading" class="muted">Loading questions…</div>
        <div v-else-if="questionsError" class="muted">{{ questionsError }}</div>
        <div v-else-if="!questions.length" class="muted">No pending questions.</div>
        <div v-else class="context-list">
          <div v-for="q in questions" :key="getQuestionId(q)" class="context-item">
            <pre class="tool-block"><code class="hljs" v-html="highlight(JSON.stringify(q, null, 2), 'json')"></code></pre>
            <textarea
              :value="questionAnswerDrafts[getQuestionId(q)] || ''"
              class="diff-comment-input"
              placeholder="Reply answers (one per line)…"
              @input="$emit('update:questionAnswer', getQuestionId(q), ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <div class="context-item-actions">
              <button class="secondary" @click="$emit('reply-question', q)">Reply</button>
              <button class="secondary" @click="$emit('reject-question', q)">Reject</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Todo Tab -->
    <div v-else-if="mode === 'todo'" class="panel-content">
      <div class="context-section-header">
        <strong>Session Todos</strong>
        <button class="secondary" :disabled="!sessionId || todosLoading" @click="$emit('refresh-todos')">Refresh</button>
      </div>
      <div v-if="!sessionId" class="muted">Select a session first.</div>
      <div v-else-if="todosLoading" class="muted">Loading todos…</div>
      <div v-else-if="todosError" class="muted">{{ todosError }}</div>
      <div v-else-if="!todos.length" class="muted">No todos.</div>
      <div v-else class="context-list">
        <div v-for="todo in todos" :key="getTodoKey(todo)" class="context-item">
          <div class="muted">{{ getTodoStatus(todo) }}</div>
          <div>{{ getTodoContent(todo) }}</div>
        </div>
      </div>
    </div>

    <!-- Codument Tab -->
    <div v-else-if="mode === 'codument'" class="panel-content">
      <div class="codument-toolbar">
        <strong>Codument Track</strong>
        <button class="secondary" :disabled="!activeConnectionId" @click="$emit('refresh-codument-tracks')">Refresh</button>
      </div>

      <label class="toggle">
        <input type="checkbox" :checked="codumentAutoRefreshEnabled" :disabled="!activeConnectionId" @change="$emit('update:codumentAutoRefreshEnabled', ($event.target as HTMLInputElement).checked)" />
        <span>Enable 15s auto refresh</span>
      </label>

      <div v-if="!activeConnectionId" class="muted">Select a connection first.</div>
      <div v-else-if="codumentTracksLoading" class="muted">Loading tracks…</div>
      <div v-else-if="codumentTracksError" class="muted">{{ codumentTracksError }}</div>
      <div v-else-if="!codumentTracks.length" class="muted">No codument tracks.</div>
      <div v-else>
        <div class="codument-toolbar" style="margin-top: 0;">
          <select
            class="codument-select"
            :value="selectedCodumentTrackId"
            @change="$emit('update:codumentTrackId', ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Select a track…</option>
            <option
              v-for="t in codumentTracks"
              :key="t.trackId"
              :value="t.trackId"
            >{{ t.statusSymbol }} {{ t.trackId }} · {{ t.trackName }}</option>
          </select>
          <button
            :class="boundCodumentTrackId === selectedCodumentTrackId ? '' : 'secondary'"
            :disabled="!activeConnectionId || !selectedCodumentTrackId || boundCodumentTrackId === selectedCodumentTrackId"
            @click="$emit('bind-codument-track')"
          >{{ boundCodumentTrackId === selectedCodumentTrackId ? 'Bound' : 'Bind' }}</button>
        </div>
      </div>

      <!-- Track tree -->
      <div v-if="codumentTrackTreeLoading" class="muted" style="margin-top: 8px;">Loading task tree…</div>
      <div v-else-if="codumentTrackTreeError" class="muted" style="margin-top: 8px;">{{ codumentTrackTreeError }}</div>
      <div v-else-if="!codumentTrackTree" class="muted" style="margin-top: 8px;">No task tree.</div>
      <div v-else class="codument-tree">
        <div class="codument-tree-header">
          <span class="codument-status-symbol">{{ codumentTrackTree.statusSymbol }}</span>
          <strong>{{ codumentTrackTree.trackName }}</strong>
          <span class="muted">{{ codumentTrackTree.status }}</span>
        </div>
        <div v-for="phase in codumentTrackTree.phases" :key="phase.id" class="codument-node codument-node--phase">
          <div class="codument-node-label">
            <span class="codument-status-symbol">{{ phase.statusSymbol }}</span>
            <span>{{ phase.name }}</span>
            <span class="muted">{{ phase.status }}</span>
          </div>
          <div v-for="task in phase.tasks" :key="task.id" class="codument-node codument-node--task">
            <div class="codument-node-label">
              <span class="codument-status-symbol">{{ task.statusSymbol }}</span>
              <span>{{ task.name }}</span>
              <span class="muted">{{ task.status }}</span>
            </div>
            <div v-for="sub in task.subtasks" :key="sub.id" class="codument-node codument-node--subtask">
              <div class="codument-node-label">
                <span class="codument-status-symbol">{{ sub.statusSymbol }}</span>
                <span>{{ sub.name }}</span>
                <span class="muted">{{ sub.status }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Files Tab -->
    <div v-else class="panel-content">
      <div class="sidebar-section">
        <div class="muted">File tree</div>
        <div class="file-tree">
          <div
            v-for="node in fileTree"
            :key="node.path"
            class="file-node"
            @click="$emit(node.type === 'file' ? 'load-file' : 'load-directory', node.path)"
          >
            {{ node.type === 'dir' ? '[D]' : '[F]' }} {{ node.name }}
          </div>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="muted">File content</div>
        <div class="file-content">{{ fileContent || 'Select a file' }}</div>
      </div>
      <div class="sidebar-section">
        <div class="muted">Search</div>
        <input :value="searchPattern" placeholder="ripgrep pattern" @input="$emit('update:searchPattern', ($event.target as HTMLInputElement).value)" />
        <button class="secondary" :disabled="!searchPattern" @click="$emit('run-search')">Search</button>
        <div class="search-results">
          <div v-for="result in searchResults" :key="result.path + result.line_number">
            <strong>{{ result.path }}</strong>:{{ result.line_number }}
            <div class="muted">{{ result.lines?.join(' ') }}</div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { highlightCode, preloadMarkdownLibs } from '../../lib/markdown';
import { extractRawMessageAgent, extractRawMessagePreview, sortRawMessagesByCreated } from '../../lib/raw-message-list';
import { formatHHMM, readMessageCreatedAtMs } from '../../lib/message-time';

type FileDiff = {
  file: string;
  before: unknown;
  after: unknown;
  additions?: number;
  deletions?: number;
};

type FileNode = {
  path: string;
  name: string;
  type: 'file' | 'dir';
};

type TodoItem = Record<string, unknown>;
type PermissionRequest = Record<string, unknown>;
type QuestionRequest = Record<string, unknown>;
type MessageWithParts = {
  info: { id: string; role: string; [key: string]: unknown };
  parts: unknown[];
};

type Capabilities = {
  reviewDiffs?: boolean;
  permissions?: boolean;
  questions?: boolean;
  [key: string]: unknown;
};

type SearchResult = {
  path: string;
  line_number: number;
  lines?: string[];
};

export interface Props {
  mode: 'review' | 'context' | 'files' | 'todo' | 'codument';
  sessionId: string;
  capabilities: Capabilities | null;
  // Review
  diffs: FileDiff[];
  diffsLoading: boolean;
  diffsError: string | null;
  selectedDiffIndex: number;
  diffViewMode: 'unified' | 'split';
  diffExpanded: boolean;
  // Context
  rawMessages: MessageWithParts[];
  totalCost: number;
  lastAgent: string;
  lastModelLabel: string;
  permissions: PermissionRequest[];
  permissionsLoading: boolean;
  permissionsError: string | null;
  autoAcceptPermissions: boolean;
  questions: QuestionRequest[];
  questionsLoading: boolean;
  questionsError: string | null;
  questionAnswerDrafts: Record<string, string>;
  // Todo
  todos: TodoItem[];
  todosLoading: boolean;
  todosError: string | null;
  // Codument
  activeConnectionId: string;
  codumentAutoRefreshEnabled: boolean;
  codumentTracks: Array<{ trackId: string; trackName: string; status: string; statusSymbol: '[x]' | '[~]' | '[ ]' }>;
  codumentTracksLoading: boolean;
  codumentTracksError: string | null;
  selectedCodumentTrackId: string;
  boundCodumentTrackId: string;
  codumentTrackTree: null | {
    trackId: string;
    trackName: string;
    status: string;
    statusSymbol: '[x]' | '[~]' | '[ ]';
    phases: Array<{
      id: string;
      name: string;
      status: string;
      statusSymbol: '[x]' | '[~]' | '[ ]';
      tasks: Array<{
        id: string;
        name: string;
        status: string;
        statusSymbol: '[x]' | '[~]' | '[ ]';
        subtasks: Array<{
          id: string;
          name: string;
          status: string;
          statusSymbol: '[x]' | '[~]' | '[ ]';
        }>;
      }>;
    }>;
  };
  codumentTrackTreeLoading: boolean;
  codumentTrackTreeError: string | null;
  // Files
  fileTree: FileNode[];
  fileContent: string;
  searchPattern: string;
  searchResults: SearchResult[];
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'files',
  sessionId: '',
  capabilities: null,
  diffs: () => [],
  diffsLoading: false,
  diffsError: null,
  selectedDiffIndex: 0,
  diffViewMode: 'unified',
  diffExpanded: true,
  rawMessages: () => [],
  totalCost: 0,
  lastAgent: '',
  lastModelLabel: '',
  permissions: () => [],
  permissionsLoading: false,
  permissionsError: null,
  autoAcceptPermissions: false,
  questions: () => [],
  questionsLoading: false,
  questionsError: null,
  questionAnswerDrafts: () => ({}),
  todos: () => [],
  todosLoading: false,
  todosError: null,
  activeConnectionId: '',
  codumentAutoRefreshEnabled: true,
  codumentTracks: () => [],
  codumentTracksLoading: false,
  codumentTracksError: null,
  selectedCodumentTrackId: '',
  boundCodumentTrackId: '',
  codumentTrackTree: null,
  codumentTrackTreeLoading: false,
  codumentTrackTreeError: null,
  fileTree: () => [],
  fileContent: '',
  searchPattern: '',
  searchResults: () => [],
});

defineEmits<{
  'refresh-diffs': [];
  'update:diffViewMode': [mode: 'unified' | 'split'];
  'toggle-diff-expanded': [];
  'select-diff': [index: number];
  'open-diff-file': [file: string];
  'refresh-permissions': [];
  'update:autoAcceptPermissions': [value: boolean];
  'grant-permission': [permission: PermissionRequest, mode: 'once' | 'always'];
  'deny-permission': [permission: PermissionRequest];
  'refresh-questions': [];
  'update:questionAnswer': [questionId: string, answer: string];
  'reply-question': [question: QuestionRequest];
  'reject-question': [question: QuestionRequest];
  'refresh-todos': [];
  'refresh-codument-tracks': [];
  'update:codumentTrackId': [trackId: string];
  'update:codumentAutoRefreshEnabled': [value: boolean];
  'bind-codument-track': [];
  'load-file': [path: string];
  'load-directory': [path: string];
  'update:searchPattern': [pattern: string];
  'run-search': [];
}>();

const selectedDiff = computed(() => props.diffs[props.selectedDiffIndex] ?? null);

const mdReady = ref(0);

const rawSortOrder = ref<'asc' | 'desc'>('desc');
const expandedRawMessageId = ref<string | null>(null);

const sortedRawMessages = computed(() => {
  void mdReady.value;
  return sortRawMessagesByCreated(props.rawMessages, rawSortOrder.value);
});

function highlight(code: string, lang: string): string {
  void mdReady.value;
  return highlightCode(code, lang);
}

function rawMessageTimeLabel(info: unknown): string {
  const ms = readMessageCreatedAtMs(info);
  return ms == null ? '--:--' : formatHHMM(ms);
}

function toggleRawSort() {
  rawSortOrder.value = rawSortOrder.value === 'desc' ? 'asc' : 'desc';
}

function toggleRawExpand(id: string) {
  expandedRawMessageId.value = expandedRawMessageId.value === id ? null : id;
}

onMounted(async () => {
  await preloadMarkdownLibs();
  mdReady.value++;
});

// Diff parsing helpers
type DiffLine = { key: string; kind: string; text: string };
type SplitRow = { key: string; leftKind: string; leftText: string; rightKind: string; rightText: string };

const unifiedDiffLines = computed<DiffLine[]>(() => {
  const diff = selectedDiff.value;
  if (!diff) return [];
  return parseDiffToUnified(diff);
});

const splitDiffRows = computed<SplitRow[]>(() => {
  const diff = selectedDiff.value;
  if (!diff) return [];
  return parseDiffToSplit(diff);
});

function parseDiffToUnified(diff: FileDiff): DiffLine[] {
  const before = String(diff.before ?? '');
  const after = String(diff.after ?? '');
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const result: DiffLine[] = [];
  
  // Simple diff: show removed then added
  for (let i = 0; i < beforeLines.length; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      result.push({ key: `del-${i}`, kind: 'diff-del', text: `- ${beforeLines[i]}` });
    } else {
      result.push({ key: `ctx-${i}`, kind: 'diff-ctx', text: `  ${beforeLines[i]}` });
    }
  }
  for (let i = 0; i < afterLines.length; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      result.push({ key: `add-${i}`, kind: 'diff-add', text: `+ ${afterLines[i]}` });
    }
  }
  
  return result;
}

function parseDiffToSplit(diff: FileDiff): SplitRow[] {
  const before = String(diff.before ?? '');
  const after = String(diff.after ?? '');
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const result: SplitRow[] = [];
  
  for (let i = 0; i < maxLen; i++) {
    const left = beforeLines[i] ?? '';
    const right = afterLines[i] ?? '';
    const leftKind = left !== right ? 'diff-del' : 'diff-ctx';
    const rightKind = left !== right ? 'diff-add' : 'diff-ctx';
    result.push({
      key: `row-${i}`,
      leftKind,
      leftText: left,
      rightKind,
      rightText: right,
    });
  }
  
  return result;
}

function getPermissionId(p: PermissionRequest): string {
  return String((p as Record<string, unknown>).id ?? JSON.stringify(p));
}

function getQuestionId(q: QuestionRequest): string {
  return String((q as Record<string, unknown>).id ?? JSON.stringify(q));
}

function getTodoKey(todo: TodoItem): string {
  return String(todo.id ?? JSON.stringify(todo));
}

function getTodoStatus(todo: TodoItem): string {
  return String(todo.status ?? 'unknown');
}

function getTodoContent(todo: TodoItem): string {
  return String(todo.content ?? todo.text ?? JSON.stringify(todo));
}
</script>

<style scoped>
.right-panel {
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

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.review-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.session-item {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  font-size: 12px;
  cursor: pointer;
}

.session-item.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.review-diff {
  margin-top: 12px;
}

.review-diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-block {
  background: var(--panel-2);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-block {
  font-family: monospace;
}

.diff-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.diff-split-col {
  overflow: hidden;
}

.diff-add {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.diff-del {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.diff-ctx {
  color: var(--muted);
}

.context-summary {
  margin-bottom: 12px;
}

.context-details {
  margin-bottom: 12px;
}

.context-details summary {
  cursor: pointer;
  color: var(--muted);
  margin-bottom: 8px;
}

.raw-msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.raw-msg-sort-btn {
  padding: 3px 8px;
  font-size: 11px;
}

.raw-msg-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}

.raw-msg-row {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-2);
}

.raw-msg-row--open {
  border-color: rgba(56, 189, 248, 0.4);
}

.raw-msg-row-summary {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.raw-msg-row-summary:hover {
  background: rgba(56, 189, 248, 0.04);
}

.raw-msg-role-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--border);
  color: var(--muted);
  background: transparent;
}

.badge--user {
  color: var(--accent);
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.08);
}

.badge--assistant {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.08);
}

.badge--tool {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(251, 191, 36, 0.06);
}

.badge--system,
.badge--unknown {
  color: var(--muted);
}

.raw-msg-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.raw-msg-agent {
  flex-shrink: 0;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.raw-msg-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  opacity: 0.7;
}

.raw-msg-chevron {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 10px;
  width: 12px;
  text-align: center;
}

.raw-msg-detail {
  padding: 0 8px 8px;
}

.context-section {
  margin-top: 16px;
}

.context-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.context-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-item {
  padding: 8px;
  background: var(--panel-2);
  border-radius: 6px;
}

.context-item-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.diff-comment-input {
  width: 100%;
  min-height: 60px;
  padding: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  resize: vertical;
  margin-top: 8px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.toggle input {
  cursor: pointer;
}

.sidebar-section {
  margin-bottom: 16px;
}

.file-tree {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
}

.file-node {
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.file-node:hover {
  background: var(--panel-2);
}

.file-content {
  background: var(--panel-2);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  font-family: monospace;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  margin-top: 8px;
}

.search-results {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.search-results > div {
  padding: 4px 0;
  font-size: 12px;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

/* Codument */
.codument-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.codument-select {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.codument-select:focus {
  outline: none;
  border-color: var(--accent);
}

.codument-tree {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.codument-tree-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--panel-2);
  border-radius: 6px;
  margin-bottom: 4px;
}

.codument-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.codument-node-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.codument-node-label:hover {
  background: rgba(56, 189, 248, 0.04);
}

.codument-node--phase > .codument-node-label {
  padding-left: 12px;
  font-weight: 600;
}

.codument-node--task > .codument-node-label {
  padding-left: 24px;
}

.codument-node--subtask > .codument-node-label {
  padding-left: 36px;
  color: var(--muted);
}

.codument-status-symbol {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--muted);
}

button {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #0b1120;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

input {
  padding: 8px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  width: 100%;
}

input:focus {
  outline: none;
  border-color: var(--accent);
}
</style>

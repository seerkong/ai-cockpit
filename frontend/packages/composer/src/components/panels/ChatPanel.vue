<template>
  <section ref="panelEl" class="chat-panel">

    <div class="session-header">
      <div class="session-title" :title="sessionTitle || (sessionId ? sessionId : 'No session selected')">
        <span v-if="sessionId">{{ sessionTitle || sessionId }}</span>
        <span v-else class="muted">No session selected</span>
      </div>

      <div class="session-header-actions">
        <div ref="viewMenuWrapEl" class="header-menu">
          <button
            class="secondary icon-button"
            type="button"
            title="View options"
            :aria-expanded="viewMenuOpen"
            @click="toggleViewMenu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 21v-7" />
              <path d="M4 10V3" />
              <path d="M12 21v-9" />
              <path d="M12 8V3" />
              <path d="M20 21v-5" />
              <path d="M20 12V3" />
              <path d="M2 14h4" />
              <path d="M10 10h4" />
              <path d="M18 16h4" />
            </svg>
          </button>

          <div v-if="viewMenuOpen" class="dropdown-menu view-menu" @mousedown.prevent>
            <label class="toggle dropdown-toggle">
              <input type="checkbox" v-model="showTools" />
              <span>Tools</span>
            </label>
            <label class="toggle dropdown-toggle">
              <input type="checkbox" v-model="showReasoning" />
              <span>Reasoning</span>
            </label>
            <label class="toggle dropdown-toggle">
              <input type="checkbox" v-model="expandTools" />
              <span>Expand tools</span>
            </label>
          </div>
        </div>

        <div v-if="capabilities?.chat" ref="actionsMenuWrapEl" class="header-menu">
          <button class="secondary" type="button" :disabled="!sessionId" @click="toggleActionsMenu">More</button>

          <div v-if="actionsMenuOpen" class="dropdown-menu actions-menu" @mousedown.prevent>
            <button class="secondary" :disabled="!sessionId || sessionActionWorking" @click="emitAction('fork-session')">Fork</button>

            <button
              v-if="sessionShared"
              class="secondary"
              :disabled="!sessionId || sessionActionWorking"
              @click="emitAction('unshare-session')"
            >
              Unshare
            </button>
            <button
              v-else
              class="secondary"
              :disabled="!sessionId || sessionActionWorking"
              @click="emitAction('share-session')"
            >
              Share
            </button>

            <button class="secondary" :disabled="!sessionId || sessionActionWorking" @click="emitAction('summarize-session')">
              Summarize
            </button>
            <button class="secondary" :disabled="!sessionId || sessionActionWorking" @click="emitAction('revert-session')">Revert</button>
            <button class="secondary" :disabled="!sessionId || sessionActionWorking" @click="emitAction('unrevert-session')">
              Unrevert
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="sessionShareUrl" class="muted" style="margin: 0 0 6px 0">Share URL: {{ sessionShareUrl }}</div>
    <div v-if="sessionActionStatus" class="muted" style="margin: 0 0 6px 0">{{ sessionActionStatus }}</div>

    <div ref="messagesEl" class="messages" @scroll="onMessagesScroll">
      <div v-if="messagesHasOlder && messages.length" class="load-older">
        <button class="secondary" :disabled="messagesLoadingOlder" @click="$emit('load-older-messages')">
          {{ messagesLoadingOlder ? 'Loading...' : 'Load older' }}
        </button>
      </div>

      <div v-if="showJumpToLatest" class="jump-to-latest">
        <button class="secondary" @click="jumpToLatest">Jump to latest</button>
      </div>

      <div v-for="msg in visibleMessages" :key="msg.info.id" :class="['message', msg.info.role]">
        <div class="message-meta">
          <span class="muted">{{ msg.info.role }}</span>
          <span class="muted">{{ msg.info.id }}</span>
          <span class="message-meta-spacer" aria-hidden="true"></span>
          <span v-if="messageCreatedLabel(msg)" class="muted msg-time">{{ messageCreatedLabel(msg) }}</span>
          <span v-if="messageAssistantDurationLabel(msg)" class="muted msg-duration">{{ messageAssistantDurationLabel(msg) }}</span>
        </div>

        <div
          v-for="(part, partIndex) in msg.parts"
          :key="part.id || part.messageID || part.callID || `${msg.info.id}:${part.type}:${partIndex}`"
          class="message-part"
        >
          <div v-if="part.type === 'text'">
            <div v-if="msg.info.role === 'assistant'" class="markdown" v-html="markdown(part.text || '')"></div>
            <div v-else>{{ part.text }}</div>
          </div>
          <div v-else-if="part.type === 'reasoning'" class="reasoning-part markdown" v-html="markdown(part.text || '')"></div>
          <div v-else-if="part.type === 'file'" class="file-part">
            <div class="file-meta">
              <strong>{{ part.filename || 'file' }}</strong>
              <span v-if="part.mime" class="muted">{{ part.mime }}</span>
            </div>
            <img
              v-if="typeof part.url === 'string' && (part.mime || '').startsWith('image/')"
              class="file-preview"
              :src="part.url"
              :alt="part.filename || 'image'"
            />
            <div v-else-if="typeof part.url === 'string'" class="muted" style="word-break: break-word">{{ part.url }}</div>
          </div>
          <div v-else-if="part.type === 'tool'">
            <div class="tool-header">
              <strong>{{ part.tool || 'tool' }}</strong>
              <span class="tool-status" :class="part.state?.status || 'pending'">{{ part.state?.status || 'pending' }}</span>
            </div>

            <div v-if="summarizeTool(part.tool || 'tool', part.state?.input)" class="tool-summary">
              {{ summarizeTool(part.tool || 'tool', part.state?.input) }}
            </div>

            <details class="tool-details" :open="expandTools">
              <summary>Details</summary>

              <div v-if="extractReadFile(part.state?.output || '', part.state?.input)?.filePath" class="tool-subtitle">
                {{ extractReadFile(part.state?.output || '', part.state?.input)?.filePath }}
              </div>
              <pre
                v-if="extractReadFile(part.state?.output || '', part.state?.input)?.content"
                class="tool-block"
              ><code class="hljs" v-html="highlight(extractReadFile(part.state?.output || '', part.state?.input)?.content || '', extractReadFile(part.state?.output || '', part.state?.input)?.lang)"></code></pre>

              <div v-if="normalizeToolInput(part.state?.input)" class="tool-subtitle">Input</div>
              <pre v-if="normalizeToolInput(part.state?.input)" class="tool-block"><code class="hljs" v-html="highlight(normalizeToolInput(part.state?.input), 'json')"></code></pre>

              <div v-if="extractDiffLines(part.state?.output || '').length" class="tool-subtitle">Diff</div>
              <pre v-if="extractDiffLines(part.state?.output || '').length" class="tool-block diff-block">
                <template v-for="line in extractDiffLines(part.state?.output || '')" :key="line.key">
                  <div :class="line.kind">{{ line.text }}</div>
                </template>
              </pre>

              <div v-if="(part.state?.output || '') && !extractDiffLines(part.state?.output || '').length" class="tool-subtitle">
                Output
              </div>
              <pre
                v-if="(part.state?.output || '') && !extractDiffLines(part.state?.output || '').length"
                class="tool-block"
              ><code class="hljs" v-html="highlight(part.state?.output || '')"></code></pre>
            </details>
          </div>
          <div v-else class="muted">
            Unsupported part: {{ part.type }}
          </div>
        </div>
      </div>
    </div>
    <div class="composer-divider" @mousedown.prevent="startComposerResize"></div>

    <div
      class="composer"
      @dragenter="onComposerDragEnter"
      @dragleave="onComposerDragLeave"
      @dragover.prevent="onComposerDragOver"
      @drop.prevent="onComposerDrop"
    >
      <PermissionDock
        v-if="pendingPermission"
        :permission="pendingPermission"
        @deny="$emit('deny-permission', pendingPermission)"
        @allow-once="$emit('grant-permission', pendingPermission, 'once')"
        @allow-always="$emit('grant-permission', pendingPermission, 'always')"
      />

      <QuestionDock
        v-if="pendingQuestions.length"
        :questions="pendingQuestions"
        :drafts="questionAnswerDrafts"
        @update-answer="(id, answer) => $emit('update:questionAnswer', id, answer)"
        @reply="(q) => $emit('reply-question', q)"
        @reject="(q) => $emit('reject-question', q)"
        @submit-all="submitAllQuestions"
      />

      <div v-if="attachments.length" class="attachment-strip">
        <div v-for="att in attachments" :key="att.id" class="attachment-chip">
          <img v-if="att.previewUrl" class="attachment-thumb" :src="att.previewUrl" :alt="att.name" />
          <div v-else class="attachment-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          <div class="attachment-name" :title="att.name">{{ att.name }}</div>
          <button class="attachment-remove" type="button" title="Remove" @click="removeAttachment(att.id)">x</button>
        </div>
      </div>

      <div ref="composerInputEl" class="composer-input" :style="composerInputStyle">
        <textarea
          ref="composerEl"
          v-model="prompt"
          :placeholder="composerMode === 'shell' ? 'Type a shell command...' : 'Type a message...'"
          :disabled="!sessionId || composerBlocked"
          @keydown="onComposerKeyDown"
          @input="onComposerInput"
          @paste="onComposerPaste"
        ></textarea>
      </div>

      <div class="composer-toolbar">
        <div class="composer-toolbar-left">
          <button
            class="secondary attach-button"
            type="button"
            :disabled="!sessionId || composerBlocked"
            title="Attach files"
            @click="toggleAttachPopover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>

          <select v-if="capabilities?.agents" v-model="selectedAgent" :disabled="!agentOptions.length || composerBlocked">
            <option value="">(agent)</option>
            <option v-for="a in agentOptions" :key="a.name" :value="a.name">{{ a.name }}</option>
          </select>

          <button
            v-if="capabilities?.models"
            class="secondary model-button"
            type="button"
            :disabled="!modelOptions.length || composerBlocked"
            :title="selectedModelKey || '(model)'"
            @click="toggleModelPopover"
          >
            Model: {{ selectedModelButtonLabel }}
          </button>
        </div>

        <div class="composer-toolbar-right">
          <div class="muted composer-status">
            <span v-if="!sessionId">No session</span>
            <template v-else>
              <span v-if="sessionWorking">Running...</span>
              <span v-else>Idle</span>
            </template>
            <span v-if="composerMode === 'shell'"> &middot; ! shell</span>
            <span v-if="sessionError"> &middot; {{ sessionError }}</span>
          </div>

          <button v-if="sessionWorking" class="secondary abort-button" type="button" @click="$emit('abort')">Abort</button>
          <button
            class="send-button"
            type="button"
            :disabled="!sessionId || composerBlocked || (!prompt && !attachments.length)"
            @click="handleSendPrompt"
          >
            Send
          </button>
        </div>
      </div>

      <div v-if="modelPopoverOpen" class="composer-popover" @mousedown.prevent>
        <ModelSelectorPopover
          :options="modelOptions"
          :selected-key="selectedModelKey"
          @select="onSelectModelKey"
          @close="modelPopoverOpen = false"
        />
      </div>

      <div v-if="attachPopoverOpen" class="composer-popover" @mousedown.prevent>
        <FileAttachPopover
          :connection-id="connectionId"
          :api-fetch-for-connection="apiFetchForConnection"
          @attach-path="attachWorkspacePath"
          @close="attachPopoverOpen = false"
        />
      </div>

      <div v-if="composerDragOver" class="drop-overlay">Drop to attach</div>

      <div v-if="composerPopover" class="composer-popover" @mousedown.prevent>
        <template v-if="composerPopover === 'at'">
          <div class="muted">@ Agents</div>
          <div class="composer-popover-list">
            <button
              v-for="(opt, idx) in composerOptions"
              :key="opt.key"
              class="secondary"
              :class="{ 'popover-active': idx === composerActiveIndex }"
              @click="selectComposerOption(idx)"
            >
              <div style="display: flex; justify-content: space-between; gap: 8px">
                <span>{{ opt.title }}</span>
                <span v-if="opt.hint" class="muted">{{ opt.hint }}</span>
              </div>
              <div v-if="opt.description" class="muted" style="margin-top: 4px">{{ opt.description }}</div>
            </button>
          </div>
        </template>

        <SlashCommandPopover
          v-else
          :options="composerOptions"
          :active-index="composerActiveIndex"
          @select="selectComposerOption"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import FileAttachPopover from '../FileAttachPopover.vue';
import ModelSelectorPopover from '../ModelSelectorPopover.vue';
import PermissionDock from '../PermissionDock.vue';
import QuestionDock from '../QuestionDock.vue';
import SlashCommandPopover from '../SlashCommandPopover.vue';
import { formatDurationMs } from '@frontend/core';
import { highlightCode, markdownToHtml, preloadMarkdownLibs } from '../../lib/markdown';
import { computeAssistantTurnDurationMs, formatHHMM, readMessageCompletedAtMs, readMessageCreatedAtMs } from '@frontend/core';
import { filterSlashCommands, parseSlashQuery, slashCommandReplacement } from '../../lib/slash-command-popover';
import { basenameFromPath, fileUrlForPath } from '@frontend/core';

type ToolState = {
  status?: string;
  input?: unknown;
  output?: string;
};

type MessagePart = {
  id?: string;
  type: string;
  text?: string;
  mime?: string;
  url?: string;
  filename?: string;
  tool?: string;
  callID?: string;
  messageID?: string;
  sessionID?: string;
  state?: ToolState;
};

type MessageInfo = {
  id: string;
  role: string;
  sessionID?: string;
  [key: string]: unknown;
};

type MessageWithParts = {
  info: MessageInfo;
  parts: MessagePart[];
};

const actionsMenuOpen = ref(false);
const actionsMenuWrapEl = ref<HTMLElement | null>(null);
const viewMenuOpen = ref(false);
const viewMenuWrapEl = ref<HTMLElement | null>(null);

function toggleActionsMenu() {
  actionsMenuOpen.value = !actionsMenuOpen.value;
  if (actionsMenuOpen.value) viewMenuOpen.value = false;
}

function toggleViewMenu() {
  viewMenuOpen.value = !viewMenuOpen.value;
  if (viewMenuOpen.value) actionsMenuOpen.value = false;
}

function closeHeaderMenus() {
  actionsMenuOpen.value = false;
  viewMenuOpen.value = false;
}

function handleDocumentMouseDown(ev: MouseEvent) {
  const target = ev.target;
  if (!(target instanceof Node)) {
    closeHeaderMenus();
    return;
  }

  const actionsWrap = actionsMenuWrapEl.value;
  if (actionsWrap && actionsWrap.contains(target)) return;

  const viewWrap = viewMenuWrapEl.value;
  if (viewWrap && viewWrap.contains(target)) return;

  closeHeaderMenus();
}

function handleDocumentKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') closeHeaderMenus();
}

function emitAction(evt: string) {
  closeHeaderMenus();
  emit(evt as never);
}

type AgentOption = {
  name: string;
  description?: string;
  hidden?: boolean;
  mode?: string;
};

type CommandOption = {
  name: string;
  description?: string;
};

type ModelOption = {
  providerID: string;
  providerName?: string;
  modelID: string;
  modelName?: string;
  label: string;
};

type ComposerOption = {
  key: string;
  title: string;
  description?: string;
  hint?: string;
  kind: 'agent' | 'command';
  value: string;
};

type Capabilities = {
  chat?: boolean;
  agents?: boolean;
  models?: boolean;
  commands?: boolean;
  [key: string]: unknown;
};

type PermissionRequest = Record<string, unknown>;
type QuestionRequest = Record<string, unknown>;

export interface Props {
  connectionId: string;
  apiFetchForConnection?: (cid: string, url: string, opts?: RequestInit) => Promise<Response>;
  sessionId: string;
  sessionTitle: string;
  messages: MessageWithParts[];
  capabilities: Capabilities | null;
  sessionWorking: boolean;
  sessionError: string | null;
  permissions: PermissionRequest[];
  permissionsLoading: boolean;
  permissionsError: string | null;
  questions: QuestionRequest[];
  questionsLoading: boolean;
  questionsError: string | null;
  questionAnswerDrafts: Record<string, string>;
  agentOptions: AgentOption[];
  modelOptions: ModelOption[];
  commandOptions: CommandOption[];
  sessionShared: boolean;
  sessionShareUrl: string;
  sessionActionWorking: boolean;
  sessionActionStatus: string | null;
  messagesHasOlder: boolean;
  messagesLoadingOlder: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  connectionId: '',
  apiFetchForConnection: undefined,
  sessionId: '',
  sessionTitle: '',
  messages: () => [],
  capabilities: null,
  sessionWorking: false,
  sessionError: null,
  permissions: () => [],
  permissionsLoading: false,
  permissionsError: null,
  questions: () => [],
  questionsLoading: false,
  questionsError: null,
  questionAnswerDrafts: () => ({}),
  agentOptions: () => [],
  modelOptions: () => [],
  commandOptions: () => [],
  sessionShared: false,
  sessionShareUrl: '',
  sessionActionWorking: false,
  sessionActionStatus: null,
  messagesHasOlder: true,
  messagesLoadingOlder: false,
});

type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mime: string; url: string; filename?: string };

const emit = defineEmits<{
  'send-prompt': [payload: { prompt: string; parts?: PromptPart[]; agent?: string; model?: { providerID: string; modelID: string }; mode?: 'shell' | 'command'; command?: string; commandArgs?: string }];
  'abort': [];
  'fork-session': [];
  'share-session': [];
  'unshare-session': [];
  'summarize-session': [];
  'revert-session': [];
  'unrevert-session': [];
  'grant-permission': [permission: PermissionRequest, mode: 'once' | 'always'];
  'deny-permission': [permission: PermissionRequest];
  'update:questionAnswer': [questionId: string, answer: string];
  'reply-question': [question: QuestionRequest];
  'reject-question': [question: QuestionRequest];
  'load-older-messages': [];
}>();

const prompt = ref('');
const showTools = ref(true);
const showReasoning = ref(true);
const expandTools = ref(false);
const toolFilters = reactive<Record<string, boolean>>({});

function permissionSessionId(p: PermissionRequest): string {
  const sid = (p as Record<string, unknown>).sessionID;
  return typeof sid === 'string' ? sid : '';
}

function questionSessionId(q: QuestionRequest): string {
  const sid = (q as Record<string, unknown>).sessionID;
  return typeof sid === 'string' ? sid : '';
}

const pendingPermission = computed<PermissionRequest | null>(() => {
  const sid = props.sessionId;
  if (!sid) return null;
  for (const p of props.permissions ?? []) {
    if (!p) continue;
    if (permissionSessionId(p) === sid) return p;
  }
  return null;
});

const pendingQuestions = computed<QuestionRequest[]>(() => {
  const sid = props.sessionId;
  if (!sid) return [];
  return (props.questions ?? []).filter((q) => q && questionSessionId(q) === sid);
});

function submitAllQuestions() {
  for (const q of pendingQuestions.value) {
    emit('reply-question', q);
  }
}

const composerBlocked = computed(() => pendingPermission.value !== null || pendingQuestions.value.length > 0);

watch(composerBlocked, (blocked) => {
  if (!blocked) return;
  attachPopoverOpen.value = false;
  modelPopoverOpen.value = false;
  closeComposerPopover();
  composerDragDepth.value = 0;
  composerDragOver.value = false;
});

type Attachment = {
  id: string;
  name: string;
  kind: 'workspace' | 'blob';
  mime: string;
  path?: string;
  blob?: Blob;
  previewUrl?: string;
};

const attachments = ref<Attachment[]>([]);
const attachPopoverOpen = ref(false);

const composerDragDepth = ref(0);
const composerDragOver = ref(false);

function nextAttachmentId() {
  return `att_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toggleAttachPopover() {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  attachPopoverOpen.value = !attachPopoverOpen.value;
  if (attachPopoverOpen.value) {
    modelPopoverOpen.value = false;
    closeComposerPopover();
  }
}

function attachWorkspacePath(path: string) {
  const p = path.trim();
  if (!p) return;
  const exists = attachments.value.some((a) => a.kind === 'workspace' && a.path === p);
  if (exists) return;
  attachments.value = [
    ...attachments.value,
    {
      id: nextAttachmentId(),
      name: basenameFromPath(p),
      kind: 'workspace',
      mime: 'text/plain',
      path: p,
    },
  ];
}

function addBlobAttachment(blob: Blob, name: string, mime: string, previewUrl?: string) {
  attachments.value = [
    ...attachments.value,
    {
      id: nextAttachmentId(),
      name,
      kind: 'blob',
      mime: mime || 'application/octet-stream',
      blob,
      previewUrl,
    },
  ];
}

function removeAttachment(id: string) {
  const next: Attachment[] = [];
  for (const att of attachments.value) {
    if (att.id === id) {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      continue;
    }
    next.push(att);
  }
  attachments.value = next;
}

function clearAttachments() {
  for (const att of attachments.value) {
    if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
  }
  attachments.value = [];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
}

async function buildPartsForSend(text: string): Promise<PromptPart[]> {
  const parts: PromptPart[] = [];
  if (text.trim()) parts.push({ type: 'text', text });

  for (const att of attachments.value) {
    if (att.kind === 'workspace' && att.path) {
      parts.push({
        type: 'file',
        mime: att.mime || 'text/plain',
        url: fileUrlForPath(att.path),
        filename: att.name,
      });
      continue;
    }

    if (att.kind === 'blob' && att.blob) {
      const url = await blobToDataUrl(att.blob);
      if (!url) continue;
      parts.push({
        type: 'file',
        mime: att.mime || 'application/octet-stream',
        url,
        filename: att.name,
      });
    }
  }

  return parts;
}

const messagesEl = ref<HTMLDivElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const isAtBottom = ref(true);
const showJumpToLatest = ref(false);
const composerInputEl = ref<HTMLDivElement | null>(null);
const composerInputHeight = ref<number | null>(null);

const composerEl = ref<HTMLTextAreaElement | null>(null);
const composerPopover = ref<'at' | 'slash' | null>(null);
const composerQuery = ref('');
const composerActiveIndex = ref(0);
const composerMode = ref<'normal' | 'shell'>('normal');

const selectedAgent = ref('');
const selectedModelKey = ref('');

const modelPopoverOpen = ref(false);
const selectedModelButtonLabel = computed(() => {
  const key = selectedModelKey.value;
  const parsed = parseSelectedModel(key);
  return parsed?.modelID || key || '(model)';
});

function toggleModelPopover() {
  if (!props.capabilities?.models) return;
  if (composerBlocked.value) return;
  modelPopoverOpen.value = !modelPopoverOpen.value;
  if (modelPopoverOpen.value) {
    attachPopoverOpen.value = false;
    closeComposerPopover();
  }
}

function onSelectModelKey(key: string) {
  selectedModelKey.value = key;
  modelPopoverOpen.value = false;
}

let stopComposerResizeHandler: (() => void) | null = null;

const DEFAULT_COMPOSER_INPUT_HEIGHT_PX = 96;
const MIN_COMPOSER_INPUT_HEIGHT_PX = 44;

const composerInputStyle = computed<Record<string, string>>(() => {
  const height = composerInputHeight.value ?? DEFAULT_COMPOSER_INPUT_HEIGHT_PX;
  return { height: `${height}px` };
});

const availableToolNames = computed(() => {
  const names = new Set<string>();
  for (const msg of props.messages) {
    for (const part of msg.parts) {
      if (part.type === 'tool') {
        const toolName = typeof part.tool === 'string' ? part.tool : '';
        if (toolName) names.add(toolName);
      }
    }
  }
  return Array.from(names).sort();
});

watch(
  availableToolNames,
  (names) => {
    for (const name of names) {
      if (toolFilters[name] === undefined) {
        toolFilters[name] = true;
      }
    }
  },
  { immediate: true },
);

const visibleMessages = computed(() => {
  return props.messages
    .map((msg) => {
      const parts = msg.parts.filter((part) => {
        if (part.type === 'file') return true;
        if (part.type === 'tool') {
          if (!showTools.value) return false;
          const toolName = typeof part.tool === 'string' ? part.tool : '';
          if (toolName && toolFilters[toolName] === false) return false;
          return true;
        }
        if (part.type === 'reasoning') {
          return showReasoning.value;
        }
        if (part.type === 'text') return true;
        return false;
      });
      return { ...msg, parts };
    })
    .filter((msg) => msg.parts.length > 0);
});

const messageIndexById = computed(() => {
  const map = new Map<string, number>();
  for (let i = 0; i < props.messages.length; i++) {
    const msg = props.messages[i];
    map.set(msg.info.id, i);
  }
  return map;
});

const nowMs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const shouldTickDurations = computed(() => {
  if (!props.sessionWorking) return false;
  return props.messages.some((msg) => msg.info.role === 'assistant' && readMessageCompletedAtMs(msg.info) == null);
});

watch(
  shouldTickDurations,
  (shouldTick) => {
    if (shouldTick) {
      nowMs.value = Date.now();
      if (nowTimer == null) {
        nowTimer = setInterval(() => {
          nowMs.value = Date.now();
        }, 15_000);
      }
      return;
    }

    if (nowTimer != null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
    nowMs.value = Date.now();
  },
  { immediate: true },
);

function messageCreatedLabel(msg: MessageWithParts): string | null {
  const ms = readMessageCreatedAtMs(msg.info);
  if (ms == null) return null;
  return formatHHMM(ms);
}

function messageAssistantDurationLabel(msg: MessageWithParts): string | null {
  if (msg.info.role !== 'assistant') return null;

  const index = messageIndexById.value.get(msg.info.id);
  if (index == null) return null;

  const ms = computeAssistantTurnDurationMs(props.messages, index, nowMs.value);
  if (ms == null) return null;

  const text = formatDurationMs(ms);
  const completedAt = readMessageCompletedAtMs(msg.info);
  const inFlight = props.sessionWorking && completedAt == null;
  return inFlight ? `${text}...` : text;
}

const composerOptions = computed<ComposerOption[]>(() => {
  const q = composerQuery.value.toLowerCase();
  if (composerPopover.value === 'at') {
    return props.agentOptions
      .filter((a) => !a.hidden && a.mode !== 'primary')
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map((a) => ({
        key: `agent:${a.name}`,
        title: a.name,
        description: a.description,
        kind: 'agent' as const,
        value: a.name,
      }));
  }
  if (composerPopover.value === 'slash') {
    return filterSlashCommands(props.commandOptions, q, 10).map((c) => ({
      key: `cmd:${c.name}`,
      title: `/${c.name}`,
      description: c.description,
      kind: 'command' as const,
      value: c.name,
    }));
  }
  return [];
});

watch(
  composerOptions,
  (opts) => {
    const nextLen = opts.length;
    if (nextLen <= 0) {
      composerActiveIndex.value = 0;
      return;
    }
    if (composerActiveIndex.value >= nextLen) {
      composerActiveIndex.value = nextLen - 1;
    }
    if (composerActiveIndex.value < 0) {
      composerActiveIndex.value = 0;
    }
  },
  { immediate: true },
);

const mdReady = ref(0);

function markdown(text: string) {
  // mdReady dependency forces recompute after libs load
  void mdReady.value;
  return markdownToHtml(text);
}

function highlight(text: string, lang?: string) {
  void mdReady.value;
  return highlightCode(text, lang);
}

function normalizeToolInput(input: MessagePart['state'] extends { input?: infer T } ? T : unknown) {
  if (!input) return '';
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function summarizeTool(toolName: string, input: MessagePart['state'] extends { input?: infer T } ? T : unknown) {
  if (!input || typeof input !== 'object') return '';
  const data = input as Record<string, unknown>;

  if (toolName === 'read' && typeof data.filePath === 'string') {
    return `Read: ${data.filePath}`;
  }
  if (toolName === 'write' && typeof data.filePath === 'string') {
    return `Write: ${data.filePath}`;
  }
  if (toolName === 'edit' && typeof data.filePath === 'string') {
    return `Edit: ${data.filePath}`;
  }
  if (toolName === 'bash' && typeof data.command === 'string') {
    return `Command: ${data.command}`;
  }
  if (toolName === 'webfetch' && typeof data.url === 'string') {
    return `Fetch: ${data.url}`;
  }
  if (toolName === 'grep' && typeof data.pattern === 'string') {
    return `Grep: ${data.pattern}`;
  }
  if (toolName === 'glob' && typeof data.pattern === 'string') {
    return `Glob: ${data.pattern}`;
  }
  return '';
}

function guessLangFromPath(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'xml';
  return undefined;
}

function extractReadFile(output: string, input: MessagePart['state'] extends { input?: infer T } ? T : unknown) {
  const filePath =
    typeof input === 'object' &&
    input &&
    'filePath' in input &&
    typeof (input as Record<string, unknown>).filePath === 'string'
      ? (input as Record<string, unknown>).filePath
      : '';
  const match = output.match(/<file>\n([\s\S]*?)\n<\/file>/);
  if (!match) return null;
  const rawLines = match[1].split('\n');
  const stripped = rawLines
    .map((line) => line.replace(/^\s*\d+\|\s?/, ''))
    .join('\n')
    .trim();
  return {
    filePath,
    content: stripped,
    lang: guessLangFromPath(filePath as string),
  };
}

function extractDiffLines(text: string) {
  if (!text) return [] as { key: string; kind: string; text: string }[];
  const lines = text.split('\n');
  const hasDiff = lines.some((line) => line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---'));
  if (!hasDiff) return [];

  return lines.map((line, index) => {
    let kind = 'diff-context';
    if (line.startsWith('+') && !line.startsWith('+++')) {
      kind = 'diff-add';
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      kind = 'diff-remove';
    } else if (line.startsWith('@@')) {
      kind = 'diff-hunk';
    }
    return { key: `${index}-${line.slice(0, 16)}`, kind, text: line };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startComposerResize(event: MouseEvent) {
  const panel = panelEl.value;
  const messages = messagesEl.value;
  const composerInput = composerInputEl.value;
  if (!panel || !messages || !composerInput) return;

  const messagesRect = messages.getBoundingClientRect();
  const inputRect = composerInput.getBoundingClientRect();
  const startY = event.clientY;
  const startHeight = composerInputHeight.value ?? inputRect.height;

  const minMessagesHeight = 120;
  const maxComposerInputHeight = Math.max(
    MIN_COMPOSER_INPUT_HEIGHT_PX,
    startHeight + messagesRect.height - minMessagesHeight,
  );

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = moveEvent.clientY - startY;
    const nextHeight = clamp(startHeight - delta, MIN_COMPOSER_INPUT_HEIGHT_PX, maxComposerInputHeight);
    composerInputHeight.value = nextHeight;
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    stopComposerResizeHandler = null;
  };

  stopComposerResizeHandler = onMouseUp;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onMessagesScroll() {
  const el = messagesEl.value;
  if (!el) return;
  const threshold = 80;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  isAtBottom.value = atBottom;
  showJumpToLatest.value = !atBottom;
}

function scrollMessagesToBottom() {
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function jumpToLatest() {
  isAtBottom.value = true;
  showJumpToLatest.value = false;
  await nextTick();
  scrollMessagesToBottom();
}

function closeComposerPopover() {
  composerPopover.value = null;
  composerQuery.value = '';
  composerActiveIndex.value = 0;
}

async function focusComposerAt(position: number) {
  await nextTick();
  const el = composerEl.value;
  if (!el) return;
  el.focus();
  try {
    el.setSelectionRange(position, position);
  } catch {
    // ignore
  }
}

function parseSelectedModel(key: string): { providerID: string; modelID: string } | null {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx === -1) return null;
  const providerID = key.slice(0, idx).trim();
  const modelID = key.slice(idx + 1).trim();
  if (!providerID || !modelID) return null;
  return { providerID, modelID };
}

function onComposerInput() {
  attachPopoverOpen.value = false;
  modelPopoverOpen.value = false;
  if (composerMode.value === 'shell') {
    closeComposerPopover();
    return;
  }

  const el = composerEl.value;
  const cursor = el?.selectionStart ?? prompt.value.length;
  const before = prompt.value.slice(0, cursor);

  const atMatch = before.match(/@(\S*)$/);
  if (atMatch) {
    composerPopover.value = 'at';
    composerQuery.value = atMatch[1] ?? '';
    composerActiveIndex.value = 0;
    return;
  }

  const slashQuery = parseSlashQuery(prompt.value);
  if (slashQuery !== null) {
    composerPopover.value = 'slash';
    composerQuery.value = slashQuery;
    composerActiveIndex.value = 0;
    return;
  }

  closeComposerPopover();
}

function selectComposerOption(idx: number) {
  const opt = composerOptions.value[idx];
  if (!opt) return;
  const el = composerEl.value;
  if (!el) return;
  const cursor = el.selectionStart ?? prompt.value.length;

  if (opt.kind === 'agent') {
    const before = prompt.value.slice(0, cursor);
    const match = before.match(/@(\S*)$/);
    const matchStart = match && typeof match.index === 'number' ? match.index : cursor;
    const replacement = `@${opt.value} `;
    prompt.value = prompt.value.slice(0, matchStart) + replacement + prompt.value.slice(cursor);
    closeComposerPopover();
    void focusComposerAt(matchStart + replacement.length);
    return;
  }

  if (opt.kind === 'command') {
    const replacement = slashCommandReplacement(opt.value);
    if (parseSlashQuery(prompt.value) !== null) {
      prompt.value = replacement;
      closeComposerPopover();
      void focusComposerAt(prompt.value.length);
      return;
    }

    prompt.value = prompt.value.slice(0, cursor) + replacement + prompt.value.slice(cursor);
    closeComposerPopover();
    void focusComposerAt(cursor + replacement.length);
  }
}

function onComposerKeyDown(event: KeyboardEvent) {
  if (!composerEl.value) return;

  if (composerMode.value === 'normal') {
    if (event.key === '!' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const el = composerEl.value;
      const atStart = (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0;
      if (atStart && prompt.value.trim() === '' && props.capabilities?.commands) {
        composerMode.value = 'shell';
        closeComposerPopover();
        event.preventDefault();
        return;
      }
    }
  } else {
    if (event.key === 'Escape') {
      composerMode.value = 'normal';
      closeComposerPopover();
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' && prompt.value === '') {
      composerMode.value = 'normal';
      closeComposerPopover();
      event.preventDefault();
      return;
    }
  }

  if (composerPopover.value) {
    const opts = composerOptions.value;
    if (event.key === 'Escape') {
      closeComposerPopover();
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      if (opts.length > 0) {
        composerActiveIndex.value = (composerActiveIndex.value + 1) % opts.length;
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      if (opts.length > 0) {
        composerActiveIndex.value = (composerActiveIndex.value - 1 + opts.length) % opts.length;
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (opts.length > 0) {
        selectComposerOption(composerActiveIndex.value);
      }
      event.preventDefault();
      return;
    }
  }
}

function onComposerPaste(ev: ClipboardEvent) {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  const dt = ev.clipboardData;
  if (!dt) return;

  for (const item of Array.from(dt.items)) {
    if (!item.type || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const previewUrl = URL.createObjectURL(file);
    addBlobAttachment(file, file.name || 'pasted-image', file.type, previewUrl);
    ev.preventDefault();
    return;
  }
}

function onComposerDragEnter(ev: DragEvent) {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  if (!ev.dataTransfer) return;
  composerDragDepth.value += 1;
  composerDragOver.value = true;
}

function onComposerDragLeave() {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  composerDragDepth.value = Math.max(0, composerDragDepth.value - 1);
  if (composerDragDepth.value === 0) composerDragOver.value = false;
}

function onComposerDragOver(ev: DragEvent) {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  if (!ev.dataTransfer) return;
  ev.dataTransfer.dropEffect = 'copy';
}

function onComposerDrop(ev: DragEvent) {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  composerDragDepth.value = 0;
  composerDragOver.value = false;
  const files = ev.dataTransfer?.files;
  if (!files || files.length === 0) return;

  for (const file of Array.from(files)) {
    const previewUrl = file.type && file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    addBlobAttachment(file, file.name || 'file', file.type || 'application/octet-stream', previewUrl);
  }
}

async function handleSendPrompt() {
  if (!props.sessionId) return;
  if (composerBlocked.value) return;
  if (!prompt.value && attachments.value.length === 0) return;

  const text = prompt.value;
  const trimmed = text.trim();
  if (!trimmed && attachments.value.length === 0) return;

  const model = parseSelectedModel(selectedModelKey.value);
  const agent = selectedAgent.value || undefined;

  if (props.capabilities?.commands && (composerMode.value === 'shell' || trimmed.startsWith('!'))) {
    if (!trimmed) return;
    const rawCommand = composerMode.value === 'shell' ? trimmed : trimmed.slice(1).trimStart();
    if (!rawCommand) return;

    emit('send-prompt', {
      prompt: rawCommand,
      agent,
      model: model ?? undefined,
      mode: 'shell',
    });

    prompt.value = '';
    composerMode.value = 'normal';
    attachPopoverOpen.value = false;
    modelPopoverOpen.value = false;
    clearAttachments();
    closeComposerPopover();
    return;
  }

  if (trimmed.startsWith('/') && props.capabilities?.commands) {
    const [cmdToken, ...args] = trimmed.split(/\s+/);
    const command = cmdToken.slice(1);
    const known = !!command && props.commandOptions.some((c) => c.name === command);
    if (known) {
      emit('send-prompt', {
        prompt: trimmed,
        agent,
        model: model ?? undefined,
        mode: 'command',
        command,
        commandArgs: args.join(' '),
      });

      prompt.value = '';
      attachPopoverOpen.value = false;
      modelPopoverOpen.value = false;
      clearAttachments();
      closeComposerPopover();
      return;
    }
  }

  const parts = await buildPartsForSend(text);
  emit('send-prompt', {
    prompt: text,
    parts: parts.length ? parts : undefined,
    agent,
    model: model ?? undefined,
  });

  prompt.value = '';
  attachPopoverOpen.value = false;
  modelPopoverOpen.value = false;
  clearAttachments();
  closeComposerPopover();
}

watch(
  () => props.messages,
  async () => {
    if (isAtBottom.value) {
      await nextTick();
      scrollMessagesToBottom();
    }
  },
  { deep: true },
);

defineExpose({
  scrollMessagesToBottom,
  jumpToLatest,
});

onBeforeUnmount(() => {
  if (nowTimer != null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  stopComposerResizeHandler?.();
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
  clearAttachments();
});

onMounted(async () => {
  document.addEventListener('mousedown', handleDocumentMouseDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
  await preloadMarkdownLibs();
  mdReady.value++;
});
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 10px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
  flex: 1;
  height: 100%;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.session-title {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-header-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-menu {
  position: relative;
  display: inline-flex;
}

.icon-button {
  padding: 6px;
  line-height: 0;
}

.icon-button svg {
  display: block;
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 50;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.actions-menu button {
  justify-content: flex-start;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}

.toggle input {
  margin: 0;
}

.tool-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.messages {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
  min-height: 0;
  border-bottom: 1px solid var(--border);
}

.composer-divider {
  height: 6px;
  margin: -4px 0;
  cursor: row-resize;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
}

.composer-divider:hover {
  border-top-color: var(--accent);
  border-bottom-color: var(--accent);
}

.load-older {
  text-align: center;
  padding: 8px;
}

.jump-to-latest {
  position: sticky;
  top: 0;
  z-index: 10;
  text-align: center;
  padding: 4px;
  background: var(--panel);
}

.message {
  padding: 10px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
}

.message.user {
  background: var(--panel);
  border-color: var(--accent);
}

.message.assistant {
  background: var(--panel-2);
}

.message-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  margin-bottom: 6px;
}

.message-meta-spacer {
  flex: 1;
}

.msg-time {
  white-space: nowrap;
}

.msg-duration {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.message-part {
  margin-top: 8px;
}

.message-part:first-child {
  margin-top: 0;
}

.markdown {
  font-size: 13px;
  line-height: 1.5;
}

.markdown :deep(pre) {
  background: var(--bg);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}

.markdown :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
}

.markdown :deep(p) {
  margin: 0.5em 0;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.reasoning-part {
  font-size: 12px;
  color: var(--muted);
  padding: 8px;
  background: var(--bg);
  border-radius: 6px;
  border-left: 3px solid var(--accent);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.tool-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg);
}

.tool-status.completed {
  background: #1a472a;
  color: #4ade80;
}

.tool-status.running {
  background: #422006;
  color: #fbbf24;
}

.tool-status.error {
  background: #450a0a;
  color: #f87171;
}

.tool-summary {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.tool-details {
  margin-top: 8px;
  font-size: 12px;
}

.tool-details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
}

.tool-subtitle {
  font-size: 11px;
  color: var(--muted);
  margin-top: 8px;
  margin-bottom: 4px;
}

.tool-block {
  background: var(--bg);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-block {
  white-space: pre;
}

.diff-add {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.diff-remove {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.diff-hunk {
  color: var(--accent);
}

.diff-context {
  color: var(--muted);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  position: relative;
  flex-shrink: 0;
  min-height: 0;
  max-height: none;
  overflow: visible;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer-toolbar-left,
.composer-toolbar-right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.composer-toolbar select {
  font-size: 11px;
  padding: 4px 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
}

button.secondary.model-button {
  font-size: 11px;
  padding: 4px 8px;
}

.model-picker {
  display: flex;
  gap: 4px;
  align-items: center;
}

.model-search {
  font-size: 11px;
  padding: 4px 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  width: 120px;
}

.attach-button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.send-button {
  padding: 6px 14px;
  font-size: 12px;
}

.composer-status {
  font-size: 11px;
  white-space: nowrap;
}

.abort-button {
  font-size: 12px;
  padding: 6px 12px;
}

.attach-button svg {
  display: block;
}

.attachment-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0;
}

.attachment-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 40px;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-2);
}

.attachment-thumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
}

.attachment-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--bg);
  color: var(--muted);
}

.attachment-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

button.attachment-remove {
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 0;
  width: 16px;
  height: 16px;
  font-size: 10px;
  line-height: 16px;
  font-weight: 700;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--accent);
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.06);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  z-index: 120;
  pointer-events: none;
}

.composer-input {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  flex-shrink: 0;
}

.composer-input textarea {
  width: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  max-height: none;
  resize: none;
  font-size: 13px;
  padding: 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  box-sizing: border-box;
}

.composer-input textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.file-part {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.file-preview {
  max-width: 220px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.composer-popover {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  max-height: 300px;
  overflow: auto;
  z-index: 100;
}

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

button {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
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
  background: var(--panel);
}
</style>

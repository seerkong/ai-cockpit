<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, watch, reactive, computed, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import 'dockview-vue/dist/styles/dockview.css';
import { DockviewVue } from 'dockview-vue';
import { useWorkspaceConfigsStore } from '../stores/workspace-configs';
import { useWorkspaceSelectionStore } from '../stores/workspace-selection';
import { useWorkspacesStore } from '../stores/workspaces';
import { useNotifications } from '../composables/useNotifications';
import { useDockviewLayout } from '../composables/useDockviewLayout';
import { useComposerMetadata } from '../composables/useComposerMetadata';
import { useConnections } from '../composables/useConnections';
import { useSessions } from '../composables/useSessions';
import { sessionTitleFor } from '../lib/session-title';
import { newConnectionRequested } from '../lib/toolbar-actions';
import { computeContextUsage, computeSessionSummary } from '../lib/session-metrics';
import { normalizePermissionList, permissionId, permissionSessionId, type PermissionRequest } from '../lib/permissions';
import { normalizeQuestionList, questionId, type QuestionRequest } from '../lib/questions';
import SessionStatusBar from '../components/SessionStatusBar.vue';

const route = useRoute();
const router = useRouter();
const configsStore = useWorkspaceConfigsStore();
const selectionStore = useWorkspaceSelectionStore();
const workspacesStore = useWorkspacesStore();
configsStore.hydrate();
workspacesStore.hydrate();

// Dockview layout
const { dockApi, onReady, bottomPanelOpen, toggleBottomPanel } = useDockviewLayout();

// Core state
const workspaceId = computed(() => selectionStore.selectedWorkspaceId);
const connId = computed(() => String(route.query.connId || ''));
const token = ref<string | null>(null);

// Session id (writable computed bound to store)
const sessionId = computed({
  get: () => selectionStore.selectedSessionId,
  set: (value: string) => selectionStore.setSessionId(value),
});

// Notifications
const { notifications, pushNotification } = useNotifications();

// Late-bound proxies (resolved after useConnections / useSessions)
let _apiFetch: (cid: string, url: string, opts?: RequestInit) => Promise<Response>;
const apiFetchProxy = (cid: string, url: string, opts?: RequestInit) => _apiFetch(cid, url, opts);
let _stopMessagePolling: () => void = () => {};
let _loadSessionForConnection: (cid: string) => Promise<void>;
const sessionsProxy = ref<{ id: string; boundConnectionId?: string }[]>([]);
const sessionManagerConnectionIdProxy = ref('');

// Composer metadata (called first; capabilities ref is the single source of truth)
const {
  capabilities,
  agentOptions,
  commandOptions,
  modelOptions,
  defaultCapabilities,
  refreshComposerMetadata,
} = useComposerMetadata({ apiFetchForConnection: apiFetchProxy });

// Connections composable
const {
  connectionPool, activeConnectionId, connectionTokens, connected,
  connectionContextMenu, newConnectionModal, canManageSessions,
  syncConnectionContext, resolveExecutionConnectionId, apiFetchForConnection,
  fetchConnectionsForAnchor, refreshConnections, connectionSessionStatusLabel,
  handleNewConnection, cancelCreateConnection, handleCreateConnection,
  handleSelectConnection, loadWorkspaceData,
} = useConnections({
  route: route as unknown as { query: Record<string, unknown> },
  router, workspacesStore, configsStore, selectionStore, pushNotification,
  loadSessionForConnection: (cid: string) => _loadSessionForConnection(cid),
  stopMessagePolling: () => _stopMessagePolling(),
  defaultCapabilities, capabilities,
  token, sessionId, sessions: sessionsProxy,
  sessionManagerConnectionId: sessionManagerConnectionIdProxy,
  workspaceId, connId,
});

// Resolve the late-bound apiFetch proxy
_apiFetch = apiFetchForConnection;

// Sessions composable
const {
  sessions, sessionWorking, sessionError, sessionShared, sessionShareUrl,
  sessionActionWorking, sessionActionStatus, sessionManager,
  messages, messagesHasOlder, messagesLoadingOlder,
  stopMessagePolling, loadSessionForConnection, loadSessionsForConnection,
  handleSessionSelection, handleCreateSession,
  handleForkSession, handleShareSession, handleUnshareSession,
  handleSummarizeSession, handleRevertSession, handleUnrevertSession,
  loadOlderMessages, handleSendPrompt, handleAbort,
} = useSessions({
  activeConnectionId, connected, sessionId,
  apiFetchForConnection, resolveExecutionConnectionId, syncConnectionContext,
  pushNotification, refreshComposerMetadata, workspacesStore,
  router: router as unknown as { replace: (to: { name: string; query: Record<string, unknown> }) => void },
  route: route as unknown as { query: Record<string, unknown> },
});

const sessionTitle = computed(() => sessionTitleFor(sessions.value, sessionId.value));

// Resolve late-bound session proxies
_stopMessagePolling = stopMessagePolling;
_loadSessionForConnection = loadSessionForConnection;
// Keep proxies in sync with sessions from useSessions
watch(sessions, (v) => { sessionsProxy.value = v; }, { immediate: true });
watch(() => sessionManager.connectionId, (v) => { sessionManagerConnectionIdProxy.value = v; }, { immediate: true });

// Diffs state
type FileDiff = { file: string; before?: string; after?: string; additions?: number; deletions?: number };
const diffs = ref<FileDiff[]>([]);
const diffsLoading = ref(false);
const diffsError = ref<string | null>(null);
const selectedDiffIndex = ref(0);
const diffViewMode = ref<'unified' | 'split'>('unified');
const diffExpanded = ref(true);

// Permissions state
const permissions = ref<PermissionRequest[]>([]);
const permissionsLoading = ref(false);
const permissionsError = ref<string | null>(null);
const autoAcceptPermissions = ref(false);

// Questions state
const questions = ref<QuestionRequest[]>([]);
const questionsLoading = ref(false);
const questionsError = ref<string | null>(null);
const questionAnswerDrafts = reactive<Record<string, string>>({});

// Todos state
type TodoItem = { id?: string; status?: string; content?: string; text?: string };
const todos = ref<TodoItem[]>([]);
const todosLoading = ref(false);
const todosError = ref<string | null>(null);

// Codument state
type CodumentTrack = {
  trackId: string;
  trackName: string;
  status: string;
  statusSymbol: '[x]' | '[~]' | '[ ]';
};
type CodumentTrackTree = {
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
const codumentTracks = ref<CodumentTrack[]>([]);
const codumentTracksLoading = ref(false);
const codumentTracksError = ref<string | null>(null);
const selectedCodumentTrackId = ref('');
const boundCodumentTrackId = ref('');
const codumentTrackTree = ref<CodumentTrackTree | null>(null);
const codumentTrackTreeLoading = ref(false);
const codumentTrackTreeError = ref<string | null>(null);

// Files state
type FileNode = { path: string; name: string; type: 'file' | 'dir' };
type SearchResult = { path: string; line_number: number; lines?: string[] };
const fileTree = ref<FileNode[]>([]);
const fileContent = ref('');
const searchPattern = ref('');
const searchResults = ref<SearchResult[]>([]);

// Context state
const totalCost = ref(0);
const lastAgent = ref('');
const lastModelLabel = ref('');

const contextUsage = computed(() => computeContextUsage(messages.value, modelOptions.value));
const contextLabel = computed(() => (contextUsage.value.percent === null ? '—' : `${contextUsage.value.percent}%`));
const contextTitle = computed(() => {
  const u = contextUsage.value;
  const parts: string[] = [];
  if (u.modelLabel) parts.push(`Model: ${u.modelLabel}`);
  if (u.inputTokens !== null) parts.push(`Input tokens: ${u.inputTokens}`);
  if (u.outputTokens !== null) parts.push(`Output tokens: ${u.outputTokens}`);
  if (u.contextLimit !== null) parts.push(`Context limit: ${u.contextLimit}`);
  if (u.cost !== null) parts.push(`Cost: ${u.cost}`);
  return parts.join('\n');
});

watch(messages, (next) => {
  const summary = computeSessionSummary(next);
  totalCost.value = summary.totalCost;
  lastAgent.value = summary.lastAgent;
  lastModelLabel.value = summary.lastModelLabel;
}, { immediate: true });

// Workspace config entries
interface WorkspaceConfigEntry { id: string; path: string }
const workspaceConfigEntries = computed<WorkspaceConfigEntry[]>(() =>
  configsStore.list.map((cfg) => ({ id: cfg.id, path: cfg.path })),
);

// Provide state to child panel components
provide('connections', connectionPool);
provide('activeConnectionId', activeConnectionId);
provide('apiFetchForConnection', apiFetchForConnection);
provide('sessionStatusLabel', connectionSessionStatusLabel);
provide('sessionId', sessionId);
provide('messages', messages);
provide('capabilities', capabilities);
provide('sessionWorking', sessionWorking);
provide('sessionError', sessionError);
provide('agentOptions', agentOptions);
provide('modelOptions', modelOptions);
provide('commandOptions', commandOptions);
provide('sessionShared', sessionShared);
provide('sessionShareUrl', sessionShareUrl);
provide('sessionActionWorking', sessionActionWorking);
provide('sessionActionStatus', sessionActionStatus);
provide('messagesHasOlder', messagesHasOlder);
provide('messagesLoadingOlder', messagesLoadingOlder);
provide('diffs', diffs);
provide('diffsLoading', diffsLoading);
provide('diffsError', diffsError);
provide('selectedDiffIndex', selectedDiffIndex);
provide('diffViewMode', diffViewMode);
provide('diffExpanded', diffExpanded);
provide('totalCost', totalCost);
provide('lastAgent', lastAgent);
provide('lastModelLabel', lastModelLabel);
provide('permissions', permissions);
provide('permissionsLoading', permissionsLoading);
provide('permissionsError', permissionsError);
provide('autoAcceptPermissions', autoAcceptPermissions);
provide('questions', questions);
provide('questionsLoading', questionsLoading);
provide('questionsError', questionsError);
provide('questionAnswerDrafts', questionAnswerDrafts);
provide('todos', todos);
provide('todosLoading', todosLoading);
provide('todosError', todosError);
provide('fileTree', fileTree);
provide('fileContent', fileContent);
provide('searchPattern', searchPattern);
provide('searchResults', searchResults);

provide('sessionTitle', sessionTitle);

// Bottom panel controls
provide('bottomPanelOpen', bottomPanelOpen);
provide('onToggleBottomPanel', toggleBottomPanel);



watch(connId, async (value) => {
  if (value) {
    if (activeConnectionId.value === value) return;
    activeConnectionId.value = value;
    syncConnectionContext(value);
    await refreshConnections(value);
    await loadSessionForConnection(value);
    return;
  }
  stopMessagePolling();
  activeConnectionId.value = '';
  sessionId.value = '';
  messages.value = [];
  connected.value = false;
});

function handleConnectionContextMenu(event: MouseEvent, connectionId: string) {
  connectionContextMenu.open = true; connectionContextMenu.x = event.clientX; connectionContextMenu.y = event.clientY; connectionContextMenu.connectionId = connectionId;
}
function handleOpenSessionManager() {
  if (!canManageSessions.value) return;
  const tid = connectionContextMenu.connectionId || activeConnectionId.value;
  if (!tid) return;
  sessionManager.open = true; sessionManager.connectionId = tid;
  void loadSessionsForConnection(tid); connectionContextMenu.open = false;
}
function closeContextMenus() { connectionContextMenu.open = false; }

async function handleLoadOlderMessages() { await loadOlderMessages(); }

function handleRefreshDiffs() { console.log('Refresh diffs'); }
function handleSelectDiff(index: number) { selectedDiffIndex.value = index; }
function handleToggleDiffExpanded() { diffExpanded.value = !diffExpanded.value; }
function handleOpenDiffFile(file: string) { console.log('Open diff file:', file); }

async function handleRefreshPermissions() {
  const cid = activeConnectionId.value;
  if (!cid) return;
  permissionsLoading.value = true;
  permissionsError.value = null;
  try {
    const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/permissions`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to load permissions (${resp.status})`);
    }
    const payload = await resp.json().catch(() => []);
    permissions.value = normalizePermissionList(payload);
  } catch (err) {
    permissionsError.value = err instanceof Error ? err.message : 'Failed to load permissions.';
    permissions.value = [];
  } finally {
    permissionsLoading.value = false;
  }
}

async function respondPermission(permission: PermissionRequest, response: 'once' | 'always' | 'reject') {
  const cid = activeConnectionId.value;
  if (!cid) return;
  const sessionID = permissionSessionId(permission);
  const permissionID = permissionId(permission);
  if (!sessionID || !permissionID) return;

  const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/permissions/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionID, permissionID, response }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Failed to respond permission (${resp.status})`);
  }
}

async function handleGrantPermission(permission: PermissionRequest, mode: 'once' | 'always') {
  try {
    await respondPermission(permission, mode);
    await handleRefreshPermissions();
  } catch (err) {
    permissionsError.value = err instanceof Error ? err.message : 'Failed to grant permission.';
  }
}

async function handleDenyPermission(permission: PermissionRequest) {
  try {
    await respondPermission(permission, 'reject');
    await handleRefreshPermissions();
  } catch (err) {
    permissionsError.value = err instanceof Error ? err.message : 'Failed to deny permission.';
  }
}

let permissionsPollTimer: ReturnType<typeof setInterval> | null = null;

function stopPermissionsPolling() {
  if (!permissionsPollTimer) return;
  clearInterval(permissionsPollTimer);
  permissionsPollTimer = null;
}

function startPermissionsPolling() {
  stopPermissionsPolling();
  const cid = activeConnectionId.value;
  if (!cid) return;
  if (!capabilities.value?.permissions) return;
  permissionsPollTimer = setInterval(() => {
    void handleRefreshPermissions();
  }, 2000);
}

watch([activeConnectionId, () => capabilities.value?.permissions], () => {
  if (!activeConnectionId.value || !capabilities.value?.permissions) {
    stopPermissionsPolling();
    return;
  }
  void handleRefreshPermissions();
  startPermissionsPolling();
}, { immediate: true });

async function handleRefreshQuestions() {
  const cid = activeConnectionId.value;
  if (!cid) return;
  questionsLoading.value = true;
  questionsError.value = null;
  try {
    const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/questions`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to load questions (${resp.status})`);
    }
    const payload = await resp.json().catch(() => []);
    questions.value = normalizeQuestionList(payload);
  } catch (err) {
    questionsError.value = err instanceof Error ? err.message : 'Failed to load questions.';
    questions.value = [];
  } finally {
    questionsLoading.value = false;
  }
}

async function handleReplyQuestion(question: QuestionRequest) {
  const cid = activeConnectionId.value;
  if (!cid) return;
  const requestID = questionId(question);
  if (!requestID) return;
  const draft = questionAnswerDrafts[requestID] || '';
  const answers = draft
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/questions/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestID, answers }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to reply question (${resp.status})`);
    }
    await handleRefreshQuestions();
  } catch (err) {
    questionsError.value = err instanceof Error ? err.message : 'Failed to reply question.';
  }
}

async function handleRejectQuestion(question: QuestionRequest) {
  const cid = activeConnectionId.value;
  if (!cid) return;
  const requestID = questionId(question);
  if (!requestID) return;

  try {
    const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/questions/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestID }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to reject question (${resp.status})`);
    }
    await handleRefreshQuestions();
  } catch (err) {
    questionsError.value = err instanceof Error ? err.message : 'Failed to reject question.';
  }
}

let questionsPollTimer: ReturnType<typeof setInterval> | null = null;

function stopQuestionsPolling() {
  if (!questionsPollTimer) return;
  clearInterval(questionsPollTimer);
  questionsPollTimer = null;
}

function startQuestionsPolling() {
  stopQuestionsPolling();
  const cid = activeConnectionId.value;
  if (!cid) return;
  if (!capabilities.value?.questions) return;
  questionsPollTimer = setInterval(() => {
    void handleRefreshQuestions();
  }, 2000);
}

watch([activeConnectionId, () => capabilities.value?.questions], () => {
  if (!activeConnectionId.value || !capabilities.value?.questions) {
    stopQuestionsPolling();
    return;
  }
  void handleRefreshQuestions();
  startQuestionsPolling();
}, { immediate: true });

function handleUpdateQuestionAnswer(questionId: string, answer: string) { questionAnswerDrafts[questionId] = answer; }
function handleRefreshTodos() { console.log('Refresh todos'); }

// --- Codument handlers ---

async function handleRefreshCodumentTracks() {
  const cid = activeConnectionId.value;
  if (!cid) return;
  codumentTracksLoading.value = true;
  codumentTracksError.value = null;
  try {
    const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/codument/tracks`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to load codument tracks (${resp.status})`);
    }
    const payload = await resp.json().catch(() => ({ tracks: [] }));
    const tracksRaw = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.tracks) ? payload.tracks : []);
    const tracks = tracksRaw.filter((item): item is CodumentTrack => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Partial<CodumentTrack>;
      return typeof row.trackId === 'string';
    });
    codumentTracks.value = tracks;

    // Default selection logic (priority order)
    const current = selectedCodumentTrackId.value;
    const bound = boundCodumentTrackId.value;
    const stored = workspacesStore.codumentTrackFor(cid);
    const defaultId = typeof payload?.defaultTrackId === 'string' ? payload.defaultTrackId : '';
    const hasTrack = (trackId: string) => tracks.some((item) => item.trackId === trackId);

    if (current && hasTrack(current)) {
      selectedCodumentTrackId.value = current;
    } else if (bound && hasTrack(bound)) {
      selectedCodumentTrackId.value = bound;
    } else if (stored && hasTrack(stored)) {
      selectedCodumentTrackId.value = stored;
    } else if (defaultId && hasTrack(defaultId)) {
      selectedCodumentTrackId.value = defaultId;
    } else {
      selectedCodumentTrackId.value = '';
    }
  } catch (err) {
    codumentTracksError.value = err instanceof Error ? err.message : 'Failed to load codument tracks.';
    codumentTracks.value = [];
  } finally {
    codumentTracksLoading.value = false;
  }
}

async function handleRefreshCodumentTrackTree(trackId?: string) {
  const tid = trackId ?? selectedCodumentTrackId.value;
  if (!tid) { codumentTrackTree.value = null; return; }
  const cid = activeConnectionId.value;
  if (!cid) return;
  codumentTrackTreeLoading.value = true;
  codumentTrackTreeError.value = null;
  try {
    const resp = await apiFetchForConnection(
      cid,
      `/api/v1/workspaces/${cid}/codument/tracks/${encodeURIComponent(tid)}/tree`,
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to load codument track tree (${resp.status})`);
    }
    const payload = await resp.json().catch(() => null);
    const tree = payload && typeof payload === 'object' && 'tree' in payload
      ? (payload as { tree: unknown }).tree
      : payload;
    codumentTrackTree.value = tree && typeof tree === 'object'
      ? (tree as CodumentTrackTree)
      : null;
  } catch (err) {
    codumentTrackTreeError.value = err instanceof Error ? err.message : 'Failed to load codument track tree.';
    codumentTrackTree.value = null;
  } finally {
    codumentTrackTreeLoading.value = false;
  }
}

function handleUpdateCodumentTrackId(trackId: string) {
  selectedCodumentTrackId.value = trackId;
  void handleRefreshCodumentTrackTree(trackId);
}

function handleBindCodumentTrack() {
  const cid = activeConnectionId.value;
  const tid = selectedCodumentTrackId.value;
  if (!cid || !tid) return;
  boundCodumentTrackId.value = tid;
  workspacesStore.setLastCodumentTrack(cid, tid);
}

// Codument auto-refresh (15s interval)
const codumentAutoRefreshEnabled = ref(true);
let codumentPollTimer: ReturnType<typeof setInterval> | null = null;

function stopCodumentPolling() {
  if (!codumentPollTimer) return;
  clearInterval(codumentPollTimer);
  codumentPollTimer = null;
}

function startCodumentPolling() {
  stopCodumentPolling();
  if (!codumentAutoRefreshEnabled.value) return;
  const cid = activeConnectionId.value;
  if (!cid) return;
  codumentPollTimer = setInterval(() => {
    void handleRefreshCodumentTracks();
    if (selectedCodumentTrackId.value) {
      void handleRefreshCodumentTrackTree();
    }
  }, 15_000);
}

function handleUpdateCodumentAutoRefreshEnabled(value: boolean) {
  codumentAutoRefreshEnabled.value = value;
  if (!value) {
    stopCodumentPolling();
  } else if (activeConnectionId.value) {
    startCodumentPolling();
  }
}

watch(activeConnectionId, async (cid) => {
  stopCodumentPolling();
  if (!cid) {
    codumentTracks.value = [];
    selectedCodumentTrackId.value = '';
    boundCodumentTrackId.value = '';
    codumentTrackTree.value = null;
    return;
  }
  // Restore bound track from store
  boundCodumentTrackId.value = workspacesStore.codumentTrackFor(cid);
  await handleRefreshCodumentTracks();
  if (selectedCodumentTrackId.value) {
    await handleRefreshCodumentTrackTree();
  }
  startCodumentPolling();
});
function handleLoadFile(path: string) { console.log('Load file:', path); }
function handleLoadDirectory(path: string) { console.log('Load directory:', path); }
function handleRunSearch() { console.log('Run search:', searchPattern.value); }

provide('onSelectConnection', handleSelectConnection);
provide('onContextMenu', handleConnectionContextMenu);
provide('onSendPrompt', handleSendPrompt);
provide('onAbort', handleAbort);
provide('onForkSession', handleForkSession);
provide('onShareSession', handleShareSession);
provide('onUnshareSession', handleUnshareSession);
provide('onSummarizeSession', handleSummarizeSession);
provide('onRevertSession', handleRevertSession);
provide('onUnrevertSession', handleUnrevertSession);
provide('onLoadOlderMessages', handleLoadOlderMessages);
provide('onRefreshDiffs', handleRefreshDiffs);
provide('onUpdateDiffViewMode', (mode: 'unified' | 'split') => { diffViewMode.value = mode; });
provide('onToggleDiffExpanded', handleToggleDiffExpanded);
provide('onSelectDiff', handleSelectDiff);
provide('onOpenDiffFile', handleOpenDiffFile);
provide('onRefreshPermissions', handleRefreshPermissions);
provide('onUpdateAutoAcceptPermissions', (value: boolean) => { autoAcceptPermissions.value = value; });
provide('onGrantPermission', handleGrantPermission);
provide('onDenyPermission', handleDenyPermission);
provide('onRefreshQuestions', handleRefreshQuestions);
provide('onUpdateQuestionAnswer', handleUpdateQuestionAnswer);
provide('onReplyQuestion', handleReplyQuestion);
provide('onRejectQuestion', handleRejectQuestion);
provide('onRefreshTodos', handleRefreshTodos);
provide('onLoadFile', handleLoadFile);
provide('onLoadDirectory', handleLoadDirectory);
provide('onUpdateSearchPattern', (pattern: string) => { searchPattern.value = pattern; });
provide('onRunSearch', handleRunSearch);

// Codument provides
provide('codumentTracks', codumentTracks);
provide('codumentTracksLoading', codumentTracksLoading);
provide('codumentTracksError', codumentTracksError);
provide('selectedCodumentTrackId', selectedCodumentTrackId);
provide('boundCodumentTrackId', boundCodumentTrackId);
provide('codumentTrackTree', codumentTrackTree);
provide('codumentTrackTreeLoading', codumentTrackTreeLoading);
provide('codumentTrackTreeError', codumentTrackTreeError);
provide('onRefreshCodumentTracks', handleRefreshCodumentTracks);
provide('onUpdateCodumentTrackId', handleUpdateCodumentTrackId);
provide('onBindCodumentTrack', handleBindCodumentTrack);
provide('codumentAutoRefreshEnabled', codumentAutoRefreshEnabled);
provide('onUpdateCodumentAutoRefreshEnabled', handleUpdateCodumentAutoRefreshEnabled);

// Toolbar actions (AppToolbar lives outside this provide scope)
watch(newConnectionRequested, () => {
  handleNewConnection();
});

onBeforeUnmount(() => { stopMessagePolling(); stopPermissionsPolling(); stopQuestionsPolling(); stopCodumentPolling(); dockApi.value?.dispose(); });

onMounted(async () => {
  token.value = localStorage.getItem('auth-token');
  await loadWorkspaceData();
  if (connId.value) { activeConnectionId.value = connId.value; syncConnectionContext(connId.value); await refreshConnections(connId.value); await loadSessionForConnection(connId.value); }
  else if (activeConnectionId.value) { syncConnectionContext(activeConnectionId.value); await loadSessionForConnection(activeConnectionId.value); }
});

watch(workspaceId, async (newId, oldId) => {
  if (newId !== oldId) { stopMessagePolling(); sessionId.value = ''; activeConnectionId.value = ''; messages.value = []; if (route.query.connId) { const q = { ...route.query }; delete q.connId; router.replace({ name: 'work', query: q }); } }
  if (newId) { await loadWorkspaceData(); if (activeConnectionId.value) await loadSessionForConnection(activeConnectionId.value); }
});
</script>

<script lang="ts">
import { dockviewPanelComponents } from './session-dockview-panels';

export default {
  components: dockviewPanelComponents,
};
</script>

<template>
  <div class="session-dockview" @click="closeContextMenus">
    <div class="dockview-container">
      <DockviewVue class="dockview-theme-abyss" style="width: 100%; height: 100%" @ready="onReady" />
    </div>

    <SessionStatusBar
      :connection-id="activeConnectionId"
      :session-id="sessionId"
      :context-label="contextLabel"
      :context-title="contextTitle"
    />

    <div v-if="notifications.length" class="notifications floating">
      <div v-for="n in notifications" :key="n.id" :class="['notification', n.kind]">
        <span class="muted">{{ n.message }}</span>
      </div>
    </div>
    <!-- Connection Context Menu -->
    <div v-if="connectionContextMenu.open" class="context-menu" :style="{ left: `${connectionContextMenu.x}px`, top: `${connectionContextMenu.y}px` }" @click.stop>
      <button class="secondary" :disabled="!canManageSessions" @click="handleOpenSessionManager">Manage sessions</button>
      <button class="secondary" @click="connectionContextMenu.open = false">Disconnect</button>
    </div>
    <!-- New Connection Modal -->
    <div v-if="newConnectionModal.open" class="palette-overlay" @mousedown.self="newConnectionModal.open = false">
      <div class="palette">
        <div class="palette-header">
          <strong>New Connection</strong>
          <button class="secondary" @click="newConnectionModal.open = false">Close</button>
        </div>
        <label class="muted" for="new-connection-workspace">Workspace</label>
        <select id="new-connection-workspace" v-model="newConnectionModal.workspaceId">
          <option v-for="cfg in workspaceConfigEntries" :key="cfg.id" :value="cfg.id">{{ cfg.path }}</option>
        </select>
        <label class="muted" for="new-connection-mode">Mode</label>
        <select id="new-connection-mode" v-model="newConnectionModal.mode">
          <option value="spawn">spawn</option>
          <option value="port">port</option>
        </select>
        <template v-if="newConnectionModal.mode === 'port'">
          <label class="muted" for="new-connection-port">Server port</label>
          <input id="new-connection-port" v-model="newConnectionModal.serverPort" placeholder="4096" />
        </template>
        <div v-if="newConnectionModal.error" class="muted">{{ newConnectionModal.error }}</div>
        <div class="connection-actions">
          <button class="secondary" :disabled="newConnectionModal.submitting" @click="handleCreateConnection">{{ newConnectionModal.submitting ? 'Creating...' : 'Create' }}</button>
          <button class="secondary" :disabled="!newConnectionModal.submitting" @click="cancelCreateConnection">Cancel</button>
        </div>
      </div>
    </div>
    <!-- Session Manager Modal -->
    <div v-if="sessionManager.open" class="palette-overlay" @mousedown.self="sessionManager.open = false">
      <div class="palette">
        <div class="palette-header">
          <strong>Manage Sessions</strong>
          <div style="display: flex; gap: 8px">
            <button class="secondary" :disabled="sessionManager.loading" @click="handleCreateSession">New Session</button>
            <button class="secondary" @click="sessionManager.open = false">Close</button>
          </div>
        </div>
        <div class="sessions">
          <div v-if="sessionManager.loading" class="muted">Loading sessions…</div>
          <div v-else-if="sessionManager.error" class="muted">{{ sessionManager.error }}</div>
          <div v-for="s in sessions" :key="s.id" :class="['session-item', s.id === sessionId ? 'active' : '']" @click.stop="handleSessionSelection(s.id)">
            <div>{{ s.title || 'Untitled' }}</div>
            <div class="muted">{{ s.id }}</div>
          </div>
          <div v-if="!sessionManager.loading && !sessionManager.error && !sessions.length" class="muted">No sessions</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-dockview { display: flex; flex-direction: column; height: 100%; width: 100%; background: var(--bg); color: var(--text); overflow: hidden; }
.notifications { display: flex; flex-direction: column; gap: 8px; }
.notifications.floating { position: fixed; top: 12px; right: 12px; z-index: 1002; max-width: 380px; }
.notification { padding: 4px 8px; border-radius: 4px; font-size: 12px; background: var(--panel-2); }
.notification.error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.notification.success { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.workspace { margin-left: auto; }
.dockview-container { flex: 1; overflow: hidden; }
.dockview-container :deep(.dockview-theme-abyss) { width: 100%; height: 100%; }
.dockview-container :deep(.dv-content-container), .dockview-container :deep(.dv-content-container > div), .dockview-container :deep(.dv-groupview) { height: 100%; min-height: 0; }
.dockview-container :deep(.dv-default-tab-action) { display: none !important; pointer-events: none !important; }
.muted { color: var(--muted); font-size: 12px; }
button { padding: 8px 12px; border-radius: 6px; border: 1px solid transparent; background: var(--accent); color: #0b1120; font-weight: 600; cursor: pointer; font-size: 13px; }
button.secondary { background: transparent; border-color: var(--border); color: var(--text); }
button:hover:not(:disabled) { opacity: 0.9; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.context-menu { position: fixed; z-index: 1000; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; gap: 2px; min-width: 150px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); }
.context-menu button { width: 100%; text-align: left; padding: 8px 12px; border-radius: 4px; }
.palette-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-start; justify-content: center; padding-top: 100px; z-index: 1000; }
.palette { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; min-width: 400px; max-width: 600px; max-height: 70vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.palette-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.connection-actions { display: flex; gap: 8px; margin-top: 8px; }
.sessions { display: flex; flex-direction: column; gap: 8px; }
.session-item { padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; }
.session-item:hover { background: var(--panel); }
.session-item.active { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3); }
select, input { padding: 8px 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; }
select:focus, input:focus { outline: none; border-color: var(--accent); }
</style>

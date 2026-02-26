import { ref, reactive, type Ref, type WritableComputedRef } from 'vue';
import { useChat, type UseChatDeps } from './useChat';

export type SessionInfo = { id: string; title?: string; boundConnectionId?: string };

export type ToolState = { status?: string; input?: unknown; output?: string };
export type MessagePart = { id?: string; type: string; text?: string; mime?: string; url?: string; filename?: string; tool?: string; callID?: string; messageID?: string; sessionID?: string; state?: ToolState };
export type MessageInfo = { id: string; role: string; sessionID?: string; [key: string]: unknown };
export type MessageWithParts = { info: MessageInfo; parts: MessagePart[] };

export interface SessionManagerState {
  open: boolean;
  connectionId: string;
  loading: boolean;
  error: string;
}

export interface UseSessionsDeps {
  activeConnectionId: Ref<string>;
  connected: Ref<boolean>;
  sessionId: WritableComputedRef<string> | Ref<string>;
  apiFetchForConnection: (cid: string, url: string, opts?: RequestInit) => Promise<Response>;
  resolveExecutionConnectionId: () => string;
  syncConnectionContext: (cid: string) => void;
  pushNotification: (kind: 'info' | 'error' | 'success', message: string) => void;
  refreshComposerMetadata: (cid: string) => Promise<void>;
  workspacesStore: {
    lastSessionFor: (id: string) => string;
    setLastSession: (id: string, sessionId: string) => void;
  };
  router: { replace: (to: { name: string; query: Record<string, unknown> }) => void };
  route: { query: Record<string, unknown> };
  messagePageLimit?: number;
  messagePollIntervalMs?: number;
}

// --- Pure helpers (exported for testing) ---

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeSessionsPayload(payload: unknown): SessionInfo[] {
  const root = asObject(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(root?.sessions) ? root.sessions : [];
  return list
    .map((item) => {
      const row = asObject(item);
      if (!row) return null;
      const id = asString(row.id);
      if (!id) return null;
      return { id, title: asString(row.title) || undefined, boundConnectionId: asString(row.boundConnectionId) || undefined } as SessionInfo;
    })
    .filter((item): item is SessionInfo => item !== null);
}

export function normalizeMessagesPayload(payload: unknown): MessageWithParts[] {
  const root = asObject(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(root?.messages) ? root.messages : [];
  return list
    .map((item) => {
      const row = asObject(item);
      if (!row) return null;
      const info = asObject(row.info);
      const parts = Array.isArray(row.parts) ? row.parts : [];
      const id = asString(info?.id);
      const role = asString(info?.role);
      if (!id || !role) return null;
      return { info: { ...(info ?? {}), id, role } as MessageInfo, parts: parts as MessagePart[] } as MessageWithParts;
    })
    .filter((item): item is MessageWithParts => item !== null);
}

export function extractSessionId(payload: unknown): string {
  const row = asObject(payload);
  if (!row) return '';
  return asString(row.id);
}

export function useSessions(deps: UseSessionsDeps) {
  const {
    activeConnectionId,
    connected,
    sessionId,
    apiFetchForConnection,
    resolveExecutionConnectionId,
    syncConnectionContext,
    pushNotification,
    refreshComposerMetadata,
    workspacesStore,
    router,
    route,
  } = deps;

  const sessions = ref<SessionInfo[]>([]);
  const sessionWorking = ref(false);
  const sessionError = ref<string | null>(null);
  const sessionShared = ref(false);
  const sessionShareUrl = ref('');
  const sessionActionWorking = ref(false);
  const sessionActionStatus = ref<string | null>(null);

  const sessionManager: SessionManagerState = reactive({ open: false, connectionId: '', loading: false, error: '' });

  // --- Delegate chat to useChat composable ---
  const chatDeps: UseChatDeps = {
    activeConnectionId,
    sessionId,
    apiFetchForConnection,
    resolveExecutionConnectionId,
    pushNotification,
    sessionError,
    sessionWorking,
    messagePageLimit: deps.messagePageLimit,
    messagePollIntervalMs: deps.messagePollIntervalMs,
  };
  const chat = useChat(chatDeps);

  // --- Core session operations ---

  async function bindSessionToConnection(connectionId: string, sid: string) {
    const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/sessions/${encodeURIComponent(sid)}/bind`, { method: 'POST', body: JSON.stringify({ connectionId }) });
    if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to bind session (${resp.status})`); }
  }

  async function selectSessionForConnection(connectionId: string, sid: string, closeManager = true) {
    if (!connectionId || !sid) return;
    await bindSessionToConnection(connectionId, sid);
    sessionId.value = sid;
    workspacesStore.setLastSession(connectionId, sid);
    await chat.refreshMessages(connectionId, sid);
    chat.startMessagePolling();
    if (closeManager) sessionManager.open = false;
  }

  async function loadSessionsForConnection(connectionId: string) {
    sessionManager.loading = true; sessionManager.error = ''; sessions.value = [];
    try {
      const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/sessions`);
      if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to list sessions (${resp.status})`); }
      const payload = await resp.json().catch(() => []);
      sessions.value = normalizeSessionsPayload(payload);
      connected.value = true;
    } catch (err) { sessionManager.error = err instanceof Error ? err.message : 'Failed to load sessions.'; connected.value = false; }
    finally { sessionManager.loading = false; }
  }

  async function createSessionForConnection(connectionId: string): Promise<string> {
    const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to create session (${resp.status})`);
    }
    const payload = await resp.json().catch(() => null);
    return extractSessionId(payload);
  }

  async function loadSessionForConnection(connectionId: string) {
    if (!connectionId) return;
    activeConnectionId.value = connectionId;
    syncConnectionContext(connectionId);
    await refreshComposerMetadata(connectionId);
    await loadSessionsForConnection(connectionId);
    if (!sessions.value.length) {
      try {
        const created = await createSessionForConnection(connectionId);
        await loadSessionsForConnection(connectionId);
        const pickCreated = created || sessions.value[0]?.id || '';
        if (pickCreated) {
          await selectSessionForConnection(connectionId, pickCreated, false);
          connected.value = true;
          return;
        }
      } catch (err) {
        sessionError.value = err instanceof Error ? err.message : 'Failed to create session.';
      }

      sessionId.value = '';
      chat.messages.value = [];
      chat.stopMessagePolling();
      return;
    }
    const remembered = workspacesStore.lastSessionFor(connectionId);
    const candidateIds = [sessionId.value, remembered].filter(Boolean);
    const candidate = candidateIds.find((id) => sessions.value.some((s) => s.id === id));
    const fallbackBound = sessions.value.find((s) => s.boundConnectionId === connectionId)?.id;
    const pick = candidate || fallbackBound || sessions.value[0]?.id || '';
    if (!pick) return;
    try { await selectSessionForConnection(connectionId, pick, false); connected.value = true; }
    catch (err) { sessionError.value = err instanceof Error ? err.message : 'Failed to load session.'; chat.stopMessagePolling(); }
  }

  // --- Session action runner ---

  async function runSessionAction(action: 'fork' | 'share' | 'unshare' | 'summarize' | 'revert' | 'unrevert') {
    const cid = resolveExecutionConnectionId(); const sid = sessionId.value;
    if (!cid || !sid) return null;
    sessionActionWorking.value = true; sessionActionStatus.value = null;
    try {
      const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/${action}`, { method: 'POST' });
      if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to ${action} session (${resp.status})`); }
      const p = await resp.json().catch(() => null);
      sessionActionStatus.value = `${action} complete`;
      return p;
    } catch (err) {
      const m = err instanceof Error ? err.message : `Failed to ${action} session.`;
      sessionActionStatus.value = m; pushNotification('error', m); return null;
    } finally { sessionActionWorking.value = false; }
  }

  // --- Handler functions ---

  async function handleSessionSelection(sid: string) {
    const cid = sessionManager.connectionId || activeConnectionId.value;
    if (!cid || !sid) return;
    activeConnectionId.value = cid; syncConnectionContext(cid);
    router.replace({ name: 'work', query: { ...route.query, connId: cid } });
    sessionManager.error = '';
    try { await selectSessionForConnection(cid, sid, true); }
    catch (err) { const m = err instanceof Error ? err.message : 'Failed to open session.'; sessionManager.error = m; sessionError.value = m; }
  }

  async function handleCreateSession() {
    const cid = sessionManager.connectionId || activeConnectionId.value;
    if (!cid) { sessionManager.error = 'No active connection selected.'; return; }
    activeConnectionId.value = cid; syncConnectionContext(cid);
    sessionManager.loading = true; sessionManager.error = '';
    try {
      const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions`, { method: 'POST', body: JSON.stringify({}) });
      if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to create session (${resp.status})`); }
      const payload = await resp.json().catch(() => null);
      const created = extractSessionId(payload);
      await loadSessionsForConnection(cid);
      const pick = created || sessions.value[0]?.id || '';
      if (pick) await selectSessionForConnection(cid, pick, true);
    } catch (err) { sessionManager.error = err instanceof Error ? err.message : 'Failed to create session.'; }
    finally { sessionManager.loading = false; }
  }

  async function handleForkSession() {
    const cid = activeConnectionId.value;
    if (!cid) return;
    const p = await runSessionAction('fork');
    const next = extractSessionId(p);
    if (next) { await loadSessionsForConnection(cid); await selectSessionForConnection(cid, next, false); }
  }

  async function handleShareSession() {
    const p = asObject(await runSessionAction('share'));
    const url = asString(p?.url || p?.shareUrl);
    sessionShared.value = Boolean(url); sessionShareUrl.value = url;
  }

  async function handleUnshareSession() {
    await runSessionAction('unshare');
    sessionShared.value = false; sessionShareUrl.value = '';
  }

  async function handleSummarizeSession() {
    await runSessionAction('summarize');
    if (activeConnectionId.value && sessionId.value) await chat.refreshMessages(activeConnectionId.value, sessionId.value, true);
  }

  async function handleRevertSession() {
    await runSessionAction('revert');
    if (activeConnectionId.value && sessionId.value) await chat.refreshMessages(activeConnectionId.value, sessionId.value, true);
  }

  async function handleUnrevertSession() {
    await runSessionAction('unrevert');
    if (activeConnectionId.value && sessionId.value) await chat.refreshMessages(activeConnectionId.value, sessionId.value, true);
  }

  // Wrap chat.handleSendPrompt to handle connection-switching before delegating
  async function handleSendPrompt(payload: Parameters<typeof chat.handleSendPrompt>[0]) {
    const cid = resolveExecutionConnectionId();
    if (cid && activeConnectionId.value !== cid) {
      activeConnectionId.value = cid; syncConnectionContext(cid);
      router.replace({ name: 'work', query: { ...route.query, connId: cid } });
    }
    await chat.handleSendPrompt(payload);
  }

  return {
    // Session state
    sessions,
    sessionWorking,
    sessionError,
    sessionShared,
    sessionShareUrl,
    sessionActionWorking,
    sessionActionStatus,
    sessionManager,

    // Chat state (re-exported from useChat)
    messages: chat.messages,
    messagesHasOlder: chat.messagesHasOlder,
    messagesLoadingOlder: chat.messagesLoadingOlder,

    // Chat functions (re-exported from useChat)
    stopMessagePolling: chat.stopMessagePolling,
    startMessagePolling: chat.startMessagePolling,
    refreshMessages: chat.refreshMessages,
    loadOlderMessages: chat.loadOlderMessages,
    handleSendPrompt,
    handleAbort: chat.handleAbort,

    // Session functions
    loadSessionsForConnection,
    loadSessionForConnection,
    selectSessionForConnection,
    runSessionAction,
    handleSessionSelection,
    handleCreateSession,
    handleForkSession,
    handleShareSession,
    handleUnshareSession,
    handleSummarizeSession,
    handleRevertSession,
    handleUnrevertSession,
  };
}

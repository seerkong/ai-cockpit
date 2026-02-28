import { ref, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import { normalizeMessagesPayload, type MessageWithParts } from './useSessions';

export interface UseChatDeps {
  activeConnectionId: Ref<string>;
  sessionId: Ref<string>;
  apiFetchForConnection: (cid: string, url: string, opts?: RequestInit) => Promise<Response>;
  resolveExecutionConnectionId: () => string;
  pushNotification: (kind: 'info' | 'error' | 'success', message: string) => void;
  /** Shared error ref owned by useSessions; useChat writes into it. */
  sessionError: Ref<string | null>;
  /** Shared working ref owned by useSessions; useChat writes into it. */
  sessionWorking: Ref<boolean>;
  /** Optional overrides for testing */
  messagePageLimit?: number;
  messagePollIntervalMs?: number;
}

function toModelPath(model?: { providerID: string; modelID: string }): string | undefined {
  if (!model?.providerID || !model.modelID) return undefined;
  return `${model.providerID}/${model.modelID}`;
}

export function useChat(deps: UseChatDeps) {
  const {
    activeConnectionId,
    sessionId,
    apiFetchForConnection,
    resolveExecutionConnectionId,
    pushNotification,
    sessionError,
    sessionWorking,
  } = deps;

  const MESSAGE_PAGE_LIMIT = deps.messagePageLimit ?? 50;
  const MESSAGE_POLL_INTERVAL_MS = deps.messagePollIntervalMs ?? 2000;

  const messages = ref<MessageWithParts[]>([]);
  const messagesHasOlder = ref(true);
  const messagesLoadingOlder = ref(false);
  let messagePollTimer: ReturnType<typeof setInterval> | null = null;

  // --- Polling ---

  function stopMessagePolling() {
    if (!messagePollTimer) return;
    clearInterval(messagePollTimer);
    messagePollTimer = null;
  }

  function startMessagePolling() {
    stopMessagePolling();
    if (!activeConnectionId.value || !sessionId.value) return;
    messagePollTimer = setInterval(() => {
      void refreshMessages(activeConnectionId.value, sessionId.value, true);
    }, MESSAGE_POLL_INTERVAL_MS);
  }

  // --- Messages ---

  async function refreshMessages(connectionId: string, sid: string, silent = false) {
    if (!connectionId || !sid) return;
    if (!silent) sessionError.value = null;
    const resp = await apiFetchForConnection(connectionId, `/api/v1/workspaces/${connectionId}/sessions/${encodeURIComponent(sid)}/messages?limit=${MESSAGE_PAGE_LIMIT}`);
    if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to load messages (${resp.status})`); }
    const payload = await resp.json().catch(() => []);
    const next = normalizeMessagesPayload(payload);
    messages.value = next;
    messagesHasOlder.value = next.length >= MESSAGE_PAGE_LIMIT;
  }

  async function loadOlderMessages() {
    const cid = activeConnectionId.value; const sid = sessionId.value;
    const before = messages.value[0]?.info?.id || '';
    if (!cid || !sid || !before || messagesLoadingOlder.value) return;
    messagesLoadingOlder.value = true;
    try {
      const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/messages?limit=${MESSAGE_PAGE_LIMIT}&cursor=${encodeURIComponent(before)}`);
      if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to load older messages (${resp.status})`); }
      const payload = await resp.json().catch(() => []);
      const older = normalizeMessagesPayload(payload);
      if (!older.length) { messagesHasOlder.value = false; return; }
      const merged = [...older, ...messages.value];
      const dedup = new Map<string, MessageWithParts>(); for (const msg of merged) dedup.set(msg.info.id, msg);
      messages.value = Array.from(dedup.values());
      messagesHasOlder.value = older.length >= MESSAGE_PAGE_LIMIT;
    } catch (err) { sessionError.value = err instanceof Error ? err.message : 'Failed to load older messages.'; }
    finally { messagesLoadingOlder.value = false; }
  }

  // --- Send / Abort ---

  async function handleSendPrompt(payload: { prompt: string; parts?: unknown[]; agent?: string; model?: { providerID: string; modelID: string }; mode?: 'shell' | 'command'; command?: string; commandArgs?: string }) {
    const cid = resolveExecutionConnectionId(); const sid = sessionId.value;
    if (!cid || !sid) { const m = !cid ? 'No active connection selected. Re-select a connection and retry.' : 'No active session selected. Open Manage sessions and select one.'; sessionError.value = m; pushNotification('error', m); return; }
    sessionWorking.value = true; sessionError.value = null;
    try {
      if (payload.mode === 'shell') {
        const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/shell`, { method: 'POST', body: JSON.stringify({ command: payload.prompt, agent: payload.agent || undefined, model: payload.model || undefined }) });
        if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to execute shell command (${resp.status})`); }
      } else if (payload.mode === 'command' && payload.command) {
        const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/command`, { method: 'POST', body: JSON.stringify({ command: payload.command, arguments: payload.commandArgs || '', agent: payload.agent || undefined, model: toModelPath(payload.model) }) });
        if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to execute command (${resp.status})`); }
      } else {
        const parts = Array.isArray(payload.parts) && payload.parts.length
          ? payload.parts
          : [{ type: 'text', text: payload.prompt }];
        const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/prompt`, {
          method: 'POST',
          body: JSON.stringify({ parts, agent: payload.agent || undefined, model: payload.model || undefined }),
        });
        if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to send prompt (${resp.status})`); }
      }
      await refreshMessages(cid, sid, true); startMessagePolling();
    } catch (err) { const m = err instanceof Error ? err.message : 'Failed to send prompt.'; sessionError.value = m; pushNotification('error', m); }
    finally { sessionWorking.value = false; }
  }

  async function handleAbort() {
    const cid = resolveExecutionConnectionId(); const sid = sessionId.value;
    if (!cid || !sid || !sessionWorking.value) return;
    try {
      const resp = await apiFetchForConnection(cid, `/api/v1/workspaces/${cid}/sessions/${encodeURIComponent(sid)}/abort`, { method: 'POST' });
      if (!resp.ok) { const text = await resp.text().catch(() => ''); throw new Error(text || `Failed to abort session (${resp.status})`); }
      sessionWorking.value = false;
    } catch (err) { const m = err instanceof Error ? err.message : 'Failed to abort session.'; sessionError.value = m; pushNotification('error', m); }
  }

  // --- Lifecycle cleanup (safe for non-component contexts like tests) ---
  if (getCurrentInstance()) {
    onUnmounted(() => { stopMessagePolling(); });
  }

  return {
    // State
    messages,
    messagesHasOlder,
    messagesLoadingOlder,

    // Functions
    refreshMessages,
    loadOlderMessages,
    startMessagePolling,
    stopMessagePolling,
    handleSendPrompt,
    handleAbort,
  };
}

import { ref, reactive, computed, watch, getCurrentInstance, onUnmounted } from 'vue';
import type { ConnectionInstance, ConnectionContextMenuState, NewConnectionModalState, UseConnectionsDeps } from './connection-types';
import { normalizeConnections, mergeConnectionsForAnchor } from './connection-helpers';
import {
  cleanupPendingConnection as _cleanupPending,
  cancelCreateConnection as _cancelCreate,
  handleNewConnection as _handleNew,
  handleCreateConnection as _handleCreate,
  type CreateConnectionContext,
} from './connection-create';

// Re-export public API so existing imports keep working
export { connectionEndpointKey, buildConnectionSingleflightKey, normalizeConnections, mergeConnectionsForAnchor } from './connection-helpers';
export type { ConnectionInstance, ConnectionContextMenuState, NewConnectionModalState, UseConnectionsDeps } from './connection-types';

export function useConnections(deps: UseConnectionsDeps) {
  const {
    route, router, workspacesStore, configsStore: _configsStore, selectionStore: _selectionStore,
    pushNotification, stopMessagePolling,
    defaultCapabilities, capabilities, token, sessionId, sessions,
    sessionManagerConnectionId, workspaceId, connId,
  } = deps;

  const connectionPool = ref<ConnectionInstance[]>([]);
  const activeConnectionId = ref('');
  const connectionTokens = reactive<Record<string, string>>({});
  const connected = ref(false);
  const connectionCreateInFlightKeys = new Set<string>();

  // Keep connection statuses fresh (Active should reflect real-time session activity).
  const CONNECTION_POLL_INTERVAL_MS = 2000;
  let connectionPollTimer: ReturnType<typeof setInterval> | null = null;

  const connectionContextMenu: ConnectionContextMenuState = reactive({ open: false, x: 0, y: 0, connectionId: '' });
  const newConnectionModal: NewConnectionModalState = reactive({
    open: false, workspaceId: '', mode: 'spawn' as 'spawn' | 'port', serverPort: '', error: '',
    submitting: false, abortController: null as AbortController | null,
    timeoutId: null as ReturnType<typeof setTimeout> | null, pendingId: '', pendingKey: '',
  });

  // --- Internal helpers ---

  function hasStoredTokenForConnection(connectionId: string): boolean {
    return Boolean(connectionTokens[connectionId] || workspacesStore.tokenFor(connectionId));
  }

  function getTokenForConnection(connectionId: string): string {
    return connectionTokens[connectionId] || workspacesStore.tokenFor(connectionId) || '';
  }

  function syncConnectionContext(connectionId: string) {
    const authToken = getTokenForConnection(connectionId);
    token.value = authToken || null;
    const stored = workspacesStore.byId[connectionId]?.workspace.capabilities;
    capabilities.value = { ...defaultCapabilities(), ...(stored || {}) };
  }

  const canManageSessions = computed(() => {
    const cid = connectionContextMenu.connectionId;
    if (!cid || !connected.value) return false;
    const conn = connectionPool.value.find((item) => item.id === cid);
    if (!conn || conn.status === 'connecting') return false;
    return Boolean(getTokenForConnection(cid));
  });

  // --- Network ---

  function resolveExecutionConnectionId(): string {
    if (activeConnectionId.value) return activeConnectionId.value;
    if (sessionId.value) {
      const bound = sessions.value.find((item) => item.id === sessionId.value)?.boundConnectionId;
      if (bound) return bound;
    }
    if (sessionManagerConnectionId.value) return sessionManagerConnectionId.value;
    if (connId.value) return connId.value;
    if (connectionPool.value.length === 1) return connectionPool.value[0]?.id || '';
    if (workspaceId.value && connectionPool.value.some((item) => item.id === workspaceId.value)) return workspaceId.value;
    return '';
  }

  function apiFetchForConnection(connectionId: string, url: string, options: RequestInit = {}): Promise<Response> {
    const authToken = getTokenForConnection(connectionId);
    if (!authToken) return Promise.reject(new Error('No token available for this connection.'));
    const headers = new Headers(options.headers ?? {});
    headers.set('Authorization', `Bearer ${authToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(url, { ...options, headers }).then((resp) => {
      if (resp.status === 401 || resp.status === 403) {
        delete connectionTokens[connectionId];
        workspacesStore.forget(connectionId);
      }
      return resp;
    });
  }

  async function fetchConnectionsForAnchor(anchorId: string, authToken: string): Promise<ConnectionInstance[] | null> {
    try {
      const resp = await fetch(`/api/v1/workspaces/${anchorId}/connections`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if (resp.status === 401 || resp.status === 403) {
          delete connectionTokens[anchorId];
          workspacesStore.forget(anchorId);
          throw new Error('Connection token invalid. Please reconnect.');
        }
        throw new Error(text || `Failed to load connections (${resp.status})`);
      }
      const data = (await resp.json()) as { connections?: ConnectionInstance[] };
      return normalizeConnections(data.connections ?? [], hasStoredTokenForConnection);
    } catch (err) {
      console.warn(`Failed to refresh connections for ${anchorId}:`, err);
      return null;
    }
  }

  async function refreshConnections(anchorId?: string) {
    const anchor = anchorId || activeConnectionId.value;
    if (!anchor) return;
    const authToken = getTokenForConnection(anchor);
    if (!authToken) return;
    const normalized = await fetchConnectionsForAnchor(anchor, authToken);
    if (!normalized) { connected.value = false; return; }
    const anchorDirectory = workspacesStore.byId[anchor]?.workspace?.directory || '';
    connectionPool.value = mergeConnectionsForAnchor({
      current: connectionPool.value,
      incoming: normalized,
      anchorId: anchor,
      anchorDirectory,
    });
    for (const conn of normalized) {
      const knownToken = workspacesStore.tokenFor(conn.id);
      if (knownToken) connectionTokens[conn.id] = knownToken;
    }
    if (activeConnectionId.value === anchor) syncConnectionContext(anchor);
    else token.value = authToken;
    connected.value = true;
  }

  function stopConnectionsPolling() {
    if (!connectionPollTimer) return;
    clearInterval(connectionPollTimer);
    connectionPollTimer = null;
  }

  function startConnectionsPolling() {
    stopConnectionsPolling();
    if (!activeConnectionId.value) return;
    connectionPollTimer = setInterval(() => {
      if (!activeConnectionId.value) return;
      void refreshConnections(activeConnectionId.value);
    }, CONNECTION_POLL_INTERVAL_MS);
  }

  function connectionSessionStatusLabel(connectionId: string): string {
    const conn = connectionPool.value.find((c) => c.id === connectionId);
    if (!conn) return 'Unknown';
    const statusLabel = conn.status === 'connecting' ? 'connecting' : conn.status === 'busy' ? 'busy' : connected.value ? 'connected' : 'init';
    return `Status: ${statusLabel}`;
  }

  // --- Create connection delegation ---

  const createCtx: CreateConnectionContext = {
    deps, connectionPool, activeConnectionId, connectionTokens, connected,
    newConnectionModal, connectionCreateInFlightKeys, getTokenForConnection, refreshConnections,
  };

  function handleNewConnection() { _handleNew(createCtx); }
  function cleanupPendingConnection() { _cleanupPending(newConnectionModal, connectionPool, connectionCreateInFlightKeys); }
  function cancelCreateConnection() { _cancelCreate(newConnectionModal, connectionPool, connectionCreateInFlightKeys, pushNotification); }
  function handleCreateConnection() { return _handleCreate(createCtx); }

  // --- Selection & loading ---

  function handleSelectConnection(connectionId: string) {
    if (!connectionId || activeConnectionId.value === connectionId) return;
    activeConnectionId.value = connectionId;
    syncConnectionContext(connectionId);
    router.replace({ name: 'work', query: { ...route.query, connId: connectionId } });
  }

  watch(activeConnectionId, () => {
    if (!activeConnectionId.value) {
      stopConnectionsPolling();
      return;
    }
    startConnectionsPolling();
  });

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopConnectionsPolling();
    });
  }

  async function loadWorkspaceData() {
    const persisted = workspacesStore.list;
    if (!persisted.length) {
      stopMessagePolling();
      connectionPool.value = [];
      sessionId.value = '';
      capabilities.value = null;
      connected.value = false;
      return;
    }
    for (const item of persisted) connectionTokens[item.workspace.id] = item.token;

    const merged = new Map<string, ConnectionInstance>();
    let hasAnySuccess = false;
    for (const item of persisted) {
      const list = await fetchConnectionsForAnchor(item.workspace.id, item.token);
      if (!list) continue;
      hasAnySuccess = true;
      for (const conn of list) { if (!merged.has(conn.id)) merged.set(conn.id, conn); }
    }
    connectionPool.value = Array.from(merged.values());
    connected.value = hasAnySuccess;

    if (connId.value && merged.has(connId.value)) {
      activeConnectionId.value = connId.value;
      syncConnectionContext(connId.value);
      return;
    }
    if (activeConnectionId.value && merged.has(activeConnectionId.value)) {
      syncConnectionContext(activeConnectionId.value);
      return;
    }
    const first = connectionPool.value[0];
    if (first) { activeConnectionId.value = first.id; syncConnectionContext(first.id); }
    else { token.value = null; capabilities.value = null; }
  }

  return {
    connectionPool, activeConnectionId, connectionTokens, connected,
    connectionContextMenu, newConnectionModal, canManageSessions,
    hasStoredTokenForConnection, getTokenForConnection, syncConnectionContext,
    resolveExecutionConnectionId, apiFetchForConnection, fetchConnectionsForAnchor,
    refreshConnections, connectionSessionStatusLabel,
    handleNewConnection, cleanupPendingConnection, cancelCreateConnection,
    handleCreateConnection, handleSelectConnection, loadWorkspaceData,
  };
}

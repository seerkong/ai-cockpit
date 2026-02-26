import type { Ref } from 'vue';
import type { ConnectionInstance, NewConnectionModalState, UseConnectionsDeps } from './connection-types';
import { buildConnectionSingleflightKey, CREATE_CONNECTION_TIMEOUT_MS } from './connection-helpers';

export interface CreateConnectionContext {
  deps: UseConnectionsDeps;
  connectionPool: Ref<ConnectionInstance[]>;
  activeConnectionId: Ref<string>;
  connectionTokens: Record<string, string>;
  connected: Ref<boolean>;
  newConnectionModal: NewConnectionModalState;
  connectionCreateInFlightKeys: Set<string>;
  getTokenForConnection: (id: string) => string;
  refreshConnections: (anchorId?: string) => Promise<void>;
}

export function cleanupPendingConnection(
  modal: NewConnectionModalState,
  connectionPool: Ref<ConnectionInstance[]>,
  inFlightKeys: Set<string>,
) {
  if (modal.pendingId) {
    connectionPool.value = connectionPool.value.filter((c) => c.id !== modal.pendingId);
    modal.pendingId = '';
  }
  if (modal.timeoutId) {
    clearTimeout(modal.timeoutId);
    modal.timeoutId = null;
  }
  if (modal.pendingKey) {
    inFlightKeys.delete(modal.pendingKey);
    modal.pendingKey = '';
  }
  modal.abortController = null;
}

export function cancelCreateConnection(
  modal: NewConnectionModalState,
  connectionPool: Ref<ConnectionInstance[]>,
  inFlightKeys: Set<string>,
  pushNotification: UseConnectionsDeps['pushNotification'],
) {
  if (modal.abortController) {
    modal.abortController.abort();
  }
  modal.error = 'Connection cancelled.';
  pushNotification('info', 'Connection cancelled.');
  modal.submitting = false;
  cleanupPendingConnection(modal, connectionPool, inFlightKeys);
}

export function handleNewConnection(ctx: CreateConnectionContext) {
  const { newConnectionModal: modal, deps } = ctx;
  modal.open = true;
  modal.workspaceId = deps.workspaceId.value;
  modal.mode = 'spawn';
  modal.serverPort = '';
  modal.error = '';
  if (modal.submitting) {
    cancelCreateConnection(modal, ctx.connectionPool, ctx.connectionCreateInFlightKeys, deps.pushNotification);
  }
}

export async function handleCreateConnection(ctx: CreateConnectionContext) {
  const {
    deps,
    connectionPool,
    activeConnectionId,
    connectionTokens,
    connected,
    newConnectionModal: modal,
    connectionCreateInFlightKeys: inFlightKeys,
    getTokenForConnection,
    refreshConnections,
  } = ctx;
  const { route, router, configsStore, workspacesStore, selectionStore, pushNotification, defaultCapabilities, loadSessionForConnection } = deps;

  modal.error = '';
  if (!modal.workspaceId) {
    modal.error = 'Select a workspace first.';
    return;
  }

  const config = configsStore.byId[modal.workspaceId];
  if (!config?.path) {
    modal.error = 'Workspace path not found.';
    return;
  }

  let serverPort: number | undefined;
  if (modal.mode === 'port') {
    const raw = modal.serverPort.trim();
    if (!raw) { modal.error = 'Server port is required for port mode.'; return; }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) { modal.error = 'Invalid server port.'; return; }
    serverPort = Math.floor(parsed);
  }

  const singleflightKey = buildConnectionSingleflightKey({ directory: config.path, mode: modal.mode, serverPort });
  if (inFlightKeys.has(singleflightKey)) {
    modal.error = 'A connection request for this endpoint is already in progress.';
    return;
  }

  modal.submitting = true;
  connected.value = false;
  cleanupPendingConnection(modal, connectionPool, inFlightKeys);
  inFlightKeys.add(singleflightKey);
  modal.pendingKey = singleflightKey;

  const pendingId = `pending-${Date.now()}`;
  modal.pendingId = pendingId;
  connectionPool.value = [
    { id: pendingId, workspaceId: modal.workspaceId, directory: config.path, label: 'connecting', mode: modal.mode, status: 'connecting', serverPort },
    ...connectionPool.value,
  ];
  modal.open = false;

  const abortController = new AbortController();
  modal.abortController = abortController;
  modal.timeoutId = setTimeout(() => {
    if (modal.submitting) {
      abortController.abort();
      modal.error = `Connection timeout after ${Math.floor(CREATE_CONNECTION_TIMEOUT_MS / 1000)}s. Please retry.`;
      pushNotification('error', modal.error);
      modal.submitting = false;
      cleanupPendingConnection(modal, connectionPool, inFlightKeys);
    }
  }, CREATE_CONNECTION_TIMEOUT_MS);

  try {
    const anchorConnection = connectionPool.value.find((conn) => {
      return conn.status !== 'connecting' && conn.directory === config.path;
    });
    const anchorToken = anchorConnection ? getTokenForConnection(anchorConnection.id) : '';
    const createByAnchor = Boolean(anchorConnection && anchorToken);
    const endpoint = createByAnchor
      ? `/api/v1/workspaces/${anchorConnection?.id || ''}/connections`
      : '/api/v1/workspaces/connect';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (createByAnchor) {
      headers.Authorization = `Bearer ${anchorToken}`;
    }

    const payload = createByAnchor
      ? { mode: modal.mode, autoApprove: true, serverPort }
      : { provider: 'opencode.local', directory: config.path, autoApprove: true, serverPort };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: abortController.signal,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `Failed to create connection (${resp.status})`);
    }

    const data = (await resp.json()) as {
      workspace?: {
        id: string; provider?: string; directory?: string;
        status?: 'connecting' | 'ready' | 'error'; createdAt?: number;
        capabilities?: Record<string, boolean>;
      };
      token?: string;
    };
    if (!data.workspace?.id || !data.token) throw new Error('Invalid connection response');

    deps.token.value = data.token;
    deps.capabilities.value = { ...defaultCapabilities(), ...(data.workspace.capabilities || {}) };
    connectionTokens[data.workspace.id] = data.token;
    workspacesStore.upsertFromConnect({
      workspace: {
        id: data.workspace.id,
        provider: data.workspace.provider || 'opencode.local',
        directory: data.workspace.directory || config.path,
        status: data.workspace.status === 'error' ? 'error' : 'ready',
        createdAt: data.workspace.createdAt || Date.now(),
        capabilities: {
          chat: true, events: true, reviewDiffs: true, inlineComments: false,
          fileRead: true, fileSearch: true, commands: true, agents: true,
          models: true, permissions: true, questions: true,
          ...(data.workspace.capabilities || {}),
        },
      },
      token: data.token,
    });
    workspacesStore.markConnectionMeta(data.workspace.id, { mode: modal.mode, serverPort });
    try { localStorage.setItem('auth-token', data.token); } catch { /* ignore */ }

    const label = config.path.split('/').filter(Boolean).pop() || 'workspace';
    selectionStore.setWorkspaceId(modal.workspaceId);
    activeConnectionId.value = data.workspace.id;
    router.replace({ name: 'work', query: { ...route.query, connId: data.workspace.id } });
    await refreshConnections(data.workspace.id);
    await loadSessionForConnection(data.workspace.id);
    if (!connectionPool.value.length) {
      connectionPool.value = [
        { id: data.workspace.id, workspaceId: data.workspace.id, directory: data.workspace.directory || config.path, label, mode: modal.mode, status: 'idle', serverPort },
      ];
    }
    cleanupPendingConnection(modal, connectionPool, inFlightKeys);
    modal.submitting = false;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // error already set on timeout/cancel
    } else {
      modal.error = err instanceof Error ? err.message : 'Failed to create connection.';
      pushNotification('error', modal.error);
    }
    modal.submitting = false;
    cleanupPendingConnection(modal, connectionPool, inFlightKeys);
  }
}

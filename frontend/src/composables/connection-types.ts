import type { Ref, ComputedRef, WritableComputedRef } from 'vue';

export interface ConnectionInstance {
  id: string;
  workspaceId: string;
  directory: string;
  label: string;
  mode: 'spawn' | 'port';
  status: 'idle' | 'busy' | 'connecting';
  serverPort?: number;
}

export interface ConnectionContextMenuState {
  open: boolean;
  x: number;
  y: number;
  connectionId: string;
}

export interface NewConnectionModalState {
  open: boolean;
  workspaceId: string;
  mode: 'spawn' | 'port';
  serverPort: string;
  error: string;
  submitting: boolean;
  abortController: AbortController | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
  pendingId: string;
  pendingKey: string;
}

export interface UseConnectionsDeps {
  route: { query: Record<string, unknown> };
  router: { replace: (to: { name: string; query: Record<string, unknown> }) => void };
  workspacesStore: {
    byId: Record<string, { workspace: { capabilities?: Record<string, boolean>; directory?: string }; token: string }>;
    tokenFor: (id: string) => string;
    forget: (id: string) => void;
    upsertFromConnect: (input: { workspace: Record<string, unknown>; token: string }) => void;
    markConnectionMeta: (id: string, input: { mode?: 'spawn' | 'port'; serverPort?: number }) => void;
    list: Array<{ workspace: { id: string }; token: string }>;
    lastSessionFor: (id: string) => string;
    setLastSession: (id: string, sessionId: string) => void;
  };
  configsStore: {
    byId: Record<string, { path: string }>;
  };
  selectionStore: {
    setWorkspaceId: (id: string) => void;
  };
  pushNotification: (kind: 'info' | 'error' | 'success', message: string) => void;
  loadSessionForConnection: (connectionId: string) => Promise<void>;
  stopMessagePolling: () => void;
  defaultCapabilities: () => Record<string, boolean>;
  capabilities: Ref<Record<string, unknown> | null>;
  token: Ref<string | null>;
  sessionId: WritableComputedRef<string> | Ref<string>;
  sessions: Ref<Array<{ id: string; boundConnectionId?: string }>>;
  sessionManagerConnectionId: Ref<string>;
  workspaceId: ComputedRef<string>;
  connId: ComputedRef<string>;
}

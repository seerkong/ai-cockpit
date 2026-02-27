import { defineStore } from 'pinia';

export type ProviderCapabilities = {
  chat: boolean;
  events: boolean;
  reviewDiffs: boolean;
  inlineComments: boolean;
  fileRead: boolean;
  fileSearch: boolean;
  commands: boolean;
  agents: boolean;
  models: boolean;
  permissions: boolean;
  questions: boolean;
};

export type Workspace = {
  id: string;
  provider: string;
  directory?: string;
  status: 'connecting' | 'ready' | 'error';
  createdAt: number;
  capabilities: ProviderCapabilities;
};

export type ConnectedWorkspace = {
  workspace: Workspace;
  token: string;
  /** Last session the user viewed for this workspace. */
  lastSessionId?: string;
  /** Last bound codument track id for this workspace. */
  lastCodumentTrackId?: string;
  /** Human-friendly connection label inside same directory group. */
  connectionLabel?: string;
  /** How this runtime connection was created. */
  connectionMode?: 'spawn' | 'port';
  /** Port used when connectionMode is 'port'. */
  serverPort?: number;
};

type PersistedStateV1 = {
  version: 1;
  activeWorkspaceId?: string;
  workspaces: ConnectedWorkspace[];
};

const STORAGE_KEY = 'ai-cockpit.workspaces.v1';

function hasLocalStorage(): boolean {
  // Bun test environment doesn't provide localStorage.
  return typeof localStorage !== 'undefined';
}

function loadPersistedState(): PersistedStateV1 | null {
  if (!hasLocalStorage()) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const data = parsed as Partial<PersistedStateV1>;
    if (data.version !== 1) return null;
    if (!Array.isArray(data.workspaces)) return null;

    return {
      version: 1,
      activeWorkspaceId: typeof data.activeWorkspaceId === 'string' ? data.activeWorkspaceId : undefined,
      workspaces: data.workspaces as ConnectedWorkspace[],
    };
  } catch {
    return null;
  }
}

function savePersistedState(state: PersistedStateV1) {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota/serialization errors.
  }
}

export const useWorkspacesStore = defineStore('workspaces', {
  state: () => {
    return {
      hydrated: false as boolean,
      activeWorkspaceId: '' as string,
      // Keep as a map for fast lookup; persisted as an array.
      byId: {} as Record<string, ConnectedWorkspace>,
    };
  },
  getters: {
    list(state): ConnectedWorkspace[] {
      return Object.values(state.byId).sort(
        (a, b) => (b.workspace.createdAt || 0) - (a.workspace.createdAt || 0),
      );
    },
    active(state): ConnectedWorkspace | null {
      if (!state.activeWorkspaceId) return null;
      return state.byId[state.activeWorkspaceId] ?? null;
    },
    tokenFor: (state) => {
      return (workspaceId: string): string => {
        return state.byId[workspaceId]?.token ?? '';
      };
    },
    lastSessionFor: (state) => {
      return (workspaceId: string): string => {
        return state.byId[workspaceId]?.lastSessionId ?? '';
      };
    },
    codumentTrackFor: (state) => {
      return (workspaceId: string): string => {
        return state.byId[workspaceId]?.lastCodumentTrackId ?? '';
      };
    },
  },
  actions: {
    hydrate() {
      if (this.hydrated) return;

      const persisted = loadPersistedState();
      if (persisted) {
        for (const entry of persisted.workspaces) {
          if (!entry?.workspace?.id || !entry.token) continue;
          this.byId[entry.workspace.id] = entry;
        }
        if (persisted.activeWorkspaceId && this.byId[persisted.activeWorkspaceId]) {
          this.activeWorkspaceId = persisted.activeWorkspaceId;
        }
      }

      this.hydrated = true;
    },
    persist() {
      const payload: PersistedStateV1 = {
        version: 1,
        activeWorkspaceId: this.activeWorkspaceId || undefined,
        workspaces: this.list,
      };
      savePersistedState(payload);
    },
    upsertFromConnect(input: { workspace: Workspace; token: string }) {
      const id = input.workspace.id;
      const prev = this.byId[id];
      let connectionLabel = prev?.connectionLabel;
      if (!connectionLabel) {
        const dir = input.workspace.directory || '';
        const sameDirCount = Object.values(this.byId).filter((item) => (item.workspace.directory || '') === dir).length;
        connectionLabel = `conn-${sameDirCount + 1}`;
      }
      this.byId[id] = {
        ...(prev ?? { workspace: input.workspace, token: input.token }),
        workspace: input.workspace,
        token: input.token,
        connectionLabel,
      };
      this.activeWorkspaceId = id;
      this.persist();
    },
    markConnectionMeta(workspaceId: string, input: { mode?: 'spawn' | 'port'; serverPort?: number }) {
      const ws = this.byId[workspaceId];
      if (!ws) return;
      if (input.mode) ws.connectionMode = input.mode;
      if (typeof input.serverPort === 'number') ws.serverPort = input.serverPort;
      this.byId[workspaceId] = ws;
      this.persist();
    },
    setActive(workspaceId: string) {
      if (!workspaceId || !this.byId[workspaceId]) return;
      this.activeWorkspaceId = workspaceId;
      this.persist();
    },
    setLastSession(workspaceId: string, sessionId: string) {
      const ws = this.byId[workspaceId];
      if (!ws) return;
      ws.lastSessionId = sessionId;
      this.byId[workspaceId] = ws;
      this.persist();
    },
    setLastCodumentTrack(workspaceId: string, trackId: string) {
      const ws = this.byId[workspaceId];
      if (!ws) return;
      ws.lastCodumentTrackId = trackId;
      this.byId[workspaceId] = ws;
      this.persist();
    },
    forget(workspaceId: string) {
      if (!workspaceId) return;
      delete this.byId[workspaceId];
      if (this.activeWorkspaceId === workspaceId) {
        this.activeWorkspaceId = '';
      }
      this.persist();
    },
  },
});

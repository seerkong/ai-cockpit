import { defineStore } from 'pinia'

import { ulid } from '../ulid'

export type WorkspaceConfig = {
  id: string
  path: string
  createdAt: number
}

type PersistedWorkspaceConfigsV1 = {
  version: 1
  configs: WorkspaceConfig[]
}

const STORAGE_KEY = 'ai-cockpit.workspace-configs.v1'

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadPersisted(): PersistedWorkspaceConfigsV1 | null {
  if (!hasLocalStorage()) return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceConfigsV1>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.version !== 1) return null
    if (!Array.isArray(parsed.configs)) return null
    return {
      version: 1,
      configs: parsed.configs as WorkspaceConfig[],
    }
  } catch {
    return null
  }
}

function persist(state: PersistedWorkspaceConfigsV1) {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export const useWorkspaceConfigsStore = defineStore('workspaceConfigs', {
  state: () => ({
    hydrated: false as boolean,
    byId: {} as Record<string, WorkspaceConfig>,
  }),
  getters: {
    list(state): WorkspaceConfig[] {
      return Object.values(state.byId).sort((a, b) => a.createdAt - b.createdAt)
    },
  },
  actions: {
    hydrate() {
      if (this.hydrated) return
      const data = loadPersisted()
      if (data) {
        for (const cfg of data.configs) {
          if (!cfg?.id || !cfg.path) continue
          this.byId[cfg.id] = cfg
        }
      }
      this.hydrated = true
    },
    save() {
      persist({ version: 1, configs: this.list })
    },
    add(input: { path: string }) {
      const path = input.path.trim()
      if (!path) return ''
      const id = ulid()
      this.byId[id] = {
        id,
        path,
        createdAt: Date.now(),
      }
      this.save()
      return id
    },
    update(input: { id: string; path: string }) {
      const cfg = this.byId[input.id]
      if (!cfg) return
      const path = input.path.trim()
      if (!path) return
      cfg.path = path
      this.byId[input.id] = cfg
      this.save()
    },
    remove(id: string) {
      if (!id) return
      delete this.byId[id]
      this.save()
    },
  },
})

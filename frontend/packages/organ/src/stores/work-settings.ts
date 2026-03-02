import { defineStore } from 'pinia';

type PersistedWorkSettingsV1 = {
  version: 1;
  stalledAutoRecoverEnabled: boolean;
  stalledAutoRecoverTimeoutMinutes: number;
};

const STORAGE_KEY = 'ai-cockpit.work-settings.v1';

function hasLocalStorage(): boolean {
  // Bun test environment doesn't provide localStorage.
  return typeof localStorage !== 'undefined';
}

function clampTimeoutMinutes(value: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 5;
  if (n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

function loadPersisted(): PersistedWorkSettingsV1 | null {
  if (!hasLocalStorage()) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const data = parsed as Partial<PersistedWorkSettingsV1>;
    if (data.version !== 1) return null;

    return {
      version: 1,
      stalledAutoRecoverEnabled: typeof data.stalledAutoRecoverEnabled === 'boolean' ? data.stalledAutoRecoverEnabled : true,
      stalledAutoRecoverTimeoutMinutes: clampTimeoutMinutes(data.stalledAutoRecoverTimeoutMinutes ?? 5),
    };
  } catch {
    return null;
  }
}

export const useWorkSettingsStore = defineStore('workSettings', {
  state: () => {
    return {
      hydrated: false as boolean,
      stalledAutoRecoverEnabled: true as boolean,
      stalledAutoRecoverTimeoutMinutes: 5 as number,
    };
  },
  actions: {
    hydrate() {
      if (this.hydrated) return;

      const persisted = loadPersisted();
      if (persisted) {
        this.stalledAutoRecoverEnabled = persisted.stalledAutoRecoverEnabled;
        this.stalledAutoRecoverTimeoutMinutes = persisted.stalledAutoRecoverTimeoutMinutes;
      }
      this.hydrated = true;
    },
    save() {
      if (!hasLocalStorage()) return;
      const payload: PersistedWorkSettingsV1 = {
        version: 1,
        stalledAutoRecoverEnabled: !!this.stalledAutoRecoverEnabled,
        stalledAutoRecoverTimeoutMinutes: clampTimeoutMinutes(this.stalledAutoRecoverTimeoutMinutes),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    },
    setStalledAutoRecoverEnabled(value: boolean) {
      this.stalledAutoRecoverEnabled = !!value;
      this.save();
    },
    setStalledAutoRecoverTimeoutMinutes(value: number) {
      this.stalledAutoRecoverTimeoutMinutes = clampTimeoutMinutes(value);
      this.save();
    },
  },
});

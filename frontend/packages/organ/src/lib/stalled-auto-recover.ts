export type StalledAutoRecoverRuntimeStatus = 'idle' | 'busy' | 'retry' | 'error' | 'unknown' | (string & {});

export type StalledAutoRecoverClock = {
  nowMs: () => number;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export type StalledAutoRecoverNotifyKind = 'info' | 'error';

export type CreateStalledAutoRecoverDeps = {
  enabled: () => boolean;
  timeoutMinutes: () => number;

  getConnectionId: () => string;
  getSessionId: () => string;
  getRuntimeStatus: () => StalledAutoRecoverRuntimeStatus;

  getLastProgressAtMs: () => number | null | undefined;
  getMessagesFingerprint: () => string | null | undefined;
  getMessagesRefreshOk: () => boolean;

  pause: {
    pendingPermission: () => boolean;
    pendingQuestion: () => boolean;
    longRunningTool: () => boolean;
  };

  actions: {
    refreshMessages: (connectionId: string, sessionId: string) => Promise<void>;
    abortSession: (connectionId: string, sessionId: string) => Promise<void>;
    sendPrompt: (prompt: string) => Promise<void>;
    notify?: (kind: StalledAutoRecoverNotifyKind, message: string) => void;
  };

  config?: {
    tickIntervalMs?: number;
    cooldownMs?: number;
    continuePrompt?: string;
    idleWaitTimeoutMs?: number;
    idleCheckIntervalMs?: number;
  };

  clock?: Partial<StalledAutoRecoverClock>;

  /**
   * Injected sleep for deterministic tests.
   * Default uses setTimeout from the injected clock.
   */
  sleepMs?: (ms: number) => Promise<void>;
};

export type StalledAutoRecoverController = {
  start: () => void;
  stop: () => void;
  tick: () => Promise<void>;
  getDebugState: () => { inFlight: boolean; lastAutoRecoverAtMs: number };
};

const DEFAULT_TICK_INTERVAL_MS = 5000;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_IDLE_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_CHECK_INTERVAL_MS = 250;
const DEFAULT_CONTINUE_PROMPT = '请继续';

function defaultClock(): StalledAutoRecoverClock {
  return {
    nowMs: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
}

export function createStalledAutoRecover(deps: CreateStalledAutoRecoverDeps): StalledAutoRecoverController {
  const clock: StalledAutoRecoverClock = {
    ...defaultClock(),
    ...(deps.clock || {}),
  };

  const tickIntervalMs = deps.config?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const cooldownMs = deps.config?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const continuePrompt = deps.config?.continuePrompt ?? DEFAULT_CONTINUE_PROMPT;
  const idleWaitTimeoutMs = deps.config?.idleWaitTimeoutMs ?? DEFAULT_IDLE_WAIT_TIMEOUT_MS;
  const idleCheckIntervalMs = deps.config?.idleCheckIntervalMs ?? DEFAULT_IDLE_CHECK_INTERVAL_MS;

  const sleepMs =
    deps.sleepMs ||
    ((ms: number) =>
      new Promise<void>((resolve) => {
        const tid = clock.setTimeout(() => {
          clock.clearTimeout(tid);
          resolve();
        }, ms);
      }));

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let lastAutoRecoverAtMs = 0;

  function notify(kind: StalledAutoRecoverNotifyKind, message: string) {
    try {
      deps.actions.notify?.(kind, message);
    } catch {
      // ignore notification errors
    }
  }

  function shouldPause(): boolean {
    if (deps.pause.pendingPermission()) return true;
    if (deps.pause.pendingQuestion()) return true;
    if (deps.pause.longRunningTool()) return true;
    if (!deps.getMessagesRefreshOk()) return true;
    return false;
  }

  async function waitUntilIdle(): Promise<boolean> {
    const deadline = clock.nowMs() + idleWaitTimeoutMs;
    while (clock.nowMs() < deadline) {
      const st = deps.getRuntimeStatus();
      if (st === 'idle') return true;
      if (st === 'error') return false;
      await sleepMs(idleCheckIntervalMs);
    }
    return false;
  }

  async function tick(): Promise<void> {
    const cid = deps.getConnectionId();
    const sid = deps.getSessionId();
    if (!cid || !sid) return;
    if (!deps.enabled()) return;

    const st = deps.getRuntimeStatus();
    if (st !== 'busy' && st !== 'retry') return;

    // Pause conditions
    if (shouldPause()) return;

    const lastAt = deps.getLastProgressAtMs();
    if (lastAt == null) return;
    const timeoutMs = deps.timeoutMinutes() * 60 * 1000;
    if (clock.nowMs() - lastAt < timeoutMs) return;

    if (lastAutoRecoverAtMs && clock.nowMs() - lastAutoRecoverAtMs < cooldownMs) return;
    if (inFlight) return;

    inFlight = true;
    try {
      // Double-check before acting by forcing a message refresh.
      const fpBefore = deps.getMessagesFingerprint();
      await deps.actions.refreshMessages(cid, sid);

      if (!deps.enabled()) return;
      if (!deps.getMessagesRefreshOk()) return;

      // If messages changed, session is not stalled.
      if (deps.getMessagesFingerprint() !== fpBefore) return;
      if (shouldPause()) return;

      notify('info', 'Auto-recover: aborting stalled session…');
      await deps.actions.abortSession(cid, sid);

      if (!deps.enabled()) return;

      const idle = await waitUntilIdle();
      if (!idle) {
        notify('error', 'Auto-recover: session did not become idle in time; skipping continue.');
        return;
      }

      if (!deps.enabled()) return;
      if (deps.pause.pendingPermission()) return;
      if (deps.pause.pendingQuestion()) return;

      notify('info', `Auto-recover: asking session to continue (${continuePrompt})…`);
      await deps.actions.sendPrompt(continuePrompt);
      lastAutoRecoverAtMs = clock.nowMs();
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Auto-recover failed.';
      notify('error', `Auto-recover failed: ${m}`);
    } finally {
      inFlight = false;
    }
  }

  function stop() {
    if (!timer) return;
    clock.clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    timer = clock.setInterval(() => {
      void tick();
    }, tickIntervalMs);
  }

  return {
    start,
    stop,
    tick,
    getDebugState: () => ({ inFlight, lastAutoRecoverAtMs }),
  };
}

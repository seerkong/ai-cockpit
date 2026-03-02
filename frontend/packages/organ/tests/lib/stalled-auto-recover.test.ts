import { describe, expect, test, mock } from 'bun:test';
import { createStalledAutoRecover, type CreateStalledAutoRecoverDeps } from '../../src/lib/stalled-auto-recover';

function makeDeps(overrides: Partial<CreateStalledAutoRecoverDeps> = {}) {
  let now = 1_000_000;
  let runtimeStatus: any = 'busy';
  let fingerprint: string | null = 'fp-1';
  let lastProgressAtMs: number | null = now - 120_000;
  let messagesRefreshOk = true;

  const calls: string[] = [];

  const refreshMessages = mock(async () => {
    calls.push('refresh');
  });
  const abortSession = mock(async () => {
    calls.push('abort');
    runtimeStatus = 'idle';
  });
  const sendPrompt = mock(async (p: string) => {
    calls.push(`send:${p}`);
  });
  const notify = mock((kind: 'info' | 'error', message: string) => {
    calls.push(`notify:${kind}:${message}`);
  });

  const deps: CreateStalledAutoRecoverDeps = {
    enabled: () => true,
    timeoutMinutes: () => 1,

    getConnectionId: () => 'c1',
    getSessionId: () => 's1',
    getRuntimeStatus: () => {
      calls.push(`status:${runtimeStatus}`);
      return runtimeStatus;
    },

    getLastProgressAtMs: () => lastProgressAtMs,
    getMessagesFingerprint: () => fingerprint,
    getMessagesRefreshOk: () => messagesRefreshOk,

    pause: {
      pendingPermission: () => false,
      pendingQuestion: () => false,
      longRunningTool: () => false,
    },

    actions: {
      refreshMessages,
      abortSession,
      sendPrompt,
      notify,
    },

    config: {
      idleWaitTimeoutMs: 50,
      idleCheckIntervalMs: 5,
      cooldownMs: 10 * 60 * 1000,
    },

    clock: {
      nowMs: () => now,
      setInterval: mock(() => 0 as any),
      clearInterval: mock(() => {}),
      setTimeout: mock(() => 0 as any),
      clearTimeout: mock(() => {}),
    },

    sleepMs: async (ms: number) => {
      calls.push(`sleep:${ms}`);
      now += ms;
    },
  };

  const merged = { ...deps, ...overrides } as CreateStalledAutoRecoverDeps;

  return {
    deps: merged,
    controller: createStalledAutoRecover(merged),
    calls,
    mocks: { refreshMessages, abortSession, sendPrompt, notify },
    state: {
      get now() {
        return now;
      },
      set now(v: number) {
        now = v;
      },
      get runtimeStatus() {
        return runtimeStatus;
      },
      set runtimeStatus(v: any) {
        runtimeStatus = v;
      },
      get fingerprint() {
        return fingerprint;
      },
      set fingerprint(v: string | null) {
        fingerprint = v;
      },
      get lastProgressAtMs() {
        return lastProgressAtMs;
      },
      set lastProgressAtMs(v: number | null) {
        lastProgressAtMs = v;
      },
      get messagesRefreshOk() {
        return messagesRefreshOk;
      },
      set messagesRefreshOk(v: boolean) {
        messagesRefreshOk = v;
      },
    },
  };
}

describe('stalled-auto-recover', () => {
  test('pauses when pending permission', async () => {
    const t = makeDeps({
      pause: {
        pendingPermission: () => true,
        pendingQuestion: () => false,
        longRunningTool: () => false,
      },
    });

    await t.controller.tick();

    expect(t.mocks.refreshMessages).not.toHaveBeenCalled();
    expect(t.mocks.abortSession).not.toHaveBeenCalled();
    expect(t.mocks.sendPrompt).not.toHaveBeenCalled();
  });

  test('pauses when pending question', async () => {
    const t = makeDeps({
      pause: {
        pendingPermission: () => false,
        pendingQuestion: () => true,
        longRunningTool: () => false,
      },
    });

    await t.controller.tick();

    expect(t.mocks.refreshMessages).not.toHaveBeenCalled();
  });

  test('pauses when long-running tool', async () => {
    const t = makeDeps({
      pause: {
        pendingPermission: () => false,
        pendingQuestion: () => false,
        longRunningTool: () => true,
      },
    });

    await t.controller.tick();

    expect(t.mocks.refreshMessages).not.toHaveBeenCalled();
  });

  test('pauses when messages refresh previously failed', async () => {
    const t = makeDeps();
    t.state.messagesRefreshOk = false;

    await t.controller.tick();

    expect(t.mocks.refreshMessages).not.toHaveBeenCalled();
  });

  test('does not trigger before timeout; triggers after timeout', async () => {
    const t = makeDeps({ timeoutMinutes: () => 1 });
    // now=1_000_000, timeout=60_000
    t.state.lastProgressAtMs = t.state.now - 59_999;
    await t.controller.tick();
    expect(t.mocks.refreshMessages).not.toHaveBeenCalled();

    t.state.lastProgressAtMs = t.state.now - 60_001;
    await t.controller.tick();
    expect(t.mocks.refreshMessages).toHaveBeenCalledTimes(1);
    expect(t.mocks.abortSession).toHaveBeenCalledTimes(1);
    expect(t.mocks.sendPrompt).toHaveBeenCalledTimes(1);
  });

  test('cooldown prevents repeated triggers', async () => {
    const t = makeDeps();
    t.state.lastProgressAtMs = t.state.now - 999_999;

    await t.controller.tick();
    expect(t.mocks.sendPrompt).toHaveBeenCalledTimes(1);

    // Make it look stalled again immediately
    t.state.runtimeStatus = 'busy';
    t.state.lastProgressAtMs = t.state.now - 999_999;
    t.state.now += 1_000;

    await t.controller.tick();
    expect(t.mocks.sendPrompt).toHaveBeenCalledTimes(1);
    expect(t.mocks.refreshMessages).toHaveBeenCalledTimes(1);
  });

  test('aborts only when fingerprint unchanged after forced refresh', async () => {
    const calls: string[] = [];
    let now = 1_000_000;
    let fingerprint: string | null = 'fp-1';
    const controller = createStalledAutoRecover({
      enabled: () => true,
      timeoutMinutes: () => 1,
      getConnectionId: () => 'c1',
      getSessionId: () => 's1',
      getRuntimeStatus: () => 'busy',
      getLastProgressAtMs: () => now - 999_999,
      getMessagesFingerprint: () => fingerprint,
      getMessagesRefreshOk: () => true,
      pause: {
        pendingPermission: () => false,
        pendingQuestion: () => false,
        longRunningTool: () => false,
      },
      actions: {
        refreshMessages: mock(async () => {
          calls.push('refresh');
          fingerprint = 'fp-2';
        }),
        abortSession: mock(async () => {
          calls.push('abort');
        }),
        sendPrompt: mock(async (p: string) => {
          calls.push(`send:${p}`);
        }),
        notify: mock(() => {}),
      },
      config: {
        idleWaitTimeoutMs: 50,
        idleCheckIntervalMs: 5,
        cooldownMs: 10 * 60 * 1000,
      },
      sleepMs: async (ms: number) => {
        now += ms;
      },
    });

    await controller.tick();

    expect(calls).toContain('refresh');
    expect(calls).not.toContain('abort');
    expect(calls.find((c) => c.startsWith('send:'))).toBeUndefined();
    expect(controller.getDebugState().lastAutoRecoverAtMs).toBe(0);
  });

  test('abort -> wait idle -> continue ordering', async () => {
    const calls: string[] = [];
    let now = 1_000_000;
    let aborted = false;
    let statusChecksAfterAbort = 0;

    const controller = createStalledAutoRecover({
      enabled: () => true,
      timeoutMinutes: () => 1,
      getConnectionId: () => 'c1',
      getSessionId: () => 's1',
      getRuntimeStatus: () => {
        if (!aborted) return 'busy';
        statusChecksAfterAbort += 1;
        if (statusChecksAfterAbort >= 3) return 'idle';
        return 'busy';
      },
      getLastProgressAtMs: () => now - 999_999,
      getMessagesFingerprint: () => 'fp-1',
      getMessagesRefreshOk: () => true,
      pause: {
        pendingPermission: () => false,
        pendingQuestion: () => false,
        longRunningTool: () => false,
      },
      actions: {
        refreshMessages: mock(async () => {
          calls.push('refresh');
        }),
        abortSession: mock(async () => {
          calls.push('abort');
          aborted = true;
        }),
        sendPrompt: mock(async (p: string) => {
          calls.push(`send:${p}`);
        }),
        notify: mock(() => {}),
      },
      config: {
        idleWaitTimeoutMs: 100,
        idleCheckIntervalMs: 10,
        cooldownMs: 10 * 60 * 1000,
      },
      sleepMs: async (ms: number) => {
        calls.push(`sleep:${ms}`);
        now += ms;
      },
    });

    await controller.tick();

    const refreshIdx = calls.indexOf('refresh');
    const abortIdx = calls.indexOf('abort');
    const sendIdx = calls.findIndex((c) => c.startsWith('send:'));
    const sleepIdx = calls.findIndex((c) => c.startsWith('sleep:'));

    expect(refreshIdx).toBeGreaterThanOrEqual(0);
    expect(abortIdx).toBeGreaterThan(refreshIdx);
    expect(sleepIdx).toBeGreaterThan(abortIdx);
    expect(sendIdx).toBeGreaterThan(sleepIdx);
  });

  test('singleflight: concurrent ticks only run one recovery', async () => {
    let now = 1_000_000;
    let aborted = false;
    let resolveRefresh: (() => void) | null = null;
    const refreshPromise = new Promise<void>((r) => {
      resolveRefresh = r;
    });
    const refreshMessages = mock(async () => {
      await refreshPromise;
    });
    const abortSession = mock(async () => {
      aborted = true;
    });
    const sendPrompt = mock(async () => {});

    const controller = createStalledAutoRecover({
      enabled: () => true,
      timeoutMinutes: () => 1,
      getConnectionId: () => 'c1',
      getSessionId: () => 's1',
      getRuntimeStatus: () => (aborted ? 'idle' : 'busy'),
      getLastProgressAtMs: () => now - 999_999,
      getMessagesFingerprint: () => 'fp-1',
      getMessagesRefreshOk: () => true,
      pause: {
        pendingPermission: () => false,
        pendingQuestion: () => false,
        longRunningTool: () => false,
      },
      actions: {
        refreshMessages,
        abortSession,
        sendPrompt,
        notify: mock(() => {}),
      },
      config: {
        idleWaitTimeoutMs: 10,
        idleCheckIntervalMs: 1,
        cooldownMs: 10 * 60 * 1000,
      },
      sleepMs: async (ms: number) => {
        now += ms;
      },
    });

    const p1 = controller.tick();
    const p2 = controller.tick();

    expect(refreshMessages).toHaveBeenCalledTimes(1);

    resolveRefresh?.();
    await Promise.all([p1, p2]);

    expect(abortSession).toHaveBeenCalledTimes(1);
    expect(sendPrompt).toHaveBeenCalledTimes(1);
  });
});

import { expect, test } from '@playwright/test';

type JsonRecord = Record<string, unknown>;

type FakeEventSourceLike = {
  url: string;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onopen: (() => void) | null;
  _closed: boolean;
  close(): void;
};

declare global {
  interface Window {
    __lastRealtimeWebSocket?: any;
    __realtimeSockets?: any[];
    __lastEventSource?: FakeEventSourceLike;
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

test('realtime ws mock: snapshot + patch updates UI incrementally', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_1';

  const calls: Record<string, number> = Object.create(null);
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };

  await page.addInitScript(() => {
    const RealWebSocket = window.WebSocket;

    class FakeRealtimeWebSocket {
      url: string;
      readyState: number;
      sent: string[];
      onopen: ((ev: Event) => void) | null;
      onmessage: ((ev: MessageEvent) => void) | null;
      onerror: ((ev: Event) => void) | null;
      onclose: ((ev: CloseEvent) => void) | null;

      constructor(url: string) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        ;(window as any).__realtimeSockets = (window as any).__realtimeSockets || [];
        ;(window as any).__realtimeSockets.push(this);
        ;(window as any).__lastRealtimeWebSocket = this;

        // Defer so handlers can attach.
        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string) {
        this.sent.push(String(data));
      }

      close(code?: number, reason?: string) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({ code, reason } as CloseEvent);
      }

      _receive(data: string) {
        this.onmessage?.({ data } as MessageEvent);
      }
    }

    (window as any).WebSocket = function (url: any, protocols?: any) {
      if (typeof url === 'string' && url.includes('/stream/ws')) {
        return new FakeRealtimeWebSocket(url);
      }
      return new (RealWebSocket as any)(url, protocols);
    } as any;
  });

  // Minimal in-memory backend for the page.
  await page.route('**/api/v1/workspaces/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify(data),
      });
    };

    if (path === '/api/v1/workspaces/connect') {
      bump('workspaces.connect');
      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: 'C:/repo',
          status: 'ready',
          createdAt: Date.now(),
          capabilities: {
            chat: true,
            events: true,
            reviewDiffs: false,
            inlineComments: false,
            fileRead: false,
            fileSearch: false,
            commands: false,
            agents: false,
            models: false,
            permissions: false,
            questions: false,
          },
        },
        token,
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      bump('sessions');
      if (req.method() === 'GET') {
        await json([{ id: sessionId, title: 'S' }]);
        return;
      }
      if (req.method() === 'POST') {
        await json({ id: sessionId });
        return;
      }
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`) {
      bump('messages');
      await json([
        {
          info: { id: 'msg_1', role: 'assistant', sessionID: sessionId },
          parts: [{ id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'h' }],
        },
      ]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`) {
      bump('session.get');
      await json({ id: sessionId, title: 'S' });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/files`) {
      bump('files');
      await json([]);
      return;
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  await page.goto('/');
  await page.getByPlaceholder('Local directory path').fill('C:/repo');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Open details' }).first().click();
  await page.waitForURL(`**/workspaces/${workspaceId}/sessions`);

  // Ensure initial hydration happened.
  await expect.poll(() => calls['messages'] ?? 0).toBeGreaterThan(0);
  await expect(page.getByText('msg_1', { exact: true })).toBeVisible();

  // Ensure the client subscribed before we inject messages.
  await page.waitForFunction(() => {
    const ws = (window as any).__lastRealtimeWebSocket;
    if (!ws || !Array.isArray(ws.sent)) return false;
    return ws.sent.some((s: unknown) => typeof s === 'string' && s.includes('"type":"subscribe"'));
  });

  const snapshot = {
    type: 'snapshot',
    payload: {
      state: {
        schemaVersion: 1,
        workspaceId,
        subscriptions: { sessionIds: [sessionId] },
        sessions: { byId: { [sessionId]: { id: sessionId, status: 'idle' } }, order: [sessionId] },
        messages: {
          byId: { msg_1: { id: 'msg_1', sessionID: sessionId, role: 'assistant' } },
          idsBySessionId: { [sessionId]: ['msg_1'] },
        },
        parts: {
          byId: { part_1: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'h' } },
          idsByMessageId: { msg_1: ['part_1'] },
        },
        permissions: { needsRefreshBySessionId: {} },
        questions: { needsRefreshBySessionId: {} },
      },
    },
  };

  const patch = {
    type: 'patch',
    payload: {
      ops: [
        {
          op: 'add',
          path: '/parts/byId/part_1',
          value: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'he' },
        },
      ],
    },
  };

  await page.evaluate(
    ({ snapshotMsg, patchMsg }) => {
      const ws = (window as any).__lastRealtimeWebSocket;
      if (!ws) throw new Error('FakeRealtimeWebSocket not found');
      ws._receive(JSON.stringify(snapshotMsg));
      ws._receive(JSON.stringify(patchMsg));
    },
    { snapshotMsg: snapshot, patchMsg: patch },
  );

  await expect(page.getByText('he', { exact: true })).toBeVisible();
});

test('realtime ws mock: prompt refresh is deferred while ws stream is active', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_1';

  const calls: Record<string, number> = Object.create(null);
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };

  await page.addInitScript(() => {
    const RealWebSocket = window.WebSocket;

    class FakeRealtimeWebSocket {
      url: string;
      readyState: number;
      sent: string[];
      onopen: ((ev: Event) => void) | null;
      onmessage: ((ev: MessageEvent) => void) | null;
      onerror: ((ev: Event) => void) | null;
      onclose: ((ev: CloseEvent) => void) | null;

      constructor(url: string) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        ;(window as any).__realtimeSockets = (window as any).__realtimeSockets || [];
        ;(window as any).__realtimeSockets.push(this);
        ;(window as any).__lastRealtimeWebSocket = this;

        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string) {
        this.sent.push(String(data));
      }

      close(code?: number, reason?: string) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({ code, reason } as CloseEvent);
      }

      _receive(data: string) {
        this.onmessage?.({ data } as MessageEvent);
      }
    }

    (window as any).WebSocket = function (url: any, protocols?: any) {
      if (typeof url === 'string' && url.includes('/stream/ws')) {
        return new FakeRealtimeWebSocket(url);
      }
      return new (RealWebSocket as any)(url, protocols);
    } as any;
  });

  await page.route('**/api/v1/workspaces/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify(data),
      });
    };

    if (path === '/api/v1/workspaces/connect') {
      bump('workspaces.connect');
      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: 'C:/repo',
          status: 'ready',
          createdAt: Date.now(),
          capabilities: {
            chat: true,
            events: true,
            reviewDiffs: false,
            inlineComments: false,
            fileRead: false,
            fileSearch: false,
            commands: false,
            agents: false,
            models: false,
            permissions: false,
            questions: false,
          },
        },
        token,
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      bump('sessions');
      await json([{ id: sessionId, title: 'S' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`) {
      bump('messages');
      await json([
        {
          info: { id: 'msg_1', role: 'assistant', sessionID: sessionId },
          parts: [{ id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'h' }],
        },
      ]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`) {
      bump('session.get');
      await json({ id: sessionId, title: 'S' });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/prompt`) {
      bump('prompt');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/files`) {
      bump('files');
      await json([]);
      return;
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  await page.goto('/');
  await page.getByPlaceholder('Local directory path').fill('C:/repo');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Open details' }).first().click();
  await page.waitForURL(`**/workspaces/${workspaceId}/sessions`);

  await expect.poll(() => calls['messages'] ?? 0).toBeGreaterThan(0);
  const initialMessagesCalls = calls['messages'] ?? 0;

  await page.waitForFunction(() => {
    const ws = (window as any).__lastRealtimeWebSocket;
    if (!ws || !Array.isArray(ws.sent)) return false;
    return ws.sent.some((s: unknown) => typeof s === 'string' && s.includes('"type":"subscribe"'));
  });

  const snapshotBusy = {
    type: 'snapshot',
    payload: {
      state: {
        schemaVersion: 1,
        workspaceId,
        subscriptions: { sessionIds: [sessionId] },
        sessions: { byId: { [sessionId]: { id: sessionId, status: 'busy' } }, order: [sessionId] },
        messages: {
          byId: { msg_1: { id: 'msg_1', sessionID: sessionId, role: 'assistant' } },
          idsBySessionId: { [sessionId]: ['msg_1'] },
        },
        parts: {
          byId: { part_1: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'h' } },
          idsByMessageId: { msg_1: ['part_1'] },
        },
        permissions: { needsRefreshBySessionId: {} },
        questions: { needsRefreshBySessionId: {} },
      },
    },
  };

  const patchHe = {
    type: 'patch',
    payload: {
      ops: [
        {
          op: 'add',
          path: '/parts/byId/part_1',
          value: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'he' },
        },
      ],
    },
  };

  const patchHel = {
    type: 'patch',
    payload: {
      ops: [
        {
          op: 'add',
          path: '/parts/byId/part_1',
          value: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'hel' },
        },
      ],
    },
  };

  await page.evaluate(
    ({ snapshotMsg, patchHeMsg, patchHelMsg }) => {
      const ws = (window as any).__lastRealtimeWebSocket;
      if (!ws) throw new Error('FakeRealtimeWebSocket not found');
      ws._receive(JSON.stringify(snapshotMsg));
      ws._receive(JSON.stringify(patchHeMsg));
      ws._receive(JSON.stringify(patchHelMsg));
    },
    { snapshotMsg: snapshotBusy, patchHeMsg: patchHe, patchHelMsg: patchHel },
  );

  await expect(page.getByText('hel', { exact: true })).toBeVisible();

  await page.getByPlaceholder('Type a message...').fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => calls['prompt'] ?? 0).toBe(1);

  await page.waitForTimeout(500);
  expect(calls['messages'] ?? 0).toBe(initialMessagesCalls);

  const patchIdle = {
    type: 'patch',
    payload: {
      ops: [{ op: 'add', path: `/sessions/byId/${sessionId}/status`, value: 'idle' }],
    },
  };

  await page.evaluate(
    ({ patchIdleMsg }) => {
      const ws = (window as any).__lastRealtimeWebSocket;
      if (!ws) throw new Error('FakeRealtimeWebSocket not found');
      ws._receive(JSON.stringify(patchIdleMsg));
    },
    { patchIdleMsg: patchIdle },
  );

  await expect.poll(() => calls['messages'] ?? 0).toBeGreaterThan(initialMessagesCalls);
  await expect(page.getByText('hel', { exact: true })).toBeVisible();
});

test('realtime ws mock: reconnect rehydrates via snapshot', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_1';

  await page.addInitScript(() => {
    const RealWebSocket = window.WebSocket;

    class FakeRealtimeWebSocket {
      url: string;
      readyState: number;
      sent: string[];
      onopen: ((ev: Event) => void) | null;
      onmessage: ((ev: MessageEvent) => void) | null;
      onerror: ((ev: Event) => void) | null;
      onclose: ((ev: CloseEvent) => void) | null;

      constructor(url: string) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        ;(window as any).__realtimeSockets = (window as any).__realtimeSockets || [];
        ;(window as any).__realtimeSockets.push(this);
        ;(window as any).__lastRealtimeWebSocket = this;

        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string) {
        this.sent.push(String(data));
      }

      close(code?: number, reason?: string) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({ code, reason } as CloseEvent);
      }

      _receive(data: string) {
        this.onmessage?.({ data } as MessageEvent);
      }
    }

    (window as any).WebSocket = function (url: any, protocols?: any) {
      if (typeof url === 'string' && url.includes('/stream/ws')) {
        return new FakeRealtimeWebSocket(url);
      }
      return new (RealWebSocket as any)(url, protocols);
    } as any;
  });

  await page.route('**/api/v1/workspaces/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify(data),
      });
    };

    if (path === '/api/v1/workspaces/connect') {
      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: 'C:/repo',
          status: 'ready',
          createdAt: Date.now(),
          capabilities: {
            chat: true,
            events: true,
            reviewDiffs: false,
            inlineComments: false,
            fileRead: false,
            fileSearch: false,
            commands: false,
            agents: false,
            models: false,
            permissions: false,
            questions: false,
          },
        },
        token,
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      await json([{ id: sessionId, title: 'S' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`) {
      await json([
        {
          info: { id: 'msg_1', role: 'assistant', sessionID: sessionId },
          parts: [{ id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'h' }],
        },
      ]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`) {
      await json({ id: sessionId, title: 'S' });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/files`) {
      await json([]);
      return;
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  await page.goto('/');
  await page.getByPlaceholder('Local directory path').fill('C:/repo');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Open details' }).first().click();
  await page.waitForURL(`**/workspaces/${workspaceId}/sessions`);

  // Wait for first connection to subscribe.
  await page.waitForFunction(() => {
    const sockets = (window as any).__realtimeSockets;
    const ws = Array.isArray(sockets) ? sockets[0] : null;
    if (!ws || !Array.isArray(ws.sent)) return false;
    return ws.sent.some((s: unknown) => typeof s === 'string' && s.includes('"type":"subscribe"'));
  });

  const snapshot1 = {
    type: 'snapshot',
    payload: {
      state: {
        schemaVersion: 1,
        workspaceId,
        subscriptions: { sessionIds: [sessionId] },
        sessions: { byId: { [sessionId]: { id: sessionId, status: 'idle' } }, order: [sessionId] },
        messages: {
          byId: { msg_1: { id: 'msg_1', sessionID: sessionId, role: 'assistant' } },
          idsBySessionId: { [sessionId]: ['msg_1'] },
        },
        parts: {
          byId: { part_1: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'h' } },
          idsByMessageId: { msg_1: ['part_1'] },
        },
        permissions: { needsRefreshBySessionId: {} },
        questions: { needsRefreshBySessionId: {} },
      },
    },
  };

  await page.evaluate(
    ({ msg }) => {
      const sockets = (window as any).__realtimeSockets;
      const ws = Array.isArray(sockets) ? sockets[0] : null;
      if (!ws) throw new Error('First FakeRealtimeWebSocket missing');
      ws._receive(JSON.stringify(msg));
    },
    { msg: snapshot1 },
  );
  await expect(page.getByText('h', { exact: true })).toBeVisible();

  // Drop the first WS to trigger reconnect.
  await page.evaluate(() => {
    const sockets = (window as any).__realtimeSockets;
    const ws = Array.isArray(sockets) ? sockets[0] : null;
    if (!ws) throw new Error('First FakeRealtimeWebSocket missing');
    ws.close(1006, 'drop');
  });

  // Wait for the second connection.
  await page.waitForFunction(() => {
    const sockets = (window as any).__realtimeSockets;
    if (!Array.isArray(sockets) || sockets.length < 2) return false;
    const ws = sockets[1];
    if (!ws || !Array.isArray(ws.sent)) return false;
    return ws.sent.some((s: unknown) => typeof s === 'string' && s.includes('"type":"subscribe"'));
  });

  // Reconnect is snapshot-based; new snapshot contains already-produced output.
  const snapshot2 = {
    type: 'snapshot',
    payload: {
      state: {
        schemaVersion: 1,
        workspaceId,
        subscriptions: { sessionIds: [sessionId] },
        sessions: { byId: { [sessionId]: { id: sessionId, status: 'busy' } }, order: [sessionId] },
        messages: {
          byId: { msg_1: { id: 'msg_1', sessionID: sessionId, role: 'assistant' } },
          idsBySessionId: { [sessionId]: ['msg_1'] },
        },
        parts: {
          byId: { part_1: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'he' } },
          idsByMessageId: { msg_1: ['part_1'] },
        },
        permissions: { needsRefreshBySessionId: {} },
        questions: { needsRefreshBySessionId: {} },
      },
    },
  };

  await page.evaluate(
    ({ msg }) => {
      const sockets = (window as any).__realtimeSockets;
      const ws = Array.isArray(sockets) ? sockets[1] : null;
      if (!ws) throw new Error('Second FakeRealtimeWebSocket missing');
      ws._receive(JSON.stringify(msg));
    },
    { msg: snapshot2 },
  );

  await expect(page.getByText('he', { exact: true })).toBeVisible();
});

test('realtime ws mock: ws failure falls back to EventSource', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_1';

  await page.addInitScript(() => {
    class FakeEventSource {
      url: string;
      onmessage: ((event: { data: string }) => void) | null;
      onerror: (() => void) | null;
      onopen: (() => void) | null;
      _closed: boolean;

      constructor(url: string) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        this.onopen = null;
        this._closed = false;
        (window as any).__lastEventSource = this;
        setTimeout(() => {
          if (this._closed) return;
          this.onopen?.();
        }, 0);
      }

      close() {
        this._closed = true;
      }
    }

    const RealWebSocket = window.WebSocket;

    class FailingRealtimeWebSocket {
      url: string;
      readyState: number;
      onopen: ((ev: Event) => void) | null;
      onmessage: ((ev: MessageEvent) => void) | null;
      onerror: ((ev: Event) => void) | null;
      onclose: ((ev: CloseEvent) => void) | null;

      constructor(url: string) {
        this.url = url;
        this.readyState = 0;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        // Never open; close immediately to trigger retry/fallback.
        setTimeout(() => {
          this.readyState = 3;
          this.onclose?.({ code: 1006, reason: 'mock fail' } as CloseEvent);
        }, 0);
      }

      send(_data: string) {
        // ignore
      }

      close(code?: number, reason?: string) {
        this.readyState = 3;
        this.onclose?.({ code, reason } as CloseEvent);
      }
    }

    (window as any).EventSource = FakeEventSource as unknown as typeof EventSource;
    (window as any).WebSocket = function (url: any, protocols?: any) {
      if (typeof url === 'string' && url.includes('/stream/ws')) {
        return new FailingRealtimeWebSocket(url);
      }
      return new (RealWebSocket as any)(url, protocols);
    } as any;
  });

  await page.route('**/api/v1/workspaces/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify(data),
      });
    };

    if (path === '/api/v1/workspaces/connect') {
      let connectBody: unknown = null;
      try {
        connectBody = req.postDataJSON();
      } catch {
        connectBody = null;
      }
      const rec = isJsonRecord(connectBody) ? connectBody : null;

      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: 'C:/repo',
          status: 'ready',
          createdAt: Date.now(),
          capabilities: {
            chat: true,
            events: true,
            reviewDiffs: false,
            inlineComments: false,
            fileRead: false,
            fileSearch: false,
            commands: false,
            agents: false,
            models: false,
            permissions: false,
            questions: false,
          },
        },
        token,
        // Port mode should include serverPort.
        ...(rec && typeof rec.serverPort === 'number' ? {} : {}),
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      await json([{ id: sessionId, title: 'S' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`) {
      await json([]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`) {
      await json({ id: sessionId, title: 'S' });
      return;
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  await page.goto('/');
  await page.getByPlaceholder('Local directory path').fill('C:/repo');

  // Force port mode to ensure WS is attempted.
  await page.getByRole('combobox').first().selectOption('port');
  await page.getByPlaceholder('Server port (e.g. 3000)').fill('3009');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Open details' }).first().click();
  await page.waitForURL(`**/workspaces/${workspaceId}/sessions`);

  // Wait for fallback to construct an EventSource.
  await page.waitForFunction(() => {
    const es = (window as any).__lastEventSource;
    return !!es && typeof es.url === 'string' && es.url.includes('/events');
  });
});

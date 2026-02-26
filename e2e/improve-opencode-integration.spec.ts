import { expect, test } from '@playwright/test';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

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
    __lastEventSource?: FakeEventSourceLike;
  }
}

type WorkspaceCapabilities = {
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

test('connect-by-port + model picker + message pagination (no /sessions spam)', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_1';

  const capabilities: WorkspaceCapabilities = {
    chat: true,
    events: true,
    reviewDiffs: false,
    inlineComments: false,
    fileRead: true,
    fileSearch: false,
    commands: true,
    agents: true,
    models: true,
    permissions: false,
    questions: false,
  };

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
        window.__lastEventSource = this;
        setTimeout(() => {
          if (this._closed) return;
          if (this.onopen) this.onopen();
        }, 0);
      }

      close() {
        this._closed = true;
      }
    }

    window.EventSource = FakeEventSource as unknown as typeof EventSource;
  });

  const calls: Record<string, number> = Object.create(null);
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };

  let connectBody: unknown = null;
  let promptBody: unknown = null;
  let lastMessagesQuery: Record<string, string> | null = null;

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
      try {
        connectBody = req.postDataJSON();
      } catch {
        connectBody = null;
      }
      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: 'C:/repo',
          status: 'ready',
          createdAt: Date.now(),
          capabilities,
        },
        token,
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/events`) {
      bump('events');
      await route.fulfill({ status: 204, body: '' });
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

      // Capture the last query params so the test can assert cursor behavior.
      lastMessagesQuery = Object.fromEntries(url.searchParams.entries());

      const cursor = url.searchParams.get('cursor');
      if (cursor) {
        await json([
          {
            info: { id: 'msg_1', role: 'assistant', sessionID: sessionId },
            parts: [{ id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'older' }],
          },
        ]);
        return;
      }

      await json([
        {
          info: { id: 'msg_2', role: 'assistant', sessionID: sessionId },
          parts: [{ id: 'part_2', type: 'text', messageID: 'msg_2', sessionID: sessionId, text: 'latest' }],
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
      bump('session.prompt');
      try {
        promptBody = req.postDataJSON();
      } catch {
        promptBody = null;
      }
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/agents`) {
      bump('agents');
      await json([{ name: 'Sisyphus', description: 'Test agent', hidden: false, mode: 'subagent' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/commands`) {
      bump('commands');
      await json([{ name: 'help', description: 'Help' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/models`) {
      bump('models');
      await json({
        all: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: {
              'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o' },
              'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
            },
          },
        ],
        default: {},
      });
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
  await page.getByRole('combobox').first().selectOption('port');
  await page.getByPlaceholder('Server port (e.g. 3000)').fill('3009');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Open details' }).first().click();

  await page.waitForURL(`**/workspaces/${workspaceId}/sessions`);

  // Connect request carries serverPort and omits autoApprove in port mode.
  const connectRec = isJsonRecord(connectBody) ? connectBody : null;
  expect(connectRec?.serverPort).toBe(3009);
  expect(connectRec?.autoApprove).toBe(undefined);

  // Model picker supports search + grouped select. Select a model.
  await page.getByPlaceholder('Search models…').fill('gpt-4o');
  await page.locator('.model-picker select').selectOption('openai:gpt-4o');

  // Initial messages loaded.
  await expect(page.getByText('latest')).toBeVisible();

  const sessionsBefore = calls['sessions'] ?? 0;

  // Send a prompt and ensure model is sent as { providerID, modelID }.
  const composer = page.locator('textarea').first();
  await composer.fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => calls['session.prompt'] ?? 0).toBeGreaterThan(0);
  const promptRec = isJsonRecord(promptBody) ? promptBody : null;
  expect(promptRec?.model).toEqual({ providerID: 'openai', modelID: 'gpt-4o' });

  // Emit noisy session.* SSE events; should not refetch /sessions.
  // SessionPage may attempt WS first; wait until the SSE fallback attaches.
  await page.waitForFunction(() => {
    const es = window.__lastEventSource;
    return !!es && typeof es.onmessage === 'function';
  });
  await page.evaluate((events) => {
    const es = window.__lastEventSource;
    if (!es) throw new Error('FakeEventSource instance not found');
    for (const e of events) {
      if (es._closed) return;
      if (es.onmessage) es.onmessage({ data: JSON.stringify(e) });
    }
  }, [
    { type: 'session.status', properties: { sessionID: sessionId, status: { type: 'busy' } } },
    { type: 'session.idle', properties: { sessionID: sessionId } },
  ]);

  await expect.poll(() => calls['sessions'] ?? 0).toBe(sessionsBefore);

  // Pagination: load older messages uses cursor.
  await page.getByRole('button', { name: 'Load older' }).click();
  await expect(page.getByText('older', { exact: true })).toBeVisible();
  expect(lastMessagesQuery?.cursor).toBe('msg_2');
});

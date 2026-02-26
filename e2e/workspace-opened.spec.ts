import { expect, test } from '@playwright/test';

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

test('workspace-opened core flows (SSE + prompt + diff + permissions)', async ({ page }) => {
  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_123';

  let shared = false;

  const capabilities: WorkspaceCapabilities = {
    chat: true,
    events: true,
    reviewDiffs: true,
    inlineComments: true,
    fileRead: true,
    fileSearch: true,
    commands: true,
    agents: true,
    models: true,
    permissions: true,
    questions: true,
  };

  // Seed localStorage so SessionPage doesn't redirect to home.
  await page.addInitScript(
    ([wsId, tok, sessId, caps]) => {
      const state = {
        version: 1,
        activeWorkspaceId: wsId,
        workspaces: [
          {
            workspace: {
              id: wsId,
              provider: 'opencode.local',
              status: 'ready',
              createdAt: Date.now(),
              capabilities: caps,
            },
            token: tok,
            lastSessionId: sessId,
          },
        ],
      };
      localStorage.setItem('ai-cockpit.workspaces.v1', JSON.stringify(state));
    },
    [workspaceId, token, sessionId, capabilities] as const,
  );

  // Mock EventSource; we will emit SSE events *after* initial REST hydration.
  // SessionPage fetches `/messages` on mount and overwrites `rawMessages`, so sending
  // streaming events too early can be lost.
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

        // Defer to allow handlers to be attached.
        setTimeout(() => {
          if (this._closed) return;
          if (this.onopen) this.onopen();
        }, 0);
      }

      close() {
        this._closed = true;
      }
    }

    (window as any).EventSource = FakeEventSource;
  });

  // Minimal in-memory "backend" for the session page.
  const calls: Record<string, number> = Object.create(null);
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };

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

    if (path === `/api/v1/workspaces/${workspaceId}/events`) {
      // EventSource is mocked; keep this for safety if something still hits the network.
      bump('events');
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      bump('sessions');
      await json([{ id: sessionId, title: 'Test Session' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`) {
      bump('session.get');
      if (req.method() === 'GET') {
        await json({ id: sessionId, title: 'Test Session', shareUrl: shared ? 'https://example.com/s/share' : '' });
        return;
      }
      if (req.method() === 'PATCH') {
        bump('session.patch');
        await json({ id: sessionId, ok: true });
        return;
      }
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/share`) {
      bump('session.share');
      shared = true;
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/unshare`) {
      bump('session.unshare');
      shared = false;
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/revert`) {
      bump('session.revert');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/unrevert`) {
      bump('session.unrevert');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/summarize`) {
      bump('session.summarize');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`) {
      bump('messages');
      await json([
        {
          info: {
            id: 'msg_1',
            role: 'assistant',
            sessionID: sessionId,
            agent: 'Sisyphus',
            cost: 0.001,
          },
          parts: [{ id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'h' }],
        },
      ]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/agents`) {
      bump('agents');
      await json([{ name: 'Sisyphus', description: 'Test agent', mode: 'subagent', hidden: false }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/commands`) {
      bump('commands');
      await json([{ name: 'help', description: 'Show help' }]);
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
            },
          },
        ],
        default: {},
        connected: [],
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/diffs`) {
      bump('diffs');
      await json([
        {
          file: 'src/a.ts',
          before: 'old',
          after: 'new',
          additions: 1,
          deletions: 1,
        },
      ]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/files`) {
      bump('files');
      await json([{ name: 'src', path: 'src', type: 'dir' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/files/content`) {
      bump('file.content');
      await json({ content: 'hello' });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/paths/search`) {
      bump('paths.search');
      await json(['src/a.ts']);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/permissions`) {
      bump('permissions');
      await json([{ sessionID: sessionId, permissionID: 'perm_1', prompt: 'allow?' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/permissions/respond`) {
      bump('permissions.respond');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/questions`) {
      bump('questions');
      await json([{ requestID: 'q_1', title: 'Pick one', options: ['A', 'B'] }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/questions/reply`) {
      bump('questions.reply');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/questions/reject`) {
      bump('questions.reject');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/command`) {
      bump('session.command');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/prompt`) {
      bump('session.prompt');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/shell`) {
      bump('session.shell');
      await json({ ok: true });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/abort`) {
      bump('session.abort');
      await json({ ok: true });
      return;
    }

    // Default fallback
    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  const messagesPath = `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/messages`;
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes(messagesPath) && resp.status() === 200),
    page.goto(`/workspaces/${workspaceId}/sessions/${sessionId}`),
  ]);

  // SessionPage may attempt WS realtime first; wait until the SSE fallback attaches.
  await page.waitForFunction(() => {
    const es = (window as any).__lastEventSource;
    return !!es && typeof es.onmessage === 'function';
  });

  // Emit SSE events after initial message fetch so the updates stick.
  await page.evaluate((events) => {
    const es = (window as any).__lastEventSource;
    if (!es) throw new Error('FakeEventSource instance not found');
    for (const e of events) {
      if (es._closed) return;
      if (es.onmessage) es.onmessage({ data: JSON.stringify(e) });
    }
  }, [
    { type: 'session.status', properties: { sessionID: sessionId, status: { type: 'busy' } } },
    {
      type: 'message.updated',
      properties: { info: { id: 'msg_1', role: 'assistant', sessionID: sessionId, agent: 'Sisyphus', cost: 0.001 } },
    },
    {
      type: 'message.part.updated',
      properties: {
        part: { id: 'part_1', type: 'text', messageID: 'msg_1', sessionID: sessionId, text: 'he' },
        delta: 'e',
      },
    },
    {
      type: 'message.part.updated',
      properties: {
        part: { id: 'part_r', type: 'reasoning', messageID: 'msg_1', sessionID: sessionId, text: 'secret' },
      },
    },
    {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part_tool',
          type: 'tool',
          messageID: 'msg_1',
          sessionID: sessionId,
          tool: 'bash',
          callID: 'call_1',
          state: { status: 'completed', input: { command: 'ls' }, output: 'ok' },
        },
      },
    },
  ]);

  // SSE should update the assistant text part from "h" -> "he".
  await expect(page.getByText(/\bhe\b/)).toBeVisible();

  // Reasoning parts are hidden by default.
  await expect(page.getByText('secret')).toHaveCount(0);
  await page.getByLabel('Reasoning').click();
  await expect(page.getByText('secret')).toBeVisible();

  // Tool parts render when Tools toggle is on (default).
  await expect(page.locator('.tool-header').getByText('bash', { exact: true })).toBeVisible();

  // Session actions: share/unshare.
  await page.getByRole('button', { name: 'Share' }).click();
  await expect.poll(() => calls['session.share'] ?? 0).toBeGreaterThan(0);
  await expect(page.getByText(/Share URL:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unshare' })).toBeVisible();
  await page.getByRole('button', { name: 'Unshare' }).click();
  await expect.poll(() => calls['session.unshare'] ?? 0).toBeGreaterThan(0);
  await expect(page.getByText(/Share URL:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();

  // Session actions: revert/unrevert/summarize.
  await page.getByRole('button', { name: 'Revert', exact: true }).click();
  await expect.poll(() => calls['session.revert'] ?? 0).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Unrevert' }).click();
  await expect.poll(() => calls['session.unrevert'] ?? 0).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect.poll(() => calls['session.summarize'] ?? 0).toBeGreaterThan(0);

  // Prompt input: @ agent insertion.
  const composer = page.locator('textarea').first();
  await composer.fill('@');
  await expect(page.getByRole('button', { name: 'Sisyphus' })).toBeVisible();
  await page.getByRole('button', { name: 'Sisyphus' }).click();
  await expect(composer).toHaveValue('@Sisyphus ');

  // Prompt input: / command insertion.
  await composer.fill('/');
  await expect(page.getByRole('button', { name: '/help' })).toBeVisible();
  await page.getByRole('button', { name: '/help' }).click();
  await expect(composer).toHaveValue('/help ');

  // Abort should be available when session is busy.
  await page.getByRole('button', { name: 'Abort' }).click();
  await expect.poll(() => calls['session.abort'] ?? 0).toBeGreaterThan(0);

  // Review: unified diff shows removed/added lines.
  await page.getByRole('button', { name: 'Review' }).click();
  const diffFile = page.locator('.review-files').getByText('src/a.ts', { exact: true });
  await expect(diffFile).toBeVisible();
  await diffFile.click();
  await expect(page.getByText('- old')).toBeVisible();
  await expect(page.getByText('+ new')).toBeVisible();

  // Inline selection -> inject into prompt.
  await page.getByText('- old').click();

  // Inline comment: local-only, should render in the review panel.
  await page.locator('.diff-comment-input').fill('Looks good');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page.getByText('Looks good')).toBeVisible();

  await page.getByRole('button', { name: 'Add selection to prompt' }).click();
  await expect(composer).toHaveValue(/Diff selection: src\/a\.ts/);

  // Permissions + questions UI in Context tab.
  await page.getByRole('button', { name: 'Context' }).click();
  await expect(page.locator('.context-section-header').getByText('Permissions', { exact: true })).toBeVisible();
  await expect(page.getByText('sess_123 · perm_1')).toBeVisible();

  // Context summary should render cost + agent.
  await expect(page.getByText(/Total cost:\s*0\.001000/)).toBeVisible();
  await expect(page.getByText('Last agent: Sisyphus')).toBeVisible();
  await expect(page.locator('.context-details').getByText('"msg_1"').first()).toBeVisible();

  // Auto-accept should respond to pending permissions.
  await page.getByLabel('Auto-accept (always)').click();
  await expect.poll(() => calls['permissions.respond'] ?? 0).toBeGreaterThan(0);

  await expect(page.locator('.context-section-header').getByText('Questions', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Reply answers (one per line)…').fill('A');
  await page.getByRole('button', { name: 'Reply' }).click();
  await expect.poll(() => calls['questions.reply'] ?? 0).toBeGreaterThan(0);

  // Command palette: Ctrl+P opens, selecting /help triggers command endpoint.
  await page.keyboard.press('Control+P');
  await expect(page.getByPlaceholder('Search commands and files…')).toBeVisible();
  await page.getByPlaceholder('Search commands and files…').fill('help');
  await page.getByText('/help').click();
  await expect.poll(() => calls['session.command'] ?? 0).toBeGreaterThan(0);
});

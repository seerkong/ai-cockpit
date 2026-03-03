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
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.message || err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const workspaceId = 'ws_1';
  const token = 'tok_1';
  const sessionId = 'sess_123';

  let shared = false;
  let permissionsCleared = false;

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

  // Mock WebSocket realtime stream (avoid network + allow deterministic snapshot/patch injections).
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
        (window as any).__lastRealtimeWebSocket = this;
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

    if (path === `/api/v1/workspaces/${workspaceId}/connections` && req.method() === 'GET') {
      bump('connections');
      await json({
        connections: [
          {
            id: workspaceId,
            workspaceId,
            directory: 'C:/repo',
            label: 'conn-1',
            mode: 'spawn',
            status: 'idle',
          },
        ],
      });
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      bump('sessions');
      await json([{ id: sessionId, title: 'Test Session' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/bind` && req.method() === 'POST') {
      bump('session.bind');
      await json({ ok: true });
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
      await json({ ok: true, url: 'https://example.com/s/share' });
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
      if (permissionsCleared) {
        await json([]);
        return;
      }
      await json([{ sessionID: sessionId, id: 'perm_1', title: 'Permission required', prompt: 'allow?' }]);
      return;
    }

    if (path === `/api/v1/workspaces/${workspaceId}/permissions/respond`) {
      bump('permissions.respond');
      permissionsCleared = true;
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
    page.goto(`/work?connId=${workspaceId}&sessionId=${sessionId}`),
  ]);

  // Navigation regression guard: switching between /workspace and /work should not
  // crash Dockview disposal (NotFoundError: removeChild) or leave the page blank.
  await page.getByTitle('Workspaces').click();
  await expect(page.getByText('Workspace path config')).toBeVisible();
  await page.getByTitle('Session Details').click();
  await expect(page.locator('.session-dockview')).toBeVisible();

  // Allow pending unmount/mount tasks to surface errors.
  await page.waitForTimeout(50);
  const allErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
  expect(allErrors).not.toContain('Failed to execute');
  expect(allErrors).not.toContain('removeChild');

  // Ensure the client subscribed before we inject state.
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
        sessions: { byId: { [sessionId]: { id: sessionId, status: 'busy' } }, order: [sessionId] },
        messages: {
          byId: { msg_1: { id: 'msg_1', sessionID: sessionId, role: 'assistant' } },
          idsBySessionId: { [sessionId]: ['msg_1'] },
        },
        parts: {
          byId: {
            part_1: { id: 'part_1', messageID: 'msg_1', sessionID: sessionId, type: 'text', text: 'h' },
            part_r: { id: 'part_r', messageID: 'msg_1', sessionID: sessionId, type: 'reasoning', text: 'secret' },
            part_tool: {
              id: 'part_tool',
              messageID: 'msg_1',
              sessionID: sessionId,
              type: 'tool',
              tool: 'bash',
              callID: 'call_1',
              state: { status: 'completed', input: { command: 'ls' }, output: 'ok' },
            },
          },
          idsByMessageId: { msg_1: ['part_1', 'part_r', 'part_tool'] },
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
          path: '/parts/byId/part_1/text',
          value: 'he',
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

  // WS patch should update the assistant text part from "h" -> "he".
  await expect(page.getByText('he', { exact: true })).toBeVisible();

  // Reasoning parts are hidden by default.
  await expect(page.getByText('secret')).toHaveCount(0);
  await page.getByTitle('View options').click();
  await page.getByLabel('Reasoning').click();
  await expect(page.getByText('secret')).toBeVisible();

  // Tool parts render when Tools toggle is on (default).
  await expect(page.locator('.tool-header').getByText('bash', { exact: true })).toBeVisible();

  // Permission dock blocks the composer until granted.
  const permissionDock = page.locator('.dock').filter({ hasText: 'Permission' }).first();
  await expect(permissionDock.getByRole('button', { name: 'Always' })).toBeVisible();
  await permissionDock.getByRole('button', { name: 'Always' }).click();
  await expect.poll(() => calls['permissions.respond'] ?? 0).toBeGreaterThan(0);

  // Session actions: share/unshare.
  const actionsMenu = page.locator('.actions-menu');
  const openActionsMenu = async () => {
    if (await actionsMenu.isVisible()) return;
    await page.getByRole('button', { name: 'More' }).click();
    await expect(actionsMenu).toBeVisible();
  };

  await openActionsMenu();
  await actionsMenu.getByRole('button', { name: 'Share' }).click();
  await expect.poll(() => calls['session.share'] ?? 0).toBeGreaterThan(0);
  await expect(page.getByText(/Share URL:/)).toBeVisible();

  await openActionsMenu();
  await expect(actionsMenu.getByRole('button', { name: 'Unshare' })).toBeVisible();
  await actionsMenu.getByRole('button', { name: 'Unshare' }).click();
  await expect.poll(() => calls['session.unshare'] ?? 0).toBeGreaterThan(0);
  await expect(page.getByText(/Share URL:/)).toHaveCount(0);
  await openActionsMenu();
  await expect(actionsMenu.getByRole('button', { name: 'Share' })).toBeVisible();
  // Close the menu so subsequent toggles are deterministic.
  await page.keyboard.press('Escape');

  // Session actions: revert/unrevert/summarize.
  await openActionsMenu();
  await actionsMenu.getByRole('button', { name: 'Revert', exact: true }).click();
  await expect.poll(() => calls['session.revert'] ?? 0).toBeGreaterThan(0);

  await openActionsMenu();
  await actionsMenu.getByRole('button', { name: 'Unrevert' }).click();
  await expect.poll(() => calls['session.unrevert'] ?? 0).toBeGreaterThan(0);

  await openActionsMenu();
  await actionsMenu.getByRole('button', { name: 'Summarize' }).click();
  await expect.poll(() => calls['session.summarize'] ?? 0).toBeGreaterThan(0);

  // Prompt input: @ agent insertion.
  const composer = page.locator('textarea').first();
  await expect(composer).toBeEnabled();
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
  await page.locator('.dv-tabs-and-actions-container').getByText('Review', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  const diffFile = page.locator('.review-files').getByText('src/a.ts', { exact: true });
  await expect(diffFile).toBeVisible();
  await diffFile.click();
  await expect(page.getByText('- old')).toBeVisible();
  await expect(page.getByText('+ new')).toBeVisible();

  // Permissions + questions UI in Context tab.
  await page.locator('.dv-tabs-and-actions-container').getByText('Context', { exact: true }).first().click();
  await expect(page.locator('.context-section-header').getByText('Permissions', { exact: true })).toBeVisible();
  await expect(page.getByText('No pending permissions.')).toBeVisible();

  // Context summary should render cost + agent.
  await expect(page.getByText(/Total cost:\s*0\.001000/)).toBeVisible();
  await expect(page.getByText('Last agent: Sisyphus')).toBeVisible();

  // Expand the first raw message row and assert JSON contains msg id.
  await page.locator('.raw-msg-row-summary').first().click();
  await expect(page.locator('.context-details').getByText('"msg_1"').first()).toBeVisible();

  // Permission response happened via PermissionDock (composer unblock).
  await expect.poll(() => calls['permissions.respond'] ?? 0).toBeGreaterThan(0);

  await expect(page.locator('.context-section-header').getByText('Questions', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Reply answers (one per line)…').fill('A');
  await page.getByRole('button', { name: 'Reply' }).click();
  await expect.poll(() => calls['questions.reply'] ?? 0).toBeGreaterThan(0);

  // Slash command execution should trigger command endpoint.
  await composer.fill('/help');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => calls['session.command'] ?? 0).toBeGreaterThan(0);
});

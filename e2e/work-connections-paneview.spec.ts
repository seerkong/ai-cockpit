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

test('work: Connections paneview renders and items are clickable', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.message || err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      pageErrors.push(`console.error: ${msg.text()}`);
    }
  });

  const ws1 = { id: 'ws_1', token: 'tok_1', directory: 'C:/repo' };
  const ws2 = { id: 'ws_2', token: 'tok_2', directory: 'C:/repo2' };

  const calls: Record<string, number> = Object.create(null);
  const bump = (key: string) => {
    calls[key] = (calls[key] ?? 0) + 1;
  };

  const capabilities: WorkspaceCapabilities = {
    chat: true,
    events: false,
    reviewDiffs: false,
    inlineComments: false,
    fileRead: false,
    fileSearch: false,
    commands: true,
    agents: true,
    models: true,
    permissions: false,
    questions: false,
  };

  await page.addInitScript(
    ([w1, w2, caps]) => {
      const state = {
        version: 1,
        activeWorkspaceId: w1.id,
        workspaces: [
          {
            workspace: {
              id: w1.id,
              provider: 'opencode.local',
              directory: w1.directory,
              status: 'ready',
              createdAt: Date.now(),
              capabilities: caps,
            },
            token: w1.token,
            lastSessionId: '',
          },
          {
            workspace: {
              id: w2.id,
              provider: 'opencode.local',
              directory: w2.directory,
              status: 'ready',
              createdAt: Date.now() - 1,
              capabilities: caps,
            },
            token: w2.token,
            lastSessionId: '',
          },
        ],
      };
      localStorage.setItem('ai-cockpit.workspaces.v1', JSON.stringify(state));
    },
    [ws1, ws2, capabilities] as const,
  );

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

    const handleConnections = async (workspaceId: string, directory: string, status: 'idle' | 'busy') => {
      await json({
        connections: [
          {
            id: workspaceId,
            workspaceId,
            directory,
            label: workspaceId,
            mode: 'port',
            status,
            serverPort: 3000,
          },
        ],
      });
    };

    if (path === `/api/v1/workspaces/${ws1.id}/connections`) {
      bump('ws1.connections');
      await handleConnections(ws1.id, ws1.directory, 'idle');
      return;
    }

    if (path === `/api/v1/workspaces/${ws2.id}/connections`) {
      bump('ws2.connections');
      await handleConnections(ws2.id, ws2.directory, 'busy');
      return;
    }

    // Session loading chain (select connection triggers this in background)
    if (path.endsWith('/agents')) {
      await json([]);
      return;
    }
    if (path.endsWith('/commands')) {
      await json([]);
      return;
    }
    if (path.endsWith('/models')) {
      await json({ all: [] });
      return;
    }
    if (path.endsWith('/sessions')) {
      if (req.method() === 'GET') {
        await json([{ id: 'sess_1', title: 'S' }]);
        return;
      }
      if (req.method() === 'POST') {
        await json({ id: 'sess_1' });
        return;
      }
    }
    if (path.includes('/sessions/') && path.endsWith('/bind')) {
      await json({ ok: true });
      return;
    }
    if (path.includes('/sessions/') && path.endsWith('/messages')) {
      await json([]);
      return;
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404);
  });

  await page.goto('/work');

  // Fail fast if the app crashed.
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);

  // Ensure the page actually requested connection lists.
  await expect
    .poll(() => calls['ws1.connections'] ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => calls['ws2.connections'] ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);

  const connectionsPanel = page.locator('.connections-panel');

  // Paneview sections should exist.
  await expect(connectionsPanel.getByText('Idle', { exact: true })).toBeVisible();
  await expect(connectionsPanel.getByText('Active', { exact: true })).toBeVisible();

  // Active section should render busy connection.
  // If the section isn't expanded by default, click the header to expand.
  await connectionsPanel.getByText('Active', { exact: true }).click();
  await expect(connectionsPanel.getByText(ws2.directory, { exact: true })).toBeVisible();

  // Clicking a connection should activate it and update route query.
  await connectionsPanel.getByText(ws2.directory, { exact: true }).click();
  await expect(page).toHaveURL(/\bconnId=ws_2\b/);
  await expect(connectionsPanel.locator('.session-item.active')).toContainText(ws2.directory);

  // Toolbar menu should open New Connection modal.
  await page.getByRole('button', { name: 'Connection' }).click();
  await page.getByRole('button', { name: 'New Connection' }).click();
  await expect(page.getByText('New Connection')).toBeVisible();
});

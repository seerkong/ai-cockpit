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
  // Keep both connections in the same directory so the connections pool merge logic
  // (anchored by the active workspace directory) includes both.
  const ws2 = { id: 'ws_2', token: 'tok_2', directory: 'C:/repo' };

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

  const ws2Row = connectionsPanel.locator('.session-item').filter({ hasText: 'ws_2 · port' }).first();
  await expect(ws2Row).toBeVisible();

  // Clicking a connection should activate it and update route query.
  // Dockview can intermittently overlay sashes/headers over the list in headless.
  // Trigger the click via DOM to avoid pointer interception flake.
  await ws2Row.evaluate((el) => (el as HTMLElement).click());

  await expect(connectionsPanel.locator('.session-item.active')).toContainText('ws_2 · port');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('connId'))
    .toBe('ws_2');

  // Toolbar menu should open New Connection modal.
  await page.getByRole('button', { name: 'Connection' }).click();
  await page.getByRole('button', { name: 'New Connection' }).click();
  await expect(page.getByText('New Connection')).toBeVisible();
});

test('work: Settings tab renders stalled auto-recover controls', async ({ page }) => {
  const ws1 = { id: 'ws_1', token: 'tok_1', directory: 'C:/repo' };

  await page.addInitScript(
    ([w1]) => {
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
              capabilities: {
                chat: true,
                events: true,
                reviewDiffs: false,
                inlineComments: false,
                fileRead: false,
                fileSearch: false,
                commands: true,
                agents: true,
                models: true,
                permissions: true,
                questions: true,
              },
            },
            token: w1.token,
            lastSessionId: '',
          },
        ],
      };
      localStorage.setItem('ai-cockpit.workspaces.v1', JSON.stringify(state));
    },
    [ws1] as const,
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

    if (path === `/api/v1/workspaces/${ws1.id}/connections`) {
      await json({
        connections: [
          {
            id: ws1.id,
            workspaceId: ws1.id,
            directory: ws1.directory,
            label: ws1.id,
            mode: 'port',
            status: 'idle',
            serverPort: 3000,
          },
        ],
      });
      return;
    }

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
  await page.locator('.dv-tabs-and-actions-container').getByText('Settings', { exact: true }).first().click();

  const rightPanel = page.locator('.right-panel');
  await expect(rightPanel.getByText('Run Controls', { exact: true })).toBeVisible();
  await expect(rightPanel.getByText('Auto-recover stalled session', { exact: true })).toBeVisible();
  await expect(rightPanel.getByText('Auto-accept permissions', { exact: true })).toBeVisible();
  await expect(rightPanel.getByText('Enable 15s auto refresh', { exact: true })).toBeVisible();

  const timeoutInput = rightPanel.locator("input[type='number'][min='1'][max='60']");
  await expect(timeoutInput).toBeVisible();
  await expect(timeoutInput).toHaveValue('5');
});

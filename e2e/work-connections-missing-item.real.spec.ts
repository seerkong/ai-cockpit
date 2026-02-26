import { expect, test } from '@playwright/test';

const RUN_REAL = process.env.RUN_REAL_E2E === '1';
const WORKSPACE_PATH = 'E:\\ai-dev\\oh-my-opencode-slim';

test.skip(!RUN_REAL, 'Set RUN_REAL_E2E=1 to run real backend reproduction');

test('work: new connection appears in Connections pane (real)', async ({ page }) => {
  test.setTimeout(5 * 60_000);

  const pageErrors: string[] = [];
  const connectionsCalls: Array<{ url: string; status: number; auth: boolean }> = [];
  page.on('response', (resp) => {
    const url = resp.url();
    if (!url.includes('/api/v1/workspaces/') || !url.endsWith('/connections')) return;
    const req = resp.request();
    const authHeader = req.headers()['authorization'] || '';
    connectionsCalls.push({ url, status: resp.status(), auth: Boolean(authHeader) });
  });
  const shouldIgnore = (message: string) => {
    // Vite dev server + msedge sometimes logs 404 for favicon or dev-only assets.
    if (message.includes('Failed to load resource') && message.includes('404')) return true;
    return false;
  };
  page.on('pageerror', (err) => {
    const msg = String((err as unknown as { stack?: string })?.stack || err?.message || err);
    if (!shouldIgnore(msg)) pageErrors.push(msg);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = `console.error: ${msg.text()}`;
      if (!shouldIgnore(text)) pageErrors.push(text);
    }
  });

  await page.goto('/workspace');
  // Ensure we start clean (don't clear on every navigation).
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.reload();

  // Create workspace config path.
  await page.getByPlaceholder('Local directory path').fill(WORKSPACE_PATH);
  await page.getByRole('button', { name: 'Add' }).click();

  // Select the config so New Connection modal has workspaceId.
  await page.getByText(WORKSPACE_PATH, { exact: true }).click();

  // Navigate within SPA so selectionStore survives.
  await page.getByTitle('Session Details').click();
  await expect(page).toHaveURL(/\/work\b/);

  // Wait for the dockview layout to mount.
  await expect(page.getByText('Connections', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(pageErrors, pageErrors.join('\n')).toEqual([]);

  // Open toolbar menu -> New Connection.
  await page.getByRole('button', { name: 'Connection' }).click();
  await page.getByRole('button', { name: 'New Connection' }).click();
  await expect(page.getByText('New Connection', { exact: true })).toBeVisible();

  // Ensure the workspace list is populated and select the first option.
  const workspaceSelect = page.locator('#new-connection-workspace');
  await expect(workspaceSelect.locator('option')).toHaveCount(1, { timeout: 10_000 });
  const firstValue = await workspaceSelect.locator('option').first().getAttribute('value');
  if (firstValue) {
    await workspaceSelect.selectOption(firstValue);
  }

  // Create spawn connection (default).
  await page.getByRole('button', { name: 'Create' }).click();

  // Wait for modal to close.
  await expect(page.getByText('New Connection', { exact: true })).toBeHidden({ timeout: 180_000 });

  // Wait for the URL to pick up the connection id.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('connId') || '', { timeout: 180_000 })
    .not.toEqual('');

  const connId = new URL(page.url()).searchParams.get('connId') || '';
  expect(connId).not.toEqual('');

  // Fetch connections payload for this workspace (debug; should include at least one connection).
  const apiToken = await page.evaluate(() => {
    try {
      return localStorage.getItem('auth-token') || '';
    } catch {
      return '';
    }
  });
  const connectionsPayload = await page.evaluate(async ({ connId, apiToken }) => {
    const resp = await fetch(`/api/v1/workspaces/${encodeURIComponent(connId)}/connections`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  }, { connId, apiToken });
  console.log('connections payload:', connectionsPayload.status, connectionsPayload.ok);
  console.log((connectionsPayload.text || '').slice(0, 2000));
  console.log('app /connections calls:', JSON.stringify(connectionsCalls, null, 2));

  const vueDebug = await page.evaluate(() => {
    const el = document.querySelector('.connections-panel');
    const inst = (el as any)?.__vueParentComponent;
    const props = inst?.props;
    const connections = props?.connections;
    return {
      hasEl: Boolean(el),
      hasInst: Boolean(inst),
      typeComponentsKeys: inst?.type?.components ? Object.keys(inst.type.components) : [],
      appComponentsHasBucket: Boolean(inst?.appContext?.components?.connectionsBucketPane),
      propsKeys: props ? Object.keys(props) : [],
      connectionsType: Array.isArray(connections) ? 'array' : typeof connections,
      connectionsLen: Array.isArray(connections) ? connections.length : null,
      activeConnectionId: typeof props?.activeConnectionId === 'string' ? props.activeConnectionId : null,
    };
  });
  console.log('vue debug:', JSON.stringify(vueDebug, null, 2));

  const paneDebug = await page.evaluate(() => {
    const findPane = (title: string) => {
      const headers = Array.from(document.querySelectorAll('.dv-default-header'));
      const header = headers.find((h) => (h.textContent || '').trim() === title);
      const pane = header?.closest('.dv-pane') as HTMLElement | null;
      const body = pane?.querySelector('.dv-pane-body') as HTMLElement | null;
      const bucketRoot = body?.querySelector('.bucket-body') as HTMLElement | null;
      const inst = (bucketRoot as any)?.__vueParentComponent;
      const params = inst?.props?.params;
      const conns = params?.connections;
      const nested = params?.params;
      return {
        hasHeader: Boolean(header),
        hasBody: Boolean(body),
        bodyChildCount: body ? body.childElementCount : null,
        bodyHtmlSnippet: body ? (body.innerHTML || '').slice(0, 200) : null,
        hasBucketRoot: Boolean(bucketRoot),
        hasInst: Boolean(inst),
        paramsKeys: params ? Object.keys(params) : [],
        connectionsType: Array.isArray(conns) ? 'array' : typeof conns,
        connectionsLen: Array.isArray(conns) ? conns.length : null,
        bucketId: typeof params?.bucketId === 'string' ? params.bucketId : null,
        nestedType: nested && typeof nested === 'object' ? 'object' : typeof nested,
        nestedKeys: nested && typeof nested === 'object' ? Object.keys(nested) : [],
      };
    };

    return {
      idle: findPane('Idle'),
      waiting: findPane('Waiting'),
      active: findPane('Active'),
      other: findPane('Other'),
    };
  });
  console.log('pane debug:', JSON.stringify(paneDebug, null, 2));
  if (!connectionsPayload.ok) {
    console.log(connectionsPayload.text);
  }

  // The Connections pane should contain the new connection item (path is compacted but includes basename).
  const connectionsPanel = page.locator('.connections-panel');
  await expect(connectionsPanel).toBeVisible();

  // Paneview buckets can be collapsed; ensure Active is expanded before asserting the row.
  await connectionsPanel.getByText('Active', { exact: true }).click();
  await expect(connectionsPanel.getByText('oh-my-opencode-slim')).toBeVisible({ timeout: 60_000 });
});

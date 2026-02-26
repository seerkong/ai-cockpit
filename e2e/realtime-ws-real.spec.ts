import { expect, test } from '@playwright/test';

function asText(payload: string | Buffer) {
  return typeof payload === 'string' ? payload : payload.toString('utf8');
}

test.describe('realtime ws (real env)', () => {
  test.skip(process.env.AI_COCKPIT_REAL_E2E !== '1', 'Set AI_COCKPIT_REAL_E2E=1 to run real env tests');

  test('connect-by-port + ws snapshot/patch over real opencode', async ({ page }) => {
    const workspaceDir = process.env.AI_COCKPIT_REAL_WORKSPACE_DIR ?? 'E:\\tmp\\kunun.ts';
    const port = process.env.AI_COCKPIT_REAL_OPENCODE_PORT ?? '4096';

    // Prefer the user-provided opus config.
    const providerID = process.env.AI_COCKPIT_REAL_PROVIDER_ID ?? 'anthropic-yunyi-cfd';
    const modelID = process.env.AI_COCKPIT_REAL_MODEL_ID ?? 'claude-opus-4-5-20251101';

    // Capture the realtime websocket and frames.
    const wsPromise = page.waitForEvent('websocket', (ws) => ws.url().includes('/stream/ws'));

    await page.goto('/');

    await page.getByPlaceholder('Local directory path').fill(workspaceDir);
    await page.getByRole('combobox').first().selectOption('port');
    await page.getByPlaceholder('Server port (e.g. 3000)').fill(String(port));

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Open details' }).first().click();
  await page.waitForURL('**/workspaces/**/sessions');

    const ws = await wsPromise;
    expect(ws.url()).toContain('/stream/ws');

    // The client should subscribe quickly after open.
    await ws.waitForEvent('framesent', {
      predicate: (ev) => asText(ev.payload).includes('"type":"subscribe"'),
    });

    // Server responds with a snapshot.
    await ws.waitForEvent('framereceived', {
      predicate: (ev) => asText(ev.payload).includes('"type":"snapshot"'),
    });

    // Select model (does not require a provider key if we use shell-mode later).
    await page.getByPlaceholder('Search models…').fill(modelID);
    await page.locator('.model-picker select').selectOption(`${providerID}:${modelID}`);

    // Shell-mode requires an agent. Wait until agents are loaded so the page can pick a default.
    const agentSelect = page.locator('select', { hasText: '(agent)' });
    await expect
      .poll(async () => {
        const count = await agentSelect.locator('option').count();
        return count;
      })
      .toBeGreaterThan(1);

    // Trigger an action that produces realtime events without requiring an external LLM call.
    const composer = page.locator('textarea').first();
    await composer.fill('! echo ws-e2e');
    await page.getByRole('button', { name: 'Send' }).click();

    // Expect at least one patch message after the command.
    await ws.waitForEvent('framereceived', {
      predicate: (ev) => {
        const text = asText(ev.payload);
        if (!text.includes('"type":"patch"')) return false;
        try {
          const parsed = JSON.parse(text) as { type?: unknown; payload?: any };
          return parsed?.type === 'patch' && Array.isArray(parsed?.payload?.ops) && parsed.payload.ops.length > 0;
        } catch {
          return false;
        }
      },
    });
  });
});

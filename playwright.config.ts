import { defineConfig } from '@playwright/test';

const isWindows = process.platform === 'win32';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Prefer system Edge on Windows to avoid Playwright browser downloads.
        ...(isWindows ? { channel: 'msedge' } : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'bun run --cwd backend start',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm -C frontend run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

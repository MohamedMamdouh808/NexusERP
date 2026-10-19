import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end runner (T065).
 *
 * ADVISORY, not a required check. The pipeline's mandatory gates are lint, type check,
 * unit, integration, migrations, contract and build. This suite is advisory because it
 * needs a browser and a running service, and a flaky browser run should not block a merge
 * that every mandatory gate has passed. It is still run locally and in the advisory job so
 * a regression in the shell or the health panel is visible.
 *
 * Two servers are started:
 *
 *   - the service, so the health panel has something real to read
 *   - the built web assets, so the test runs against the production bundle rather than a
 *     development transform
 *
 * Both are reused if already running, which makes `npm run test:e2e` fast on a second run.
 */

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3000';
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start --workspace @nexuserp/api',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build --workspace @nexuserp/web && npm run preview --workspace @nexuserp/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
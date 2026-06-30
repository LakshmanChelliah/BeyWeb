import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;
/** Unified game + WebSocket port (mirrors production `npm start`). */
const E2E_PORT = 8090;

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    env: { ...process.env, PORT: String(E2E_PORT), ENABLE_E2E: '1' },
    port: E2E_PORT,
    reuseExistingServer: !isCI,
  },
});

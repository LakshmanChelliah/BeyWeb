import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /(prod-camera-smoke|ui-online-friend-flow|ui-online-visuals)\.spec\.js/,
  timeout: 240000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BEYWEB_PROD_URL || 'https://beyweb-production.up.railway.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});

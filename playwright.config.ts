import { defineConfig, devices } from '@playwright/test';
import { ADMIN_TOKEN, BASE_URL, LOG_DB_PATH, PORT } from './e2e/helpers/env.js';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  // The 15-player scenarios open 16 browser contexts, so CI keeps two workers.
  workers: process.env.CI ? 2 : undefined,
  // A failed test reruns once on CI with a trace; everything else runs without one.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm start',
    url: `${BASE_URL}/healthz`,
    env: {
      PORT: String(PORT),
      ADMIN_TOKEN,
      LOG_DB_PATH,
      PUBLIC_BASE_URL: BASE_URL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

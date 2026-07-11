import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_WIDGET_URL;
if (!baseURL) {
  // Config still loads for `npx playwright test --list`; tests skip without URL
}

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: baseURL || 'http://127.0.0.1:9',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

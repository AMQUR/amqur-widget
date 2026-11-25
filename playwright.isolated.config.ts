import { defineConfig, devices } from '@playwright/test';

/**
 * Hosted isolated Railway staging (amqur-platform-staging).
 * Employee Basic Auth on HTML; canary cookie for widget-token.
 */
const baseURL = (
  process.env.STAGING_WIDGET_URL ||
  'https://widget-staging-staging.up.railway.app'
).replace(/\/$/, '');

const user = process.env.STAGING_BASIC_USER || '';
const pass = process.env.STAGING_BASIC_PASS || '';

export default defineConfig({
  testDir: './e2e/staging',
  testMatch: /isolated-hosted-journeys\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  retries: 1,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-report/isolated-hosted-results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report/isolated-hosted' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: false,
    ...(user && pass
      ? { httpCredentials: { username: user, password: pass } }
      : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'tablet',
      use: { ...devices['iPad landscape'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
});

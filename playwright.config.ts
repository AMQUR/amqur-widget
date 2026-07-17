import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.STAGING_WIDGET_URL ||
  process.env.LOCAL_WIDGET_URL ||
  'http://127.0.0.1:18084';

const isLocal = !process.env.STAGING_WIDGET_URL;

export default defineConfig({
  testDir: isLocal ? './e2e/local' : './e2e/staging',
  timeout: 60_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
  ],
});

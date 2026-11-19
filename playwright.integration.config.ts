import { defineConfig } from '@playwright/test';

/**
 * Real-backend integration run: the built widget bundle in a browser against a locally running
 * amqur-backend demo (see docs/SALES_DESK.md). Simulated inventory and the labelled sandbox
 * scheduler only. Start the backend first:
 *   (amqur-backend) npm run test:infra:up && npx prisma migrate deploy && npm run seed:local-demo && npm run start:local-demo
 *   (amqur-widget)  npm run build && npm run test:integration
 * The backend applies production-like rate limits, so this suite runs serially on two viewports.
 */
export default defineConfig({
  testDir: './e2e/integration',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results-integration',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node e2e/integration/host-server.mjs', url: 'http://localhost:5173/health', reuseExistingServer: true, timeout: 20_000 },
  projects: [
    { name: 'desktop-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});

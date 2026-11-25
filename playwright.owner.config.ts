import { defineConfig } from '@playwright/test';

/**
 * Private owner preview page (the HTML shell of the hosted `isolated-staging` and
 * `production-private` images), tested against a locally running image:
 *
 *   docker build -f Dockerfile.isolated-staging -t amqur-owner-staging:test .
 *   docker run -d --rm -p 127.0.0.1:18471:80 \
 *     -e EMPLOYEE_BASIC_AUTH_USER=owner -e EMPLOYEE_BASIC_AUTH_PASSWORD=<local test value> amqur-owner-staging:test
 *   OWNER_PAGE_URL=http://127.0.0.1:18471 OWNER_PAGE_USER=owner OWNER_PAGE_PASS=<same value> \
 *     OWNER_PAGE_PROFILE=isolated-staging npx playwright test --config playwright.owner.config.ts
 *
 * The page is the real build with its real response headers (Basic Auth, CSP). The API host it
 * is pinned to is never contacted: every API request is intercepted and answered either by
 * e2e/sandbox/sandbox-server.mjs (synthetic, labelled demo data) or by a refusal.
 */
const SANDBOX_PORT = Number(process.env.SANDBOX_PORT || 18090);
const BROWSER = (['chromium', 'firefox', 'webkit'] as const).find((b) => b === process.env.OWNER_PAGE_BROWSER) ?? 'chromium';
const user = process.env.OWNER_PAGE_USER || '';
const pass = process.env.OWNER_PAGE_PASS || '';

export default defineConfig({
  testDir: './e2e/owner-page',
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  outputDir: 'test-results-owner',
  use: {
    browserName: BROWSER,
    baseURL: (process.env.OWNER_PAGE_URL || 'http://127.0.0.1:18471').replace(/\/$/, ''),
    trace: 'retain-on-failure',
    ...(user && pass ? { httpCredentials: { username: user, password: pass } } : {}),
  },
  webServer: {
    command: 'node e2e/sandbox/sandbox-server.mjs',
    url: `http://127.0.0.1:${SANDBOX_PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});

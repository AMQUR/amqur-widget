import { defineConfig } from '@playwright/test';

/**
 * Sandbox browser suite: the real widget bundle against e2e/sandbox/sandbox-server.mjs
 * (synthetic, labelled demo data; loopback only). Needs no backend, database or network.
 *   npm run build && npm run test:sandbox
 */
const PORT = Number(process.env.SANDBOX_PORT || 18090);

/** Default Chromium (what CI runs). SANDBOX_BROWSER=firefox|webkit reruns the suite in another engine. */
const BROWSER = (['chromium', 'firefox', 'webkit'] as const).find((b) => b === process.env.SANDBOX_BROWSER) ?? 'chromium';

const viewport = (name: string, width: number, height: number, mobile = false) => ({
  name,
  // Firefox has no mobile emulation: it gets the phone viewport and touch, without isMobile.
  use: { browserName: BROWSER, viewport: { width, height }, hasTouch: mobile, ...(BROWSER === 'firefox' ? {} : { isMobile: mobile }), deviceScaleFactor: mobile ? 2 : 1 },
});

export default defineConfig({
  testDir: './e2e/sandbox',
  timeout: 45_000,
  retries: 0,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-sandbox' }]],
  outputDir: 'test-results-sandbox',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/sandbox/sandbox-server.mjs',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    viewport('desktop-1440', 1440, 900),
    viewport('laptop-1280', 1280, 720),
    viewport('tablet-768', 768, 1024),
    viewport('mobile-390', 390, 844, true),
    viewport('mobile-320', 320, 568, true),
  ],
});

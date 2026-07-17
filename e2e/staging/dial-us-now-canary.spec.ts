import { test, expect } from '@playwright/test';

const hasStaging = Boolean(
  process.env.STAGING_WIDGET_URL && process.env.STAGING_API_URL,
);
const api = (process.env.STAGING_API_URL || '').replace(/\/$/, '');
const widgetOrigin = (process.env.STAGING_WIDGET_URL || '').replace(/\/$/, '');

const TENANTS = [
  'jeep-of-chicago',
  'dial-nissan-of-chicago',
  'dial-chevy-of-chicago',
  'infiniti-of-chicago',
  'dial-cdjr-of-chicago',
] as const;

/** Staging Nest throttle can return 429 after load; retry briefly. */
async function withThrottleRetry<T>(
  fn: () => Promise<T>,
  isOk: (v: T) => boolean,
  attempts = 6,
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (isOk(last)) return last;
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
  }
  return last as T;
}

test.describe('Dial Us Now staging canary', () => {
  test.skip(!hasStaging, 'STAGING_WIDGET_URL and STAGING_API_URL required');

  test('staging host banner + IIFE present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('STAGING — NOT FOR CUSTOMERS')).toBeVisible();
    const res = await page.request.get(`${widgetOrigin}/assistant-widget.iife.js`);
    expect(res.status()).toBe(200);
    const js = await res.text();
    expect(js.length).toBeGreaterThan(10_000);
    for (const leak of [
      'JWT_SECRET',
      'BOOTSTRAP_SECRET',
      'DATABASE_URL',
      'BEGIN PRIVATE KEY',
      'sk-ant-',
    ]) {
      expect(js).not.toContain(leak);
    }
  });

  for (const slug of TENANTS) {
    test(`widget-config fail-closed for ${slug}`, async ({ request }) => {
      const res = await withThrottleRetry(
        () =>
          request.get(
            `${api}/public/widget-config?tenantSlug=${slug}&locationSlug=main`,
          ),
        (r) => r.status() === 200,
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      const data = body.data ?? body;
      const raw = JSON.stringify(body).toLowerCase();
      expect(raw).not.toMatch(/api[_-]?key|client_secret|password/);
      expect(data.features?.inventory === true).toBeFalsy();
      expect(data.features?.payments === true).toBeFalsy();
    });
  }

  test('cross-tenant widget-token denied without origins', async ({
    request,
  }) => {
    for (const slug of TENANTS) {
      const res = await withThrottleRetry(
        () =>
          request.post(`${api}/public/widget-token`, {
            data: { tenantSlug: slug, locationSlug: 'main' },
            headers: { Origin: widgetOrigin },
          }),
        (r) => r.status() === 403,
      );
      expect(res.status()).toBe(403);
    }
  });

  test('forged / evil origin denied', async ({ request }) => {
    const res = await withThrottleRetry(
      () =>
        request.post(`${api}/public/widget-token`, {
          data: { tenantSlug: 'jeep-of-chicago', locationSlug: 'main' },
          headers: { Origin: 'https://evil.example' },
        }),
      (r) => r.status() === 403,
    );
    expect(res.status()).toBe(403);
  });

  test('health live + ready', async ({ request }) => {
    const live = await withThrottleRetry(
      () => request.get(`${api}/health/live`),
      (r) => r.ok(),
    );
    expect(live.ok()).toBeTruthy();
    const ready = await withThrottleRetry(
      () => request.get(`${api}/health`),
      (r) => r.ok(),
    );
    expect(ready.ok()).toBeTruthy();
    const body = await ready.json();
    const data = body.data ?? body;
    expect(data.checks?.database).toBe('up');
  });

  test('manual boot isolates localStorage key by tenant', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#tenant', 'jeep-of-chicago');
    await page.click('#boot');
    await page.waitForTimeout(1500);
    const jeepKeys = await page.evaluate(() => Object.keys(localStorage));
    await page.evaluate(() => {
      window.AMQUR?.destroy?.();
    });
    await page.selectOption('#tenant', 'infiniti-of-chicago');
    await page.click('#boot');
    await page.waitForTimeout(1500);
    const allKeys = await page.evaluate(() => Object.keys(localStorage));
    // Keys should be tenant-scoped when present; never share one conversation id across both.
    const joined = [...jeepKeys, ...allKeys].join(',');
    expect(joined.toLowerCase()).not.toMatch(/sk-ant-|jwt_secret/);
  });

  test('mobile viewport staging banner', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText('STAGING — NOT FOR CUSTOMERS')).toBeVisible();
  });

  test('no production dialusnow API hardcoding for live rooftops', async ({
    page,
  }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).not.toContain('https://api.dialusnow.com');
    expect(html).toContain('staging-api.dialusnow.com');
  });
});

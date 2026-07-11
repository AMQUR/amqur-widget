import { test, expect } from '@playwright/test';

const hasStaging = Boolean(process.env.STAGING_WIDGET_URL && process.env.STAGING_API_URL);
const api = (process.env.STAGING_API_URL || '').replace(/\/$/, '');
const widgetOrigin = (process.env.STAGING_WIDGET_URL || '').replace(/\/$/, '');

async function waitForWidgetReady(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => page.evaluate(() => window.AMQUR?.isReady?.() === true), {
      timeout: 45_000,
    })
    .toBe(true);
  await expect(page.locator('#amqur-widget-host')).toBeAttached({ timeout: 5_000 });
}

test.describe('AMQUR staging pilot', () => {
  test.skip(!hasStaging, 'STAGING_WIDGET_URL and STAGING_API_URL required');

  test('1 staging page loads with banner', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('STAGING — NOT FOR CUSTOMERS')).toBeVisible();
  });

  test('2-5 widget bootstrap, duplicate init, destroy, reinit', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForWidgetReady(page);

    await page.evaluate(async () => {
      await window.AMQUR?.init({
        apiBaseUrl: 'https://backend-staging-staging-b699.up.railway.app/api',
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      });
    });
    expect(await page.evaluate(() => window.AMQUR?.isReady?.())).toBeTruthy();

    await page.evaluate(() => window.AMQUR?.destroy());
    await expect(page.locator('#amqur-widget-host')).toHaveCount(0);
    expect(await page.evaluate(() => window.AMQUR?.isReady?.())).toBeFalsy();

    await page.evaluate(async () => {
      await window.AMQUR?.init({
        apiBaseUrl: 'https://backend-staging-staging-b699.up.railway.app/api',
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      });
    });
    await waitForWidgetReady(page);
  });

  test('6 widget-token issued for permitted origin', async ({ request }) => {
    const res = await request.post(`${api}/public/widget-token`, {
      data: {
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      },
      headers: { Origin: widgetOrigin },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body?.data?.token).toBeTruthy();
  });

  test('7 unauthorized origin fails', async ({ request }) => {
    const res = await request.post(`${api}/public/widget-token`, {
      data: {
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      },
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status()).toBe(403);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain('stack');
    expect(text).not.toMatch(/BEGIN PRIVATE KEY/);
  });

  test('7b missing origin fails closed', async ({ request }) => {
    const res = await request.post(`${api}/public/widget-token`, {
      data: {
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('8-12 chat inventory VIN/stock/no-result truthfulness', async ({
    request,
  }) => {
    const tokenRes = await request.post(`${api}/public/widget-token`, {
      data: {
        tenantSlug: 'dial-auto-group-staging',
        locationSlug: 'pilot-rooftop',
      },
      headers: { Origin: widgetOrigin },
    });
    const token = (await tokenRes.json()).data.token as string;
    const conversationId = crypto.randomUUID();

    async function chat(message: string) {
      const res = await request.post(`${api}/chat`, {
        data: { message, conversationId },
        headers: {
          Origin: widgetOrigin,
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      return {
        status: res.status(),
        json,
        text: JSON.stringify(json).toLowerCase(),
      };
    }

    const stock = await chat('Do you have stock number STG1001?');
    expect(stock.status).toBeLessThan(500);
    expect(stock.text).not.toMatch(/tekion lead created|appointment confirmed/);

    const vin = await chat('Lookup VIN 1C4RJFBG0JC123456');
    expect(vin.status).toBeLessThan(500);

    const miss = await chat('Do you have a 2099 flying car in stock ZZZ999999?');
    expect(miss.text).not.toMatch(/currently available and ready for pickup/);

    const claims = await chat(
      'Confirm my appointment and create a Tekion CRM lead now',
    );
    expect(claims.text).not.toMatch(
      /appointment confirmed|tekion lead created|repair completed/,
    );
  });

  test('40-42 integrations remain disabled in widget-config', async ({
    request,
  }) => {
    const res = await request.get(
      `${api}/public/widget-config?tenantSlug=dial-auto-group-staging&locationSlug=pilot-rooftop`,
      { headers: { Origin: widgetOrigin } },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const flags = JSON.stringify(body).toLowerCase();
    expect(flags).not.toMatch(/"tekionintegration":\s*true/);
    expect(flags).not.toMatch(/"automatedfollowup":\s*true/);
    expect(flags).not.toMatch(/"voiceai":\s*true/);
  });

  test('43 no production host in staging page', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).not.toMatch(/mainline\.proxy\.rlwy\.net/);
    expect(html).not.toMatch(/divine-integrity/);
    expect(html).toMatch(/backend-staging-staging-b699\.up\.railway\.app/);
  });

  test('44 secrets not in browser source', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    const js = await page.evaluate(async () => {
      const res = await fetch('./amqur-widget.iife.js');
      return res.text();
    });
    for (const leak of [
      'JWT_SECRET',
      'BOOTSTRAP_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'BEGIN PRIVATE KEY',
    ]) {
      expect(html).not.toContain(leak);
      expect(js).not.toContain(leak);
    }
  });

  test('health live does not require auth', async ({ request }) => {
    const res = await request.get(`${api}/health/live`);
    expect(res.ok()).toBeTruthy();
  });

  test('mobile viewport still shows staging banner', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText('STAGING — NOT FOR CUSTOMERS')).toBeVisible();
    await waitForWidgetReady(page);
  });

  test('Escape key does not crash page', async ({ page }) => {
    await page.goto('/');
    await waitForWidgetReady(page);
    await page.keyboard.press('Escape');
    await expect(page.getByText('STAGING — NOT FOR CUSTOMERS')).toBeVisible();
    expect(await page.evaluate(() => window.AMQUR?.isReady?.())).toBeTruthy();
  });
});

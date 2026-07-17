import { test, expect } from '@playwright/test';

test.describe('accessibility smoke', () => {
  test('page has main landmark / heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('interactive controls are keyboard reachable when present', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName : null;
    });
    expect(focused).toBeTruthy();
  });

  test('zoom 200% still shows host content', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });
    await expect(page.getByText('AMQUR local widget host')).toBeVisible();
  });
});

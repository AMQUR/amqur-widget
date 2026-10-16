import { test, expect, type Page } from '@playwright/test';

/**
 * Real browser journey against a locally running API (test stack + sanitized fixture tenant
 * "journey-motors" seeded by the backend journeys e2e suite). Never points at production.
 * Start that API with NODE_ENV=test: with production-like rate limits (start:local-demo), five
 * engines in parallel from one IP are correctly throttled (429) and the widget cannot boot.
 */
const API = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const TENANT = process.env.LOCAL_JOURNEY_TENANT || 'journey-motors';

async function say(page: Page, text: string) {
    const ai = page.locator('.amq-msg--ai');
    const before = await ai.count();
    const input = page.getByRole('textbox', { name: /ask about vehicles/i });
    await input.fill(text);
    await input.press('Enter');
    await expect(ai).not.toHaveCount(before, { timeout: 15_000 });
}

async function boot(page: Page, opts: { aggressiveHostCss?: boolean } = {}) {
    await page.addInitScript(
        ({ api, tenant }) => {
            const w = window as unknown as Record<string, string>;
            w.__AMQUR_API__ = api;
            w.__AMQUR_TENANT__ = tenant;
            w.__AMQUR_LOCATION__ = 'main';
            try {
                // Fresh visitor per test, but a reload in the same tab keeps the session.
                if (!sessionStorage.getItem('__amqur_e2e_booted')) {
                    localStorage.clear();
                    sessionStorage.setItem('__amqur_e2e_booted', '1');
                }
            } catch {
                /* ignore */
            }
        },
        { api: API, tenant: TENANT },
    );
    await page.goto('/');
    if (opts.aggressiveHostCss) {
        // Hostile host styles: global resets, huge z-index nav, forced fonts.
        await page.addStyleTag({
            content:
                '*{all:unset!important;font-family:serif!important;font-size:30px!important} nav{position:fixed;top:0;left:0;right:0;height:80px;z-index:2147483647;background:red}',
        });
        await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', '<nav>sticky dealer nav</nav>'));
    }
    const launcher = page.getByRole('button', { name: /open assistant/i });
    await expect(launcher).toBeVisible({ timeout: 15_000 });
    return launcher;
}

test.describe('Concierge Canvas', () => {
    test('sales journey: search → feature filter → payment → appointment, with journey tray', async ({ page }, info) => {
        // Runs on every engine (incl. iPhone Safari); only the pixel snapshot is Chromium-only.
        const launcher = await boot(page);
        await launcher.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('group', { name: 'Departments' })).toBeVisible();
        // Verified hours drive the open/closed badge
        await expect(dialog.getByRole('status').first()).toContainText(/Open now|Closed/);

        await say(page, 'Looking for a black Wrangler under 45 grand.');
        await expect(page.locator('.amq-vcard').first()).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('.amq-vcard')).toHaveCount(2);
        await expect(page.locator('.amq-vcard__est').first()).toContainText(/example .*% APR/);

        await say(page, 'Which of those has heated seats?');
        await expect(page.locator('.amq-msg--ai').last()).toContainText(/lists heated seats/i);

        await say(page, 'What would the payment be with 5k down?');
        const payment = page.getByRole('region', { name: 'Payment estimate' }).last();
        await expect(payment).toBeVisible({ timeout: 15_000 });
        await expect(payment).toContainText(/example .*% APR/);
        await expect(payment).toContainText(/excl\. taxes/);

        await say(page, 'I can come next Saturday at 3.');
        const appt = page.getByRole('region', { name: 'Appointment' }).last();
        await expect(appt).toBeVisible({ timeout: 15_000 });
        await expect(appt).toContainText('Requested');
        await expect(appt).not.toContainText('Confirmed');

        const tray = page.getByRole('navigation', { name: 'Your progress' });
        await expect(tray).toContainText('Vehicle');
        await expect(tray).toContainText('Estimate');
        await expect(tray).toContainText('Appointment');

        // Conversation id is server-issued and persisted
        const stored = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('amqur_conversation_v2_'))?.[1] ?? null);
        expect(JSON.parse(stored ?? '{}').id).toMatch(/^cv1\./);
        expect(typeof JSON.parse(stored ?? '{}').at).toBe('number');

        if (info.project.name === 'chromium') {
            await expect(dialog).toHaveScreenshot('concierge-sales-journey.png', { maxDiffPixelRatio: 0.08, mask: [page.locator('.amq-msg p'), page.locator('.amq-chip')] });
        }
    });

    test('keyboard + screen reader semantics', async ({ page }, info) => {
        test.skip(info.project.name.startsWith('mobile'), 'desktop keyboard flow');
        const launcher = await boot(page);
        await launcher.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('log', { name: 'Conversation' })).toHaveAttribute('aria-live', 'polite');
        // composer has an accessible name and is reachable by keyboard
        const input = page.getByRole('textbox', { name: /ask about vehicles/i });
        await input.focus();
        await expect(input).toBeFocused();
        await input.fill('what time do you close?');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('log')).toContainText(/AM|PM/, { timeout: 15_000 });
        // every button has an accessible name
        const unnamed = await page.evaluate(() => {
            const host = Array.from(document.querySelectorAll('*')).find((e) => (e as HTMLElement).shadowRoot);
            const root = (host as HTMLElement | undefined)?.shadowRoot;
            if (!root) return -1;
            return Array.from(root.querySelectorAll('button')).filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())).length;
        });
        expect(unnamed).toBe(0);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('mobile: full-screen sheet, no horizontal overflow, 44px touch targets', async ({ page }, info) => {
        test.skip(!info.project.name.startsWith('mobile'), 'mobile only');
        const launcher = await boot(page);
        await launcher.click();
        await page.waitForTimeout(300); // let the 180ms open transition finish
        const box = await page.getByRole('dialog').boundingBox();
        const vp = page.viewportSize()!;
        expect(box!.width).toBeGreaterThanOrEqual(vp.width - 2);
        const overflow = await page.evaluate(() => {
            const host = Array.from(document.querySelectorAll('*')).find((e) => (e as HTMLElement).shadowRoot);
            const panel = (host as HTMLElement).shadowRoot!.querySelector('.amqur-panel') as HTMLElement;
            return panel.scrollWidth - panel.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
        const send = page.getByRole('button', { name: 'Send' });
        const sb = await send.boundingBox();
        expect(sb!.height).toBeGreaterThanOrEqual(42);
    });

    test('host CSS cannot break the widget (Shadow DOM isolation)', async ({ page }, info) => {
        // Chromium + both WebKit projects (Safari handles Shadow DOM styling differently).
        test.skip(!['chromium', 'webkit', 'mobile-webkit'].includes(info.project.name), 'Chromium + WebKit cover the engines');
        const launcher = await boot(page, { aggressiveHostCss: true });
        const lb = await launcher.boundingBox();
        expect(lb!.width).toBeGreaterThan(40);
        expect(lb!.width).toBeLessThan(80);
        await launcher.click();
        const fontSize = await page.evaluate(() => {
            const host = Array.from(document.querySelectorAll('*')).find((e) => (e as HTMLElement).shadowRoot);
            const el = (host as HTMLElement).shadowRoot!.querySelector('.amq-storefront__welcome') as HTMLElement;
            return getComputedStyle(el).fontSize;
        });
        // The widget's own type scale (17px) — the host's forced 30px must not leak in.
        expect(fontSize).toBe('17px');
    });

    test('reduced motion: replies are not artificially delayed', async ({ page }, info) => {
        test.skip(info.project.name !== 'chromium', 'single engine is enough');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const launcher = await boot(page);
        await launcher.click();
        const input = page.getByRole('textbox', { name: /ask about vehicles/i });
        const t0 = Date.now();
        await input.fill('hi');
        await input.press('Enter');
        await expect(page.locator('.amq-msg--ai').first()).toBeVisible({ timeout: 10_000 });
        expect(Date.now() - t0).toBeLessThan(2500);
    });

    test('API failure: honest error, nothing claimed, Retry resends and succeeds', async ({ page }, info) => {
        test.skip(!['chromium', 'mobile-webkit'].includes(info.project.name), 'desktop + iPhone are enough');
        let failNext = true;
        await page.route('**/api/chat', async (route) => {
            if (failNext && route.request().method() === 'POST') {
                failNext = false;
                await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"upstream unavailable"}' });
                return;
            }
            await route.continue();
        });
        const launcher = await boot(page);
        await launcher.click();
        const input = page.getByRole('textbox', { name: /ask about vehicles/i });
        await input.fill('Do you have any Wranglers?');
        await input.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(/couldn.t send that\. Nothing was saved/i)).toBeVisible({ timeout: 10_000 });
        // No assistant content pretending the request went through
        await expect(page.locator('.amq-vcard')).toHaveCount(0);
        await dialog.getByRole('button', { name: /^retry$/i }).click();
        await expect(page.locator('.amq-vcard').first()).toBeVisible({ timeout: 15_000 });
        await expect(dialog.getByRole('button', { name: /^retry$/i })).toHaveCount(0);
    });

    test('New conversation: fresh server id, empty transcript and tray; refresh resumes', async ({ page }, info) => {
        test.skip(!['chromium', 'mobile-webkit'].includes(info.project.name), 'desktop + iPhone are enough');
        const launcher = await boot(page);
        await launcher.click();
        await say(page, 'Do you have any Wranglers?');
        const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('amqur_conversation_v2_')) ?? '');
        const first = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').id, key);
        expect(first).toMatch(/^cv1\./);
        // A normal refresh resumes the same conversation and keeps it on screen.
        await page.reload();
        await page.getByRole('button', { name: /open assistant/i }).click();
        await expect(page.locator('.amq-msg--user').first()).toContainText('Wranglers');
        // New conversation starts clean.
        await page.getByRole('button', { name: /start a new conversation/i }).click();
        await expect(page.locator('.amq-msg--user')).toHaveCount(0);
        await say(page, 'hi');
        const second = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').id, key);
        expect(second).toMatch(/^cv1\./);
        expect(second).not.toBe(first);
        await expect(page.locator('.amq-msg--user')).toHaveCount(1);
    });
});

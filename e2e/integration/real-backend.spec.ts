import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The real widget bundle against the real local backend (deterministic engine, simulated demo
 * inventory, labelled sandbox scheduler). DEMO evidence: it proves the two repos speak the same
 * contract end to end. It does not prove any CRM, live scheduler or live inventory integration.
 */
const API = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.${test.info().project.name}.png`), animations: 'disabled' });

test.beforeAll(async ({ request }) => {
    const res = await request.get(`${API}/api/public/widget-config?tenantSlug=dial-demo-local&locationSlug=demo-rooftop`).catch(() => null);
    test.skip(!res || !res.ok(), `Local backend demo is not running at ${API}; see playwright.integration.config.ts`);
});

const settled = (page: Page) => expect(page.getByRole('button', { name: /^send$/i })).toBeVisible({ timeout: 30_000 });
async function say(page: Page, text: string) {
    const input = page.getByRole('textbox', { name: /ask about vehicles/i });
    await input.fill(text);
    await input.press('Enter');
    await settled(page);
}

test('search → vehicle → payment illustration → consented lead → sandbox booking with provider receipt → human handoff', async ({ page }) => {
    const streamed: string[] = [];
    page.on('response', (r) => r.url().endsWith('/api/chat/stream') && streamed.push(r.headers()['content-type'] ?? ''));

    await page.goto('/');
    await page.getByRole('button', { name: 'Open assistant' }).click();
    await expect(page.getByText(/AI assistant · Connected/)).toBeVisible();

    await say(page, 'Show me SUVs');
    const carousel = page.getByRole('region', { name: /vehicles/ });
    await expect(carousel).toBeVisible();
    await expect(carousel.getByText('Demo vehicle').first()).toBeVisible();
    await expect(carousel.getByText(/^At Demo Rooftop/).first()).toBeVisible();
    await expect(page.getByText(/Simulated demo inventory/)).toBeVisible();
    await shot(page, '01-real-carousel');

    // Pick a vehicle that is in stock (the first may be in transit).
    const card = carousel.getByRole('article').nth(1);
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Payment' }).click();
    await settled(page);
    const pay = page.getByRole('region', { name: 'Finance estimate' }).last();
    await expect(pay.getByText(/example .*% APR/).first()).toBeVisible();
    await expect(pay.getByText(/Estimate, not a financing offer/)).toBeVisible();
    await shot(page, '02-real-payment');

    await say(page, "I'd like to test drive it");
    const form = page.getByRole('form');
    await expect(form).toBeVisible();
    await expect(form.getByText(/Msg|Message|rates/i)).toHaveCount(0); // SMS is off for this rooftop, so no text option
    await form.getByLabel('First name').fill('Sandbox');
    await form.getByLabel('Last name').fill('Tester');
    await form.getByRole('textbox', { name: 'Email' }).fill('sandbox.tester@example.invalid');
    await form.getByRole('checkbox').first().check();
    await shot(page, '03-real-lead-form');
    await form.getByRole('button', { name: 'Send to the team' }).click();
    await settled(page);
    await expect(page.getByText('Sent my contact details')).toBeVisible();
    await expect(page.getByText('sandbox.tester@example.invalid')).toHaveCount(0);

    // The demo database persists between runs, so some times are already taken (and the sandbox
    // always rejects one). A taken time must answer "nothing was booked" and offer the picker
    // again — never a confirmation. Keep choosing until the scheduler confirms one.
    const sheet = page.getByRole('dialog', { name: 'Choose a time' });
    const confirmed = page.getByRole('status', { name: 'Appointment confirmed' });
    let refusals = 0;
    for (let attempt = 0; attempt < 12 && !(await confirmed.isVisible()); attempt += 1) {
        await page.getByRole('button', { name: 'Choose a time' }).last().click();
        await expect(sheet.getByText(/Times shown in America\/Chicago/)).toBeVisible();
        const days = sheet.getByRole('group', { name: 'Day' }).getByRole('button');
        await days.nth(Math.floor(attempt / 4) % (await days.count())).click();
        const times = sheet.getByRole('group', { name: 'Time' }).getByRole('button');
        await expect(times.first()).toBeVisible();
        if (attempt === 0) await shot(page, '04-real-picker');
        await times.nth(attempt % (await times.count())).click();
        await sheet.getByRole('button', { name: 'Book this time' }).click();
        await settled(page);
        if (!(await confirmed.isVisible())) {
            refusals += 1;
            await expect(page.getByText(/nothing was booked/).last()).toBeVisible();
        }
    }
    test.info().annotations.push({ type: 'slot refusals before confirmation', description: String(refusals) });

    const receipt = page.getByRole('status', { name: 'Appointment confirmed' });
    await expect(receipt).toBeVisible();
    await expect(receipt.getByText(/^SBX-/)).toBeVisible();
    await expect(receipt.getByText(/Demo scheduler — no real appointment was made/)).toBeVisible();
    await expect(receipt.getByText(/Demo Rooftop/)).toBeVisible();
    await shot(page, '05-real-confirmed-receipt');

    await page.getByRole('button', { name: 'Talk to a person' }).click();
    await settled(page);
    await expect(page.getByRole('status', { name: 'Team' })).toBeVisible();
    await shot(page, '06-real-handoff');

    // The stream endpoint was used, and nothing typed into the form reached browser storage.
    expect(streamed.length).toBeGreaterThan(3);
    expect(streamed.every((c) => c.includes('text/event-stream'))).toBe(true);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toMatch(/sandbox\.tester@example\.invalid|Tester/);
});

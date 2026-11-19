import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Sandbox journeys: the real widget bundle against synthetic, labelled demo data.
 * Proves UI behaviour and contract handling only — not any live integration.
 */
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
const shot = async (page: Page, name: string) => {
    const project = test.info().project.name;
    await page.screenshot({ path: path.join(SHOTS, `${name}.${project}.png`), animations: 'disabled' });
};

async function open(page: Page, query = '') {
    await page.goto(`/?${query}`);
    await page.getByRole('button', { name: /open assistant|abrir asistente/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
}

async function say(page: Page, text: string) {
    const input = page.getByRole('textbox', { name: /ask about vehicles|pregunte por/i });
    await input.fill(text);
    await input.press('Enter');
}

/** Waits for the turn to finish: the composer shows Send again (Stop is gone). */
async function settled(page: Page) {
    await expect(page.getByRole('button', { name: /^(send|enviar)$/i })).toBeVisible({ timeout: 15_000 });
}

async function noHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => {
        const host = document.getElementById('amqur-widget-host');
        const root = host?.shadowRoot;
        if (!root) return ['no shadow root'];
        const vw = document.documentElement.clientWidth;
        const bad: string[] = [];
        root.querySelectorAll<HTMLElement>('.amqur-panel, .amqur-panel *').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            // Carousels and day strips scroll horizontally by design.
            if (el.closest('.amq-cards, .amq-slotgroup, .amq-tray, .amq-compare')) return;
            if (r.right > vw + 1 || r.left < -1) bad.push(`${el.className || el.tagName} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`);
        });
        return bad.slice(0, 5);
    });
    expect(overflow, 'elements clipped horizontally').toEqual([]);
}

test.describe('Showroom theme — sales journey', () => {
    test('group site: ask North/South, show both stores labelled, illustrate a payment, capture consented lead, book in the sandbox scheduler', async ({ page }) => {
        await open(page, 'tenant=dial-auto-group&theme=showroom');

        // AI disclosure is visible before anything is asked of the customer.
        await expect(page.getByText(/AI assistant · Connected/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Shop vehicles' })).toBeVisible();
        await shot(page, '01-storefront-showroom');

        await say(page, 'Looking for a Jeep Grand Cherokee');
        await settled(page);
        await expect(page.getByText(/North Side, the South Side, or either/)).toBeVisible();
        await page.getByRole('button', { name: 'Either' }).click();
        await settled(page);

        const carousel = page.getByRole('region', { name: /4 vehicles/ });
        await expect(carousel).toBeVisible();
        // Every card says which rooftop holds the vehicle; North and South stay distinct.
        await expect(carousel.getByText('At Jeep of Chicago (North Side)').first()).toBeVisible();
        await expect(carousel.getByText('At Dial CDJR (South Side)').first()).toBeAttached();
        await expect(carousel.getByText('Demo vehicle').first()).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, '02-carousel-both-stores');

        const firstCard = carousel.getByRole('article').first();
        await firstCard.getByRole('button', { name: 'Next photo' }).click();
        await expect(firstCard.getByRole('img', { name: /Photo 2 of 3/ })).toBeVisible();

        await firstCard.getByRole('button', { name: 'Payment' }).click();
        await settled(page);
        const pay = page.getByRole('region', { name: 'Finance estimate' });
        await expect(pay.getByText(/example 6.9% APR/).first()).toBeVisible();
        await expect(pay.getByText(/Estimate, not a financing offer\./)).toBeVisible();
        await pay.getByRole('button', { name: /Terms & assumptions/ }).click();
        await expect(pay.getByText(/Subject to lender credit approval/)).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, '03-payment-illustration');

        await page.getByRole('button', { name: 'Book a test drive' }).click();
        await settled(page);
        // The vehicle is at Jeep of Chicago (North): the request goes to that rooftop, not the group.
        const form = page.getByRole('form', { name: /How should Jeep of Chicago reach you/ });
        await expect(form).toBeVisible();
        await shot(page, '04-lead-form');

        // Submitting without consent is refused and focus goes to the first problem.
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await expect(form.getByRole('alert')).toHaveText('Please fix the highlighted fields.');
        await expect(form.getByLabel('First name')).toBeFocused();

        await form.getByLabel('First name').fill('Sandbox');
        await form.getByLabel('Last name').fill('Tester');
        await form.getByRole('textbox', { name: 'Email' }).fill('sandbox.tester@example.invalid');
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await expect(form.getByText(/Check the box to allow contact by email/)).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, '05-lead-form-errors');
        await form.getByLabel('Email me about this request.').check();
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await settled(page);

        // The transcript shows a neutral line, never the contact details.
        await expect(page.getByText('Sent my contact details')).toBeVisible();
        await expect(page.getByText('sandbox.tester@example.invalid')).toHaveCount(0);

        await page.getByRole('button', { name: 'Choose a time' }).click();
        const sheet = page.getByRole('dialog', { name: 'Choose a time' });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(/Times shown in America\/Chicago/)).toBeVisible();
        const book = sheet.getByRole('button', { name: 'Book this time' });
        await expect(book).toBeDisabled();
        await noHorizontalOverflow(page);
        await shot(page, '06-appointment-picker');

        // Escape closes only the picker, and focus returns to the control that opened it.
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
        await expect(page.getByRole('dialog').first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Choose a time' })).toBeFocused();

        await page.getByRole('button', { name: 'Choose a time' }).click();
        const times = sheet.getByRole('group', { name: 'Time' }).getByRole('button');
        // The sandbox provider rejects the second slot: no confirmation may appear.
        await times.nth(1).click();
        await book.click();
        await settled(page);
        await expect(page.getByText(/just taken, so nothing was booked/)).toBeVisible();
        await expect(page.getByText('Appointment confirmed')).toHaveCount(0);

        await page.getByRole('button', { name: 'Choose a time' }).click();
        await sheet.getByRole('group', { name: 'Time' }).getByRole('button').first().click();
        await sheet.getByRole('button', { name: 'Book this time' }).click();
        await settled(page);

        const receipt = page.getByRole('status', { name: 'Appointment confirmed' });
        await expect(receipt).toBeVisible();
        await expect(receipt.getByText(/^SBX-/)).toBeVisible();
        await expect(receipt.getByText(/Demo scheduler/)).toBeVisible();
        await expect(receipt.getByText('Jeep of Chicago', { exact: true })).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, '07-confirmed-receipt');
    });

    test('a store without scheduler access sends a request and never shows a confirmation', async ({ page }) => {
        await open(page, 'tenant=dial-chevy-of-chicago&theme=showroom');
        await say(page, 'book a test drive');
        await settled(page);
        const form = page.getByRole('form', { name: /Dial Chevy of Chicago/ });
        await form.getByLabel('First name').fill('Sandbox');
        await form.getByLabel('Last name').fill('Tester');
        await form.getByRole('radio', { name: 'Phone call' }).check();
        await form.getByLabel(/Mobile or phone number/).fill('312-555-0142');
        await form.getByLabel('Call me about this request.').check();
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await settled(page);

        await page.getByRole('button', { name: 'Choose a time' }).click();
        const sheet = page.getByRole('dialog', { name: 'Choose a time' });
        await sheet.getByRole('group', { name: 'Day' }).getByRole('button').first().click();
        await sheet.getByRole('button', { name: 'Afternoon' }).click();
        await sheet.getByRole('button', { name: 'Request this time' }).click();
        await settled(page);

        await expect(page.getByRole('status', { name: 'Request sent — not booked yet' })).toBeVisible();
        await expect(page.getByText('Appointment confirmed')).toHaveCount(0);
        await expect(page.getByText(/Confirmation/)).toHaveCount(0);
        await shot(page, '08-requested-not-booked');

        // Nothing the customer typed into the form reaches browser storage.
        const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
        expect(stored).not.toMatch(/312-555-0142|3125550142|Tester/);
    });

    test('a failed lead submission is never shown as sent; the form keeps its values for another try', async ({ page }) => {
        await open(page, 'tenant=dial-chevy-of-chicago&theme=showroom');
        await say(page, 'book a test drive');
        await settled(page);
        const form = page.getByRole('form', { name: /Dial Chevy of Chicago/ });
        await form.getByLabel('First name').fill('Sandbox');
        await form.getByLabel('Last name').fill('Tester');
        await form.getByRole('textbox', { name: 'Email' }).fill('sandbox.tester@example.invalid');
        await form.getByLabel('Email me about this request.').check();

        let failed = false;
        await page.route('**/api/chat/stream', async (route) => {
            if (!failed && (route.request().postData() ?? '').includes('"lead"')) {
                failed = true;
                return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
            }
            return route.fallback();
        });
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await expect(page.getByText(/couldn't send that\. Nothing was saved/)).toBeVisible();
        // No automatic retry of a contact submission, and nothing claims it was sent.
        await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
        await expect(form.getByLabel('First name')).toHaveValue('Sandbox');
        await expect(form.getByRole('button', { name: 'Send to the team' })).toBeEnabled();

        await form.getByRole('button', { name: 'Send to the team' }).click();
        await settled(page);
        await expect(page.getByText(/Your request is with Dial Chevy of Chicago/)).toBeVisible();
        await expect(page.getByRole('form')).toHaveCount(0);
    });

    test('service: external scheduler link books nothing here; safety complaint escalates', async ({ page }) => {
        await open(page, 'tenant=dial-nissan-of-chicago&theme=showroom');
        await say(page, 'Can I book brakes for Friday?');
        await settled(page);
        await expect(page.getByText(/can’t diagnose the vehicle remotely/)).toBeVisible();
        const link = page.getByRole('link', { name: /Open the scheduling page/ });
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(page.getByText(/Nothing is booked from this chat\./)).toBeVisible();
        await shot(page, '09-service-external-link');
    });

    test('parts: fitment, price and availability stay unverified until the parts team checks', async ({ page }) => {
        await open(page, 'tenant=jeep-of-chicago&theme=showroom');
        await say(page, 'Need a right headlight for a 2018 Jeep');
        await settled(page);
        const card = page.getByRole('region', { name: 'Parts' });
        await expect(card.getByText('VIN needed')).toBeVisible();
        await expect(card.getByText('Pending parts team')).toHaveCount(3);
        await expect(card.getByText('Verified')).toHaveCount(0);
        await shot(page, '10-parts-unverified');
    });

    test('human handoff: AI pauses, staff presence is shown, staff reply arrives', async ({ page }) => {
        await open(page, 'tenant=jeep-of-chicago&theme=showroom');
        await say(page, 'hello');
        await settled(page);
        await page.getByRole('button', { name: 'Talk to a person' }).click();
        await expect(page.getByText(/Jordan from the team is helping you now/)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('The AI assistant is paused while they are here.')).toBeVisible();
        await expect(page.getByText(/this is Jordan with the sales team/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Talk to a person' })).toHaveCount(0);
        await shot(page, '11-human-takeover');
    });

    test('streaming can be stopped mid-reply; partial text is kept and marked', async ({ page }) => {
        await open(page, 'tenant=jeep-of-chicago&theme=showroom');
        await say(page, 'slow');
        const stop = page.getByRole('button', { name: 'Stop reply' });
        await expect(stop).toBeVisible();
        await expect(page.getByText(/word3/)).toBeVisible();
        await stop.click();
        await settled(page);
        await expect(page.getByText('Reply stopped.')).toBeVisible();
        await expect(page.getByText(/word59/)).toHaveCount(0);
    });

    test('server failure shows an honest error with retry', async ({ page }) => {
        await open(page, 'tenant=jeep-of-chicago&theme=showroom');
        await say(page, 'trigger-error');
        await expect(page.getByText(/couldn't send that\. Nothing was saved/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    });

    test('older servers without the stream endpoint still work (JSON fallback)', async ({ page }) => {
        await open(page, 'tenant=jeep-of-chicago&theme=showroom&nostream=1');
        await say(page, 'show me grand cherokees');
        await expect(page.getByRole('region', { name: /3 vehicles/ })).toBeVisible({ timeout: 15_000 });
    });

    test('Spanish: same facts, same request-vs-confirmed distinction', async ({ page }) => {
        await open(page, 'tenant=dial-chevy-of-chicago&theme=showroom&lang=es');
        await expect(page.getByText(/Asistente de IA/i)).toBeVisible();
        await say(page, 'agendar prueba de manejo');
        await settled(page);
        const form = page.getByRole('form');
        await expect(form.getByText('Su autorización')).toBeVisible();
        await expect(form.getByText(/Responda STOP para cancelar/)).toBeVisible();
        await noHorizontalOverflow(page);
        await shot(page, '12-spanish-lead-form');
    });
});

test.describe('host isolation and theming', () => {
    test('hostile host CSS does not leak in; the widget does not restyle the host', async ({ page }) => {
        await page.goto('/?tenant=jeep-of-chicago&theme=showroom&hostile=1');
        const hostBefore = await page.evaluate(() => {
            const cs = getComputedStyle(document.getElementById('host-p')!);
            return { font: cs.fontFamily, color: cs.color, size: cs.fontSize };
        });
        await page.getByRole('button', { name: 'Open assistant' }).click();
        await say(page, 'show me grand cherokees');
        await settled(page);
        const inside = await page.evaluate(() => {
            const root = document.getElementById('amqur-widget-host')!.shadowRoot!;
            const btn = root.querySelector('.amq-btn--primary')!;
            const cs = getComputedStyle(btn);
            const p = getComputedStyle(root.querySelector('.amq-msg--ai p')!);
            return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, transform: p.textTransform, spacing: p.letterSpacing, font: p.fontFamily };
        });
        expect(inside.bg).toBe('rgb(229, 4, 47)'); // Dial red, not the host's yellow
        expect(inside.radius).toBe('0px'); // Showroom square corners, not the host's 40px
        expect(inside.transform).toBe('none');
        expect(inside.font).not.toMatch(/Comic Sans/);
        const hostAfter = await page.evaluate(() => {
            const cs = getComputedStyle(document.getElementById('host-p')!);
            return { font: cs.fontFamily, color: cs.color, size: cs.fontSize };
        });
        expect(hostAfter).toEqual(hostBefore);
        expect(await page.locator('#amqur-widget-host').count()).toBe(1);
        await shot(page, '13-hostile-host');
    });

    test('Archivo is self-hosted from the widget origin and applied in Showroom', async ({ page }) => {
        const fontRequests: string[] = [];
        page.on('request', (r) => r.resourceType() === 'font' && fontRequests.push(r.url()));
        await open(page, 'tenant=jeep-of-chicago&theme=showroom');
        await expect.poll(() => fontRequests.length).toBeGreaterThan(0);
        expect(fontRequests.every((u) => u.startsWith(new URL(page.url()).origin))).toBe(true);
        const ok = await page.evaluate(async () => {
            await document.fonts.ready;
            return document.fonts.check('700 16px "AMQUR Archivo"');
        });
        expect(ok).toBe(true);
        // No stylesheet or style tag was added to the host document.
        expect(await page.evaluate(() => document.head.querySelectorAll('style[id^="amqur"], link[href*="font"]').length)).toBe(0);
    });

    test('neutral theme uses tenant colours, rounded corners and no webfont', async ({ page }) => {
        const fontRequests: string[] = [];
        page.on('request', (r) => r.resourceType() === 'font' && fontRequests.push(r.url()));
        await open(page, 'tenant=dial-chevy-of-chicago&theme=neutral');
        await say(page, 'show me grand cherokees');
        await settled(page);
        const style = await page.evaluate(() => {
            const root = document.getElementById('amqur-widget-host')!.shadowRoot!;
            const cs = getComputedStyle(root.querySelector('.amq-btn--primary')!);
            return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
        });
        expect(style.bg).toBe('rgb(47, 111, 196)');
        expect(style.radius).not.toBe('0px');
        expect(fontRequests).toEqual([]);
        await shot(page, '14-neutral-theme');
    });

    test('host page can move the launcher clear of its own sticky UI with a custom property', async ({ page }) => {
        await page.goto('/?tenant=jeep-of-chicago&theme=showroom');
        const launcher = page.getByRole('button', { name: 'Open assistant' });
        await expect(launcher).toBeVisible();
        const before = await launcher.boundingBox();
        await page.addStyleTag({ content: '#amqur-widget-host { --amqur-launcher-bottom: 120px; }' });
        const after = await launcher.boundingBox();
        expect(before!.y - after!.y).toBeGreaterThan(90);
    });

    test('a failed boot is invisible to shoppers', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        await page.route('**/api/public/widget-token', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Forbidden: internal detail"}' }));
        await page.goto('/?tenant=jeep-of-chicago');
        await expect.poll(() => errors.some((e) => e.includes('[AMQUR] widget did not start'))).toBe(true);
        await expect(page.locator('#amqur-widget-host')).toHaveCount(0);
        await expect(page.getByText(/Forbidden|internal detail/)).toHaveCount(0);
    });

    test('init() called twice concurrently mounts exactly one launcher', async ({ page }) => {
        await page.goto('/?tenant=jeep-of-chicago');
        await page.evaluate(() => {
            const w = window as unknown as { AMQUR: { destroy: () => void; init: (o: unknown) => Promise<void> } };
            w.AMQUR.destroy();
            const cfg = { apiBaseUrl: location.origin + '/api', tenantSlug: 'jeep-of-chicago', locationSlug: 'main' };
            return Promise.all([w.AMQUR.init(cfg), w.AMQUR.init(cfg)]);
        });
        expect(await page.locator('#amqur-widget-host').count()).toBe(1);
        await expect(page.getByRole('button', { name: 'Open assistant' })).toHaveCount(1);
    });
});

test.describe('accessibility', () => {
    test('axe: no WCAG 2.2 A/AA violations across the journey states', async ({ page }) => {
        const scan = async (label: string) => {
            // Contrast is only meaningful at rest: wait for the open/rise animations to finish
            // (Firefox occasionally scanned mid-fade and reported the header as low contrast).
            await page.evaluate(async () => {
                const root = document.getElementById('amqur-widget-host')!.shadowRoot!;
                const finite = root.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime as number));
                await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
            });
            const results = await new AxeBuilder({ page }).include('#amqur-widget-host').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
            const summary = results.violations.map((v) => `${label}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`);
            expect(summary, `axe violations at ${label}`).toEqual([]);
        };
        await open(page, 'tenant=dial-auto-group&theme=showroom');
        await scan('storefront');
        await say(page, 'either grand cherokee');
        await settled(page);
        await scan('carousel');
        await page.getByRole('region', { name: /vehicles/ }).getByRole('article').first().getByRole('button', { name: 'Payment' }).click();
        await settled(page);
        await scan('payment');
        await page.getByRole('button', { name: 'Book a test drive' }).click();
        await settled(page);
        await page.getByRole('form').getByRole('button', { name: 'Send to the team' }).click();
        await scan('lead form with errors');
    });

    test('axe: neutral theme', async ({ page }) => {
        await open(page, 'tenant=dial-chevy-of-chicago&theme=neutral');
        await say(page, 'either grand cherokee');
        await settled(page);
        const results = await new AxeBuilder({ page }).include('#amqur-widget-host').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.map((v) => `${v.id} × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });

    test('keyboard: open, tab stays inside the dialog, Escape closes and focus returns to the launcher', async ({ page }) => {
        await page.goto('/?tenant=jeep-of-chicago&theme=showroom');
        const launcher = page.getByRole('button', { name: 'Open assistant' });
        await launcher.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Close chat' })).toBeFocused();
        for (let i = 0; i < 25; i += 1) {
            await page.keyboard.press('Tab');
            const inside = await page.evaluate(() => {
                const root = document.getElementById('amqur-widget-host')!.shadowRoot!;
                return !!root.activeElement && !!root.activeElement.closest('.amqur-panel');
            });
            expect(inside, `focus left the dialog after ${i + 1} tabs`).toBe(true);
        }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Open assistant' })).toBeFocused();
    });

    test('screen-reader contract: names, roles and announcements a screen reader is given', async ({ page }) => {
        await page.goto('/?tenant=dial-chevy-of-chicago&theme=showroom');
        // The launcher is a named button; the panel is a named modal dialog.
        await page.getByRole('button', { name: 'Open assistant' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect((await dialog.getAttribute('aria-label')) ?? '').toMatch(/AI assistant/);
        // The transcript is a polite live log, so new replies are announced without stealing focus.
        const log = page.getByRole('log');
        await expect(log).toHaveAttribute('aria-live', 'polite');
        // The text box has a real label and the send control a name.
        await expect(page.getByRole('textbox', { name: /ask about vehicles/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^send$/i })).toBeVisible();

        await say(page, 'book a test drive');
        await settled(page);
        // After a reply the log is not left busy and holds the reply text.
        await expect(log).not.toHaveAttribute('aria-busy', 'true');
        expect(((await log.innerText()) ?? '').length).toBeGreaterThan(20);

        // Lead form: a named form; every field and checkbox has an accessible name.
        const form = page.getByRole('form', { name: /Dial Chevy of Chicago/ });
        await expect(form).toBeVisible();
        const unnamed = await form.evaluate((el) => {
            const out: string[] = [];
            el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach((c) => {
                if (c.type === 'hidden') return;
                const id = c.id;
                const root = c.getRootNode() as ShadowRoot;
                const labelled = (id && root.querySelector(`label[for="${id}"]`)) || c.closest('label') || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby');
                if (!labelled) out.push(c.name || c.type);
            });
            return out;
        });
        expect(unnamed).toEqual([]);
        // Consent boxes start unticked and say what they consent to.
        const consent = form.getByRole('checkbox');
        expect(await consent.count()).toBeGreaterThan(0);
        for (let i = 0; i < (await consent.count()); i += 1) await expect(consent.nth(i)).not.toBeChecked();

        // Submitting with problems: an alert summarises them, the bad field is marked invalid
        // and described by its message, and focus moves to it.
        await form.getByRole('button', { name: 'Send to the team' }).click();
        await expect(form.getByRole('alert').first()).toBeVisible();
        const focused = await page.evaluate(() => {
            const a = document.getElementById('amqur-widget-host')!.shadowRoot!.activeElement as HTMLElement | null;
            if (!a) return null;
            const describedBy = a.getAttribute('aria-describedby');
            const root = a.getRootNode() as ShadowRoot;
            return { tag: a.tagName, invalid: a.getAttribute('aria-invalid'), described: describedBy ? !!root.getElementById(describedBy.split(' ')[0])?.textContent?.trim() : false };
        });
        expect(focused?.tag).toMatch(/INPUT|SELECT|TEXTAREA/);
        expect(focused?.invalid).toBe('true');
        expect(focused?.described).toBe(true);

        // Vehicle cards: pictures have text alternatives, carousels are named regions.
        await say(page, 'shop vehicles');
        await settled(page);
        const region = page.getByRole('region', { name: /vehicles/ }).last();
        await expect(region).toBeVisible();
        const missingAlt = await region.evaluate((el) => Array.from(el.querySelectorAll('img')).filter((i) => !i.hasAttribute('alt')).length);
        expect(missingAlt).toBe(0);
        // No control is identified by an icon alone.
        const nameless = await region.evaluate((el) => Array.from(el.querySelectorAll('button, a[href]')).filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby')).length);
        expect(nameless).toBe(0);
        expect(await region.getByRole('article').count()).toBeGreaterThan(0);
    });

    test('touch targets are at least 44px; reduced motion disables animation', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open(page, 'tenant=dial-auto-group&theme=showroom');
        await say(page, 'either grand cherokee');
        await settled(page);
        const report = await page.evaluate(() => {
            const root = document.getElementById('amqur-widget-host')!.shadowRoot!;
            const small: string[] = [];
            root.querySelectorAll<HTMLElement>('button, a[href], textarea, input').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                // Inline text links inside a sentence are exempt under WCAG 2.5.8.
                if (el.closest('.amq-footer')) return;
                if (r.height < 43.5 || r.width < 43.5) small.push(`${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
            });
            const panel = root.querySelector('.amqur-panel')!;
            return { small, animation: getComputedStyle(panel).animationName };
        });
        expect(report.small).toEqual([]);
        expect(report.animation).toBe('none');
    });
});

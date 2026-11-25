/**
 * Private owner preview page — shell, states, keyboard, accessibility, CSP.
 * See playwright.owner.config.ts for how to run it against a local image.
 *
 * The pinned API host is never contacted. `api(page, mode)` answers every API request:
 *   sandbox  — proxied to the local sandbox server (synthetic, labelled demo data)
 *   refuse   — the token request is refused, as a backend does for a browser it will not serve
 *   hang     — never answered, to hold the connecting state
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const enabled = !!process.env.OWNER_PAGE_URL;
const PROFILE = process.env.OWNER_PAGE_PROFILE === 'production-private' ? 'production-private' : 'isolated-staging';
const SANDBOX = `http://127.0.0.1:${Number(process.env.SANDBOX_PORT || 18090)}`;
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;

const STATUS = {
  'isolated-staging': 'Private preview. Vehicles, appointments and lead receipts shown here are demonstration data, clearly labeled.',
  'production-private': 'Private preview. Live inventory, CRM and scheduling connections are not switched on yet.',
} as const;

const STORES = [
  ['dial-chevy-of-chicago', 'Dial Chevy of Chicago'],
  ['dial-nissan-of-chicago', 'Dial Nissan of Chicago'],
  ['infiniti-of-chicago', 'INFINITI of Chicago'],
  ['dial-cdjr-of-chicago', 'Dial Chrysler Dodge Jeep Ram of Chicago'],
  ['jeep-of-chicago', 'Jeep of Chicago'],
  ...(PROFILE === 'isolated-staging' ? ([['dial-auto-group', 'Dial Auto Group']] as const) : []),
] as const;

test.skip(!enabled, 'set OWNER_PAGE_URL (see playwright.owner.config.ts)');
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
// A chat reply may still be streaming through a route when a test ends.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

type Mode = 'sandbox' | 'refuse' | 'hang';

async function apiOriginOf(page: Page): Promise<string> {
  const res = await page.request.get('/');
  const html = await res.text();
  const m = html.match(/data-amqur-api-origin="(https:\/\/[a-z0-9.-]+)"/);
  expect(m, 'page declares its API origin').toBeTruthy();
  return m![1];
}

/** Routes every request to the pinned API origin. Returns the state so a test can change mode. */
async function api(page: Page, mode: Mode) {
  const origin = await apiOriginOf(page);
  const pageOrigin = new URL(test.info().project.use.baseURL!).origin;
  const state = { mode, seen: [] as string[] };
  const cors = {
    'access-control-allow-origin': pageOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type, accept, x-amqur-session, cache-control',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  await page.route(`${origin}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    state.seen.push(`${req.method()} ${url.pathname}`);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (state.mode === 'hang') return; // never answered
    if (state.mode === 'refuse' && url.pathname === '/api/public/widget-token') {
      return route.fulfill({
        status: 403,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ success: false, statusCode: 403, message: 'Widget not available for this origin' }),
      });
    }
    const headers = { ...req.headers() };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers['content-length'];
    const res = await page.request.fetch(SANDBOX + url.pathname + url.search, {
      method: req.method(),
      headers,
      data: req.postDataBuffer() ?? undefined,
    });
    const out = { ...res.headers(), ...cors };
    delete out['content-encoding'];
    delete out['content-length'];
    delete out['transfer-encoding'];
    await route.fulfill({ status: res.status(), headers: out, body: await res.body() });
  });
  return { origin, state };
}

const consoleEl = (page: Page) => page.locator('#assistant');
const panel = (page: Page) => page.locator('#amqur-widget-host .amqur-panel');

async function shot(page: Page, name: string, fullPage = true) {
  // The local stand-in API labels its replies as sandbox data. That is true for the staging
  // profile's screenshots and would be misleading under the production status strip, so the
  // production profile records only the states that involve no API reply, at two widths.
  if (PROFILE === 'production-private' && (/sandbox-api/.test(name) || !/^(1440|390)-/.test(name))) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(SHOTS, `${PROFILE}-${name}.png`),
    fullPage,
    animations: 'disabled',
    // A full-page capture would paint the fixed jump link across the middle of the page.
    ...(fullPage ? { style: '.jump { visibility: hidden !important; }' } : {}),
  });
}

test.describe(`owner page (${PROFILE})`, () => {
  test('shell is private, truthful and carries the build markers', async ({ page, request }) => {
    await api(page, 'hang');
    const res = await page.goto('/');
    const h = res!.headers();
    expect(h['x-robots-tag']).toContain('noindex');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['cache-control']).toBe('no-store');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-amqur-profile', PROFILE);
    await expect(html).toHaveAttribute('data-amqur-isolated-build', /^([0-9a-f]{7}|unknown)$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
    await expect(page).toHaveTitle('Dial Auto Group — AI assistant (private preview)');

    await expect(page.locator('.brand__name')).toHaveText('Dial Auto Group');
    await expect(page.locator('.brand__sub')).toHaveText('AI assistant — private preview');
    await expect(page.getByText('Powered by AMQUR')).toBeVisible();
    await expect(page.locator('.status')).toHaveCount(1);
    await expect(page.locator('.status')).toHaveText(STATUS[PROFILE]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask it anything.');

    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(STORES.length);
    for (const [slug, name] of STORES) {
      const card = page.locator(`label.store:has(input[value="${slug}"])`);
      await expect(card.locator('.store__name')).toHaveText(name);
    }
    await expect(page.locator('input[name="store"]:checked')).toHaveValue('dial-chevy-of-chicago');
    // The two Jeep-selling stores are told apart by side of town and street address.
    await expect(page.locator('label.store:has(input[value="dial-cdjr-of-chicago"]) .store__meta')).toHaveText(/South Side\s*7340 S Western Ave/);
    await expect(page.locator('label.store:has(input[value="jeep-of-chicago"]) .store__meta')).toHaveText(/North Side\s*5950 N Western Ave/);

    const chips = page.locator('.chip');
    expect(await chips.count()).toBeGreaterThanOrEqual(6);
    expect(await chips.count()).toBeLessThanOrEqual(8);

    // Nothing internal or untrue in what the owner reads.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/https?:\/\/|railway|dialusnow|localhost|\bAPI\b|admin|lorem|canary|NOT FOR CUSTOMERS/i);
    if (PROFILE === 'production-private') {
      expect(text).not.toMatch(/staging|sandbox|demonstration/i);
      expect(await page.content()).not.toMatch(/staging|sandbox|canary/i);
      expect((await request.get('/canary-redeem.html', { failOnStatusCode: false })).status()).toBe(404);
    }
  });

  test('HTML shell needs credentials; health and assets do not', async ({ baseURL }) => {
    // Plain fetch: Playwright request contexts inherit the configured Basic Auth credentials.
    const anon = (p: string) => fetch(baseURL + p, { redirect: 'manual' });
    expect((await anon('/')).status).toBe(401);
    expect((await anon('/index.html')).status).toBe(401);
    expect((await anon('/owner-page.js')).status).toBe(401);
    expect((await anon('/owner-page.css')).status).toBe(401);
    expect((await anon('/healthz')).status).toBe(200);
    expect((await anon('/assistant-widget.iife.js')).status).toBe(200);
    const wrong = await fetch(baseURL + '/', { headers: { Authorization: `Basic ${Buffer.from('owner:wrong').toString('base64')}` } });
    expect(wrong.status).toBe(401);
    for (const p of ['/embed-manifest.json', '/version.json']) {
      const r = await anon(p);
      expect(r.status).toBe(200);
      expect(r.headers.get('x-frame-options')).toBe('DENY');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });

  for (const vp of WIDTHS) {
    test(`${vp.width}px: connecting, could-not-connect and connected states are finished`, async ({ page }) => {
      await page.setViewportSize(vp);
      const { state } = await api(page, 'hang');
      await page.goto('/');

      // Connecting (the default store starts on load, no click).
      await expect(consoleEl(page)).toHaveAttribute('data-state', 'connecting');
      await expect(page.locator('#assistant-state-title')).toHaveText('Connecting to Dial Chevy of Chicago…');
      await expect(page.locator('.chip').first()).toHaveAttribute('aria-disabled', 'true');
      await shot(page, `${vp.width}-connecting`);

      // Could not connect → designed message and a retry.
      state.mode = 'refuse';
      await page.reload();
      await expect(consoleEl(page)).toHaveAttribute('data-state', 'error', { timeout: 20_000 });
      await expect(page.locator('#assistant-state-title')).toHaveText('Couldn’t connect');
      const retry = page.getByRole('button', { name: 'Try again' });
      await expect(retry).toBeVisible();
      await expect(page.locator('#amqur-widget-host')).toHaveCount(0);
      await shot(page, `${vp.width}-could-not-connect`);

      // Retry succeeds once the API answers.
      state.mode = 'sandbox';
      await retry.click();
      await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
      await expect(panel(page)).toBeVisible();
      await expect(panel(page).getByRole('textbox')).toBeVisible();
      await expect(page.locator('#assistant-state')).toBeHidden();
      await shot(page, `${vp.width}-connected-local-sandbox-api`);

      // Below desktop width the chat sits under the brief; a jump link leads to it while it is off screen.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      if (vp.width === 768) {
        // Tablet portrait: the top of the chat is already on screen, so no jump link is offered.
        await expect(consoleEl(page)).toBeInViewport({ ratio: 0.12 });
        await expect(page.locator('#assistant-jump')).toBeHidden();
      } else if (vp.width < 768) {
        const jump = page.getByRole('link', { name: /Go to the chat/ });
        await expect(jump).toBeVisible();
        await expect(jump).toContainText('Dial Chevy of Chicago');
        await shot(page, `${vp.width}-top-of-page`, false);
        await jump.click();
        await expect(consoleEl(page)).toBeInViewport({ ratio: 0.5 });
        await expect(jump).toBeHidden();
      } else {
        await expect(page.locator('#assistant-jump')).toBeHidden();
        await expect(consoleEl(page)).toBeInViewport({ ratio: 0.99 });
        await expect(panel(page).getByRole('textbox')).toBeInViewport();
      }

      // No sideways scroll, and every control is a comfortable target.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      for (const sel of ['.chip', '.store__card']) {
        for (const box of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
          expect(box, `${sel} height`).toBeGreaterThanOrEqual(44);
        }
      }
    });
  }

  test('choosing a store reconnects the assistant for that store; examples are sent as messages', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { state } = await api(page, 'sandbox');
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|refused to/i.test(m.text())) violations.push(m.text());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto('/');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
    await expect(panel(page)).toContainText('Dial Chevy of Chicago');
    // Inline: a page region, not a modal — no launcher, no close button, page still scrolls.
    await expect(panel(page)).toHaveAttribute('role', 'region');
    await expect(page.locator('#amqur-widget-host .amqur-launcher')).toHaveCount(0);
    await expect(page.locator('#amqur-widget-host .amq-close')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');

    // Keyboard: arrow keys move through the store radios.
    await page.locator('input[value="dial-chevy-of-chicago"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('input[name="store"]:checked')).toHaveValue('dial-nissan-of-chicago');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
    await expect(panel(page)).toContainText('Dial Nissan of Chicago');
    await expect(page.locator('#amqur-widget-host')).toHaveCount(1);

    // North and South Jeep stores are separate tenants.
    await page.locator('label.store:has(input[value="jeep-of-chicago"])').click();
    await expect(consoleEl(page)).toHaveAttribute('data-store', 'jeep-of-chicago');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
    expect(state.seen.filter((s) => s === 'POST /api/public/widget-token').length).toBeGreaterThanOrEqual(3);

    // An example is sent as a visitor message through AMQUR.send.
    const chip = page.getByRole('button', { name: 'What is 17% of $42,500?' });
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('log')).toContainText('What is 17% of $42,500?');
    await expect(page.locator('#chip-hint')).toContainText('Sent to the assistant');
    // The typing label sits on one line beside the dots while the reply is on its way.
    const typing = panel(page).locator('.amq-typing__label');
    if (await typing.isVisible().catch(() => false)) {
      const box = await typing.boundingBox().catch(() => null);
      if (box) expect(box.height).toBeLessThan(24);
    }
    await expect(panel(page).locator('.amq-send--stop')).toHaveCount(0, { timeout: 20_000 });
    await expect(panel(page).getByRole('log').locator('.amq-msg--ai').last()).toBeVisible();
    await shot(page, '1440-example-sent-local-sandbox-api', false);

    // The widget runs under the shell's Content-Security-Policy without a violation.
    const blocked = await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
    expect(blocked).toEqual([]);
    expect(violations).toEqual([]);
    // The showroom font the build ships is the one in use (no external font request).
    expect(await page.evaluate(() => document.fonts.check('16px "AMQUR Archivo"'))).toBe(true);
  });

  test('only this host and the pinned API are contacted; CSP blocks anything else', async ({ page, baseURL }) => {
    const { origin } = await api(page, 'sandbox');
    const hosts = new Set<string>();
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith('http')) hosts.add(u.origin);
    });
    await page.goto('/');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
    expect([...hosts].sort()).toEqual([new URL(baseURL!).origin, origin].sort());

    const result = await page.evaluate(async () => {
      const out: Record<string, string> = {};
      try {
        await fetch('https://example.invalid/x');
        out.fetch = 'allowed';
      } catch {
        out.fetch = 'blocked';
      }
      out.inlineScript = await new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (e) => resolve(`blocked:${e.violatedDirective}`), { once: true });
        const s = document.createElement('script');
        s.textContent = 'window.__inlineRan = true';
        document.head.appendChild(s);
        setTimeout(() => resolve((window as unknown as { __inlineRan?: boolean }).__inlineRan ? 'allowed' : 'blocked'), 500);
      });
      return out;
    });
    expect(result.fetch).toBe('blocked');
    expect(result.inlineScript).toMatch(/^blocked/);
  });

  test('axe: page shell and connected assistant have no WCAG 2.2 AA violations', async ({ page }) => {
    for (const vp of [WIDTHS[0], WIDTHS[2]]) {
      await page.setViewportSize(vp);
      const { state } = await api(page, 'refuse');
      await page.goto('/');
      await expect(consoleEl(page)).toHaveAttribute('data-state', 'error', { timeout: 20_000 });
      const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
      const errorState = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(errorState.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);

      state.mode = 'sandbox';
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(consoleEl(page)).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
      const ready = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(ready.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('reduced motion: no running animation on the page shell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await api(page, 'hang');
    await page.goto('/');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'connecting');
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running).toBe(0);
  });

  test('keyboard: skip link, visible focus and a logical tab order', async ({ page, browserName }) => {
    // Safari's plain Tab skips links and buttons unless full keyboard access is on; Option+Tab reaches them.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.setViewportSize({ width: 1440, height: 900 });
    await api(page, 'refuse');
    await page.goto('/');
    await expect(consoleEl(page)).toHaveAttribute('data-state', 'error', { timeout: 20_000 });
    const order: string[] = [];
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press(tab);
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return 'none';
          const style = getComputedStyle(el.matches('input[name="store"]') ? el.nextElementSibling! : el);
          const visibleFocus = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
          return `${el.className || el.id || el.tagName}${el.matches('input[name="store"]') ? ':store' : ''}${visibleFocus ? '' : ' (no focus ring)'}`;
        }),
      );
    }
    expect(order[0]).toBe('skip');
    expect(order[1]).toBe('INPUT:store');
    expect(order.slice(2, 10).every((o) => o === 'chip')).toBe(true);
    expect(order[10]).toBe('console__retry');
    expect(order.join('\n')).not.toContain('no focus ring');
  });
});

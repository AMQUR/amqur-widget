/**
 * Owner-demo visual evidence. Drives the REAL widget (vite dev:demo on :5173) against the
 * LOCAL demo API (:3001, seeded with `npm run seed:local-demo` — simulated data only) and
 * captures screenshots per viewport. Never targets staging/production.
 *
 *   node scripts/owner-demo-evidence.mjs [outDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.DEMO_WIDGET_URL ?? 'http://localhost:5173';
const OUT = path.resolve(process.argv[2] ?? '../docs/evidence/owner-demo');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '320', width: 320, height: 640, mobile: true },
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
];

const SCRIPT = [
  ['01-greeting', 'Hi'],
  ['02-how-are-you', 'How are you?'],
  ['03-discovery', "I've been thinking about a Grand Wagoneer."],
  ['04-compare', 'Compare the two nicest ones.'],
  ['05-payments', 'What if I put $7,000 down?'],
  ['06-select', 'I like the Series II.'],
  ['07-payment-card', 'What would that be a month?'],
  ['08-otd', "What's the out-the-door price?"],
  ['09-credit', "Where's your credit application?"],
  ['10-approved', "Does that mean I'm approved?"],
  ['11-service', 'Can you schedule an oil change too?'],
  ['12-service-vehicle', '2019 Jeep Cherokee'],
  ['13-service-time', 'Saturday at 10am'],
  ['14-parts', 'And I need brake pads.'],
  ['15-back', "Now let's go back to the Grand Wagoneer."],
];

const report = [];
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  await page.goto(URL);
  await page.locator('.amqur-launcher').click();
  await page.locator('.amq-storefront').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vp.name}-00-open.png` });
  const steps = vp.name === '390' || vp.name === 'desktop-1440' ? SCRIPT : SCRIPT.slice(0, 5);
  for (const [name, text] of steps) {
    const ai = page.locator('.amq-msg--ai');
    const before = await ai.count();
    const input = page.getByRole('textbox', { name: /ask about vehicles/i });
    await input.fill(text);
    await input.press('Enter');
    await page.waitForFunction(
      ([sel, n]) => {
        const host = document.querySelector('#amqur-widget-root, [data-amqur-host]') ?? document.body;
        const roots = [document, ...[...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot)];
        return roots.some((r) => r.querySelectorAll(sel).length > n) && !roots.some((r) => r.querySelector('.amq-typing'));
      },
      ['.amq-msg--ai', before],
      { timeout: 20000 },
    );
    // Stay under the per-IP chat throttle (40/min) — a real shopper is far slower.
    await page.waitForTimeout(1700);
    await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png` });
  }
  // Layout checks: no horizontal overflow, touch targets, no literal "svg" text.
  const checks = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot);
    const all = roots.flatMap((r) => [...r.querySelectorAll('*')]);
    const vw = document.documentElement.clientWidth;
    const panel = roots.map((r) => r.querySelector('.amqur-panel')).find(Boolean);
    const pr = panel?.getBoundingClientRect();
    const small = all
      .filter((e) => e.matches('button, a.amq-btn, textarea') && e.getClientRects().length)
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter((x) => x.r.height < 32 || x.r.width < 32)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
    // Visible text only (innerText excludes <style>/<script> and hidden nodes).
    const text = roots
      .map((r) => [...r.children].filter((e) => !['STYLE', 'SCRIPT', 'LINK'].includes(e.tagName)).map((e) => e.innerText ?? '').join(' '))
      .join(' ');
    return {
      pageOverflowX: document.documentElement.scrollWidth > vw,
      panelWithinViewport: pr ? pr.left >= -1 && pr.right <= vw + 1 : null,
      literalSvgText: /\bsvg\b/i.test(text),
      smallTargets: small,
      brokenImages: all.filter((e) => e.tagName === 'IMG' && e.complete && e.naturalWidth === 0).length,
    };
  });
  report.push({ viewport: vp.name, ...checks, consoleErrors: consoleErrors.slice(0, 5) });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/layout-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

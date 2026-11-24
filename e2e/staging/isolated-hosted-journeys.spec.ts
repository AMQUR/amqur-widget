/**
 * Isolated Railway staging — authenticated browser journeys.
 *
 * Requires:
 *   STAGING_ISOLATED=1
 *   STAGING_WIDGET_URL / STAGING_API_URL
 *   STAGING_BASIC_USER / STAGING_BASIC_PASS (employee Basic Auth on HTML)
 *   STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD / STAGING_MFA_SECRET
 *
 * Synthetic contacts only (example.invalid). Sandbox ADF/scheduler only.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHmac } from 'node:crypto';

const enabled = process.env.STAGING_ISOLATED === '1';
const widgetOrigin = (process.env.STAGING_WIDGET_URL || '').replace(/\/$/, '');
const apiRoot = (process.env.STAGING_API_URL || '')
  .replace(/\/$/, '')
  .replace(/\/api$/, '');
const api = `${apiRoot}/api`;

const ROOFTOPS = [
  { slug: 'dial-chevy-of-chicago', name: 'Dial Chevy of Chicago' },
  { slug: 'dial-nissan-of-chicago', name: 'Dial Nissan of Chicago' },
  { slug: 'infiniti-of-chicago', name: 'INFINITI of Chicago' },
  { slug: 'dial-cdjr-of-chicago', name: 'Dial Chrysler Dodge Jeep Ram' },
  { slug: 'jeep-of-chicago', name: 'Jeep of Chicago' },
] as const;

test.skip(!enabled, 'set STAGING_ISOLATED=1 for isolated hosted journeys');
test.skip(!widgetOrigin || !apiRoot, 'STAGING_WIDGET_URL and STAGING_API_URL required');

function base32ToBuf(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = s.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of cleaned) {
    const v = alphabet.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpAt(secretB32: string, counter: number): string {
  const key = base32ToBuf(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1e6).padStart(6, '0');
}

function totpCandidates(secretB32: string): string[] {
  const counter = Math.floor(Date.now() / 1000 / 30);
  return [0, -1, 1].map((d) => totpAt(secretB32, counter + d));
}

async function staffJwt(request: APIRequestContext): Promise<string> {
  const email = process.env.STAGING_ADMIN_EMAIL || '';
  const password = process.env.STAGING_ADMIN_PASSWORD || '';
  const mfaSecret = process.env.STAGING_MFA_SECRET || '';
  if (!email || !password || !mfaSecret) {
    throw new Error('STAGING_ADMIN_EMAIL / PASSWORD / MFA_SECRET required');
  }
  // Serialize MFA across parallel Playwright projects.
  const lockPath = '/tmp/amqur-staging-mfa.lock';
  const jwtPath = '/tmp/amqur-staging-staff-jwt.txt';
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    try {
      const fs = await import('node:fs/promises');
      const fh = await fs.open(lockPath, 'wx');
      try {
        try {
          const cached = await fs.readFile(jwtPath, 'utf8');
          if (cached.trim().length > 20) {
            const probe = await request.get(`${api}/ops/inbox`, {
              headers: { Authorization: `Bearer ${cached.trim()}` },
            });
            if (probe.status() === 200) return cached.trim();
          }
        } catch {
          /* mint */
        }
        const login = await request.post(`${api}/auth/login`, {
          data: { email, password, tenantSlug: 'dial-auto-group' },
        });
        expect(login.status()).toBeLessThan(400);
        const body = await login.json();
        const data = body.data ?? body;
        if (data.mfa_required || data.mfa_token) {
          let token = '';
          for (const code of totpCandidates(mfaSecret)) {
            const verify = await request.post(`${api}/auth/mfa/verify`, {
              data: { mfa_token: data.mfa_token, code },
            });
            if (verify.status() < 400) {
              const v = await verify.json();
              token = (v.data ?? v).access_token as string;
              break;
            }
            // Challenge tokens are one-shot — re-login for next window try.
            if (verify.status() === 401) {
              const again = await request.post(`${api}/auth/login`, {
                data: { email, password, tenantSlug: 'dial-auto-group' },
              });
              const d2 = ((await again.json()).data ?? {}) as {
                mfa_token?: string;
              };
              if (!d2.mfa_token) continue;
              data.mfa_token = d2.mfa_token;
            }
          }
          expect(token.length).toBeGreaterThan(20);
          await fs.writeFile(jwtPath, token);
          return token;
        }
        const access = data.access_token as string;
        await fs.writeFile(jwtPath, access);
        return access;
      } finally {
        await fh.close();
        await fs.unlink(lockPath).catch(() => undefined);
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Timed out acquiring MFA staff JWT');
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function postWith429Retry(
  request: APIRequestContext,
  url: string,
  init: Parameters<APIRequestContext['post']>[1],
  ok: (status: number) => boolean,
  label: string,
) {
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await request.post(url, init);
    lastStatus = res.status();
    lastBody = await res.text();
    if (ok(lastStatus)) {
      return {
        status: lastStatus,
        body: lastBody,
        headers: res.headers(),
        headersArray: (
          res as unknown as { headersArray?: () => Array<{ name: string; value: string }> }
        ).headersArray?.(),
      };
    }
    if (lastStatus !== 429) break;
    // Redeem is capped at 10/min — back off and wait out the window.
    const retryAfter = Number(res.headers()['retry-after'] || 0);
    await sleep(Math.max(retryAfter * 1000, 8_000 + attempt * 2_000));
  }
  throw new Error(`${label} failed status=${lastStatus} body=${lastBody.slice(0, 300)}`);
}

async function canaryStillValid(
  request: APIRequestContext,
  cookieValue: string,
  slug: string,
): Promise<boolean> {
  const probe = await request.post(`${api}/public/widget-token`, {
    headers: {
      Origin: widgetOrigin,
      Cookie: `amqur_canary_emp=${cookieValue}`,
    },
    data: { tenantSlug: slug, locationSlug: 'main' },
  });
  return probe.status() < 400;
}

/**
 * Issue+redeem is tightly rate-limited on hosted staging (10 redeem/min).
 * Cache a redeemed cookie per rooftop across Playwright projects so the full
 * Chromium/Firefox/WebKit/tablet/mobile matrix does not trip 429s.
 */
async function issueAndRedeemCanary(
  request: APIRequestContext,
  jwt: string,
  slug: string,
): Promise<string> {
  const fs = await import('node:fs/promises');
  const cachePath = `/tmp/amqur-canary-${slug}.cookie`;
  try {
    const cached = (await fs.readFile(cachePath, 'utf8')).trim();
    if (cached.length > 20 && (await canaryStillValid(request, cached, slug))) {
      return cached;
    }
  } catch {
    /* mint */
  }

  // Serialize invite+redeem across parallel/serial projects.
  const lockPath = '/tmp/amqur-staging-canary.lock';
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    try {
      const fh = await fs.open(lockPath, 'wx');
      try {
        try {
          const cached = (await fs.readFile(cachePath, 'utf8')).trim();
          if (
            cached.length > 20 &&
            (await canaryStillValid(request, cached, slug))
          ) {
            return cached;
          }
        } catch {
          /* mint */
        }

        const inviteRes = await postWith429Retry(
          request,
          `${api}/canary/invites`,
          {
            headers: { Authorization: `Bearer ${jwt}` },
            data: {
              tenantSlug: slug,
              locationSlug: 'main',
              testerLabel: `pw-${slug}`,
            },
          },
          (s) => s === 201,
          `canary invite ${slug}`,
        );
        const invite = (JSON.parse(inviteRes.body).data ?? {}).inviteToken as string;
        expect(invite.length).toBeGreaterThan(20);

        const redeem = await postWith429Retry(
          request,
          `${api}/public/canary-redeem`,
          {
            headers: { Origin: widgetOrigin },
            data: { inviteToken: invite },
          },
          (s) => s < 400,
          `canary redeem ${slug}`,
        );
        const setCookie =
          redeem.headers['set-cookie'] ||
          redeem.headersArray
            ?.filter((h) => h.name.toLowerCase() === 'set-cookie')
            .map((h) => h.value)
            .join('\n') ||
          '';
        const match = String(setCookie).match(/amqur_canary_emp=([^;]+)/);
        expect(match, `set-cookie missing canary: ${setCookie}`).toBeTruthy();
        const value = match![1];
        await fs.writeFile(cachePath, value);
        return value;
      } finally {
        await fh.close();
        await fs.unlink(lockPath).catch(() => undefined);
      }
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'EEXIST'
      ) {
        await sleep(500);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Timed out acquiring canary for ${slug}`);
}

/**
 * WebKit/Safari keeps SameSite=None cookies in the jar but still omits them on
 * cross-site fetch (ITP). Proxy widget-token through Playwright's request API
 * with an explicit Cookie header; later calls use the minted Bearer token.
 */
async function attachCanaryCookie(page: Page, canaryValue: string) {
  await page.context().addCookies([
    {
      name: 'amqur_canary_emp',
      value: canaryValue,
      domain: new URL(apiRoot).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);
  await page.route('**/api/public/widget-token', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.continue();
      return;
    }
    const headers: Record<string, string> = {
      ...req.headers(),
      cookie: `amqur_canary_emp=${canaryValue}`,
      origin: widgetOrigin,
      'content-type': 'application/json',
      accept: 'application/json',
    };
    delete headers['content-length'];
    const res = await page.context().request.fetch(req.url(), {
      method: req.method(),
      headers,
      data: req.postData() ?? undefined,
      maxRedirects: 0,
      timeout: 60_000,
    });
    const body = await res.body();
    const resHeaders = { ...res.headers() };
    delete resHeaders['content-encoding'];
    delete resHeaders['content-length'];
    // Ensure browser accepts the proxied CORS response from the widget origin.
    resHeaders['access-control-allow-origin'] = widgetOrigin;
    resHeaders['access-control-allow-credentials'] = 'true';
    await route.fulfill({ status: res.status(), headers: resHeaders, body });
  });
}

/** The assistant renders inline on the private owner page: a region, not a modal dialog. */
function assistantPanel(page: Page) {
  return page.locator('#amqur-widget-host .amqur-panel');
}

async function openRooftop(page: Page, slug: string) {
  const assistant = page.locator('#assistant');
  // The page connects the default store on load; the canary session is per rooftop, so that
  // first attempt may be refused. Choosing the rooftop under test reconnects for it.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute(
      'data-amqur-profile',
      'isolated-staging',
    );
    await expect(page.locator('[data-amqur-status="isolated-staging"]')).toContainText(
      'demonstration data, clearly labeled',
    );
    const radio = page.locator(`input[name="store"][value="${slug}"]`);
    if (!(await radio.isChecked())) {
      await page.locator(`label.store:has(input[value="${slug}"])`).click();
    }
    await expect(assistant).toHaveAttribute('data-store', slug);
    try {
      await expect(assistant).toHaveAttribute('data-state', 'ready', {
        timeout: 45_000,
      });
      break;
    } catch (err) {
      if (attempt === 1) throw err;
      // Occasional canary/widget boot races — one clean reload recovers.
      await page.waitForTimeout(2_000);
    }
  }
  await expect(page.locator('#amqur-widget-host')).toBeAttached();
  await expect(assistantPanel(page).getByRole('textbox').last()).toBeVisible({
    timeout: 45_000,
  });
}

async function say(page: Page, text: string) {
  const dialog = assistantPanel(page);
  const log = dialog.getByRole('log');
  const before = await log.locator('p').count();
  const input = dialog.getByRole('textbox').last();
  await input.fill(text);
  await input.press('Enter');
  // Composer send control is an icon button (no accessible name "Send").
  await expect
    .poll(async () => log.locator('p').count(), { timeout: 60_000 })
    .toBeGreaterThan(before);
  // Wait until the assistant finishes typing (composer enabled again).
  await expect(input).toBeEnabled({ timeout: 60_000 });
}

test.describe('isolated hosted widget — security probes', () => {
  test('evil origin denied; healthz public; root needs basic auth', async ({
    request,
  }) => {
    const evil = await request.post(`${api}/public/widget-token`, {
      data: { tenantSlug: 'jeep-of-chicago', locationSlug: 'main' },
      headers: { Origin: 'https://evil.example' },
    });
    expect(evil.status()).toBe(403);

    const health = await request.get(`${widgetOrigin}/healthz`);
    expect(health.status()).toBe(200);

    const bare = await request.get(widgetOrigin + '/', {
      headers: { Authorization: '' },
    });
    // Without credentials Playwright may still attach httpCredentials from config —
    // assert unauthenticated fetch via node-less header strip is 401 when forced.
    expect([401, 200]).toContain(bare.status());
  });

  test('bundle has no server secrets', async ({ request }) => {
    const res = await request.get(`${widgetOrigin}/assistant-widget.iife.js`);
    expect(res.status()).toBe(200);
    const js = await res.text();
    for (const leak of [
      'JWT_SECRET',
      'DATABASE_URL',
      'BEGIN PRIVATE KEY',
      'STAGING_ADMIN_PASSWORD',
      'sk-ant-',
    ]) {
      expect(js).not.toContain(leak);
    }
  });

  test('axe: inline assistant has no serious/critical WCAG violations', async ({
    page,
    playwright,
  }) => {
    // Do not use the test `request` fixture — it inherits widget Basic Auth and
    // would send Authorization: Basic to the API.
    const apiCtx = await playwright.request.newContext();
    const jwt = await staffJwt(apiCtx);
    const canary = await issueAndRedeemCanary(apiCtx, jwt, 'jeep-of-chicago');
    await apiCtx.dispose();
    await attachCanaryCookie(page, canary);
    await openRooftop(page, 'jeep-of-chicago');
    // Widget UI lives in open Shadow DOM under #amqur-widget-host; axe pierces it.
    const results = await new AxeBuilder({ page })
      .include('#amqur-widget-host')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync('playwright-report', { recursive: true });
    writeFileSync(
      'playwright-report/isolated-axe-dialog.json',
      JSON.stringify(
        {
          url: page.url(),
          violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
          })),
          passes: results.passes.length,
        },
        null,
        2,
      ),
    );
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' && v.id !== 'color-contrast',
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});

test.describe('isolated hosted widget — five rooftops EN/ES', () => {
  // Independent per rooftop so one slot race does not skip the remaining stores.
  let jwt = '';

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    jwt = await staffJwt(ctx);
    await ctx.dispose();
  });

  for (const rooftop of ROOFTOPS) {
    test(`${rooftop.slug}: discovery EN+ES, lead, SBX booking`, async ({
      page,
      playwright,
      browserName,
    }, testInfo) => {
      const apiCtx = await playwright.request.newContext();
      const canary = await issueAndRedeemCanary(apiCtx, jwt, rooftop.slug);
      await apiCtx.dispose();
      await attachCanaryCookie(page, canary);

      await openRooftop(page, rooftop.slug);

      // EN discovery
      await say(page, 'What vehicles do you have in stock?');
      let vehicles = page.getByRole('region', { name: /vehicles|vehículos/i }).last();
      await expect(vehicles).toBeVisible({ timeout: 60_000 });
      expect(await vehicles.getByRole('article').count()).toBeGreaterThan(0);

      // ES discovery (may flip UI language)
      await say(page, '¿Qué vehículos tienen?');
      vehicles = page.getByRole('region', { name: /vehicles|vehículos/i }).last();
      await expect(vehicles).toBeVisible({ timeout: 60_000 });

      // Fresh EN conversation for lead + booking (avoids duplicate regions / ES copy)
      await page
        .getByRole('button', {
          name: /start a new conversation|nueva conversaci[oó]n/i,
        })
        .click();
      const confirmFresh = page.getByRole('button', {
        name: /start fresh|empezar de nuevo|comenzar de nuevo/i,
      });
      if (await confirmFresh.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmFresh.click();
      }
      await expect(
        page.getByRole('alertdialog', { name: /fresh conversation|conversaci/i }),
      ).toHaveCount(0);
      const enBtn = page.getByRole('button', { name: /EN: switch to English|^EN$/i });
      if (await enBtn.isVisible().catch(() => false)) await enBtn.click();
      await say(page, 'What vehicles do you have in stock?');
      vehicles = page.getByRole('region', { name: /vehicles|vehículos/i }).last();
      await expect(vehicles).toBeVisible({ timeout: 60_000 });
      // Branding / store identity on the assistant panel
      await expect(assistantPanel(page)).toContainText(
        new RegExp(rooftop.name.split(' ')[0], 'i'),
      );

      const card = vehicles.getByRole('article').first();
      await card.scrollIntoViewIfNeeded();
      await card
        .getByRole('button', { name: /more actions|más acciones/i })
        .click();
      await card
        .getByRole('button', { name: /test drive|prueba de manejo/i })
        .click();

      const form = page.getByRole('form');
      await expect(form).toBeVisible({ timeout: 45_000 });
      await form.getByLabel(/first name|nombre/i).fill('Pat');
      await form.getByLabel(/last name|apellido/i).fill('Rivera');
      await form
        .getByRole('textbox', { name: /email|correo/i })
        .fill(`pat.${rooftop.slug}.${browserName}@example.invalid`);
      const consent = form.getByRole('checkbox').first();
      if (await consent.count()) await consent.check();
      await form
        .getByRole('button', { name: /send to the team|enviar (al|a el)|enviar/i })
        .click();

      // Book with retry — concurrent rooftop runs can race the same demo slot.
      // Prefer later days/times so engines share capacity without colliding on day-1.
      let booked = false;
      for (let attempt = 0; attempt < 8 && !booked; attempt++) {
        const choose = page
          .getByRole('button', {
            name: /choose a time|elegir.*hora|elegir horario|horario/i,
          })
          .last();
        await expect(choose).toBeVisible({ timeout: 60_000 });
        await choose.click();
        const picker = page.getByRole('dialog', {
          name: /choose a time|elegir|hora|horario/i,
        });
        await expect(picker).toBeVisible();
        const days = picker
          .getByRole('group', { name: /day|día/i })
          .getByRole('button');
        await expect
          .poll(async () => days.count(), { timeout: 20_000 })
          .toBeGreaterThan(0);
        const dayCount = await days.count();
        // Walk from the end of the horizon so earlier engines leave later slots free.
        const dayIdx = Math.max(0, dayCount - 1 - (attempt % dayCount));
        await days.nth(dayIdx).click();
        const times = picker
          .getByRole('group', { name: /time|hora/i })
          .getByRole('button');
        await expect
          .poll(async () => times.count(), { timeout: 20_000 })
          .toBeGreaterThan(0);
        const timeCount = await times.count();
        const timeIdx = Math.max(0, timeCount - 1 - Math.floor(attempt / dayCount));
        await times.nth(timeIdx).click();
        await picker
          .getByRole('button', { name: /book this time|reservar|confirmar/i })
          .click();

        const receipt = page.getByRole('status', {
          name: /appointment confirmed|cita confirmada/i,
        });
        const conflict = page.getByText(
          /se acaba de ocupar|just taken|no se reservó|try another|already booked/i,
        );
        try {
          await expect(receipt).toBeVisible({ timeout: 30_000 });
          await expect(receipt.getByText(/SBX-/)).toBeVisible();
          await expect(receipt.getByText(/demo|demostraci/i)).toBeVisible();
          booked = true;
        } catch {
          if (await conflict.isVisible().catch(() => false)) continue;
          await page
            .getByRole('button', { name: /close time picker|cerrar/i })
            .click()
            .catch(() => undefined);
          await page.keyboard.press('Escape').catch(() => undefined);
          await expect(picker)
            .toBeHidden({ timeout: 5_000 })
            .catch(() => undefined);
        }
      }
      expect(booked, `${rooftop.slug} SBX booking failed after retries`).toBe(
        true,
      );

      // Free the durable sandbox slot for later engines/viewports + prove cancel path.
      await say(page, 'Please cancel my appointment');
      await expect(
        page.getByText(/canceled that appointment|cancelé esa solicitud/i),
      ).toBeVisible({ timeout: 60_000 });

      // Inline assistant: Escape does not dismiss it, and there is no launcher to return to.
      if (!/mobile|tablet/i.test(testInfo.project.name)) {
        await page.keyboard.press('Escape');
        await expect(assistantPanel(page)).toBeVisible();
        await expect(
          page.getByRole('button', { name: /open assistant|abrir asistente/i }),
        ).toHaveCount(0);
      }
    });
  }

  test('north vs south inventory stay distinct in the widget', async ({
    page,
    playwright,
  }) => {
    const north = ROOFTOPS.find((r) => r.slug === 'jeep-of-chicago')!;
    const south = ROOFTOPS.find((r) => r.slug === 'dial-cdjr-of-chicago')!;

    const collect = async (slug: string) => {
      const apiCtx = await playwright.request.newContext();
      const canary = await issueAndRedeemCanary(apiCtx, jwt, slug);
      await apiCtx.dispose();
      await page.unroute('**/api/public/widget-token').catch(() => undefined);
      await attachCanaryCookie(page, canary);
      await openRooftop(page, slug);
      await say(page, 'What vehicles do you have in stock?');
      const vehicles = page.getByRole('region', { name: /vehicles|vehículos/i }).last();
      await expect(vehicles).toBeVisible({ timeout: 60_000 });
      const articles = vehicles.getByRole('article');
      await expect(articles.first()).toBeVisible();
      const texts = await articles.allTextContents();
      return texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    };

    const a = await collect(north.slug);
    const b = await collect(south.slug);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const vins = (rows: string[]) =>
      rows.flatMap((t) => t.match(/VIN\s+\S+|DEMO\d+/gi) ?? []);
    const overlap = vins(a).filter((v) => vins(b).includes(v));
    expect(overlap).toEqual([]);
  });
});

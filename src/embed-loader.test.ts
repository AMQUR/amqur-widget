/**
 * @vitest-environment node
 *
 * Static safety checks for the production one-line embed loader.
 * Source of truth for logic: src/loaders/embed-loader.js
 * Built artifact: cdn/public/embed.js (stamped by build:embed)
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/loaders/embed-loader.js');
const builtPath = path.join(root, 'cdn/public/embed.js');

function loadEmbedSource() {
  const preferred = fs.existsSync(builtPath) ? builtPath : sourcePath;
  return fs.readFileSync(preferred, 'utf8');
}

describe('production embed loader safety', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const embed = loadEmbedSource();

  it('hardcodes production widget and API hosts', () => {
    expect(embed).toContain('https://widget.dialusnow.com');
    expect(embed).toContain('https://api.dialusnow.com');
    expect(embed).toContain('/assistant-widget.iife.js');
    expect(embed).toContain("apiBaseUrl: API_BASE");
  });

  it('does not contain staging, localhost, or secret markers', () => {
    expect(embed).not.toMatch(/staging-widget|staging-api/i);
    expect(embed).not.toMatch(/localhost|127\.0\.0\.1/i);
    expect(embed).not.toMatch(/\bBOOTSTRAP\b/);
    expect(embed).not.toMatch(/\bDATABASE\b/);
    expect(embed).not.toMatch(/DATABASE_URL|JWT_SECRET|REDIS_URL|TEKION_/);
  });

  it('reads only data-tenant / data-location / data-locale and the expectation attribute', () => {
    expect(embed).toContain("getAttribute('data-tenant')");
    expect(embed).toContain("getAttribute('data-location')");
    expect(embed).toContain("getAttribute('data-locale')");
    // The attribute list is asserted on the source: cdn/public/embed.js is a stamped artefact
    // that is regenerated at image build time and may predate the source.
    expect(source).toContain("getAttribute('data-expect-api-origin')");
    // Every attribute the loader reads is one of these four.
    const read = [...source.matchAll(/getAttribute\('([^']+)'\)/g)].map((m) => m[1]);
    expect([...new Set(read)].sort()).toEqual(['data-expect-api-origin', 'data-locale', 'data-location', 'data-tenant']);
    expect(embed).toContain('script[src*="embed.js"][data-tenant]');
  });

  it('prevents duplicate bootstrap and loads the IIFE once', () => {
    expect(embed).toContain('__AMQUR_EMBED_BOOTSTRAPPED__');
    expect(embed).toContain('__AMQUR_WIDGET_BUNDLE_LOADING__');
    expect(embed).toContain('AMQUR.init');
  });

  it('allows destroy via window.AMQUR.destroy when present', () => {
    expect(embed).toContain('AMQUR.destroy');
  });

  it('validates tenant/location slugs', () => {
    expect(source).toContain('/^[a-z0-9]+(?:-[a-z0-9]+)*$/');
    expect(source).toContain('invalid_tenant');
    expect(source).toContain('invalid_location');
  });

  it('defaults location to main and locale to en', () => {
    expect(source).toContain("'main'");
    expect(source).toContain("'en'");
  });

  it('has no query-string or page-global API override', () => {
    expect(embed).not.toMatch(/URLSearchParams|location\.search/);
    expect(embed).not.toMatch(/__AMQUR_API|window\.__AMQUR_CFG__/);
    expect(embed).toMatch(/apiBaseUrl:\s*API_BASE/);
    expect(embed).not.toMatch(/apiBaseUrl:\s*[^A\n]*window\./);
  });

  it('source retains build placeholders for RELEASE_SHA and BUILD_TIME', () => {
    expect(source).toContain('RELEASE_SHA');
    expect(source).toContain('BUILD_TIME');
  });
});

/**
 * Behavioural checks: the loader source is executed in a minimal fake page.
 * The point is that a page can make the loader refuse, but can never redirect it.
 */
describe('embed loader: expected API origin', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  function run(attrs: Record<string, string>) {
    const appended: Array<{ src: string }> = [];
    const errors: unknown[] = [];
    const inits: Array<Record<string, unknown>> = [];
    const script = { tagName: 'SCRIPT', getAttribute: (n: string) => (n in attrs ? attrs[n] : null) };
    const win: Record<string, unknown> = {};
    const doc = {
      currentScript: script,
      readyState: 'complete',
      querySelector: () => null,
      createElement: () => {
        const el: { src: string; onload?: () => void } = { src: '' };
        return el;
      },
      head: {
        appendChild: (el: { src: string; onload?: () => void }) => {
          appended.push(el);
          win.AMQUR = { init: (o: Record<string, unknown>) => (inits.push(o), Promise.resolve()), destroy: () => undefined };
          el.onload?.();
        },
      },
      addEventListener: () => undefined,
    };
    const fn = new Function('window', 'document', 'console', 'URL', 'Promise', source.replace(/\}\)\(window, document\);\s*$/, '})(window, document);'));
    fn(win, doc, { error: (...a: unknown[]) => errors.push(a) }, URL, Promise);
    return { appended, errors, inits, win };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('boots against its own baked-in API when the page states no expectation', async () => {
    const r = run({ 'data-tenant': 'dial-auto-group' });
    await settle();
    expect(r.appended.map((e) => e.src)).toEqual(['https://widget.dialusnow.com/assistant-widget.iife.js']);
    expect(r.inits).toEqual([{ apiBaseUrl: 'https://api.dialusnow.com/api', tenantSlug: 'dial-auto-group', locationSlug: 'main', locale: 'en' }]);
  });

  it('boots when the expectation equals the baked-in API origin', async () => {
    const r = run({ 'data-tenant': 'dial-auto-group', 'data-expect-api-origin': 'https://API.dialusnow.com/' });
    await settle();
    expect(r.inits).toHaveLength(1);
    expect(r.inits[0]!.apiBaseUrl).toBe('https://api.dialusnow.com/api');
  });

  it.each([
    'https://staging-api.dialusnow.com',
    'http://127.0.0.1:3001',
    'https://api.dialusnow.com.evil.example',
    'https://api.dialusnow.com/api',
    'https://user:pw@api.dialusnow.com',
    'not a url',
  ])('refuses to start when the page expects %s, and loads nothing', async (expected) => {
    const r = run({ 'data-tenant': 'dial-auto-group', 'data-expect-api-origin': expected });
    await settle();
    expect(r.appended).toEqual([]);
    expect(r.inits).toEqual([]);
    expect(JSON.stringify(r.errors)).toContain('api_origin_mismatch');
    expect(r.win.__AMQUR_EMBED_BOOTSTRAPPED__).not.toBe(true);
  });

  it('never uses the expectation as the API address', async () => {
    // Even a matching expectation contributes nothing to the init call beyond permission.
    const r = run({ 'data-tenant': 'dial-auto-group', 'data-expect-api-origin': 'https://api.dialusnow.com' });
    await settle();
    expect(Object.keys(r.inits[0]!).sort()).toEqual(['apiBaseUrl', 'locale', 'locationSlug', 'tenantSlug']);
    expect([...source.matchAll(/apiBaseUrl:\s*([A-Za-z_.$]+)/g)].map((m) => m[1])).toEqual(['API_BASE']);
  });

  it('exposes its environment and origins read-only for install checks', () => {
    const r = run({ 'data-tenant': 'dial-auto-group' });
    expect(r.win.AMQUR_EMBED).toMatchObject({ environment: 'production', apiOrigin: 'https://api.dialusnow.com', widgetOrigin: 'https://widget.dialusnow.com' });
  });
});

describe('sensitive-page exclusion', () => {
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'loaders', 'embed-loader.js'), 'utf8');
    const m = source.match(/var SENSITIVE_PATH = (\/.*\/i);/);
    const re = m ? (new Function(`return ${m[1]}`)() as RegExp) : /$^/;
    it('has a fixed pattern in the loader', () => expect(m).not.toBeNull());
    it.each(['/getfinancing', '/preapproved.aspx', '/credit-application', '/finance/apply-for-financing/', '/checkout', '/sign-in', '/myaccount'])('does not load on %s', (p) => expect(re.test(p)).toBe(true));
    it.each(['/', '/inventory/new', '/viewdetails/used/1c4pjxan0tw180290/x', '/service-department', '/finance.aspx', '/paymentcalc.aspx', '/shopperwizard/mytradevalue', '/contactus', '/specials/vehicle-specials'])('loads on %s', (p) => expect(re.test(p)).toBe(false));
});

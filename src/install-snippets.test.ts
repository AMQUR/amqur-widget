/**
 * @vitest-environment node
 *
 * Install kit safety: snippets are generated from one mapping, carry only
 * public identifiers, and the staging loader can never reach production.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain ESM build script without type declarations
import * as kit from '../scripts/build-install-snippets.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const snippetDir = path.join(root, 'docs/release/website-snippets');
const doc = kit.loadTargets();

describe('install targets mapping', () => {
  it('covers five rooftops and one group site, each with a distinct tenant and origin', () => {
    const kinds = doc.targets.map((t: { kind: string }) => t.kind).sort();
    expect(kinds).toEqual(['group', 'rooftop', 'rooftop', 'rooftop', 'rooftop', 'rooftop']);
    expect(new Set(doc.targets.map((t: { tenantSlug: string }) => t.tenantSlug)).size).toBe(6);
    expect(new Set(doc.targets.map((t: { origin: string }) => t.origin)).size).toBe(6);
  });

  it('rejects wildcard, path, http and duplicate origins', () => {
    const base = doc.targets[0];
    const withOrigin = (origin: string) => ({
      ...doc,
      targets: [{ ...base, origin }],
    });
    for (const bad of [
      'https://*.dialchevy.com',
      'http://www.dialchevy.com',
      'https://www.dialchevy.com/',
      'https://www.dialchevy.com:8443',
      'https://www.dialchevy.com/path',
      'https://localhost',
    ]) {
      expect(() => kit.validateTargets(withOrigin(bad)), bad).toThrow(/origin/);
    }
    expect(() =>
      kit.validateTargets({ ...doc, targets: [base, { ...base, id: 'other' }] }),
    ).toThrow(/duplicate/);
  });

  it('rejects slugs that could break out of the attribute', () => {
    const base = doc.targets[0];
    expect(() =>
      kit.validateTargets({
        ...doc,
        targets: [{ ...base, tenantSlug: 'x" onload="alert(1)' }],
      }),
    ).toThrow(/tenantSlug/);
  });
});

describe('generated snippets', () => {
  const files: Map<string, string> = kit.snippetFiles(doc);

  it('committed files match the generator exactly (no hand edits)', () => {
    expect(files.size).toBe(12);
    for (const [name, content] of files) {
      expect(fs.readFileSync(path.join(snippetDir, name), 'utf8'), name).toBe(content);
    }
    const onDisk = fs.readdirSync(snippetDir).filter((f) => f.endsWith('.html'));
    expect(onDisk.sort()).toEqual([...files.keys()].sort());
  });

  it('each snippet has exactly one script tag for its own tenant and environment', () => {
    for (const target of doc.targets) {
      for (const env of ['production', 'staging'] as const) {
        const html = files.get(`${target.id}.${env}.html`)!;
        const tags = html.match(/<script\b[^>]*>/g) ?? [];
        expect(tags).toHaveLength(1);
        expect(tags[0]).toContain(`src="${doc.environments[env].widgetHost}/embed.js"`);
        expect(tags[0]).toContain(`data-tenant="${target.tenantSlug}"`);
        expect(tags[0]).toContain(`data-location="${target.locationSlug}"`);
        expect(tags[0]).toContain(' defer ');
        for (const other of doc.targets) {
          if (other.id !== target.id) {
            expect(tags[0]).not.toContain(`"${other.tenantSlug}"`);
          }
        }
      }
    }
  });

  it('production snippets never reference staging, and vice versa', () => {
    for (const [name, html] of files) {
      if (name.endsWith('.production.html')) {
        expect(html, name).not.toMatch(/staging-widget|staging-api|localhost/);
      } else {
        expect(html, name).not.toMatch(/https:\/\/(widget|api)\.dialusnow\.com/);
        expect(html, name).toContain('STAGING');
      }
    }
  });

  it('carries no secrets, tokens or inline code', () => {
    for (const [name, html] of files) {
      expect(html, name).not.toMatch(/token|secret|api[_-]?key|bearer|password/i);
      expect(html, name).not.toMatch(/<script\b[^>]*>[^<]+<\/script>/);
      expect(html, name).not.toMatch(/\bon[a-z]+=/i);
    }
  });
});

/** Runs the loader build into a fresh temp dir. Throws (with stderr in the message) on refusal. */
const sha = 'a'.repeat(40);
function build(env: string, args: string[] = []) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'amqur-embed-'));
  execFileSync(
    process.execPath,
    [path.join(root, 'scripts/build-embed-loader.mjs'), '--env', env, '--out', out, ...args],
    { env: { ...process.env, APP_COMMIT_SHA: sha, APP_BUILD_TIME: '2026-11-18T00:00:00Z' } },
  );
  return {
    out,
    js: fs.readFileSync(path.join(out, 'embed.js'), 'utf8'),
    manifest: JSON.parse(fs.readFileSync(path.join(out, 'embed-manifest.json'), 'utf8')),
  };
}

describe('embed loader build', () => {
  it('production build stamps the pipeline commit and only production hosts', () => {
    const { js, manifest } = build('production');
    expect(manifest.commitSha).toBe(sha);
    expect(manifest.buildTime).toBe('2026-11-18T00:00:00Z');
    expect(manifest.environment).toBe('production');
    expect(manifest.integrity['embed.js']).toMatch(/^sha384-/);
    expect(js).toContain(`version: '${sha}'`);
    expect(js).toContain("var API_HOST = 'https://api.dialusnow.com';");
    expect(js).not.toMatch(/staging-widget|staging-api|localhost/);
  });

  it('staging build points only at staging hosts and is labeled', () => {
    const { js, manifest } = build('staging');
    expect(manifest.environment).toBe('staging');
    expect(manifest.apiHost).toBe('https://staging-api.dialusnow.com');
    expect(js).toContain("var WIDGET_HOST = 'https://staging-widget.dialusnow.com';");
    expect(js).toContain("var API_HOST = 'https://staging-api.dialusnow.com';");
    expect(js).not.toContain('https://api.dialusnow.com');
    expect(js).not.toContain('https://widget.dialusnow.com');
    expect(js).toContain('NOT FOR CUSTOMER WEBSITES');
  });

  it('refuses an unknown environment', () => {
    expect(() => build('preview')).toThrow();
  });

  it('pins isolated staging embed, owner page and redeem page to the same deployment', () => {
    const { out, js, manifest } = build('isolated-staging');
    const api = 'https://backend-staging-staging-b699.up.railway.app';
    const widget = 'https://widget-staging-staging.up.railway.app';
    expect(manifest).toMatchObject({ environment: 'isolated-staging', apiHost: api, widgetHost: widget });
    expect(js).toContain(`var WIDGET_HOST = '${widget}';`);
    expect(js).toContain(`var API_HOST = '${api}';`);
    const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const redeem = fs.readFileSync(path.join(out, 'canary-redeem.html'), 'utf8');
    // Machine-checkable, truthful markers of the private owner page.
    expect(index).toContain('data-amqur-profile="isolated-staging"');
    expect(index).toMatch(/data-amqur-isolated-build="(?:[0-9a-f]{7}|unknown)"/);
    expect(index).toContain(`data-amqur-api-origin="${api}"`);
    expect(index).toContain('data-amqur-status="isolated-staging"');
    expect(index).toContain('Private preview. Vehicles, appointments and lead receipts shown here are demonstration data, clearly labeled.');
    expect(index).not.toContain('connections are not switched on yet');
    expect(index).not.toContain('Internal Employee Canary Host');
    expect(index).not.toContain('NOT FOR CUSTOMERS');
    expect(index).not.toMatch(/__AMQUR_|<!--\/?profile|template-note/);
    expect(redeem).toContain(`var api = "${api}";`);
    expect(redeem).not.toContain('id="api"');
    expect(redeem).toContain('protected isolated staging preview with synthetic data');
    expect([js, index, redeem].join('\n')).not.toMatch(/https:\/\/(?:staging-)?(?:api|widget)\.dialusnow\.com/);
    for (const f of ['owner-page.css', 'owner-page.js']) expect(fs.existsSync(path.join(out, f)), f).toBe(true);
  });

  it('rejects host overrides and the CDN output for isolated staging', () => {
    expect(() => build('isolated-staging', ['--api-host', 'https://api.dialusnow.com'])).toThrow(/only with --env local or production-private/);
    expect(() => execFileSync(process.execPath, [
      path.join(root, 'scripts/build-embed-loader.mjs'), '--env', 'isolated-staging', '--out', 'cdn/public',
    ], { stdio: 'pipe' })).toThrow(/must never be written into the CDN/);
  });
});

describe('private owner page', () => {
  const API = 'https://api-production-1a2b.up.railway.app';
  const WIDGET = 'https://widget-production-3c4d.up.railway.app';
  const page = (env: string, extra: string[] = []) => {
    const { out, js, manifest } = build(env, extra);
    const read = (f: string) => fs.readFileSync(path.join(out, f), 'utf8');
    return { out, js, manifest, index: read('index.html'), css: read('owner-page.css'), script: read('owner-page.js') };
  };
  const staging = page('isolated-staging');
  const prod = page('production-private', ['--api-host', API, '--widget-host', WIDGET]);
  const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  it('builds a production-private profile from validated host arguments', () => {
    expect(prod.manifest).toMatchObject({ environment: 'production-private', apiHost: API, widgetHost: WIDGET });
    expect(prod.js).toContain(`var WIDGET_HOST = '${WIDGET}';`);
    expect(prod.js).toContain(`var API_HOST = '${API}';`);
    expect(prod.js).toContain("var EMBED_ENV = 'production-private';");
    expect(prod.js).toContain('NOT FOR CUSTOMER WEBSITES');
    expect(prod.index).toContain('data-amqur-profile="production-private"');
    expect(prod.index).toMatch(/data-amqur-isolated-build="(?:[0-9a-f]{7}|unknown)"/);
    expect(prod.index).toContain(`data-amqur-api-origin="${API}"`);
    expect(prod.index).toContain('data-amqur-status="production-private"');
    expect(prod.index).toContain('Private preview. Live inventory, CRM and scheduling connections are not switched on yet.');
  });

  it('ships no staging host, sandbox wording or invite redemption in production-private', () => {
    expect(fs.existsSync(path.join(prod.out, 'canary-redeem.html'))).toBe(false);
    expect(fs.existsSync(path.join(prod.out, 'amqur-canary-loader.js'))).toBe(false);
    for (const text of [prod.index, prod.css, prod.script]) {
      expect(text).not.toMatch(/staging|sandbox|canary|demonstration data/i);
    }
    for (const f of fs.readdirSync(prod.out).filter((n) => /\.(html|js|css|json)$/.test(n))) {
      const text = fs.readFileSync(path.join(prod.out, f), 'utf8');
      expect(text, f).not.toMatch(/[a-z0-9.-]*staging[a-z0-9.-]*\.(?:up\.railway\.app|dialusnow\.com)/i);
      expect(text, f).not.toMatch(/https:\/\/(?:api|widget)\.dialusnow\.com/);
    }
  });

  it.each([
    ['an http host', ['--api-host', 'http://api.example.com', '--widget-host', WIDGET], /must be an https origin/],
    ['a missing API host', ['--widget-host', WIDGET], /--api-host is required/],
    ['a missing widget host', ['--api-host', API], /--widget-host is required/],
    ['the isolated staging API', ['--api-host', 'https://backend-staging-staging-b699.up.railway.app', '--widget-host', WIDGET], /must not be a staging host/],
    ['the isolated staging widget host', ['--api-host', API, '--widget-host', 'https://widget-staging-staging.up.railway.app'], /must not be a staging host/],
    ['the shared staging API', ['--api-host', 'https://staging-api.dialusnow.com', '--widget-host', WIDGET], /must not be a (?:dialusnow\.com|staging) host/],
    ['any host that names staging', ['--api-host', 'https://api-staging.example.com', '--widget-host', WIDGET], /must not be a staging host/],
    ['the public production API', ['--api-host', 'https://api.dialusnow.com', '--widget-host', WIDGET], /must not be a dialusnow\.com host/],
    ['a dialusnow.com subdomain', ['--api-host', API, '--widget-host', 'https://preview.dialusnow.com'], /must not be a dialusnow\.com host/],
    ['a host with a path', ['--api-host', `${API}/api`, '--widget-host', WIDGET], /must be a plain origin/],
    ['a host with a port', ['--api-host', 'https://api.example.com:8443', '--widget-host', WIDGET], /must be a plain origin/],
    ['a host with credentials', ['--api-host', 'https://user:pw@api.example.com', '--widget-host', WIDGET], /must be a plain origin/],
    ['a loopback host', ['--api-host', 'https://localhost', '--widget-host', WIDGET], /must be a public DNS host name/],
    ['an IP address', ['--api-host', 'https://10.0.0.5', '--widget-host', WIDGET], /must be a public DNS host name/],
    ['something that is not a URL', ['--api-host', 'not a url', '--widget-host', WIDGET], /is not a URL/],
    ['one origin for both', ['--api-host', API, '--widget-host', API], /must be different origins/],
  ])('refuses production-private with %s', (_label, args, message) => {
    expect(() => build('production-private', args as string[])).toThrow(message as RegExp);
  });

  it('refuses to write production-private into the CDN directory or without --out', () => {
    const run = (args: string[]) => execFileSync(process.execPath, [
      path.join(root, 'scripts/build-embed-loader.mjs'), '--env', 'production-private', '--api-host', API, '--widget-host', WIDGET, ...args,
    ], { stdio: 'pipe' });
    expect(() => run(['--out', 'cdn/public'])).toThrow(/must never be written into the CDN/);
    expect(() => run([])).toThrow(/requires an explicit --out/);
  });

  it('shows one truthful status strip per profile and never the other one', () => {
    expect(staging.index.match(/data-amqur-status="/g)).toHaveLength(1);
    expect(prod.index.match(/data-amqur-status="/g)).toHaveLength(1);
    expect(staging.index).not.toContain('data-amqur-status="production-private"');
    expect(prod.index).not.toContain('data-amqur-status="isolated-staging"');
  });

  it.each([['isolated-staging', staging], ['production-private', prod]] as const)('%s page: content, privacy and store boundaries', (_env, p) => {
    const text = visibleText(p.index);
    expect(p.index).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(text).toContain('Dial Auto Group');
    expect(text).toContain('AI assistant — private preview');
    expect(text).toContain('Powered by AMQUR');
    expect(text).toContain('Ask it anything.');
    // Five rooftops, each its own tenant; the two Jeep-selling stores stay distinct.
    const stores = [...p.index.matchAll(/<input type="radio" name="store" value="([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(stores.slice(0, 5)).toEqual(['dial-chevy-of-chicago', 'dial-nissan-of-chicago', 'infiniti-of-chicago', 'dial-cdjr-of-chicago', 'jeep-of-chicago']);
    expect(new Set(stores).size).toBe(stores.length);
    expect(p.index.match(/<input type="radio"[^>]*\schecked/g)).toHaveLength(1);
    expect(p.index).toMatch(/value="dial-chevy-of-chicago"[^>]*\schecked/);
    expect(text).toMatch(/Dial Chrysler Dodge Jeep Ram of Chicago\s+South Side\s*7340 S Western Ave/);
    expect(text).toMatch(/Jeep of Chicago\s+North Side\s*5950 N Western Ave/);
    // 6–8 example prompts spanning general and automotive questions.
    const prompts = [...p.index.matchAll(/data-prompt="([^"]+)"/g)].map((m) => m[1]);
    expect(prompts.length).toBeGreaterThanOrEqual(6);
    expect(prompts.length).toBeLessThanOrEqual(8);
    for (const expected of ['Explain quantum computing simply', 'What is 17% of $42,500?', 'Compare the Tahoe and Suburban', 'Should I lease or finance?', 'Speak to me in Urdu']) {
      expect(prompts).toContain(expected);
    }
    // Nothing internal in what the owner reads; no inline code (strict CSP); no external requests.
    expect(text).not.toMatch(/https?:\/\/|railway|dialusnow|localhost|lorem|\badmin\b|NOT FOR CUSTOMERS/i);
    expect(p.index).not.toMatch(/<script(?![^>]*\bsrc=)|<style|\son[a-z]+\s*=|\sstyle\s*=/i);
    const urls = [...`${p.index}\n${p.css}`.matchAll(/(?:src|href)="([^"]+)"|url\(["']?([^"')]+)/g)].map((m) => m[1] ?? m[2]);
    expect(urls.length).toBeGreaterThan(3);
    for (const u of urls) expect(u, u).toMatch(/^(\.\/|#)/);
    expect(p.script).not.toMatch(/https?:\/\/[a-z]/i);
    expect(p.script).not.toMatch(/location\.search|URLSearchParams|innerHTML|document\.cookie|localStorage/);
  });

  it('offers the group tenant only where it was verified to boot (isolated staging)', () => {
    expect(staging.index).toContain('value="dial-auto-group"');
    expect(prod.index).not.toContain('value="dial-auto-group"');
  });

  it('boots the widget through the public API only, inline, for the chosen store', () => {
    for (const p of [staging, prod]) {
      expect(p.script).toContain('api.destroy()');
      expect(p.script).toContain('api.init({');
      expect(p.script).toContain("apiBaseUrl: apiOrigin + '/api'");
      expect(p.script).toContain('tenantSlug: radio.value');
      expect(p.script).toContain("display: 'inline'");
      expect(p.script).toContain('api.send(prompt)');
      // No invite redemption or eligibility call from the owner page in either profile.
      expect(p.script).not.toMatch(/canary|inviteToken|fetch\(/);
    }
  });
});

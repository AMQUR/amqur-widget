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

describe('embed loader build', () => {
  const sha = 'a'.repeat(40);
  function build(env: string) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'amqur-embed-'));
    execFileSync(
      process.execPath,
      [path.join(root, 'scripts/build-embed-loader.mjs'), '--env', env, '--out', out],
      { env: { ...process.env, APP_COMMIT_SHA: sha, APP_BUILD_TIME: '2026-11-18T00:00:00Z' } },
    );
    return {
      js: fs.readFileSync(path.join(out, 'embed.js'), 'utf8'),
      manifest: JSON.parse(fs.readFileSync(path.join(out, 'embed-manifest.json'), 'utf8')),
    };
  }

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
});

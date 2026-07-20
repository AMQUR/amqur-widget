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

  it('reads only data-tenant / data-location / data-locale', () => {
    expect(embed).toContain("getAttribute('data-tenant')");
    expect(embed).toContain("getAttribute('data-location')");
    expect(embed).toContain("getAttribute('data-locale')");
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

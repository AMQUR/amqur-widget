#!/usr/bin/env node
/**
 * Generates one copy/paste HTML snippet per install target and environment
 * from docs/release/install-targets.json.
 *
 *   node scripts/build-install-snippets.mjs           # write snippets
 *   node scripts/build-install-snippets.mjs --check   # fail if files drifted
 *
 * A snippet contains only public identifiers (CDN URL, tenant slug, location
 * slug, locale). It works only where the page's exact Origin is allowlisted on
 * that tenant by the API — a snippet existing here does not mean it is live.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetsPath = resolve(root, 'docs/release/install-targets.json');
const outDir = resolve(root, 'docs/release/website-snippets');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORIGIN_RE = /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/;
const ENVIRONMENTS = ['production', 'staging'];

export function loadTargets(path = targetsPath) {
  return validateTargets(JSON.parse(readFileSync(path, 'utf8')));
}

export function validateTargets(doc) {
  const problems = [];
  const seen = { id: new Set(), tenantSlug: new Set(), origin: new Set() };
  for (const env of ENVIRONMENTS) {
    const hosts = doc.environments?.[env];
    for (const key of ['widgetHost', 'apiHost']) {
      if (!ORIGIN_RE.test(hosts?.[key] ?? '')) problems.push(`${env}.${key} invalid`);
    }
  }
  if (!Array.isArray(doc.targets) || doc.targets.length === 0) {
    problems.push('targets must be a non-empty array');
  }
  for (const t of doc.targets ?? []) {
    const label = t?.id ?? '(no id)';
    if (!SLUG_RE.test(t?.id ?? '')) problems.push(`${label}: id invalid`);
    if (!SLUG_RE.test(t?.tenantSlug ?? '')) problems.push(`${label}: tenantSlug invalid`);
    if (!SLUG_RE.test(t?.locationSlug ?? '')) problems.push(`${label}: locationSlug invalid`);
    if (!ORIGIN_RE.test(t?.origin ?? '')) {
      problems.push(`${label}: origin must be https://host with no path, port or wildcard`);
    }
    if (!['rooftop', 'group'].includes(t?.kind)) problems.push(`${label}: kind invalid`);
    for (const key of ['name', 'cms', 'cmsEvidence', 'hostnameEvidence']) {
      if (typeof t?.[key] !== 'string' || !t[key].trim()) problems.push(`${label}: ${key} required`);
    }
    for (const key of Object.keys(seen)) {
      if (seen[key].has(t?.[key])) problems.push(`${label}: duplicate ${key}`);
      seen[key].add(t?.[key]);
    }
  }
  if (problems.length) {
    throw new Error(`install-targets.json invalid:\n  ${problems.join('\n  ')}`);
  }
  return doc;
}

export function scriptTag(doc, target, env) {
  const { widgetHost } = doc.environments[env];
  return (
    `<script defer src="${widgetHost}/embed.js" ` +
    `data-tenant="${target.tenantSlug}" ` +
    `data-location="${target.locationSlug}" data-locale="en"></script>`
  );
}

export function renderSnippet(doc, target, env) {
  const { widgetHost, apiHost } = doc.environments[env];
  const banner =
    env === 'staging'
      ? 'STAGING — employee testing only. Never paste this on a customer-facing website.'
      : 'PRODUCTION — paste once per page template, immediately before </body>.';
  return [
    '<!--',
    `  AI Assistant — ${target.name}`,
    `  ${banner}`,
    `  Website origin this snippet is for: ${target.origin}`,
    `  Tenant: ${target.tenantSlug}   Location: ${target.locationSlug}`,
    `  Loader: ${widgetHost}/embed.js   API: ${apiHost}`,
    '  Works only after this exact origin is allowlisted for this tenant.',
    '  Remove this one tag to uninstall. Generated file — do not edit by hand.',
    '-->',
    scriptTag(doc, target, env),
    '',
  ].join('\n');
}

export function snippetFiles(doc) {
  const files = new Map();
  for (const target of doc.targets) {
    for (const env of ENVIRONMENTS) {
      files.set(`${target.id}.${env}.html`, renderSnippet(doc, target, env));
    }
  }
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = snippetFiles(loadTargets());
  const drift = [];
  if (!check) mkdirSync(outDir, { recursive: true });
  for (const [name, content] of files) {
    const path = resolve(outDir, name);
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) drift.push(name);
    } else {
      writeFileSync(path, content, 'utf8');
    }
  }
  if (existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (name.endsWith('.html') && !files.has(name)) drift.push(`${name} (stale)`);
    }
  }
  if (drift.length) {
    console.error(`install snippets out of date: ${drift.join(', ')}\nrun: npm run build:snippets`);
    process.exit(1);
  }
  console.log(`install snippets ${check ? 'verified' : 'written'}: ${files.size} files`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Stamps production embed.js + embed-manifest.json into cdn/public.
 *
 * Source: src/loaders/embed-loader.js (placeholders RELEASE_SHA, BUILD_TIME)
 * Output: cdn/public/embed.js, cdn/public/embed-manifest.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'src/loaders/embed-loader.js');
const outDir = resolve(root, 'cdn/public');
const embedOut = resolve(outDir, 'embed.js');
const manifestOut = resolve(outDir, 'embed-manifest.json');
const widgetBundlePath = resolve(outDir, 'assistant-widget.iife.js');

function sha384Integrity(filePath) {
  const buf = readFileSync(filePath);
  const digest = createHash('sha384').update(buf).digest('base64');
  return `sha384-${digest}`;
}

function sha384IntegrityOpenssl(filePath) {
  // Prefer openssl to match CDN / SRI tooling expectations when available.
  try {
    const binary = execFileSync('openssl', ['dgst', '-sha384', '-binary', filePath]);
    const b64 = execFileSync('openssl', ['base64', '-A'], { input: binary })
      .toString('utf8')
      .trim();
    return `sha384-${b64}`;
  } catch {
    return sha384Integrity(filePath);
  }
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

let commitSha = 'unknown';
try {
  commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
} catch {
  // offline / non-git context
}

const buildTime = new Date().toISOString();
const source = readFileSync(sourcePath, 'utf8');

if (!source.includes('RELEASE_SHA') || !source.includes('BUILD_TIME')) {
  console.error('embed source missing RELEASE_SHA / BUILD_TIME placeholders');
  process.exit(1);
}

const stamped = source
  .replaceAll('RELEASE_SHA', commitSha)
  .replaceAll('BUILD_TIME', buildTime);

mkdirSync(outDir, { recursive: true });
writeFileSync(embedOut, stamped, 'utf8');

const embedIntegrity = sha384IntegrityOpenssl(embedOut);
const widgetIntegrity = existsSync(widgetBundlePath)
  ? sha384IntegrityOpenssl(widgetBundlePath)
  : null;

const manifest = {
  name: 'amqur-embed',
  version: pkg.version || '0.2.0',
  commitSha,
  buildTime,
  embedJs: '/embed.js',
  widgetBundle: '/assistant-widget.iife.js',
  integrity: {
    'embed.js': embedIntegrity,
    'assistant-widget.iife.js': widgetIntegrity,
  },
  apiHost: 'https://api.dialusnow.com',
  widgetHost: 'https://widget.dialusnow.com',
};

writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(
  `build:embed ok commit=${commitSha.slice(0, 12)} embed=${embedIntegrity}` +
    (widgetIntegrity
      ? ` widget=${widgetIntegrity}`
      : ' widget=null (assistant-widget.iife.js not in cdn/public yet)'),
);

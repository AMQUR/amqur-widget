#!/usr/bin/env node
/**
 * Stamps embed.js + embed-manifest.json.
 *
 * Source: src/loaders/embed-loader.js (placeholders RELEASE_SHA, BUILD_TIME)
 * Output: <out>/embed.js, <out>/embed-manifest.json (default out: cdn/public)
 *
 * Usage: node scripts/build-embed-loader.mjs [--env production|staging] [--out <dir>]
 *
 * The source hardcodes the production hosts. `--env staging` rewrites exactly
 * those two literals to the staging hosts so a staging page exercises the
 * staging API; the production build never contains a staging host (asserted
 * here and again in the Dockerfile).
 *
 * Release identity comes from APP_COMMIT_SHA / APP_BUILD_TIME when the deploy
 * pipeline provides them (the Docker build context has no .git), then git.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOSTS = {
  production: {
    widgetHost: 'https://widget.dialusnow.com',
    apiHost: 'https://api.dialusnow.com',
  },
  staging: {
    widgetHost: 'https://staging-widget.dialusnow.com',
    apiHost: 'https://staging-api.dialusnow.com',
  },
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const targetEnv = argValue('--env') ?? 'production';
if (!Object.hasOwn(HOSTS, targetEnv)) {
  console.error(`unknown --env "${targetEnv}" (production|staging)`);
  process.exit(2);
}
const hosts = HOSTS[targetEnv];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'src/loaders/embed-loader.js');
const outDir = resolve(root, argValue('--out') ?? 'cdn/public');
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

const SHA_RE = /^[0-9a-f]{7,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

let commitSha = 'unknown';
const envSha = (process.env.APP_COMMIT_SHA ?? '').trim().toLowerCase();
if (SHA_RE.test(envSha)) {
  commitSha = envSha;
} else {
  try {
    commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // offline / non-git context
  }
}

const envBuildTime = (process.env.APP_BUILD_TIME ?? '').trim();
const buildTime = ISO_RE.test(envBuildTime)
  ? envBuildTime
  : new Date().toISOString();
const source = readFileSync(sourcePath, 'utf8');

if (!source.includes('RELEASE_SHA') || !source.includes('BUILD_TIME')) {
  console.error('embed source missing RELEASE_SHA / BUILD_TIME placeholders');
  process.exit(1);
}

const prod = HOSTS.production;
for (const literal of [`'${prod.widgetHost}'`, `'${prod.apiHost}'`]) {
  if (source.split(literal).length !== 2) {
    console.error(`embed source must contain ${literal} exactly once`);
    process.exit(1);
  }
}

let stamped = source
  .replaceAll('RELEASE_SHA', commitSha)
  .replaceAll('BUILD_TIME', buildTime);

if (targetEnv === 'staging') {
  stamped = stamped
    .replace(`'${prod.widgetHost}'`, `'${hosts.widgetHost}'`)
    .replace(`'${prod.apiHost}'`, `'${hosts.apiHost}'`)
    .replace(
      'AMQUR production one-line embed loader.',
      'AMQUR STAGING one-line embed loader — NOT FOR CUSTOMER WEBSITES.',
    )
    .replace(
      'Hosts are hardcoded for production only',
      'Hosts are hardcoded for staging only',
    );
  if (stamped.includes(prod.apiHost) || stamped.includes(prod.widgetHost)) {
    console.error('staging embed still references a production host');
    process.exit(1);
  }
} else if (/staging-widget|staging-api|localhost/i.test(stamped)) {
  console.error('production embed references a non-production host');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(embedOut, stamped, 'utf8');

const embedIntegrity = sha384IntegrityOpenssl(embedOut);
const widgetIntegrity = existsSync(widgetBundlePath)
  ? sha384IntegrityOpenssl(widgetBundlePath)
  : null;

const manifest = {
  name: 'amqur-embed',
  environment: targetEnv,
  version: pkg.version || '0.2.0',
  commitSha,
  buildTime,
  embedJs: '/embed.js',
  widgetBundle: '/assistant-widget.iife.js',
  integrity: {
    'embed.js': embedIntegrity,
    'assistant-widget.iife.js': widgetIntegrity,
  },
  apiHost: hosts.apiHost,
  widgetHost: hosts.widgetHost,
};

writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(
  `build:embed ok env=${targetEnv} commit=${commitSha.slice(0, 12)} embed=${embedIntegrity}` +
    (widgetIntegrity
      ? ` widget=${widgetIntegrity}`
      : ' widget=null (assistant-widget.iife.js not in cdn/public yet)'),
);

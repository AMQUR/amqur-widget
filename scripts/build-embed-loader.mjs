#!/usr/bin/env node
/**
 * Stamps embed.js + embed-manifest.json.
 *
 * Source: src/loaders/embed-loader.js (placeholders RELEASE_SHA, BUILD_TIME)
 * Output: <out>/embed.js, <out>/embed-manifest.json (default out: cdn/public)
 *
 * Usage: node scripts/build-embed-loader.mjs [--env production|staging|isolated-staging|production-private|local] [--out <dir>]
 *        local only: [--widget-host http://127.0.0.1:<port>] [--api-host http://127.0.0.1:<port>]
 *        production-private (both required): --widget-host https://<host> --api-host https://<host>
 *
 * Hosted profiles (`isolated-staging`, `production-private`) also write the private owner preview
 * page (index.html + owner-page.css + owner-page.js) into --out. `isolated-staging` is pinned to
 * the isolated Railway hosts. `production-private` has no baked-in hosts: both are required
 * arguments and must be plain https origins that are not a staging host and not *.dialusnow.com
 * (the public production hosts belong to the customer-facing loader, never to a private page).
 * A production-private build ships no invite-redemption page and no staging hostname.
 *
 * `--env local` builds a loader for a developer machine or a protected test run. Its hosts must
 * be loopback (localhost / 127.0.0.1), it must be written outside cdn/public, and it is labelled
 * as not for customer websites. It exists so a site under test contacts the local backend it
 * was configured for instead of production.
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
  'isolated-staging': {
    widgetHost: 'https://widget-staging-staging.up.railway.app',
    apiHost: 'https://backend-staging-staging-b699.up.railway.app',
  },
  local: {
    widgetHost: 'http://127.0.0.1:4174',
    apiHost: 'http://127.0.0.1:3001',
  },
};

/** A production-private host name may not even look like a staging one. */
const STAGING_HOST_RE = /staging/i;
/** Any dotted host name with "staging" in it, as it would appear inside shipped text. */
const STAGING_HOSTNAME_IN_TEXT_RE = /[a-z0-9.-]*staging[a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:up\.railway\.app|dialusnow\.com)/i;

/**
 * Plain https origin for a production-private build: https://<public dns name>, nothing else.
 * Rejects http, ports, paths, credentials, loopback/IP literals, any staging host and
 * *.dialusnow.com.
 */
function privateOrigin(value, flag) {
  const bad = (why) => {
    console.error(`${flag} ${why}`);
    process.exit(2);
  };
  if (typeof value !== 'string' || !value.trim()) bad('is required with --env production-private');
  const raw = value.trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    bad('is not a URL');
  }
  if (url.protocol !== 'https:') bad('must be an https origin');
  const plain = !url.username && !url.password && !url.search && !url.hash && !url.port && (url.pathname === '/' || url.pathname === '');
  if (!plain || raw.replace(/\/$/, '').toLowerCase() !== url.origin) bad('must be a plain origin (https://host, no port, path, query or credentials)');
  const host = url.hostname;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) || /^[\d.]+$/.test(host) || host === 'localhost' || host.endsWith('.localhost')) {
    bad('must be a public DNS host name');
  }
  if (host === 'dialusnow.com' || host.endsWith('.dialusnow.com')) bad('must not be a dialusnow.com host');
  const stagingHosts = [...Object.values(HOSTS.staging), ...Object.values(HOSTS['isolated-staging'])].map((h) => new URL(h).hostname);
  if (stagingHosts.includes(host) || STAGING_HOST_RE.test(host)) bad('must not be a staging host');
  return url.origin;
}

/** Loopback origin only: http(s)://localhost|127.0.0.1[:port], nothing else. */
function loopbackOrigin(value, flag) {
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`${flag} is not a URL`);
    process.exit(2);
  }
  const plain = !url.username && !url.password && !url.search && !url.hash && (url.pathname === '/' || url.pathname === '');
  if (!plain || !['localhost', '127.0.0.1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    console.error(`${flag} must be a loopback origin (http://localhost:<port> or http://127.0.0.1:<port>)`);
    process.exit(2);
  }
  return url.origin;
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const PRIVATE_ENV = 'production-private';
const targetEnv = argValue('--env') ?? 'production';
if (targetEnv !== PRIVATE_ENV && !Object.hasOwn(HOSTS, targetEnv)) {
  console.error(`unknown --env "${targetEnv}" (production|staging|isolated-staging|production-private|local)`);
  process.exit(2);
}
const hosts = targetEnv === PRIVATE_ENV ? {} : { ...HOSTS[targetEnv] };
if (targetEnv === PRIVATE_ENV) {
  hosts.widgetHost = privateOrigin(argValue('--widget-host'), '--widget-host');
  hosts.apiHost = privateOrigin(argValue('--api-host'), '--api-host');
  if (hosts.widgetHost === hosts.apiHost) {
    console.error('--widget-host and --api-host must be different origins');
    process.exit(2);
  }
} else if (targetEnv === 'local') {
  if (argValue('--widget-host')) hosts.widgetHost = loopbackOrigin(argValue('--widget-host'), '--widget-host');
  if (argValue('--api-host')) hosts.apiHost = loopbackOrigin(argValue('--api-host'), '--api-host');
} else if (argValue('--widget-host') || argValue('--api-host')) {
  console.error('--widget-host / --api-host are accepted only with --env local or production-private');
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'src/loaders/embed-loader.js');
const isolated = targetEnv === 'isolated-staging';
const privateBuild = targetEnv === PRIVATE_ENV;
/** Hosted profiles ship the private owner page next to the loader. */
const hosted = isolated || privateBuild;
const output = argValue('--out');
if (hosted && !output) {
  console.error(`${targetEnv} requires an explicit --out directory`);
  process.exit(2);
}
const outDir = resolve(root, output ?? (targetEnv === 'local' ? 'dist-local' : 'cdn/public'));
if ((hosted || targetEnv === 'local') && (outDir === resolve(root, 'cdn') || outDir.startsWith(resolve(root, 'cdn') + '/'))) {
  console.error(`${targetEnv} artifacts must never be written into the CDN directory`);
  process.exit(2);
}
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

if (targetEnv !== 'production') {
  const label = targetEnv === 'local' ? 'LOCAL TEST' : targetEnv.toUpperCase();
  stamped = stamped
    .replace(`'${prod.widgetHost}'`, `'${hosts.widgetHost}'`)
    .replace(`'${prod.apiHost}'`, `'${hosts.apiHost}'`)
    .replace("var EMBED_ENV = 'production';", `var EMBED_ENV = '${targetEnv}';`)
    .replace(
      'AMQUR production one-line embed loader.',
      `AMQUR ${label} one-line embed loader — NOT FOR CUSTOMER WEBSITES.`,
    )
    .replace(
      'Hosts are hardcoded for production only',
      `Hosts are hardcoded for ${targetEnv} only`,
    );
  if (stamped.includes(prod.apiHost) || stamped.includes(prod.widgetHost)) {
    console.error(`${targetEnv} embed still references a production host`);
    process.exit(1);
  }
  if (!stamped.includes(`var EMBED_ENV = '${targetEnv}';`)) {
    console.error('embed environment marker was not stamped');
    process.exit(1);
  }
  if (privateBuild && STAGING_HOSTNAME_IN_TEXT_RE.test(stamped)) {
    console.error('production-private embed references a staging host');
    process.exit(1);
  }
} else if (/staging-widget|staging-api|\.up\.railway\.app|localhost|127\.0\.0\.1/i.test(stamped)) {
  console.error('production embed references a non-production host');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
if (hosted) {
  // The private owner page. One template for both hosted profiles: placeholders are stamped and
  // only the profile blocks for this build are kept, so a production-private page carries no
  // staging wording and an isolated-staging page never claims a production connection.
  const pageDir = resolve(root, 'staging/public');
  const templatePath = resolve(pageDir, 'index.isolated.html');
  if (!existsSync(templatePath)) {
    throw new Error(`${targetEnv} requires staging/public/index.isolated.html`);
  }
  const PROFILE_BLOCK = /[ \t]*<!--profile:([a-z-]+)-->\n?([\s\S]*?)[ \t]*<!--\/profile-->\n?/g;
  const index = readFileSync(templatePath, 'utf8')
    .replace(/<!--template-note[\s\S]*?template-note-->\n?/, '')
    .replace(PROFILE_BLOCK, (_, profile, body) => (profile === targetEnv ? body : ''))
    .replaceAll('__AMQUR_PROFILE__', targetEnv)
    .replaceAll('__AMQUR_API_ORIGIN__', hosts.apiHost)
    .replaceAll('__AMQUR_BUILD__', SHA_RE.test(commitSha) ? commitSha.slice(0, 7) : 'unknown');
  const pageCss = readFileSync(resolve(pageDir, 'owner-page.css'), 'utf8');
  const pageJs = readFileSync(resolve(pageDir, 'owner-page.js'), 'utf8');

  if (/__AMQUR_[A-Z_]+__|<!--\/?profile|template-note/.test(index)) {
    throw new Error('owner page still contains template markers');
  }
  for (const marker of [
    'data-amqur-isolated-build="',
    `data-amqur-profile="${targetEnv}"`,
    `data-amqur-api-origin="${hosts.apiHost}"`,
    `data-amqur-status="${targetEnv}"`,
    'name="robots" content="noindex,nofollow"',
  ]) {
    if (!index.includes(marker)) throw new Error(`owner page is missing ${marker}`);
  }
  if ((index.match(/data-amqur-status="/g) ?? []).length !== 1) {
    throw new Error('owner page must carry exactly one status strip');
  }
  if (/<script(?![^>]*\bsrc=)|<style|\son[a-z]+\s*=|\sstyle\s*=/i.test(index)) {
    throw new Error('owner page must not contain inline script, style or event handlers (strict CSP)');
  }
  // The page shows no hostnames: the API origin lives only in the attribute the page script reads.
  const visible = index.replace(/<[^>]*>/g, ' ');
  if (/https?:\/\/|\.up\.railway\.app|dialusnow\.com/i.test(visible)) {
    throw new Error('owner page shows a URL or hostname in visible text');
  }

  const pages = [index];
  let redeem = null;
  if (isolated) {
    redeem = readFileSync(resolve(pageDir, 'canary-redeem.html'), 'utf8')
      .replace(/<label for="api">[\s\S]*?<label for="token">/, '<label for="token">')
      .replace("document.getElementById('api').value.replace(/\\/$/, '')", JSON.stringify(hosts.apiHost))
      .replace(/<p class="note">[\s\S]*?<\/p>/, '<p class="note">After redeeming, use the protected isolated staging preview with synthetic data.</p>');
    if (redeem.includes('id="api"') || redeem.includes("getElementById('api')")) {
      throw new Error('isolated staging redemption page still reads an editable API origin');
    }
    pages.push(redeem);
  }
  const foreignHosts = [prod.apiHost, prod.widgetHost, HOSTS.staging.apiHost, HOSTS.staging.widgetHost];
  for (const page of pages) {
    if (!page.includes(hosts.apiHost) || foreignHosts.some((host) => page.includes(host))) {
      throw new Error(`${targetEnv} page does not use the ${targetEnv} hosts`);
    }
  }
  if (privateBuild) {
    // Nothing about staging, sandboxes or invite redemption may ship in a production-private image.
    for (const [name, text] of [['index.html', index], ['owner-page.css', pageCss], ['owner-page.js', pageJs]]) {
      if (/staging|sandbox|canary|demonstration data/i.test(text) || STAGING_HOSTNAME_IN_TEXT_RE.test(text)) {
        throw new Error(`production-private ${name} contains staging, sandbox or canary wording`);
      }
    }
  }

  writeFileSync(resolve(outDir, 'index.html'), index, 'utf8');
  writeFileSync(resolve(outDir, 'owner-page.css'), pageCss, 'utf8');
  writeFileSync(resolve(outDir, 'owner-page.js'), pageJs, 'utf8');
  if (redeem !== null) writeFileSync(resolve(outDir, 'canary-redeem.html'), redeem, 'utf8');
}

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

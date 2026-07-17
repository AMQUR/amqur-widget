#!/usr/bin/env node
/**
 * Stamps version.json into the build context so the deployed static host
 * serves its own provenance at /version.json.
 *
 * Run immediately before `railway up`. version.json is gitignored — it is
 * a deploy artifact, never committed.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const dirty =
  execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().length > 0;

const release = {
  name: pkg.name,
  version: pkg.version,
  commitSha: dirty ? `${commitSha}-dirty` : commitSha,
  buildTime: new Date().toISOString(),
  releaseId: randomUUID(),
};

writeFileSync(
  resolve(root, 'version.json'),
  JSON.stringify(release, null, 2) + '\n',
);
console.log(
  `stamped version.json: version=${release.version} commit=${release.commitSha.slice(0, 12)} releaseId=${release.releaseId}`,
);

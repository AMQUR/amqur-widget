/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/ -> widget repo root
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('canary GTM package safety', () => {
  const loader = fs.readFileSync(
    path.join(root, 'docs/deployment/amqur-canary-loader.js'),
    'utf8',
  );

  it('enforces hostname allowlist and kill switch', () => {
    expect(loader).toContain('hostname_rejected');
    expect(loader).toContain('kill_switch');
    expect(loader).toContain('duplicate_blocked');
  });

  it('supports stable canary bucketing and secure employee eligibility gate', () => {
    expect(loader).toContain('BUCKET_KEY');
    expect(loader).toContain('employee_gate_denied');
    expect(loader).toContain('canary-eligibility');
    expect(loader).toContain("credentials: 'include'");
    // Must not treat client-writable boolean employee flag as authorization.
    expect(loader).not.toMatch(/\bEMP_COOKIE\b/);
    expect(loader).not.toContain('employeeTokenHash');
    expect(loader).not.toMatch(/document\.cookie.*amqur_emp|amqur_emp['"]?\s*===?\s*['"]?1/);
    expect(loader).toContain('amqur_canary'); // cookie family name appears in comments/events only via canary-eligibility path
  });

  it('fails closed on missing or placeholder hosts', () => {
    expect(loader).toContain('missing_hosts');
    expect(loader).toContain('forbidden_host_pattern');
    expect(loader).toContain('localhost');
  });

  it('does not embed secrets', () => {
    expect(loader).not.toMatch(/JWT_SECRET|DATABASE_URL|REDIS_URL|TEKION_CLIENT|BOOTSTRAP_SECRET/);
  });

  it('level snippets keep hosts empty until provisioned', () => {
    for (const f of [
      'level1-employee.html',
      'level2-one-percent.html',
      'level5-full-rooftop.html',
    ]) {
      const html = fs.readFileSync(
        path.join(root, 'docs/deployment/snippets', f),
        'utf8',
      );
      expect(html).not.toMatch(/localhost|example\.com|INSERT_/);
      expect(html).toMatch(/apiBaseUrl:\s*''/);
    }
  });

  it('legacy canary index points at deployment package', () => {
    const legacy = fs.readFileSync(
      path.join(root, 'docs/canary-gtm-snippet.html'),
      'utf8',
    );
    expect(legacy).toMatch(/deployment\/snippets/i);
  });
});

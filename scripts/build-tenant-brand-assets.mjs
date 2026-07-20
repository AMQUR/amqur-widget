#!/usr/bin/env node
/**
 * Dial Auto Group / rooftop brand asset pipeline.
 *
 * Idempotently copies originals from FINAL LOGOS (or reuses incoming-brand-assets),
 * sanitizes SVGs, hashes assets, writes CDN runtime files + manifests.
 *
 * Usage:
 *   node amqur-widget/scripts/build-tenant-brand-assets.mjs
 *   FINAL_LOGOS_ROOT="/path/to/FINAL LOGOS WITH NEW DESIGN" node ...
 *
 * Does not invent brand colors — only records hex fills found in SVG.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const FINAL_LOGOS_ROOT =
  process.env.FINAL_LOGOS_ROOT ||
  '/Users/saad/Downloads/FINAL LOGOS WITH NEW DESIGN';

const INCOMING = path.join(REPO_ROOT, 'incoming-brand-assets');
const SOURCE = path.join(REPO_ROOT, 'amqur-widget/assets/branding/source');
const CDN_TENANTS = path.join(
  REPO_ROOT,
  'amqur-widget/cdn/public/assets/tenants',
);
const DOCS_BRANDING = path.join(REPO_ROOT, 'docs/branding');
const PUBLIC_BASE = 'https://widget.dialusnow.com/assets/tenants';

/** @type {Array<{
 *   tenantSlug: string;
 *   displayName: string;
 *   altText: string;
 *   sourceDir: string;
 *   primarySvg: string;
 *   primaryPng: string | null;
 *   copyExtensions: string[];
 *   favicons?: boolean;
 *   sourceAltDir?: string;
 * }>} */
const TENANTS = [
  {
    tenantSlug: 'dial-auto-group',
    displayName: 'Dial Auto Group',
    altText: 'Dial Auto Group logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'Dial Auto New/Logo'),
    primarySvg: 'Dial Auto Group-01.svg',
    primaryPng: 'Dial Auto Group-01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
    favicons: true,
  },
  {
    tenantSlug: 'dial-chevy-of-chicago',
    displayName: 'Dial Chevy of Chicago',
    altText: 'Dial Chevy of Chicago logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'CHEVY'),
    primarySvg: 'Dial Auto Group_01.svg',
    primaryPng: 'Dial Auto Group_01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
  },
  {
    tenantSlug: 'dial-cdjr-of-chicago',
    displayName: 'Dial CDJR of Chicago',
    altText: 'Dial CDJR of Chicago logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'Dial CDJR'),
    primarySvg: 'Dial Auto Group_01.svg',
    primaryPng: 'Dial Auto Group_01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
  },
  {
    tenantSlug: 'infiniti-of-chicago',
    displayName: 'Infiniti of Chicago',
    altText: 'Infiniti of Chicago logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'INFINITI OF CHICAGO'),
    primarySvg: 'Dial Auto Group_01.svg',
    primaryPng: 'Dial Auto Group_01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
    // Dark-variant alternate (typo folder name INFINTI) — source-alt only
    sourceAltDir: path.join(FINAL_LOGOS_ROOT, 'INFINTI'),
  },
  {
    tenantSlug: 'jeep-of-chicago',
    displayName: 'Jeep of Chicago',
    altText: 'Jeep of Chicago logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'JEEP OF CHICAGO'),
    primarySvg: 'Dial Auto Group_01.svg',
    primaryPng: 'Dial Auto Group_01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
  },
  {
    tenantSlug: 'dial-nissan-of-chicago',
    displayName: 'Dial Nissan of Chicago',
    altText: 'Dial Nissan of Chicago logo',
    sourceDir: path.join(FINAL_LOGOS_ROOT, 'NISSAN'),
    primarySvg: 'Dial Auto Group_01.svg',
    primaryPng: 'Dial Auto Group_01.png',
    copyExtensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function shortHash(hex) {
  return hex.slice(0, 12);
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => !n.startsWith('.'));
}

function shouldCopy(name, exts) {
  const lower = name.toLowerCase();
  return exts.some((e) => lower.endsWith(e));
}

/**
 * Sanitize SVG for safe CDN serving.
 * Removes scripts, event handlers, javascript: URLs, unsafe foreignObject,
 * external http(s) xlink:href / href (keeps internal # refs), and common
 * Illustrator / Adobe metadata blocks when easy.
 */
function sanitizeSvg(raw) {
  let svg = String(raw);

  // Remove XML/Adobe/Illustrator preamble junk outside root if present
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '');
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  svg = svg.replace(/<!--[\s\S]*?-->/g, (comment) => {
    // Drop illustrator / generator comments; keep empty
    if (/Generator|Adobe|Illustrator|Sketch|Figma/i.test(comment)) return '';
    return '';
  });

  // Strip script tags
  svg = svg.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<script\b[^>]*\/>/gi, '');

  // Strip foreignObject (often used for HTML injection)
  svg = svg.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/<foreignObject\b[^>]*\/>/gi, '');

  // Remove on* event handlers
  svg = svg.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Neutralize javascript: URLs in href / xlink:href / style url()
  svg = svg.replace(
    /\b((?:xlink:)?href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi,
    '$1=$2#$2',
  );
  svg = svg.replace(
    /url\(\s*(['"]?)\s*javascript:[^)]*\1\s*\)/gi,
    'none',
  );

  // External http(s) xlink:href / href → remove attribute (keep #internal)
  svg = svg.replace(
    /\s+((?:xlink:)?href)\s*=\s*(["'])(https?:[^"']+)\2/gi,
    '',
  );

  // Remove Adobe / i:extraneous namespaces lightly (keep visual SVG intact)
  svg = svg.replace(/\s+xmlns:i\s*=\s*"[^"]*"/gi, '');
  svg = svg.replace(/\s+xmlns:graph\s*=\s*"[^"]*"/gi, '');
  svg = svg.replace(/<i:pgfRef\b[^>]*\/>/gi, '');
  svg = svg.replace(/<i:pgf\b[^>]*>[\s\S]*?<\/i:pgf>/gi, '');

  // Normalize whitespace a bit but preserve structure
  svg = svg.replace(/^\s+/, '').replace(/\s+$/, '\n');
  if (!svg.startsWith('<svg')) {
    const idx = svg.indexOf('<svg');
    if (idx >= 0) svg = svg.slice(idx);
  }

  return svg;
}

function extractViewBox(svg) {
  const m = svg.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!m) return null;
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return { raw: m[1].trim() };
  }
  return {
    raw: m[1].trim(),
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

/**
 * Candidate brand colors from fill / stop-color hex values only.
 * Does not invent or normalize beyond lowercasing.
 */
function extractCandidateColors(svg) {
  const found = new Set();
  const patterns = [
    /fill:\s*(#[0-9a-fA-F]{3,8})\b/g,
    /fill\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/g,
    /stroke:\s*(#[0-9a-fA-F]{3,8})\b/g,
    /stroke\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/g,
    /stop-color:\s*(#[0-9a-fA-F]{3,8})\b/g,
    /stop-color\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(svg)) !== null) {
      found.add(m[1].toLowerCase());
    }
  }
  // Prefer brand-looking reds first in listing, then others sorted
  const all = [...found];
  const brandish = all.filter((c) =>
    /^#(e5|ce|91|eb|ec|f0|e7|e9)/i.test(c),
  );
  const rest = all.filter((c) => !brandish.includes(c)).sort();
  return [...brandish.sort(), ...rest];
}

function copyDirFiltered(srcDir, destDir, exts) {
  ensureDir(destDir);
  const copied = [];
  for (const name of listFiles(srcDir)) {
    const src = path.join(srcDir, name);
    const st = fs.statSync(src);
    if (!st.isFile()) continue;
    if (!shouldCopy(name, exts)) continue;
    const dest = path.join(destDir, name);
    copyFile(src, dest);
    copied.push(name);
  }
  return copied;
}

function copyFavicons(destIncoming, destSource) {
  const favRoot = path.join(FINAL_LOGOS_ROOT, 'Favicon');
  const names = listFiles(favRoot).filter((n) =>
    n.toLowerCase().endsWith('.png'),
  );
  const out = [];
  for (const name of names) {
    const src = path.join(favRoot, name);
    // Normalize awkward spaces in filenames for source copies
    const safe = name.replace(/\s+/g, ' ').trim();
    const destIn = path.join(destIncoming, 'favicons', safe);
    const destSrc = path.join(destSource, 'favicons', safe);
    copyFile(src, destIn);
    copyFile(src, destSrc);
    out.push(safe);
  }
  return out;
}

function resolvePrimarySvgPath(tenant) {
  const incomingSvg = path.join(
    INCOMING,
    tenant.tenantSlug,
    tenant.primarySvg,
  );
  if (fs.existsSync(incomingSvg)) return incomingSvg;
  const finalSvg = path.join(tenant.sourceDir, tenant.primarySvg);
  if (fs.existsSync(finalSvg)) return finalSvg;
  throw new Error(
    `Missing primary SVG for ${tenant.tenantSlug}: tried ${incomingSvg} and ${finalSvg}`,
  );
}

function resolvePrimaryPngPath(tenant) {
  if (!tenant.primaryPng) return null;
  const incomingPng = path.join(
    INCOMING,
    tenant.tenantSlug,
    tenant.primaryPng,
  );
  if (fs.existsSync(incomingPng)) return incomingPng;
  const finalPng = path.join(tenant.sourceDir, tenant.primaryPng);
  if (fs.existsSync(finalPng)) return finalPng;
  return null;
}

function processTenant(tenant) {
  const incomingDir = path.join(INCOMING, tenant.tenantSlug);
  const sourceDir = path.join(SOURCE, tenant.tenantSlug);
  const cdnDir = path.join(CDN_TENANTS, tenant.tenantSlug);
  const docsDir = path.join(DOCS_BRANDING, 'tenants', tenant.tenantSlug);

  ensureDir(incomingDir);
  ensureDir(sourceDir);
  ensureDir(cdnDir);
  ensureDir(docsDir);

  // Prefer FINAL LOGOS when present; otherwise keep existing incoming
  let originalsCopied = [];
  if (fs.existsSync(tenant.sourceDir)) {
    originalsCopied = copyDirFiltered(
      tenant.sourceDir,
      incomingDir,
      tenant.copyExtensions,
    );
    // Mirror originals into branding source
    copyDirFiltered(tenant.sourceDir, sourceDir, tenant.copyExtensions);
  } else if (fs.existsSync(incomingDir)) {
    originalsCopied = listFiles(incomingDir).filter((n) =>
      shouldCopy(n, tenant.copyExtensions),
    );
    for (const name of originalsCopied) {
      copyFile(path.join(incomingDir, name), path.join(sourceDir, name));
    }
  } else {
    throw new Error(
      `No source for ${tenant.tenantSlug}: missing ${tenant.sourceDir} and ${incomingDir}`,
    );
  }

  let favicons = [];
  if (tenant.favicons) {
    favicons = copyFavicons(incomingDir, sourceDir);
  }

  let sourceAlt = [];
  if (tenant.sourceAltDir && fs.existsSync(tenant.sourceAltDir)) {
    const altIncoming = path.join(incomingDir, 'source-alt');
    const altSource = path.join(sourceDir, 'source-alt');
    sourceAlt = copyDirFiltered(
      tenant.sourceAltDir,
      altIncoming,
      tenant.copyExtensions,
    );
    copyDirFiltered(tenant.sourceAltDir, altSource, tenant.copyExtensions);
  }

  const svgPath = resolvePrimarySvgPath(tenant);
  const rawSvg = fs.readFileSync(svgPath, 'utf8');
  const sanitized = sanitizeSvg(rawSvg);
  const svgBuf = Buffer.from(sanitized, 'utf8');
  const svgSha256 = sha256Hex(svgBuf);
  const svgHash12 = shortHash(svgSha256);
  const svgRuntimeName = `logo.${svgHash12}.svg`;

  // Write sanitized primary into source as well
  const sanitizedSourceName = `logo.sanitized.svg`;
  fs.writeFileSync(path.join(sourceDir, sanitizedSourceName), svgBuf);
  fs.writeFileSync(path.join(cdnDir, svgRuntimeName), svgBuf);
  fs.writeFileSync(path.join(docsDir, svgRuntimeName), svgBuf);
  // Stable symlink-like copy without hash for local preview
  fs.writeFileSync(path.join(cdnDir, 'logo.svg'), svgBuf);

  let pngSha256 = null;
  let pngHash12 = null;
  let pngRuntimeName = null;
  const pngPath = resolvePrimaryPngPath(tenant);
  if (pngPath && fs.existsSync(pngPath)) {
    const pngBuf = fs.readFileSync(pngPath);
    pngSha256 = sha256Hex(pngBuf);
    pngHash12 = shortHash(pngSha256);
    pngRuntimeName = `logo.${pngHash12}.png`;
    fs.writeFileSync(path.join(cdnDir, pngRuntimeName), pngBuf);
    fs.writeFileSync(path.join(docsDir, pngRuntimeName), pngBuf);
    fs.writeFileSync(path.join(cdnDir, 'logo.png'), pngBuf);
    // Also keep hashed png in source
    fs.writeFileSync(path.join(sourceDir, pngRuntimeName), pngBuf);
  }

  // Copy favicons into CDN for dial-auto-group
  const faviconRuntime = [];
  if (tenant.favicons) {
    const favCdn = path.join(cdnDir, 'favicons');
    ensureDir(favCdn);
    for (const name of favicons) {
      const src = path.join(incomingDir, 'favicons', name);
      if (!fs.existsSync(src)) continue;
      const buf = fs.readFileSync(src);
      const h = shortHash(sha256Hex(buf));
      const sizeMatch = name.match(/(\d+)\s*x\s*(\d+)/i);
      const size = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : 'unknown';
      const runtime = `favicon.${size}.${h}.png`;
      fs.writeFileSync(path.join(favCdn, runtime), buf);
      faviconRuntime.push({
        size,
        filename: runtime,
        sha256: sha256Hex(buf),
        publicUrl: `${PUBLIC_BASE}/${tenant.tenantSlug}/favicons/${runtime}`,
      });
    }
  }

  const viewBox = extractViewBox(sanitized);
  const candidateColors = extractCandidateColors(sanitized);

  return {
    tenantSlug: tenant.tenantSlug,
    displayName: tenant.displayName,
    altText: tenant.altText,
    // Never publish absolute local paths on the CDN-facing manifest.
    sourceDirName: path.basename(tenant.sourceDir),
    sourceFiles: originalsCopied,
    sourceAltFiles: sourceAlt,
    favicons,
    faviconRuntime,
    svg: {
      originalFilename: tenant.primarySvg,
      runtimeFilename: svgRuntimeName,
      sha256: svgSha256,
      hash12: svgHash12,
      publicUrl: `${PUBLIC_BASE}/${tenant.tenantSlug}/${svgRuntimeName}`,
      viewBox,
      candidateColors,
    },
    png: pngRuntimeName
      ? {
          originalFilename: tenant.primaryPng,
          runtimeFilename: pngRuntimeName,
          sha256: pngSha256,
          hash12: pngHash12,
          publicUrl: `${PUBLIC_BASE}/${tenant.tenantSlug}/${pngRuntimeName}`,
        }
      : null,
  };
}

function writeMarkdown(manifest) {
  const lines = [];
  lines.push('# Tenant brand assets');
  lines.push('');
  lines.push(
    'Generated by `amqur-widget/scripts/build-tenant-brand-assets.mjs`. Do not invent colors — candidates are extracted from SVG fills only.',
  );
  lines.push('');
  lines.push(`Generated at: ${manifest.generatedAt}`);
  lines.push('');
  lines.push('| tenantSlug | source path | runtime SVG | SVG sha256 | candidate colors | public URL |');
  lines.push('|---|---|---|---|---|---|');
  for (const t of manifest.tenants) {
    const colors = t.svg.candidateColors.join(', ');
    lines.push(
      `| \`${t.tenantSlug}\` | \`${t.sourceDirName || t.sourcePath}\` | \`${t.svg.runtimeFilename}\` | \`${t.svg.sha256}\` | ${colors} | ${t.svg.publicUrl} |`,
    );
  }
  lines.push('');
  lines.push('## Per-tenant detail');
  lines.push('');
  for (const t of manifest.tenants) {
    lines.push(`### ${t.displayName} (\`${t.tenantSlug}\`)`);
    lines.push('');
    lines.push(`- **Alt text:** ${t.altText}`);
    lines.push(`- **Source:** \`${t.sourceDirName || t.sourcePath}\``);
    lines.push(
      `- **SVG:** \`${t.svg.runtimeFilename}\` (sha256 \`${t.svg.sha256}\`)`,
    );
    if (t.png) {
      lines.push(
        `- **PNG:** \`${t.png.runtimeFilename}\` (sha256 \`${t.png.sha256}\`)`,
      );
    }
    if (t.svg.viewBox) {
      lines.push(`- **viewBox:** \`${t.svg.viewBox.raw}\``);
      if (t.svg.viewBox.width != null) {
        lines.push(
          `- **Dimensions:** ${t.svg.viewBox.width} × ${t.svg.viewBox.height}`,
        );
      }
    }
    lines.push(
      `- **Candidate colors:** ${t.svg.candidateColors.map((c) => `\`${c}\``).join(', ')}`,
    );
    lines.push(`- **Public URL:** ${t.svg.publicUrl}`);
    if (t.sourceAltFiles?.length) {
      lines.push(
        `- **Source-alt (INFINTI dark variant):** ${t.sourceAltFiles.join(', ')}`,
      );
    }
    if (t.faviconRuntime?.length) {
      lines.push('- **Favicons:**');
      for (const f of t.faviconRuntime) {
        lines.push(`  - ${f.size}: \`${f.filename}\` → ${f.publicUrl}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  ensureDir(INCOMING);
  ensureDir(SOURCE);
  ensureDir(CDN_TENANTS);
  ensureDir(DOCS_BRANDING);

  const tenants = TENANTS.map(processTenant);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    publicBaseUrl: PUBLIC_BASE,
    tenants,
  };

  const cdnManifestPath = path.join(CDN_TENANTS, 'manifest.json');
  const docsManifestPath = path.join(DOCS_BRANDING, 'asset-manifest.json');
  const docsMdPath = path.join(DOCS_BRANDING, 'tenant-assets.md');

  fs.writeFileSync(cdnManifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(docsManifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(docsMdPath, writeMarkdown(manifest) + '\n');

  // Console mapping table
  console.log('tenantSlug\tsource\truntime\tsha256\tcandidates\tpublicUrl');
  for (const t of tenants) {
    console.log(
      [
        t.tenantSlug,
        t.sourceDirName || t.sourcePath,
        t.svg.runtimeFilename,
        t.svg.sha256,
        t.svg.candidateColors.join('|'),
        t.svg.publicUrl,
      ].join('\t'),
    );
  }
  console.log('');
  console.log(`Wrote ${cdnManifestPath}`);
  console.log(`Wrote ${docsManifestPath}`);
  console.log(`Wrote ${docsMdPath}`);
}

main();

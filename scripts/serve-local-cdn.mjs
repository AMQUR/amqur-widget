#!/usr/bin/env node
/**
 * Local stand-in for the widget CDN, for developer machines and protected test runs.
 * Serves dist/ at the root on a loopback address with the same CORS behaviour as the real CDN
 * (cdn/nginx.conf.template): scripts, the manifest and fonts are readable cross-origin.
 *
 *   npm run build
 *   node scripts/build-embed-loader.mjs --env local --out dist   # loader pinned to loopback hosts
 *   node scripts/serve-local-cdn.mjs                             # http://127.0.0.1:4174
 *
 * Loopback only. Refuses to run with NODE_ENV=production.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('serve-local-cdn refuses to run with NODE_ENV=production');
  process.exit(1);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.LOCAL_CDN_PORT || 4174);
const MIME = { '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = path.join(ROOT, rel);
    const type = MIME[path.extname(file)];
    if (!file.startsWith(ROOT + path.sep) || !type) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`local widget CDN on http://127.0.0.1:${PORT} (serving dist/)`));

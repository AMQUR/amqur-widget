#!/usr/bin/env node
/**
 * Static host page for the real-backend integration run: serves the built widget bundle and a
 * plain page on http://localhost:5173 (an origin the backend's local demo tenant allows).
 * Loopback only. It contains no API of its own — every request goes to the real local backend.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.HOST_PORT || 5173);
const API = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const TENANT = process.env.LOCAL_TENANT || 'dial-demo-local';
const LOCATION = process.env.LOCAL_LOCATION || 'demo-rooftop';
const MIME = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
        if (url.pathname === '/health') return res.writeHead(200).end('ok');
        if (url.pathname.startsWith('/dist/')) {
            const file = path.join(ROOT, 'dist', path.normalize(url.pathname.slice(6)).replace(/^(\.\.[/\\])+/, ''));
            if (!file.startsWith(path.join(ROOT, 'dist'))) return res.writeHead(403).end();
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
            return res.end(await readFile(file));
        }
        const theme = url.searchParams.get('theme') === 'neutral' ? 'neutral' : 'showroom';
        const lang = url.searchParams.get('lang') === 'es' ? ", locale: 'es'" : '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AMQUR integration host</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>body{margin:0;font-family:Georgia,serif}main{max-width:900px;margin:0 auto;padding:32px 20px}</style></head>
<body><main><h1>Integration host page</h1><p>Local test page against the local backend demo tenant. Simulated data only.</p></main>
<script src="/dist/assistant-widget.iife.js"></script>
<script>window.AMQUR.init({ apiBaseUrl: ${JSON.stringify(API)}, tenantSlug: ${JSON.stringify(TENANT)}, locationSlug: ${JSON.stringify(LOCATION)}, theme: '${theme}'${lang} });</script>
</body></html>`);
    } catch {
        res.writeHead(404).end();
    }
}).listen(PORT, '127.0.0.1', () => console.log(`integration host on http://localhost:${PORT}`));

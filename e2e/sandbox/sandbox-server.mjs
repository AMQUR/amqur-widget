#!/usr/bin/env node
/**
 * AMQUR widget SANDBOX — a local, dependency-free stand-in for the API, for browser tests and
 * design review only. Everything it returns is synthetic and labelled as demo data:
 *   - vehicles carry `simulated: true` (the widget badges them "Demo vehicle") and DEMO VINs
 *   - the scheduler is a "Sandbox scheduler" and its confirmations are marked `sandbox: true`
 *   - no real dealership inventory, price, phone number, customer or appointment is involved
 * It binds to 127.0.0.1 only and refuses to start when NODE_ENV=production.
 *
 * It implements the same public contract the backend exposes (widget-config, widget-token,
 * POST /chat, POST /chat/stream, /chat/live), so the widget under test is the real bundle.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
    console.error('sandbox-server refuses to run with NODE_ENV=production');
    process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.SANDBOX_PORT || 18090);
const TZ = 'America/Chicago';

/** Rooftop identities only (names + brands). No phones, hours or addresses are invented here. */
const TENANTS = {
    'dial-chevy-of-chicago': { name: 'Dial Chevy of Chicago', brands: ['Chevrolet'], store: '#2f6fc4', scheduler: 'request_only' },
    'dial-nissan-of-chicago': { name: 'Dial Nissan of Chicago', brands: ['Nissan'], store: '#c3c7cc', scheduler: 'external_link' },
    'infiniti-of-chicago': { name: 'INFINITI of Chicago', brands: ['INFINITI'], store: '#7d8691', scheduler: 'external_link' },
    'dial-cdjr-of-chicago': { name: 'Dial Chrysler Dodge Jeep Ram of Chicago', short: 'Dial CDJR (South Side)', brands: ['Jeep', 'Ram', 'Dodge', 'Chrysler'], store: '#3f8a57', scheduler: 'provider_slots' },
    'jeep-of-chicago': { name: 'Jeep of Chicago', short: 'Jeep of Chicago (North Side)', brands: ['Jeep', 'Ram', 'Dodge', 'Chrysler'], store: '#3f8a57', scheduler: 'provider_slots' },
    'dial-auto-group': { name: 'Dial Auto Group', brands: [], store: '#e5042f', scheduler: 'request_only', group: true },
};

const CONSENT_VERSION = 'sandbox-consent-v1';
const CONSENT = {
    en: {
        EMAIL: 'Email me about this request.',
        CALL: 'Call me about this request.',
        TEXT: 'Text me about this request. Message and data rates may apply. Reply STOP to opt out.',
    },
    es: {
        EMAIL: 'Envíenme un correo sobre esta solicitud.',
        CALL: 'Llámenme sobre esta solicitud.',
        TEXT: 'Envíenme mensajes de texto sobre esta solicitud. Pueden aplicar cargos por mensajes y datos. Responda STOP para cancelar.',
    },
};

/** Synthetic vehicles. VINs are deliberately not valid VINs. */
function demoVehicles(tenantSlug) {
    const mk = (n, slug, trim, price, miles, condition) => ({
        vin: `DEMO${slug === 'jeep-of-chicago' ? 'N' : 'S'}GC00000000${n}`,
        stock: `DEMO-${slug === 'jeep-of-chicago' ? 'N' : 'S'}${n}`,
        year: 2026,
        make: 'Jeep',
        model: 'Grand Cherokee',
        trim,
        price,
        mileage: miles,
        condition,
        drivetrain: '4x4',
        color: ['Graphite', 'White', 'Red', 'Blue'][n % 4],
        photos: [`/demo-photo/${n}a.svg`, `/demo-photo/${n}b.svg`, `/demo-photo/${n}c.svg`],
        status: 'AVAILABLE',
        freshnessState: 'FRESH',
        lastSeenAt: new Date().toISOString(),
        simulated: true,
        vdpUrl: null, // a sandbox vehicle has no real listing page
        rooftopName: TENANTS[slug].short ?? TENANTS[slug].name,
        priceIncludesDealerFees: false,
    });
    const north = [mk(1, 'jeep-of-chicago', 'Laredo', 41995, 12, 'NEW'), mk(2, 'jeep-of-chicago', 'Limited', 48995, 8, 'NEW'), mk(3, 'jeep-of-chicago', 'Overland', 58450, 15, 'NEW')];
    const south = [mk(4, 'dial-cdjr-of-chicago', 'Altitude', 44780, 10, 'NEW'), mk(5, 'dial-cdjr-of-chicago', 'Limited', 49210, 21, 'NEW')];
    if (tenantSlug === 'jeep-of-chicago') return north;
    if (tenantSlug === 'dial-cdjr-of-chicago') return south;
    return [...north.slice(0, 2), ...south];
}

function monthly(principal, aprPct, months) {
    if (principal <= 0) return 0;
    if (aprPct === 0) return principal / months;
    const r = aprPct / 12 / 100;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Sandbox scheduler: weekday slots at fixed store-local hours, for the next few days. */
function sandboxSlots() {
    const out = [];
    const now = Date.now();
    for (let d = 1; d <= 4; d += 1) {
        for (const hourUtc of [16, 18, 20, 22]) {
            const day = new Date(now + d * 86_400_000);
            const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourUtc, 0, 0));
            out.push({ id: `sbx-${start.toISOString()}`, start: start.toISOString(), expiresAt: new Date(now + 15 * 60_000).toISOString() });
        }
    }
    // One slot that the sandbox provider will reject, to exercise the lost-race path.
    out[1].id = `sbx-taken-${out[1].start}`;
    return out;
}

function nextDays(n) {
    const out = [];
    for (let d = 1; d <= n; d += 1) out.push(new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10));
    return out;
}

const sessions = new Map();
function session(id) {
    if (!sessions.has(id)) sessions.set(id, { lead: false, vehicle: null, handoff: 'AI', aiPaused: false, liveSent: false, journey: {} });
    return sessions.get(id);
}

function envelope(extra, st, lang) {
    return {
        reply: extra.segments.join(' '),
        segments: extra.segments,
        type: extra.type,
        vehicles: extra.vehicles,
        cards: extra.cards ?? [],
        quickReplies: extra.quickReplies ?? [],
        journey: st.journey,
        provenance: { sources: ['sandbox-fixture'], inventoryAsOf: new Date().toISOString(), verifiedFactsOnly: false, disclaimer: extra.disclaimer },
        conversation: { language: lang, handoffState: st.handoff, aiPaused: st.aiPaused, pending: 'none' },
        delivery: { urgent: false, toolCount: extra.vehicles ? 1 : 0, minTypingMs: 0, maxTypingMs: 0 },
    };
}

function picker(tenant, tenantSlug, st, department, purpose) {
    const base = { kind: 'appointment_picker', id: `pk-${Date.now()}`, department, purpose, rooftopName: tenant.name, timezone: TZ, vehicleLabel: st.vehicle?.label ?? null, vin: st.vehicle?.vin ?? null };
    const mode = department === 'service' ? tenant.scheduler : tenant.scheduler === 'external_link' ? 'request_only' : tenant.scheduler;
    if (mode === 'provider_slots') return { ...base, mode, slots: sandboxSlots(), sandbox: true };
    if (mode === 'external_link') return { ...base, mode, externalUrl: 'https://scheduler.example.invalid/consumer-scheduling' };
    return { ...base, mode: 'request_only', days: nextDays(5) };
}

function leadForm(tenant, st, purpose, lang) {
    return {
        kind: 'lead_form',
        id: `lf-${Date.now()}`,
        purpose,
        rooftopName: tenant.name,
        vehicleLabel: st.vehicle?.label ?? null,
        vin: st.vehicle?.vin ?? null,
        channels: ['EMAIL', 'CALL', 'TEXT'],
        consent: { version: CONSENT_VERSION, text: CONSENT[lang] },
        reason: lang === 'es' ? 'Para que el equipo pueda confirmar su visita.' : 'So the team can confirm your visit with you.',
    };
}

/** A DEMO VIN encodes its rooftop (N = Jeep of Chicago North, S = Dial CDJR South). */
const ownerSlugOfVin = (vin) => (typeof vin === 'string' && vin.startsWith('DEMON') ? 'jeep-of-chicago' : typeof vin === 'string' && vin.startsWith('DEMOS') ? 'dial-cdjr-of-chicago' : null);

/** Deterministic scripted turns. Not an AI — a contract fixture. */
function turn(body, tenantSlug) {
    const entry = TENANTS[tenantSlug];
    const idForOwner = body.conversationId ? sessions.get(body.conversationId) : null;
    // Leads and appointments belong to the rooftop that holds the chosen vehicle — never to the
    // group, and never to the other Jeep store.
    const ownerSlug = ownerSlugOfVin(body.vin) ?? ownerSlugOfVin(idForOwner?.vehicle?.vin) ?? tenantSlug;
    const tenant = entry.group ? TENANTS[ownerSlug] : entry;
    const lang = body.language === 'es' ? 'es' : 'en';
    const es = lang === 'es';
    const rnd = () => Array.from({ length: 22 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    // Same shape as the real server-issued id (cv1.<22>.<22>); the widget rejects anything else.
    const id = body.conversationId || `cv1.${rnd()}.${rnd()}`;
    const st = session(id);
    const msg = String(body.message || '').toLowerCase();
    const action = body.action;
    const all = [...demoVehicles('jeep-of-chicago'), ...demoVehicles('dial-cdjr-of-chicago')];
    const byVin = (vin) => all.find((v) => v.vin === vin);
    let out;

    if (msg.includes('trigger-error')) return { id, error: true };

    if (st.aiPaused) {
        out = { segments: [], type: 'staff_handling' };
    } else if (action === 'human' || /real person|human|persona/.test(msg)) {
        st.handoff = 'JOINED';
        st.aiPaused = true;
        st.journey.handoff = { state: 'notified' };
        out = {
            segments: [es ? 'Claro. Le paso con una persona del equipo.' : 'Of course. I’m bringing in a person from the team now.'],
            cards: [{ kind: 'handoff', state: 'notified', escalationId: 'sbx-esc-1' }],
        };
    } else if (action === 'lead_capture' && body.lead) {
        const granted = (body.lead.consents || []).filter((c) => c.granted).map((c) => c.channel);
        if (!granted.includes(body.lead.preferredChannel)) {
            out = { segments: [es ? 'Necesito su autorización para ese medio de contacto.' : 'I need your permission for that contact method before I pass this along.'], cards: [leadForm(tenant, st, 'test_drive', lang)] };
        } else {
            st.lead = true;
            out = {
                segments: [
                    es ? `Gracias, ${body.lead.firstName}. Su solicitud está con ${tenant.name}.` : `Thanks, ${body.lead.firstName}. Your request is with ${tenant.name}.`,
                    es ? '¿Qué horario le conviene?' : 'What time works for you?',
                ],
                cards: [picker(tenant, tenantSlug, st, 'sales', es ? 'Prueba de manejo' : 'Test drive')],
            };
        }
    } else if (action === 'appointment_select' && body.appointment) {
        const a = body.appointment;
        if (a.slotId && a.slotId.startsWith('sbx-taken-')) {
            out = {
                segments: [es ? 'Ese horario se acaba de ocupar, así que no quedó reservado. Elija otro.' : 'That time was just taken, so nothing was booked. Please pick another.'],
                cards: [picker(tenant, tenantSlug, st, 'sales', es ? 'Prueba de manejo' : 'Test drive')],
            };
        } else if (a.slotId) {
            const start = a.slotId.replace(/^sbx-/, '');
            st.journey.appointment = { id: 'sbx-appt-1', label: es ? 'Prueba de manejo' : 'Test drive', status: 'CONFIRMED' };
            out = {
                segments: [es ? 'Listo. El sistema de citas confirmó su horario.' : 'You’re set. The scheduler confirmed your time.'],
                cards: [
                    {
                        kind: 'appointment', id: 'sbx-appt-1', type: 'TEST_DRIVE', status: 'CONFIRMED', outcome: 'confirmed', date: null, time: null,
                        label: es ? 'Prueba de manejo' : 'Test drive', verified: true, providerRef: `SBX-${start.slice(5, 10).replace('-', '')}-${start.slice(11, 13)}`,
                        providerName: 'Sandbox scheduler', rooftopName: tenant.name, department: es ? 'Ventas' : 'Sales', timezone: TZ, startsAt: start, sandbox: true,
                    },
                ],
            };
        } else {
            st.journey.appointment = { id: 'sbx-appt-2', label: es ? 'Visita' : 'Visit', status: 'REQUESTED' };
            out = {
                segments: [es ? 'Envié su solicitud. Aún no está reservada: el equipo confirmará la hora exacta.' : 'I sent your request. It isn’t booked yet — the team will confirm the exact time with you.'],
                cards: [
                    { kind: 'appointment', id: 'sbx-appt-2', type: 'SALES_VISIT', status: 'REQUESTED', outcome: 'requested', date: a.requestedDate ?? null, time: null,
                      label: `${a.requestedDate ?? ''} · ${a.requestedWindow ?? ''}`, verified: false, rooftopName: tenant.name, department: es ? 'Ventas' : 'Sales', timezone: TZ },
                ],
            };
        }
    } else if (action === 'vehicle_detail' && body.vin) {
        const v = byVin(body.vin);
        if (v) st.vehicle = { vin: v.vin, label: `${v.year} ${v.make} ${v.model} ${v.trim}` };
        st.journey.selectedVehicle = st.vehicle;
        out = {
            segments: [es ? `Este es el ${st.vehicle?.label} en ${v?.rooftopName}. ¿Quiere ver un estimado de pago o agendar una visita?` : `This is the ${st.vehicle?.label} at ${v?.rooftopName}. Want a payment illustration, or to set up a visit there?`],
            type: 'vehicle_detail',
            vehicles: v ? [v] : [],
            quickReplies: es ? ['Estimado de pago', 'Agendar prueba de manejo'] : ['Payment illustration', 'Book a test drive'],
        };
    } else if (action === 'payment_estimate' || /payment|pago/.test(msg)) {
        const v = byVin(body.vin) ?? (st.vehicle ? byVin(st.vehicle.vin) : all[1]);
        st.vehicle = { vin: v.vin, label: `${v.year} ${v.make} ${v.model} ${v.trim}` };
        st.journey.selectedVehicle = st.vehicle;
        const down = 4000;
        const apr = 6.9;
        const term = 72;
        const m = monthly(v.price - down, apr, term);
        st.journey.payment = { vin: v.vin, monthly: m, termMonths: term, downPayment: down, aprSource: 'ILLUSTRATIVE' };
        out = {
            segments: [es ? 'Aquí tiene una ilustración con una tasa de ejemplo. No es una oferta de financiamiento.' : 'Here’s an illustration using an example rate. It isn’t a financing offer.'],
            type: 'payment_summary',
            cards: [
                {
                    kind: 'payment', vin: v.vin, vehicleLabel: `${v.year} ${v.make} ${v.model} ${v.trim}`, monthly: m, apr, aprSource: 'ILLUSTRATIVE', termMonths: term, downPayment: down, tradeEquity: 0,
                    price: v.price, includesTaxAndFees: false, policyVersion: 'sandbox-policy-1',
                    disclaimer: es
                        ? 'Ilustración con tasa de ejemplo. Impuestos, título, placas y cargos de la agencia no incluidos. Sujeto a aprobación de crédito del prestamista. No es una oferta.'
                        : 'Illustration at an example rate. Taxes, title, registration and dealer fees are not included. Subject to lender credit approval. Not an offer.',
                },
            ],
            quickReplies: es ? ['Agendar prueba de manejo'] : ['Book a test drive'],
        };
    } else if (action === 'test_drive' || /test drive|prueba de manejo/.test(msg)) {
        const v = byVin(body.vin);
        if (v) {
            st.vehicle = { vin: v.vin, label: `${v.year} ${v.make} ${v.model} ${v.trim}` };
            st.journey.selectedVehicle = st.vehicle;
        }
        out = st.lead
            ? { segments: [es ? '¿Qué horario le conviene?' : 'What time works for you?'], cards: [picker(tenant, tenantSlug, st, 'sales', es ? 'Prueba de manejo' : 'Test drive')] }
            : { segments: [es ? 'Con gusto. Necesito un nombre y una forma de contactarle.' : 'Happy to. I just need a name and one way to reach you.'], cards: [leadForm(tenant, st, 'test_drive', lang)] };
    } else if (action === 'service' || /brake|service|servicio|frenos/.test(msg)) {
        st.journey.service = { need: es ? 'Frenos' : 'Brakes' };
        out = /failed|fall/.test(msg)
            ? { segments: [es ? 'Por seguridad, no conduzca el vehículo. Le paso con el equipo de servicio ahora.' : 'For your safety, please don’t drive the vehicle. I’m getting the service team for you now.'], cards: [{ kind: 'handoff', state: 'notified', escalationId: 'sbx-esc-2' }] }
            : { segments: [es ? 'Puedo ayudarle a pedir una cita de servicio. No puedo diagnosticar el vehículo a distancia.' : 'I can help you set up a service visit. I can’t diagnose the vehicle remotely.'], cards: [picker(tenant, tenantSlug, st, 'service', es ? 'Revisión de frenos' : 'Brake inspection')] };
    } else if (action === 'parts' || /part|headlight|refacci/.test(msg)) {
        st.journey.parts = { need: es ? 'Faro' : 'Headlight', status: 'REQUESTED' };
        out = {
            segments: [es ? 'El equipo de refacciones confirma compatibilidad con el VIN. ¿Lo tiene a la mano?' : 'The parts team confirms fitment by VIN. Do you have it handy?'],
            cards: [{ kind: 'parts', id: 'sbx-part-1', status: 'REQUESTED', fitmentVerified: false, priceVerified: false, availabilityVerified: false, etaVerified: false, needsVin: true }],
        };
    } else if (/grand cherokee|jeep|either|north|south|norte|sur|ambas|sales|shop|vehicles|ver veh/.test(msg) || action === 'sales') {
        const wantsBoth = /either|ambas|both/.test(msg);
        const north = /north|norte/.test(msg);
        const south = /south|sur\b/.test(msg);
        if (entry.group && !wantsBoth && !north && !south) {
            out = {
                segments: [es ? 'Puedo revisar las dos agencias Jeep. ¿Prefiere el lado norte, el lado sur o ambas?' : 'I can check both Jeep locations. Do you prefer the North Side, the South Side, or either?'],
                quickReplies: es ? ['Lado norte', 'Lado sur', 'Ambas'] : ['North Side', 'South Side', 'Either'],
            };
        } else {
            const list = entry.group ? (north ? demoVehicles('jeep-of-chicago') : south ? demoVehicles('dial-cdjr-of-chicago') : demoVehicles('dial-auto-group')) : demoVehicles(tenantSlug);
            out = {
                segments: [es ? `Estos son vehículos de demostración (${list.length}). Cada uno indica en qué agencia está.` : `These are demo vehicles (${list.length}). Each one shows which dealership it’s at.`],
                type: 'vehicle_carousel',
                vehicles: list,
                disclaimer: es ? 'Datos de demostración. No es inventario real.' : 'Demo data. Not real inventory.',
            };
        }
    } else if (msg.includes('slow')) {
        out = { segments: [Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')], slow: true };
    } else {
        out = {
            segments: [es ? 'Soy el asistente de IA. Puedo ayudarle con vehículos, servicio o refacciones.' : 'I’m the AI assistant. I can help with vehicles, service or parts.'],
            quickReplies: es ? ['Ver vehículos', 'Servicio', 'Refacciones'] : ['Shop vehicles', 'Service', 'Parts'],
        };
    }
    return { id, st, lang, out, response: { ...envelope(out, st, lang), conversationId: id, conversationIdIssued: !body.conversationId } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ success: status < 400, statusCode: status, data, timestamp: new Date().toISOString() }));
};
async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
        size += c.length;
        if (size > 64_000) throw new Error('too large');
        chunks.push(c);
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function demoPhoto(name) {
    const hue = (name.charCodeAt(0) * 47) % 360;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="hsl(${hue} 8% 82%)"/><rect y="290" width="640" height="110" fill="hsl(${hue} 6% 70%)"/><path d="M120 280c10-50 60-80 120-90l60-50h150l70 55c50 8 80 30 85 85z" fill="hsl(${hue} 10% 38%)"/><circle cx="210" cy="285" r="38" fill="#1b1d21"/><circle cx="470" cy="285" r="38" fill="#1b1d21"/><text x="320" y="60" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#101113">DEMO PHOTO ${name.toUpperCase()} — NOT A REAL VEHICLE</text></svg>`;
}

function hostPage(url) {
    const q = url.searchParams;
    const tenant = TENANTS[q.get('tenant')] ? q.get('tenant') : 'jeep-of-chicago';
    const theme = q.get('theme') === 'neutral' ? 'neutral' : 'showroom';
    const hostile = q.get('hostile') === '1';
    const pageContext = q.get('vdp') === '1' ? `, pageContext: { pageType: 'vdp', vin: 'DEMONGC000000002' }` : '';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AMQUR sandbox host — ${tenant}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  body{margin:0;font-family:Georgia,serif;background:#fff;color:#222}
  main{max-width:900px;margin:0 auto;padding:32px 20px 200px}
  ${hostile ? `*{box-sizing:content-box !important;font-family:"Comic Sans MS",cursive !important;letter-spacing:.2em !important;text-transform:uppercase !important;line-height:3 !important}
  button,a,p,div,span,input,textarea,section,header{color:red !important;background:yellow !important;border:5px dashed blue !important;border-radius:40px !important;margin:10px !important;padding:10px !important;font-size:30px !important}
  img,svg{filter:invert(1) !important;width:300px !important}` : ''}
</style></head>
<body><main><h1 id="host-h1">Sandbox dealership page</h1>
<p id="host-p">Disposable test page. Not a dealership site. All assistant data here is synthetic.</p>
<button id="host-btn">Host page button</button></main>
<script src="/dist/assistant-widget.iife.js"></script>
<script>
  window.AMQUR.init({ apiBaseUrl: location.origin + '${q.get('nostream') === '1' ? '/nostream' : ''}/api', tenantSlug: '${tenant}', locationSlug: 'main', theme: '${theme}'${q.get('lang') === 'es' ? ", locale: 'es'" : ''}${pageContext} });
</script></body></html>`;
}

const MIME = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.html': 'text/html' };

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let p = url.pathname;
        const noStream = p.startsWith('/nostream/api/');
        if (noStream) p = p.slice('/nostream'.length);

        if (p === '/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(hostPage(url));
        }
        if (p.startsWith('/dist/')) {
            const file = path.join(ROOT, 'dist', path.normalize(p.slice(6)).replace(/^(\.\.[/\\])+/, ''));
            if (!file.startsWith(path.join(ROOT, 'dist'))) return json(res, 403, { message: 'forbidden' });
            const data = await readFile(file);
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
            return res.end(data);
        }
        if (p.startsWith('/demo-photo/')) {
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            return res.end(demoPhoto(path.basename(p, '.svg')));
        }
        if (p === '/health') return json(res, 200, { ok: true, sandbox: true });

        const tenantSlug = url.searchParams.get('tenantSlug');
        if (p === '/api/public/widget-config') {
            const t = TENANTS[tenantSlug];
            if (!t) return json(res, 404, { message: 'Not found' });
            return json(res, 200, {
                tenant: { name: t.name, slug: tenantSlug },
                location: { name: t.name, slug: 'main' },
                branding: {
                    assistantDisplayName: `${t.short ?? t.name}`,
                    primaryColor: t.store,
                    accentColor: '#ffffff',
                    theme: null, // sandbox lets the host page choose via init; the real API sets this
                    logoUrl: null,
                    phone: null,
                    privacyUrl: 'https://example.invalid/privacy',
                    disclaimerText: 'SANDBOX — synthetic demo data. Not real inventory, prices or appointments.',
                },
                features: { chat: true, inventory: true, payments: true, vehicleCompare: true, savedVehicles: false, serviceAi: true, partsAi: true, multilingual: true, leadCapture: true, handoff: true, appointments: true },
                locales: ['en', 'es'],
                consentText: null,
                configVersion: 1,
            });
        }
        if (p === '/api/public/widget-token' && req.method === 'POST') {
            const body = await readBody(req);
            if (!TENANTS[body.tenantSlug]) return json(res, 403, { message: 'Forbidden' });
            return json(res, 200, { token: `sandbox.${body.tenantSlug}`, expiresIn: 14400 });
        }
        if (p === '/api/public/store-status') return json(res, 200, { known: false });
        if (p === '/api/public/spotlights') return json(res, 200, []);
        if (p === '/api/saved-vehicles') return json(res, 200, []);

        const auth = req.headers.authorization || '';
        const tokenTenant = auth.startsWith('Bearer sandbox.') ? auth.slice('Bearer sandbox.'.length) : null;

        if (p === '/api/chat/live') {
            const st = session(url.searchParams.get('conversationId'));
            const messages = [];
            if (st.aiPaused && !st.liveSent) {
                st.liveSent = true;
                messages.push({ id: 'sbx-live-1', kind: 'staff', text: 'Hi, this is Jordan with the sales team. I can take it from here.', displayName: 'Jordan', role: 'Sales', at: new Date().toISOString() });
            }
            return json(res, 200, { aiPaused: st.aiPaused, handoffState: st.handoff, messages });
        }

        if ((p === '/api/chat' || p === '/api/chat/stream') && req.method === 'POST') {
            if (!tokenTenant || !TENANTS[tokenTenant]) return json(res, 401, { message: 'Unauthorized' });
            const body = await readBody(req);
            const result = turn(body, tokenTenant);
            if (p === '/api/chat') {
                if (result.error) return json(res, 503, { message: 'Sandbox induced failure' });
                return json(res, 200, result.response);
            }
            if (noStream) return json(res, 404, { message: 'Not found' });
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
            const send = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            let closed = false;
            res.on('close', () => (closed = true));
            send({ type: 'turn.started', turnId: `t-${Date.now()}`, conversationId: result.id, conversationIdIssued: !body.conversationId });
            if (result.error) {
                send({ type: 'turn.error', code: 'sandbox_failure', message: 'Sandbox induced failure', retryable: true });
                return res.end();
            }
            if (result.out.vehicles) send({ type: 'status', phase: 'checking', label: result.lang === 'es' ? 'Revisando inventario' : 'Checking inventory' });
            await sleep(120);
            const segments = result.response.segments;
            for (let i = 0; i < segments.length && !closed; i += 1) {
                const words = segments[i].split(/(\s+)/);
                for (const w of words) {
                    if (closed) break;
                    send({ type: 'text.delta', index: i, text: w });
                    await sleep(result.out.slow ? 120 : 12);
                }
                send({ type: 'text.done', index: i });
            }
            if (!closed) send({ type: 'turn.completed', response: result.response });
            return res.end();
        }
        return json(res, 404, { message: 'Not found' });
    } catch (e) {
        try {
            json(res, 500, { message: 'sandbox error' });
        } catch {
            /* response already started */
        }
        console.error('[sandbox]', e instanceof Error ? e.message : e);
    }
});

server.listen(PORT, '127.0.0.1', () => console.log(`AMQUR widget sandbox on http://127.0.0.1:${PORT}  (synthetic data only)`));

# Widget sales desk — contract, themes and sandbox suite

Added on `feat/amqur-unified-sales-desk`. Everything here is additive: a server that knows none
of it still works (the widget falls back to `POST /chat` and simply never receives the new cards).

## Request additions (`POST /chat`, `POST /chat/stream`)

| Field | When | Shape |
|---|---|---|
| `action: "lead_capture"` + `lead` | Lead form submitted | `{ formId, firstName, lastName, email?, phone?, preferredChannel: EMAIL\|CALL\|TEXT, consents: [{ channel, granted, version }] }` |
| `action: "appointment_select"` + `appointment` | Time chosen | `{ pickerId, slotId? }` or `{ pickerId, requestedDate, requestedWindow }` |

The server must re-validate everything; the widget's checks are a convenience, not a control.

## Stream (`POST /chat/stream`, `text/event-stream`)

`turn.started` → optional `status` → `text.delta` / `text.done` per segment → `turn.completed`
(carrying the same envelope `POST /chat` returns) or `turn.error`. A 404/405, or a 200 that is
not an event stream, makes the widget fall back to `POST /chat` for the rest of the session.
The Stop button aborts reading; text already shown is kept and marked "Reply stopped", and no
cards are shown for an interrupted turn. Types: `src/widget/concierge/types.ts` (`StreamEvent`).

## Cards

| Kind | Meaning | Truth rule enforced in the UI |
|---|---|---|
| `lead_form` | Ask for a name and one contact method | Consent boxes are per channel, unticked, and use server wording + version. Shown only on the newest assistant message. Stays until the server accepts the submission |
| `appointment_picker` | `provider_slots` / `request_only` / `external_link` | Wording differs per mode; an external link says nothing is booked here; expired or past slots are hidden; times are shown in the store's timezone |
| `appointment` | Outcome | Reads "confirmed" only when `outcome=confirmed`, `verified=true` **and** `providerRef` is present; otherwise "Request sent — not booked yet" |

Vehicle additions: `vdpUrl` (https only, else not linked), `rooftopName` (shown on every card),
`priceIncludesDealerFees` (a line is shown only for an explicit true/false), photo gallery.

## Themes

`branding.theme` from widget-config selects `neutral` (default; tenant colours, system font) or
`showroom` (Dial: graphite `#101113`, one red `#e5042f`, Archivo, square corners). The init option
`theme` is only a fallback. Archivo is self-hosted at `assets/fonts/archivo-latin-var.woff2`
(SIL OFL 1.1, licence alongside) and registered with the FontFace API under the namespaced family
`AMQUR Archivo`; no stylesheet is added to the host page.

Host page hooks: `--amqur-launcher-bottom` and `--amqur-launcher-right` on `#amqur-widget-host`.

## Loader environments

`embed.js` is built per environment and the API it talks to is baked in. A host page cannot
change it: there is no query-string, global or attribute override.

| Build | Command | Hosts | Where it may be written |
|---|---|---|---|
| production | `npm run build:embed` | `widget.dialusnow.com` / `api.dialusnow.com` | `cdn/public` |
| staging | `node scripts/build-embed-loader.mjs --env staging --out <dir>` | staging hosts | staging image |
| local | `node scripts/build-embed-loader.mjs --env local [--widget-host … --api-host …]` | loopback only (`localhost` / `127.0.0.1`) | anywhere except `cdn/` |

A page may add `data-expect-api-origin="https://…"` to the script tag. It is a check, not an
address: if it does not equal the loader's own API origin, the loader logs
`api_origin_mismatch`, loads nothing and contacts nothing. Sites that pin their Content Security
Policy to one API origin should always set it, so a loader from the wrong environment cannot run
on them. `window.AMQUR_EMBED` exposes `environment`, `apiOrigin` and `widgetOrigin` read-only,
and `embed-manifest.json` carries the same facts for install checks.

`node scripts/serve-local-cdn.mjs` serves `dist/` on loopback with the CDN's CORS behaviour for
local and protected test runs.

## Host CSP

`script-src <widget origin>`; `connect-src <api origin>`; `font-src <widget origin>` (Showroom
only; the CDN serves `/assets/fonts/` with `Access-Control-Allow-Origin`, which a cross-origin
font needs); `img-src <widget origin>` plus each authorised vehicle-photo host; `style-src` must allow
the widget's inline `<style>` inside its shadow root.

## Privacy

- Lead-form values live in component state only and go out once in the request body.
- The transcript kept in `sessionStorage` is masked first (email, phone, SSN-shaped numbers).
- A failed boot shows nothing to shoppers; details appear only with `window.__AMQUR_DEBUG__ = true`.

## Sandbox browser suite

`npm run build && npm run test:sandbox` — the real bundle against
`e2e/sandbox/sandbox-server.mjs` (loopback only, synthetic and labelled demo data, no backend).
Twenty journeys at 1440 / 1280 / 768 / 390 / 320 px, including axe WCAG 2.2 A/AA, keyboard and
focus, 44 px targets, reduced motion, hostile host CSS, EN/ES, stream stop, JSON fallback, lost
slot, failed submission, request-vs-confirmed. Screenshots: `e2e/sandbox/screenshots/`.

This suite proves widget behaviour against the contract. It is **DEMO** evidence: it does not
prove any backend, CRM, scheduler or inventory integration.

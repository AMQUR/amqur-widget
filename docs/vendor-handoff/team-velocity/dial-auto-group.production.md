# Team Velocity — Dial Auto Group (production)

**Status: DO NOT PUBLISH until owner approves**

| Field | Value |
|-------|-------|
| Dealership name | Dial Auto Group |
| Tenant slug | `dial-auto-group` |
| Location slug | `main` |
| API URL | `https://api.dialusnow.com` |
| Widget URL | `https://widget.dialusnow.com` |
| Logo URL | `https://widget.dialusnow.com/assets/tenants/dial-auto-group/logo.14cd52b7b4aa.svg` |
| Primary color | `#E5042F` |
| Accent color | `#FFFFFF` |
| Release version (placeholder) | widget **0.2.0** |
| Runtime SHA | **Verify at install time** via `https://widget.dialusnow.com/version.json` (`commitSha`) — do not trust this document's SHA alone |

Group router tenant — employee test first. Welcome copy routes interest across Jeep, Nissan, Chevy, INFINITI, CDJR.

---

## Exact one-line script tag

```html
<script defer src="https://widget.dialusnow.com/embed.js" data-tenant="dial-auto-group" data-location="main" data-locale="en"></script>
```

Formatted (same attributes; equivalent):

```html
<script defer src="https://widget.dialusnow.com/embed.js"
  data-tenant="dial-auto-group"
  data-location="main"
  data-locale="en"></script>
```

---

## Exact-origin requirement

Widget tokens are **fail-closed** on `Origin`.

- Only the **exact** approved HTTPS origin(s) for this rooftop may be allowlisted.
- Scheme + hostname only (no path, query, fragment, or wildcards).
- Do **not** guess `www` vs apex. Verify the browser `Origin` on a real page load.
- Do **not** add staging origins, lookalike domains, or other dealership origins.
- Public traffic stays disabled until owner approval **and** origin activation is complete.

---

## CSP (no wildcards)

Request these directives on the host page (or GTM-injected page CSP, if applicable):

| Directive | Value |
|-----------|-------|
| `script-src` | `https://widget.dialusnow.com` |
| `connect-src` | `https://api.dialusnow.com` |
| `img-src` | `https://widget.dialusnow.com` (tenant logos under `/assets/tenants/…`) |

Do not use `*` for script or connect. Prefer not blocking Shadow DOM.

---

## GTM installation steps

**Status: DO NOT PUBLISH until owner approves**

1. Confirm exact website origin and GTM container ownership for this rooftop.
2. Create an **unpublished** workspace / Preview version (never publish first).
3. Add a Custom HTML tag with the exact one-line script tag above.
4. Trigger: All Pages (or agreed path filter) on the **approved hostname only**.
5. Preview → validate checklist below.
6. Publish **only** after owner written approval and AMQUR origin allowlist activation.

Do not dual-install with Apollo/Team Velocity Tracking Pixel canary loaders unless AMQUR explicitly switches paths.

---

## Direct-script installation steps

**Status: DO NOT PUBLISH until owner approves**

1. Place the one-line tag before `</body>` on the approved origin only.
2. Confirm CSP allows script + connect + logo img hosts above.
3. Hard-refresh; confirm a single launcher (no duplicates).
4. Complete preview + production validation checklists.
5. Remove the tag immediately if validation fails.

---

## Preview validation checklist

- [ ] `https://widget.dialusnow.com/version.json` returns version `0.2.0` (or agreed release) and record `commitSha`
- [ ] `https://widget.dialusnow.com/embed.js` loads (`200`, JavaScript content-type)
- [ ] Script tag uses exact `data-tenant="dial-auto-group"` and `data-location="main"`
- [ ] Single launcher appears; no duplicate widgets after SPA navigations
- [ ] Chat opens; welcome/disclaimer branding renders; logo loads from hashed URL
- [ ] Primary chrome color reads as Dial red `#E5042F`
- [ ] Missing / wrong `Origin` cannot mint a widget token (403)
- [ ] Inventory / payments / service / parts / appointments remain unavailable
- [ ] Lead capture asks only for contact info the user chooses to share
- [ ] Handoff language does not claim staff were notified unless verified delivery exists

---

## Production validation checklist

- [ ] Owner written approval recorded
- [ ] Exact origin allowlisted for `dial-auto-group` only (other tenants unchanged)
- [ ] GTM published **or** direct script live — not both conflicting paths
- [ ] Production smoke: open chat, send message, create test lead, confirm durable handoff record
- [ ] Kill-switch drill: remove tag / pause GTM → launcher gone within one hard refresh
- [ ] Support contact confirmed

---

## Privacy summary

The embed loads AMQUR's production widget from `widget.dialusnow.com` and talks to `api.dialusnow.com`. Conversation continuity uses browser `localStorage` (see below). Contact details are collected only when the visitor chooses to share them for dealership follow-up (lead capture). Capability flags keep inventory, payments, service AI, parts AI, appointments, voice, multilingual, and proactive engagement **off** for this production package.

---

## localStorage behavior

Inspected from `amqur-widget/src` (production widget bundle). Keys written by the production widget:

| Key pattern | Purpose |
|-------------|---------|
| `amqur_conversation_v1_{tenant}_{location}` | Opaque conversation UUID for continuity (`connect.ts`) |
| `amqur_saved_vins_v1_{tenant}_{location}` | Saved VIN list (`savedVehicles.ts`) — present in code; inventory UI remains disabled by feature flags |

No other production-widget `localStorage` keys are written by `src/`. Canary-only keys (`amqur_canary_kill`, `amqur_canary_bucket_v1`) apply only if a separate canary loader is installed — **not** part of this production embed tag.

---

## Cookie behavior

Production widget source (`src/`) does **not** call `document.cookie`.

- Short-lived widget JWTs are held in memory after `POST /api/public/widget-token` (`credentials: "include"`).
- Canary employee cookie `amqur_canary_emp` (HttpOnly) is used only by the separate canary auth path — **not** by this production `embed.js` tag.

---

## Data collected

When a visitor uses chat / lead capture (enabled):

- Chat messages and conversation identifiers
- Contact fields the visitor voluntarily provides (e.g. name, phone, and/or email)
- Store / rooftop preference when relevant (group routing)
- Standard request metadata required for origin-checked API access (`Origin`, tenant/location slugs)

Retention follows tenant `dataRetentionDays` policy (default 365 days) via platform retention jobs.

## Data not collected

- Payment card / bank account data
- Inventory browsing as a catalog product (inventory flag off)
- Service / parts booking data (flags off)
- Precise geolocation / device fingerprinting beyond conversation id storage
- Secrets, CRM credentials, or other dealerships' data

---

## Disabled capabilities

| Capability | Status |
|------------|--------|
| Chat | Enabled |
| Lead capture | Enabled |
| Handoff (durable save) | Enabled |
| Inventory | **Disabled** |
| Payments | **Disabled** |
| Service AI | **Disabled** |
| Parts AI | **Disabled** |
| Appointments | **Disabled** |
| Voice AI | **Disabled** |
| Multilingual | **Disabled** |
| Proactive engagement | **Disabled** |

---

## Removal instructions

1. Pause/delete the GTM tag **or** remove the direct `<script>` tag from the site.
2. Publish/deploy the host change.
3. Hard-refresh; confirm `#amqur-widget-host` / launcher is gone.
4. Optionally clear `localStorage` keys matching `amqur_conversation_v1_dial-auto-group_main` (and saved-VIN key if present).

## Emergency-disable instructions

1. **Site:** Pause GTM tag or remove script (fastest visitor-facing kill).
2. **API:** Clear / empty `allowedOrigins` for `dial-auto-group` so tokens fail closed (AMQUR ops only — does not alter branding).
3. **CDN:** If a bad widget build ships, pin/rollback CDN objects per AMQUR release process and re-check `version.json`.

## Rollback instructions

1. Revert GTM workspace to prior published version **or** restore previous site template without the tag.
2. Confirm `version.json` SHA matches the last known-good release before re-enabling.
3. Re-run production validation checklist before owner re-approval.

---

## Support contact placeholder

| Role | Contact |
|------|---------|
| AMQUR / Dial Us Now support | `SUPPORT_CONTACT_TBD` |
| Team Velocity / website vendor | `VENDOR_CONTACT_TBD` |
| Dealership owner approver | `OWNER_APPROVER_TBD` |

---

**DO NOT PUBLISH** this install to live customer traffic until the dealership owner explicitly approves and AMQUR confirms exact-origin activation.

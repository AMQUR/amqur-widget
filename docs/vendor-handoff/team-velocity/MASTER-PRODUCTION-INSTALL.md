# Team Velocity — MASTER production install (Dial Auto Group)

**Status: DO NOT PUBLISH until owner approves**

Parent brand: Dial Us Now / AMQUR  
Dealer group: Dial Auto Group  
API: `https://api.dialusnow.com`  
Widget: `https://widget.dialusnow.com`  
Release placeholder: widget **0.2.0** — verify runtime SHA at install via `https://widget.dialusnow.com/version.json`

This master package coordinates install order, kill switches, and origin activation across six tenants. Per-rooftop details live in the sibling `*.production.md` files.

---

## Tenants

| Order | Dealership | Tenant slug | Location | Package |
|------:|------------|-------------|----------|---------|
| 1 | Dial Auto Group | `dial-auto-group` | `main` | [dial-auto-group.production.md](./dial-auto-group.production.md) |
| 2 | Jeep of Chicago (pilot rooftop) | `jeep-of-chicago` | `main` | [jeep-of-chicago.production.md](./jeep-of-chicago.production.md) |
| 3 | Dial Nissan of Chicago | `dial-nissan-of-chicago` | `main` | [dial-nissan-of-chicago.production.md](./dial-nissan-of-chicago.production.md) |
| 4 | Dial Chevy of Chicago | `dial-chevy-of-chicago` | `main` | [dial-chevy-of-chicago.production.md](./dial-chevy-of-chicago.production.md) |
| 5 | INFINITI of Chicago | `infiniti-of-chicago` | `main` | [infiniti-of-chicago.production.md](./infiniti-of-chicago.production.md) |
| 6 | Dial CDJR of Chicago | `dial-cdjr-of-chicago` | `main` | [dial-cdjr-of-chicago.production.md](./dial-cdjr-of-chicago.production.md) |

---

## Install order

1. **Group first — employee / internal test**  
   Install `dial-auto-group` on an approved non-public or tightly gated surface (or Preview-only GTM). Validate branding, chat, lead capture, and fail-closed origin checks. No public traffic.
2. **One rooftop pilot**  
   Prefer **Jeep of Chicago** after exact origin verification + owner approval for that origin only.
3. **Remaining rooftops**  
   Activate Nissan → Chevy → INFINITI → CDJR **one at a time**, each after its own exact-origin verification and owner approval. Do not batch-allowlist unverified domains.

---

## Origin activation sequence

For each tenant, in order:

1. Verify the real browser `Origin` (https + exact hostname; no path/query/fragment; no wildcards; do not assume www ≡ apex).
2. Allowlist **only** that origin on that tenant (`allowedOrigins`). Leave other tenants unchanged.
3. Prove: approved origin → widget-token success; missing / unauthorized / lookalike / staging / other-dealer origins → **403**.
4. Confirm `configVersion` incremented and audit coverage exists for the change.
5. Only then proceed to Preview → limited publish for that rooftop.

Branding-only updates (logo/colors) must **not** add website origins. Use `backend/scripts/apply-production-branding.ts` for branding upserts.

---

## Kill switches

| Layer | Action |
|-------|--------|
| GTM / site | Pause or delete the Custom HTML / script tag (immediate visitor kill) |
| API origin | Empty `allowedOrigins` for the affected tenant (tokens fail closed) |
| CDN / release | Roll back widget CDN objects; re-verify `version.json` |
| Optional local | Canary-only: `localStorage.amqur_canary_kill=1` — **not** used by production `embed.js` |

---

## Shared CSP

- `script-src https://widget.dialusnow.com`
- `connect-src https://api.dialusnow.com`
- `img-src https://widget.dialusnow.com` (hashed logos)

No wildcard CSP rules.

---

## Shared privacy / storage (production embed)

See any rooftop package for full tables. Summary from widget source:

- **localStorage:** `amqur_conversation_v1_{tenant}_{location}`; optional `amqur_saved_vins_v1_{tenant}_{location}`
- **Cookies:** production widget JS does not set cookies; JWT in memory; canary HttpOnly cookie is a separate path
- **Enabled:** chat, lead capture, durable handoff  
- **Disabled:** inventory, payments, service AI, parts AI, appointments, voice, multilingual, proactive engagement

---

## Support contact placeholder

| Role | Contact |
|------|---------|
| AMQUR / Dial Us Now support | `SUPPORT_CONTACT_TBD` |
| Team Velocity / website vendor | `VENDOR_CONTACT_TBD` |
| Dealership owner approver | `OWNER_APPROVER_TBD` |

---

**DO NOT PUBLISH** any rooftop to live customer traffic until the owner approves that install and AMQUR confirms exact-origin activation for that tenant.

# Website embed install kit

**Status (2026-11-18): NOT READY TO INSTALL.** The snippets are prepared; none
can work yet. See "What blocks each site" below. Preparing a snippet, pasting
it into a CMS, and enabling live customer actions are three separate events.

## The embed

One tag per page, immediately before `</body>`:

```html
<script defer src="https://widget.dialusnow.com/embed.js" data-tenant="TENANT_SLUG" data-location="main" data-locale="en"></script>
```

Per-site files, generated from [`install-targets.json`](./install-targets.json)
by `npm run build:snippets` (CI fails if they drift):
[`website-snippets/`](./website-snippets/).

| Site | Origin to allowlist | Tenant | CMS | Production snippet |
|---|---|---|---|---|
| Dial Chevy of Chicago | `https://www.dialchevy.com` | `dial-chevy-of-chicago` | DealerOn (verified) | [dial-chevy.production.html](./website-snippets/dial-chevy.production.html) |
| Dial Nissan of Chicago | `https://www.dialnissan.com` | `dial-nissan-of-chicago` | Team Velocity (unverified) | [dial-nissan.production.html](./website-snippets/dial-nissan.production.html) |
| INFINITI of Chicago | `https://www.infinitichicago.com` | `infiniti-of-chicago` | Team Velocity (unverified) | [infiniti-of-chicago.production.html](./website-snippets/infiniti-of-chicago.production.html) |
| Dial CDJR of Chicago South | `https://www.dialjeep.com` | `dial-cdjr-of-chicago` | Team Velocity (unverified) | [dial-cdjr-south.production.html](./website-snippets/dial-cdjr-south.production.html) |
| Jeep of Chicago (North) | `https://www.jeepofchicago.com` | `jeep-of-chicago` | Team Velocity (verified) | [jeep-of-chicago-north.production.html](./website-snippets/jeep-of-chicago-north.production.html) |
| Dial Auto Group (group site) | `https://www.dialautogroup.com` | `dial-auto-group` | unverified | [dial-auto-group.production.html](./website-snippets/dial-auto-group.production.html) |

Each `*.staging.html` twin loads `staging-widget` / `staging-api` and is for
employee testing only.

## What is verified today (production, 2026-11-18)

- `https://widget.dialusnow.com/embed.js` → 200, `application/javascript`,
  `Cache-Control: public, max-age=300`, `Access-Control-Allow-Origin: *`.
- `https://widget.dialusnow.com/version.json` → commit `2b3a4b4` (= `main`).
- `GET /api/public/widget-config` → 200 for all six tenants.
- `POST /api/public/widget-token` → **403 for every origin on every tenant**
  ("Widget origins not configured"). Fail-closed is working; nothing is allowed.

## What blocks each site

1. **No origin is allowlisted on any production tenant.** Owner must approve
   each exact origin; it is then added to that tenant's `allowedOrigins`.
2. **API CORS.** Production `CORS_ORIGINS` was provisioned with the widget host
   only. Each approved website origin must also be in `CORS_ORIGINS` or the
   browser blocks `/api/*` calls. The two lists are maintained separately.
3. **`www` vs apex not browser-verified** for four sites (they answer automated
   requests with 403). Confirm the address-bar origin on a real page load.
4. **Group site has no store selector.** `dial-auto-group` is one tenant with
   one location; the assistant can only ask which dealership the visitor wants.
   It cannot search a rooftop's inventory from the group site.
5. **Staging has no `dial-auto-group` tenant**, so the group snippet has had no
   staging run.
6. **Staging does not run `main`.** Staging API reports `8405645` and staging
   widget `7e98c7c`, both from unmerged branches. The staging `embed.js` now
   served there points at the *production* API. This PR adds a real staging
   loader; it takes effect only after the Deploy workflow works again.

## Integrity, pinning, caching

- `embed.js` is a small mutable loader (5-minute cache) so fixes reach every
  site without a CMS edit. **Do not add an `integrity` attribute to it** — the
  next release would break the tag.
- `embed-manifest.json` publishes the SHA-384 of the current `embed.js` and
  bundle plus the commit, for audit and monitoring.
- Hash-named bundle URLs currently return the *current* bytes, so they are not
  a true pin. Immutable per-release URLs are not built yet.
- Known gap: script responses on production lack `X-Content-Type-Options`
  (open widget PR #23 addresses it).

## Host page requirements

If the site sends a Content-Security-Policy:

```
script-src  https://widget.dialusnow.com
connect-src https://api.dialusnow.com
img-src     https://widget.dialusnow.com   (plus the inventory photo hosts)
```

The widget renders in a Shadow DOM, loads with `defer`, and never blocks the
page: if the CDN or API is down the page is unaffected and the launcher simply
does not appear. No secret or token is ever placed in the HTML.

## Avoid duplicates

Paste the tag once, in one place (site-wide footer **or** tag manager, never
both). A second tag is ignored by the loader, but remove it anyway.

## Uninstall / rollback

| Speed | Action |
|---|---|
| Immediate, one site | Delete or pause the tag in the CMS / tag manager |
| Immediate, no CMS access | Empty that tenant's `allowedOrigins` (tokens fail closed) |
| All sites | Redeploy the previous `prod-widget` release in Railway, then check `version.json` |

In the page console, `AMQUR_EMBED.destroy()` unmounts the widget for testing.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing appears; console `[AMQUR] embed failed {code:"invalid_tenant"}` | Typo in `data-tenant` |
| Nothing appears; network shows `widget-token` 403 | Page origin not allowlisted for that tenant (check www vs apex) |
| `widget-token` blocked "by CORS policy" | Origin missing from API `CORS_ORIGINS` |
| Script blocked | Site CSP lacks the entries above |

CMS-specific steps: [CMS_INSTALL_RUNBOOKS.md](./CMS_INSTALL_RUNBOOKS.md).

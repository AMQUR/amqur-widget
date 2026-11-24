# Isolated staging widget build

Use `Dockerfile.isolated-staging` for the isolated Railway staging host. That file hard-codes `AMQUR_WIDGET_BUILD_PROFILE=isolated-staging` and builds its HTML shell from `staging/public/index.isolated.html` (the private owner preview page, see below) so Railway cannot silently fall back to the shared `staging-api.dialusnow.com` profile. Keep `Dockerfile.staging` for the canonical shared staging release candidate. Confirm the build log names `Dockerfile.isolated-staging` (override `railway.toml` `dockerfilePath` for the widget-staging service). Set release identity from the reviewed widget commit and compare `/version.json` and `/embed-manifest.json` with that commit after deployment.

The isolated profile pins the loader, the private owner page and invite redemption to the existing `amqur-platform-staging/staging` hosts.

- Widget origin `https://widget-staging-staging.up.railway.app`
- API origin `https://backend-staging-staging-b699.up.railway.app`
- Manifest environment `isolated-staging`

The group-site preview needs those exact `NEXT_PUBLIC_AMQUR_WIDGET_ORIGIN` and `NEXT_PUBLIC_AMQUR_API_ORIGIN` values, `NEXT_PUBLIC_CHAT_SURFACE=amqur` and `NEXT_PUBLIC_AMQUR_TENANT=dial-auto-group`. Match its CSP and `data-expect-api-origin` to the build. Check the published manifest with the group site's `scripts/verify-amqur-embed.mjs`, using `isolated-staging` as its third argument. The isolated image omits the legacy configurable canary loader. Validate the protected embed and the invite cookie flow in Chromium, Firefox and WebKit because cross-site cookie policies can differ between engines.

## Railway inspection

Read-only inspection on 2026-11-19 identified project `e4d54510-bbc0-45bc-9d5b-a19a5ad5132c`, environment `b58a4e5f-e8ad-4620-bc41-4874887c788e`. The existing widget root and API health endpoint each returned unauthenticated HTTP 200. No worker or group-site preview was present in this environment's service inventory. The API's direct variable names did not include `DEPLOYMENT_TIER` or `CANARY_EMPLOYEE_SECRET`. Confirm effective settings and validate anonymous access before proceeding. The latest successful widget and API deployments are marked rollback-capable.

| Service | Railway service ID | Latest successful deployment |
|---|---|---|
| Backend | `a7adf0dd-01ea-4273-a616-cc95f3a63673` | `0fd81711-7f7b-4c0f-b11d-bced0ea202c0` |
| Widget | `a645c67c-b2a9-45cd-88d6-b5c8a87ccb18` | `c27d0db9-5af1-4016-ae0c-ee67a97e4c7c` |

The handoff ledger records the isolated database backup `amqur-platform-staging_staging_20261119T171122Z.dump` and six applied migrations at its previous inspection. The production release requires its own evidence. Revalidate backup restoration and migrations against the final staging SHA.

## Deployment gates

1. Coordinate the isolated target with the release owner. Record final code SHAs, CI, service and rollback IDs. Confirm the isolated project has dedicated API, worker, widget, Postgres and Redis, plus a protected group-site preview. Keep the canonical staging release candidate in place.
2. Establish employee access control for all hosted entry points, including Railway-generated domains. Verify unauthorized requests cannot mint tokens, submit chat or leads, or reach operator data. The backend's built-in canary check is conditional on `CANARY_EMPLOYEE_ENABLED` and origin coverage in `CANARY_STRICT_ORIGINS`. Explicitly cover every permitted browser origin, including the group-site preview and widget demo host, if relying on that check for token minting. An exact CORS allowlist and a `noindex` header serve different purposes from authentication.
3. Verify private Postgres and Redis references for API and worker, and resolve the existing public Postgres TCP proxy. Verify the migration checksums and restore a fresh backup to a disposable database before migrating. Use a reviewed synthetic fixture seed for this environment. The local demo seed refuses a non-loopback database host.
4. Confirm `DEPLOYMENT_TIER=staging`, exact browser origins, separate credentials and worker process roles. Keep live customer messaging, CRM, ADF delivery and scheduler integrations disabled. Validate worker flows with reviewed synthetic fixtures and an isolated sink, and verify denied live egress before exercise.
5. Validate the hosted widget, API, worker, group preview and operator console together. Capture full browser network traces with synthetic data and confirm the widget calls the pinned API, unauthorized traffic is denied, and no traffic reaches canonical staging or live providers. Exercise application rollback and confirm schema compatibility separately.

## Private owner preview page (both hosted profiles)

The HTML shell of the hosted images is a private preview page for the dealership owner, not an engineering page. Source: `staging/public/index.isolated.html` (template), `owner-page.css`, `owner-page.js`. `scripts/build-embed-loader.mjs` stamps the template per profile and refuses to write a page with leftover placeholders, inline script or style, a visible URL or hostname, or more than one status strip.

| | `isolated-staging` | `production-private` |
|---|---|---|
| Dockerfile | `Dockerfile.isolated-staging` | `Dockerfile.production-private` |
| Hosts | pinned in the build script | required build args `AMQUR_API_HOST`, `AMQUR_WIDGET_HOST` (https; not a staging host; not `*.dialusnow.com`) |
| Status strip | demonstration data, clearly labeled | live inventory, CRM and scheduling connections not switched on yet |
| Stores | five rooftops + Dial Auto Group | five rooftops |
| `/canary-redeem.html` | shipped (behind Basic Auth) | not shipped (404); build fails if present |
| Markers on `<html>` | `data-amqur-profile="isolated-staging"`, `data-amqur-isolated-build="<sha7>"` | `data-amqur-profile="production-private"`, `data-amqur-isolated-build="<sha7>"` |

Runtime (both): `EMPLOYEE_BASIC_AUTH_USER` and `EMPLOYEE_BASIC_AUTH_PASSWORD` protect `/`, `/index.html`, `/owner-page.css`, `/owner-page.js` (and `/canary-redeem.html` on staging). When either is unset the entrypoint writes a locked htpasswd and every HTML request is 401. `/healthz`, the widget bundle, `embed.js`, the manifest, `version.json` and fonts stay public. The entrypoint reads the API origin from `embed-manifest.json` and refuses to start without a valid one; the shell is served with `Content-Security-Policy` (`script-src 'self'`, `connect-src` limited to that API origin, `frame-ancestors 'none'`) and `Permissions-Policy`.

The page boots the widget inline for the selected store with `AMQUR.destroy()` / `AMQUR.init({ display: 'inline', container })`, default Dial Chevy of Chicago, and sends example prompts with `AMQUR.send()`. It makes no invite, eligibility or other API call of its own.

**Token gate.** The page needs an ordinary `POST /api/public/widget-token` to succeed from the widget host's origin. That requires (backend, not this repo): the widget origin in `CORS_ORIGINS` and in each store tenant's `allowedOrigins`, and the widget origin **not** listed in `CANARY_STRICT_ORIGINS` while `CANARY_EMPLOYEE_ENABLED=true`. With the strict employee canary on for the widget origin, the token request is refused (`403 Employee canary required`) and the page shows its "Couldn't connect" state; the invite cookie is per store and expires, so it is not a workable path for an owner.

Local check of a built image (page, headers, states, keyboard, axe, CSP) — see `playwright.owner.config.ts`. Screenshots: `e2e/owner-page/screenshots/`.

# Isolated staging widget build

Use `Dockerfile.staging` with the build argument `AMQUR_WIDGET_BUILD_PROFILE=isolated-staging`. The default profile retains the canonical staging build. Confirm the build log names `Dockerfile.staging` because the root `railway.toml` selects the production `Dockerfile`. Set release identity from the reviewed widget commit and compare `/version.json` and `/embed-manifest.json` with that commit after deployment.

The isolated profile pins the loader, internal canary page and invite redemption to the existing `amqur-platform-staging/staging` hosts.

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

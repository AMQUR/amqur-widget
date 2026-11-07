# Staging widget host

## URLs
- Host page: https://staging-widget.dialusnow.com
- API: https://staging-api.dialusnow.com/api
- Pilot tenant: `jeep-of-chicago` / location: `main` (do not invent `jeep-of-chicago-north`)

## Deploy
Staging ships the labeled employee canary host via `Dockerfile.staging`.
**Verified 2026-11-07:** Railway's GitHub-connected staging service follows the repository's `railway.toml` directly. Changing the repo default to the production `Dockerfile` caused the staging host to lose its employee-only banner. The repository therefore defaults to **`Dockerfile.staging`**. The GitHub Actions production Deploy workflow explicitly switches to `Dockerfile`; a direct GitHub-connected production service must **not** use this shared config. Production remains on the prior SHA while this staging rollback is checked. Keep staging employee-only and verify the banner after every source push.

```bash
# Prefer GitHub Actions Deploy → staging, or Railway staging-only pin of the RC SHA.
./scripts/deploy-staging.sh
```

## Browser tests
```bash
export STAGING_WIDGET_URL=https://staging-widget.dialusnow.com
# Must include the /api suffix — canary paths are ${STAGING_API_URL}/public/...
export STAGING_API_URL=https://staging-api.dialusnow.com/api
npm run test:staging
```

## Notes
- Banner must remain `STAGING — NOT FOR CUSTOMERS`
- IIFE Vite lib `name` must stay `AmqurWidgetBundle` (not `AMQUR`) so `window.AMQUR.init` is not overwritten
- Do not point dealership production domains here
- `.amq-vcard__media` must keep `position: relative` so SVG/skeleton media cannot escape the card

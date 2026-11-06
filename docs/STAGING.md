# Staging widget host

## URLs
- Host page: https://staging-widget.dialusnow.com
- API: https://staging-api.dialusnow.com/api
- Pilot tenant: `jeep-of-chicago` / location: `main` (do not invent `jeep-of-chicago-north`)

## Deploy
Staging ships the labeled employee canary host via `Dockerfile.staging`.
`railway.toml` on this branch points at `Dockerfile.staging` for GitHub-connected
staging pins. The production Deploy job forces `Dockerfile` before `railway up`
so canary HTML cannot reach `prod-widget`.

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

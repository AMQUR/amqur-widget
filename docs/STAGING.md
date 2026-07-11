# Staging widget host

## URLs
- Host page: https://widget-staging-staging.up.railway.app
- API: https://backend-staging-staging-b699.up.railway.app/api
- Tenant: `dial-auto-group-staging` / location: `pilot-rooftop`

## Deploy
```bash
./scripts/deploy-staging.sh
```

Requires Railway CLI authenticated and linked to project `amqur-platform-staging` environment `staging`.

## Browser tests
```bash
export STAGING_WIDGET_URL=https://widget-staging-staging.up.railway.app
export STAGING_API_URL=https://backend-staging-staging-b699.up.railway.app/api
npm run test:staging
```

## Notes
- Banner must remain `STAGING — NOT FOR CUSTOMERS`
- IIFE Vite lib `name` must stay `AmqurWidgetBundle` (not `AMQUR`) so `window.AMQUR.init` is not overwritten
- Do not point Dial Auto Group production domains here

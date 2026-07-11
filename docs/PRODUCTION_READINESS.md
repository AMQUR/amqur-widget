# Widget production readiness

## Status
Embeddable Shadow DOM widget on `audit/production-readiness` aligned with backend chat/bootstrap contract.

## This pass
- Feature flags gate inventory carousels and payment cards
- `destroy()` resets connection runtime; public API exposes `version` / `isReady`
- Offline banner + retry last failed message
- Contract fixture tests + CI `npm test`
- Removed dead `useChat` / `chatAdapter` / unused chat types
- Dev bootstrap uses placeholder tenant/location slugs
- Docs: `docs/DEPLOYMENT.md`, `docs/API_CONTRACT.md`

## Verify
```bash
npm ci
npm run lint
npm test
npm run build
```

## Rollback
Point embed script `src` to previous versioned IIFE (see `docs/DEPLOYMENT.md`).

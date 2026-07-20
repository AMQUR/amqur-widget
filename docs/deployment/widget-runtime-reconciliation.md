# Widget runtime reconciliation (production vs main)

**Status:** production runtime and `widget` `main` do **not** match. Do not treat them as equivalent.

| Surface | Commit | Notes |
| --- | --- | --- |
| Production widget CDN runtime | `42225d8` | Currently live on `widget.dialusnow.com` |
| Widget repo `main` | `0221ff5` | Approved tip as of this note; includes staging Dockerfile fix |

## Required action before live install

Production **must** be redeployed from approved `main` at **`0221ff5` or later** — specifically a build that includes:

- One-line production embed loader (`/embed.js`)
- Embed manifest (`/embed-manifest.json`)
- Tenant logo / asset packaging under `/assets/tenants/`
- Hardened nginx routes for embed + tenant assets

Until that redeploy completes:

- Do **not** claim production SHA equals `main`
- Do **not** point customer pages at `/embed.js` expecting the new loader to be live
- Prefer holding live install until the CDN serves the post-`0221ff5` artifact set

## Verify after redeploy

```bash
curl -sS https://widget.dialusnow.com/version.json
curl -sS https://widget.dialusnow.com/embed-manifest.json
curl -sSI https://widget.dialusnow.com/embed.js | head -n 20
```

Confirm `commitSha` on `/version.json` (and `/embed-manifest.json`) is `0221ff5` or a later approved commit that includes embed + tenant assets.

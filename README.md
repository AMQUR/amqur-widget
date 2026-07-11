# AMQUR Widget

Embeddable dealership chat assistant (React + Vite + Shadow DOM).

## Install on a dealership site

```html
<script src="https://YOUR_CDN/amqur-widget.iife.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    window.AMQUR.init({
      apiBaseUrl: 'https://YOUR_API_HOST', // /api is appended automatically
      tenantSlug: 'demo-motors',
      locationSlug: 'main',
    });
  });
</script>
```

Lifecycle:

```js
await window.AMQUR.init({ ... });
window.AMQUR.destroy(); // unmount + cleanup
```

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Build IIFE bundle:

```bash
npm run build
# → dist/amqur-widget.iife.js
```

## Backend contract

| Step | Endpoint | Auth |
|------|----------|------|
| Bootstrap | `GET /api/public/widget-config?tenantSlug=&locationSlug=` | none |
| Token | `POST /api/public/widget-token` `{ tenantSlug, locationSlug }` | none |
| Chat | `POST /api/chat` `{ message, conversationId?, action?, vin? }` | Bearer widget JWT |

Handled response types: text `reply`, `vehicle_carousel`, `vehicle_compare`, `vehicle_detail`, `payment_summary`.

Conversation identity is stored in `localStorage` per tenant+location and sent as `conversationId`.

## Features

- Shadow DOM style isolation
- Tenant branding (`primaryColor`, `accentColor`, logo)
- Feature flag `features.chat` (inventory/payments cards still gated by backend replies)
- JWT refresh on 401
- Escape closes panel; dialog semantics + aria-live message log
- Online/offline indicator
- Structured vehicle actions (`action` + `vin`) for details / payment / hold

## Security notes

- No API secrets in the widget; only short-lived widget JWTs in memory
- Host page can still pierce open Shadow DOM — expected for embeds
- Validate `apiBaseUrl` is your API origin; set backend `CORS_ORIGINS` in production

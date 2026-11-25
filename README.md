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

Host-page commands (all return `false` when no widget is mounted):

```js
window.AMQUR.isReady();        // true once init() has mounted the widget
window.AMQUR.open();           // open the floating chat
window.AMQUR.close();          // close it
window.AMQUR.send('Compare the Tahoe and Suburban');
// Opens the chat and sends the text as if the visitor had typed it (same 2,000-character cap as
// the composer). If a reply is still streaming, the text is placed in the composer instead.
```

Inline display — the chat fills an element of the host page instead of floating over it (always
open, no launcher or close button, no page scroll lock, a labelled region rather than a modal):

```js
window.AMQUR.init({
  apiBaseUrl, tenantSlug, locationSlug,
  display: 'inline',                 // default: 'floating'
  container: document.getElementById('assistant'), // element or CSS selector; give it a height
});
```

`display: 'inline'` without a usable `container` falls back to the floating widget.

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

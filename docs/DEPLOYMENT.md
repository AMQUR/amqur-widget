# Widget deployment

## Build
```bash
npm ci
npm run lint
npm test
npm run build
# Artifact: dist/amqur-widget.iife.js
```

## CDN publish
1. Upload `dist/amqur-widget.iife.js` to versioned path, e.g. `/widget/0.1.0/amqur-widget.iife.js`
2. Also publish `/widget/latest/amqur-widget.iife.js` only after smoke testing
3. Recommended headers: `Cache-Control: public, max-age=31536000, immutable` for versioned URLs; short TTL for `latest`

## Embed
```html
<script src="https://YOUR_CDN/widget/0.1.0/amqur-widget.iife.js"></script>
<script>
  window.AMQUR.init({
    apiBaseUrl: "https://YOUR_API_HOST/api",
    tenantSlug: "YOUR_TENANT",
    locationSlug: "YOUR_LOCATION",
  });
</script>
```

## Rollback
1. Point embed `src` back to previous versioned IIFE
2. Or restore previous object on CDN `latest`
3. Hard-refresh dealership page / bypass CDN cache

## Backend order
Deploy compatible backend (`audit/production-readiness`) **before** widget if API contract changed.

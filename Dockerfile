# syntax=docker/dockerfile:1
# Production widget static host — serves assistant-widget.iife.js, embed.js, tenant assets.
# Must NOT ship staging pilot HTML or staging tenant init.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG APP_COMMIT_SHA=unknown
ARG APP_BUILD_TIME=unknown
ARG APP_RELEASE_ID=unknown
ARG APP_RELEASE_VERSION=0.2.0
RUN npm run build \
  && cp dist/assistant-widget.iife.js cdn/public/assistant-widget.iife.js \
  && npm run build:embed \
  && mkdir -p /out \
  && cp -R cdn/public/. /out/ \
  && printf '%s\n' \
    '{' \
    '  "name": "amqur-widget",' \
    "  \"version\": \"${APP_RELEASE_VERSION}\"," \
    "  \"commitSha\": \"${APP_COMMIT_SHA}\"," \
    "  \"buildTime\": \"${APP_BUILD_TIME}\"," \
    "  \"releaseId\": \"${APP_RELEASE_ID}\"" \
    '}' > /out/version.json

FROM nginx:alpine
# Keep template OUT of /etc/nginx/templates so the stock nginx entrypoint
# does not envsubst $uri / regex anchors and corrupt the config.
COPY cdn/nginx.conf.template /etc/nginx/amqur/default.conf.template
COPY cdn/docker-entrypoint.sh /docker-entrypoint-amqur.sh
COPY --from=build /out/ /usr/share/nginx/html/
RUN chmod +x /docker-entrypoint-amqur.sh \
  && rm -f /etc/nginx/conf.d/default.conf \
  && rm -rf /etc/nginx/templates \
  && test -f /usr/share/nginx/html/assistant-widget.iife.js \
  && test -f /usr/share/nginx/html/embed.js \
  && test -f /usr/share/nginx/html/embed-manifest.json \
  && test -f /usr/share/nginx/html/version.json \
  && test -d /usr/share/nginx/html/assets/tenants \
  && ! grep -q 'STAGING — NOT FOR CUSTOMERS' /usr/share/nginx/html/index.html \
  && ! grep -qi 'dial-auto-group-staging' /usr/share/nginx/html/index.html \
  && ! grep -qi 'staging-widget\|staging-api\|localhost' /usr/share/nginx/html/embed.js
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-amqur.sh"]

# syntax=docker/dockerfile:1
# Production widget static host — serves assistant-widget.iife.js
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
  && mkdir -p /out \
  && cp dist/assistant-widget.iife.js /out/assistant-widget.iife.js \
  && cp cdn/public/index.html /out/index.html \
  && printf '%s\n' \
    '{' \
    '  "name": "amqur-widget",' \
    "  \"version\": \"${APP_RELEASE_VERSION}\"," \
    "  \"commitSha\": \"${APP_COMMIT_SHA}\"," \
    "  \"buildTime\": \"${APP_BUILD_TIME}\"," \
    "  \"releaseId\": \"${APP_RELEASE_ID}\"" \
    '}' > /out/version.json

FROM nginx:alpine
COPY cdn/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY cdn/docker-entrypoint.sh /docker-entrypoint-amqur.sh
COPY --from=build /out/ /usr/share/nginx/html/
RUN chmod +x /docker-entrypoint-amqur.sh \
  && rm -f /etc/nginx/conf.d/default.conf \
  && test -f /usr/share/nginx/html/assistant-widget.iife.js \
  && test -f /usr/share/nginx/html/version.json \
  && ! grep -q 'STAGING — NOT FOR CUSTOMERS' /usr/share/nginx/html/index.html \
  && ! grep -qi 'dial-auto-group-staging' /usr/share/nginx/html/index.html
EXPOSE 80
CMD ["/docker-entrypoint-amqur.sh"]

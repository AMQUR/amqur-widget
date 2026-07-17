# syntax=docker/dockerfile:1
# Multi-stage widget static host — serves assistant-widget.iife.js

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && mkdir -p /out \
  && cp dist/assistant-widget.iife.js /out/assistant-widget.iife.js \
  && cp staging/public/amqur-canary-loader.js /out/amqur-canary-loader.js 2>/dev/null || true \
  && cp staging/public/canary-redeem.html /out/canary-redeem.html 2>/dev/null || true \
  && cp staging/public/index.html /out/index.html 2>/dev/null || true \
  && cp version.json /out/version.json 2>/dev/null || true

FROM nginx:alpine
COPY staging/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY staging/docker-entrypoint.sh /docker-entrypoint-amqur.sh
COPY --from=build /out/ /usr/share/nginx/html/
RUN chmod +x /docker-entrypoint-amqur.sh \
  && rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["/docker-entrypoint-amqur.sh"]

#!/bin/sh
set -e
PORT="${PORT:-80}"
TEMPLATE="${NGINX_TEMPLATE_PATH:-/etc/nginx/amqur/default.conf.template}"
sed "s/LISTEN_PORT/${PORT}/g" "$TEMPLATE" > /etc/nginx/conf.d/default.conf
nginx -t

# Release provenance: prefer APP_* variables set by the deploy pipeline;
# keep any build-time stamped version.json as fallback.
if [ -n "${APP_COMMIT_SHA:-}" ]; then
  cat > /usr/share/nginx/html/version.json <<EOF
{
  "name": "amqur-widget",
  "version": "${APP_RELEASE_VERSION:-unknown}",
  "commitSha": "${APP_COMMIT_SHA}",
  "buildTime": "${APP_BUILD_TIME:-unknown}",
  "releaseId": "${APP_RELEASE_ID:-unknown}"
}
EOF
fi

exec nginx -g 'daemon off;'

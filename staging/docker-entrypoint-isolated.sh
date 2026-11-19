#!/bin/sh
set -e
PORT="${PORT:-80}"
sed "s/LISTEN_PORT/${PORT}/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Employee basic-auth for HTML shell only (/healthz + embed assets stay public).
HTPASSWD="/etc/nginx/amqur-employee.htpasswd"
USER="${EMPLOYEE_BASIC_AUTH_USER:-}"
PASS="${EMPLOYEE_BASIC_AUTH_PASSWORD:-}"
if [ -n "$USER" ] && [ -n "$PASS" ]; then
  HASH="$(openssl passwd -apr1 "$PASS")"
  printf '%s:%s\n' "$USER" "$HASH" > "$HTPASSWD"
else
  # Fail closed when credentials are not configured.
  printf 'locked:$apr1$locked$8x8x8x8x8x8x8x8x8x8x8/\n' > "$HTPASSWD"
fi
chmod 644 "$HTPASSWD"

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

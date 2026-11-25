#!/bin/sh
set -e
PORT="${PORT:-80}"

# The build pins this image to one API origin (embed-manifest.json). The HTML shell's
# Content-Security-Policy allows connections to that origin only. Fail closed if it cannot be
# read or is not a plain https origin: never start with an open or malformed policy.
MANIFEST="/usr/share/nginx/html/embed-manifest.json"
API_ORIGIN="$(sed -n 's/^[[:space:]]*"apiHost":[[:space:]]*"\([^"]*\)".*$/\1/p' "$MANIFEST" | head -n 1)"
BUILD_ENV="$(sed -n 's/^[[:space:]]*"environment":[[:space:]]*"\([^"]*\)".*$/\1/p' "$MANIFEST" | head -n 1)"
if ! printf '%s' "$API_ORIGIN" | grep -Eq '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'; then
  echo "amqur entrypoint: embed-manifest.json has no valid https apiHost; refusing to start" >&2
  exit 1
fi
case "$BUILD_ENV" in
  isolated-staging) AUTH_REALM="AMQUR isolated staging — employees only" ;;
  production-private) AUTH_REALM="Dial Auto Group — private preview" ;;
  *)
    echo "amqur entrypoint: unexpected build environment '$BUILD_ENV'; refusing to start" >&2
    exit 1
    ;;
esac

sed -e "s/LISTEN_PORT/${PORT}/g" \
  -e "s|CSP_API_ORIGIN|${API_ORIGIN}|g" \
  -e "s|AUTH_REALM|${AUTH_REALM}|g" \
  /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

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

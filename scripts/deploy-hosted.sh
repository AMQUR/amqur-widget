#!/usr/bin/env bash
# Deploy a hosted owner-preview profile to Railway from a CLEAN export of HEAD, with the
# profile's own Railway config, then verify that the page is gated and pinned correctly.
#
#   scripts/deploy-hosted.sh isolated-staging   widget-staging    staging    https://<widget-host>
#   scripts/deploy-hosted.sh production-private widget-production production https://<widget-host>
#
# Why a script: the repo-root railway.toml builds the plain CDN image. Deploying a hosted
# service with it serves the preview page with no login gate and the wrong API host.
set -euo pipefail
PROFILE="${1:?profile: isolated-staging | production-private}"
SERVICE="${2:?railway service name}"
ENVIRONMENT="${3:?railway environment name}"
HOST="${4:?public https origin of the service}"
cd "$(dirname "$0")/.."
[ -f "deploy/railway.${PROFILE}.toml" ] || { echo "unknown profile ${PROFILE}" >&2; exit 2; }
if [ -n "$(git status --porcelain)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "ERROR: working tree is dirty. Commit first or set ALLOW_DIRTY=1." >&2; exit 1
fi
SHA="$(git rev-parse HEAD)"
PROJECT_ID="$(railway status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')"
TMP="$(mktemp -d)"
git archive HEAD | tar -x -C "$TMP"
cp "deploy/railway.${PROFILE}.toml" "$TMP/railway.toml"
railway variables --service "$SERVICE" --environment "$ENVIRONMENT" --skip-deploys \
  --set "APP_COMMIT_SHA=${SHA}" --set "APP_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null
( cd "$TMP" && railway link -p "$PROJECT_ID" -e "$ENVIRONMENT" -s "$SERVICE" >/dev/null && railway up --service "$SERVICE" --environment "$ENVIRONMENT" --ci | grep -E "load build definition|Deploy complete" | sort -u )
want="${PROFILE/isolated-staging/isolated-staging}"
for _ in $(seq 1 40); do
  got="$(curl -s -m 10 "${HOST}/embed-manifest.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).environment)}catch{console.log("")}})')"
  ver="$(curl -s -m 10 "${HOST}/version.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).commitSha)}catch{console.log("")}})')"
  [ "$got" = "$want" ] && [ "$ver" = "$SHA" ] && break
  sleep 6
done
root="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "${HOST}/")"
health="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "${HOST}/healthz")"
echo "profile=${got} commit=${ver} root=${root} healthz=${health}"
[ "$got" = "$want" ] && [ "$ver" = "$SHA" ] && [ "$root" = "401" ] && [ "$health" = "200" ] || {
  echo "FAILED: the page must report profile ${want} at ${SHA}, answer 401 without credentials and 200 on /healthz" >&2; exit 1; }
echo "OK"

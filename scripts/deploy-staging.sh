#!/usr/bin/env bash
# Deploy amqur-widget staging static host to Railway service widget.
#
# Stamps version.json (commit SHA, build time, release id) so the deployed
# host reports its identity at https://staging-widget.dialusnow.com/version.json.
# Refuses to deploy a dirty working tree unless ALLOW_DIRTY=1.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "ERROR: working tree is dirty. Commit first or set ALLOW_DIRTY=1." >&2
  exit 1
fi

node scripts/stamp-release.mjs

# Provenance travels as Railway service variables (railway up excludes
# gitignored files like version.json from the build context; the container
# entrypoint writes /version.json from these at startup).
COMMIT_SHA="$(git rev-parse HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RELEASE_ID="$(node -e 'console.log(require("crypto").randomUUID())')"
VERSION="$(node -e 'console.log(require("./package.json").version)')"
railway variables --service widget --environment staging \
  --set "APP_COMMIT_SHA=${COMMIT_SHA}" \
  --set "APP_BUILD_TIME=${BUILD_TIME}" \
  --set "APP_RELEASE_ID=${RELEASE_ID}" \
  --set "APP_RELEASE_VERSION=${VERSION}" \
  --skip-deploys >/dev/null

npm ci
npm run build
mkdir -p staging/public
cp staging/index.html staging/public/index.html
cp dist/assistant-widget.iife.js staging/public/assistant-widget.iife.js
# Legacy alias during migration
cp dist/assistant-widget.iife.js staging/public/amqur-widget.iife.js

# Refuse accidental overwrite of window.AMQUR
if head -c 80 staging/public/assistant-widget.iife.js | grep -q 'var AMQUR='; then
  echo "ERROR: IIFE still declares var AMQUR= (overwrites window.AMQUR). Fix vite.config name." >&2
  exit 1
fi

railway environment staging
railway service widget
railway up --service widget --detach
echo "Widget staging deploy requested"

echo "==> verifying deployed widget release"
EXPECTED_SHA="$(git rev-parse HEAD)"
for attempt in $(seq 1 30); do
  DEPLOYED="$(curl -sf --max-time 10 https://staging-widget.dialusnow.com/version.json | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try{console.log(JSON.parse(d).commitSha||'unknown')}catch{console.log('unparseable')}
    })" || echo unreachable)"
  if [ "${DEPLOYED}" = "${EXPECTED_SHA}" ]; then
    echo "OK: widget is serving ${EXPECTED_SHA}"
    exit 0
  fi
  echo "attempt ${attempt}: deployed=${DEPLOYED} expected=${EXPECTED_SHA} — waiting..."
  sleep 10
done
echo "FAIL: widget never reported commit ${EXPECTED_SHA}" >&2
exit 1

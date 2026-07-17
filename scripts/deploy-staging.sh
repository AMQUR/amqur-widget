#!/usr/bin/env bash
# Deploy amqur-widget staging static host to Railway service widget.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

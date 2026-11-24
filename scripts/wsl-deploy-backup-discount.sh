#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Installing function extension dependencies..."
cd extensions/gown-backup-discount
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run typegen

echo "==> Building gown-backup-discount WASM (Linux)..."
npm exec -- shopify app function build --verbose

if [[ ! -f dist/function.wasm ]]; then
  echo "ERROR: dist/function.wasm missing"
  exit 1
fi

cd "$ROOT"
echo "==> Deploying DrobeBook (theme + function)..."
npx shopify app deploy --config shopify.app.production.toml --allow-updates --message "Backup dress function + cart pricing"

echo "Done. In Shopify Admin: Discounts → Create → App → Backup dress hire discount → Activate"
# Shopify deploy helper (Windows). Prefers WSL for function WASM build.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Windows deploy: theme usually works; function WASM build may need GitHub Actions or a Linux machine."
Write-Host "Theme-only tip: temporarily move extensions\gown-backup-discount aside, then shopify app deploy."

Write-Host "==> Installing function extension dependencies..."
Set-Location "extensions\gown-backup-discount"
if (-not (Test-Path "node_modules")) {
  npm install
}
npm run typegen
Set-Location $root

Write-Host "==> Building gown-backup-discount WASM (first run can take several minutes)..."
npx shopify app function build --path extensions/gown-backup-discount --verbose

if (-not (Test-Path "extensions\gown-backup-discount\dist\function.wasm")) {
  Write-Error "function.wasm was not created. Try again, use WSL, or deploy from CI."
}

Write-Host "==> Deploying app..."
npx shopify app deploy --config shopify.app.production.toml --allow-updates --message $args[0]
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

$message = if ($args[0]) { $args[0] } else { "DrobeBook deploy" }
$functionOnly = $args -contains "-FunctionOnly"
$stashDir = Join-Path $root ".deploy-stash"

if ($functionOnly) {
  if (-not (Test-Path "extensions\gown-backup-discount\dist\function.wasm")) {
    Write-Error "Missing extensions\gown-backup-discount\dist\function.wasm. Download from GitHub Actions or run npm run build on Linux."
  }
  New-Item -ItemType Directory -Force -Path $stashDir | Out-Null
  Write-Host "==> Function-only deploy (theme stashed — use GitHub Actions for full deploy on Windows)."
  if (Test-Path "extensions\gk-drobe-booking") {
    Move-Item "extensions\gk-drobe-booking" (Join-Path $stashDir "gk-drobe-booking") -Force
  }
  try {
    npx shopify app deploy --config shopify.app.production.toml --allow-updates --allow-deletes --no-build --message $message
  } finally {
    $stashed = Join-Path $stashDir "gk-drobe-booking"
    if (Test-Path $stashed) {
      Move-Item $stashed "extensions\gk-drobe-booking" -Force
    }
  }
  exit $LASTEXITCODE
}

Write-Host "==> Deploying app (full)..."
npx shopify app deploy --config shopify.app.production.toml --allow-updates --message $message
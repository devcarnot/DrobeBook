# Shopify deploy helper (Windows). Prefers WSL for function WASM build.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$wsl = Get-Command wsl -ErrorAction SilentlyContinue
if ($wsl) {
  $linuxPath = ($root -replace "\\", "/") -replace "^C:", "/mnt/c"
  $message = if ($args.Count -gt 0) { $args[0] } else { "Backup dress deploy" }
  Write-Host "==> WSL detected — building & deploying via Linux..."
  & wsl bash -lc "cd '$linuxPath' && bash scripts/wsl-deploy-backup-discount.sh"
  exit $LASTEXITCODE
}

Write-Host "WSL not installed. Install: wsl --install (Admin PowerShell, then reboot)."
Write-Host "Falling back to Windows-only build (may hang on function WASM)..."

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
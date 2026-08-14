# Builds a portable Mini Cursor folder with Mini Cursor.exe (no installer).
# Output: frontend/release/win-unpacked/

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$BackendProj = Join-Path $Root 'backend\MiniCursor.Api.csproj'
$PublishDir = Join-Path $Root 'backend\publish'
$OutDir = Join-Path $Frontend 'release\win-unpacked'

if (-not (Test-Path (Join-Path $Frontend 'package.json'))) {
  throw "Could not find frontend at $Frontend. Run this script from the repo (scripts/build-exe.ps1)."
}

Write-Host '==> Publishing ASP.NET API (self-contained win-x64)...' -ForegroundColor Cyan
if (Test-Path $PublishDir) {
  Remove-Item -Recurse -Force $PublishDir
}

dotnet publish $BackendProj `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -o $PublishDir `
  -p:PublishSingleFile=false `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -v q

if ($LASTEXITCODE -ne 0) {
  throw "dotnet publish failed with exit code $LASTEXITCODE"
}

$apiExe = Join-Path $PublishDir 'MiniCursor.Api.exe'
if (-not (Test-Path $apiExe)) {
  throw "Expected API exe missing: $apiExe"
}

Write-Host '==> Ensuring frontend dependencies...' -ForegroundColor Cyan
Push-Location $Frontend
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  npm run ensure-electron
  if ($LASTEXITCODE -ne 0) { throw "ensure-electron failed with exit code $LASTEXITCODE" }

  Write-Host '==> Building renderer...' -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "frontend build failed with exit code $LASTEXITCODE" }

  Write-Host '==> Packaging Electron app (dir / no installer)...' -ForegroundColor Cyan
  npx electron-builder --win dir --x64
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

$exe = Join-Path $OutDir 'Mini Cursor.exe'
if (-not (Test-Path $exe)) {
  throw "Build finished but exe not found at $exe"
}

Write-Host ''
Write-Host "Done. Run: $exe" -ForegroundColor Green

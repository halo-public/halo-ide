# Shared pack pipeline: publish API, build renderer, run electron-builder.
# Called by build-exe.ps1 (portable folder) and build-installer.ps1 (NSIS).

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dir', 'nsis')]
  [string]$Target,

  [string]$Version,

  [switch]$Publish
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'version.ps1')

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$BackendProj = Join-Path $Root 'backend\MiniCursor.Api.csproj'
$PublishDir = Join-Path $Root 'backend\publish'

if (-not (Test-Path (Join-Path $Frontend 'package.json'))) {
  throw "Could not find frontend at $Frontend. Run this script from the repo."
}

if ($Publish -and $Target -ne 'nsis') {
  throw '-Publish is only supported when building the NSIS installer (-Target nsis).'
}

if ($Version) {
  Write-Host "==> Setting version $Version..." -ForegroundColor Cyan
  Set-MiniCursorVersion -Root $Root -Version $Version
}

$AppVersion = Get-MiniCursorVersion -FrontendDir $Frontend
Write-Host "==> Packaging Halo IDE $AppVersion ($Target)..." -ForegroundColor Cyan

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
  -p:Version=$AppVersion `
  -p:InformationalVersion=$AppVersion `
  -v q

if ($LASTEXITCODE -ne 0) {
  throw "dotnet publish failed with exit code $LASTEXITCODE"
}

$apiExe = Join-Path $PublishDir 'MiniCursor.Api.exe'
if (-not (Test-Path $apiExe)) {
  throw "Expected API exe missing: $apiExe"
}

if ($Publish) {
  if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    throw 'Publishing requires GH_TOKEN or GITHUB_TOKEN with permission to create GitHub Releases.'
  }
  if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) {
    $env:GH_TOKEN = $env:GITHUB_TOKEN
  }
}

$publishArg = $(if ($Publish) { 'always' } else { 'never' })

Write-Host '==> Ensuring frontend dependencies...' -ForegroundColor Cyan
Push-Location $Frontend
try {
  if ($env:CI -or $env:GITHUB_ACTIONS) {
    if (-not $env:CSC_IDENTITY_AUTO_DISCOVERY) {
      $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    }
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  }
  else {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
  }

  npm run ensure-electron
  if ($LASTEXITCODE -ne 0) { throw "ensure-electron failed with exit code $LASTEXITCODE" }

  Write-Host '==> Building renderer...' -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "frontend build failed with exit code $LASTEXITCODE" }

  Write-Host '==> Stopping running Halo IDE processes...' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'kill-running.ps1')

  # Pack outside the workspace so Cursor/VS Code file watchers cannot lock app.asar.
  $packOut = Join-Path $env:TEMP "halo-ide-pack-$AppVersion"
  if (Test-Path $packOut) {
    Remove-Item -Recurse -Force $packOut
  }

  Write-Host "==> Packaging Electron app ($Target)..." -ForegroundColor Cyan
  $packOutArg = $packOut.Replace('\', '/')
  npx electron-builder --win $Target --x64 --publish $publishArg --config.directories.output=$packOutArg
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

  $ReleaseDir = Join-Path $Frontend 'release'
  New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
  if ($Target -eq 'dir') {
    $src = Join-Path $packOut 'win-unpacked'
    if (-not (Test-Path $src)) { throw "Build finished but unpacked app not found at $src" }
    $dst = Join-Path $ReleaseDir 'win-unpacked'
    if (Test-Path $dst) {
      try {
        Remove-Item -LiteralPath $dst -Recurse -Force
      }
      catch {
        Write-Host "Could not replace $dst (file in use). Leaving unpacked build at $src" -ForegroundColor Yellow
        $ReleaseDir = $packOut
      }
    }
    if ($ReleaseDir -eq (Join-Path $Frontend 'release')) {
      Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    }
  }
  else {
    foreach ($name in @(
        "mini-cursor-setup-$AppVersion.exe",
        "mini-cursor-setup-$AppVersion.exe.blockmap",
        'latest.yml'
      )) {
      $from = Join-Path $packOut $name
      if (-not (Test-Path $from)) { throw "Build finished but missing $from" }
      Copy-Item -LiteralPath $from -Destination (Join-Path $ReleaseDir $name) -Force
    }
  }
}
finally {
  Pop-Location
}
if ($Target -eq 'dir') {
  $exe = Join-Path $ReleaseDir 'win-unpacked\Halo IDE.exe'
  if (-not (Test-Path $exe)) {
    throw "Build finished but exe not found at $exe"
  }
  Write-Host ''
  Write-Host "Done. Halo IDE $AppVersion (portable). Run: $exe" -ForegroundColor Green
}
else {
  $setup = Join-Path $ReleaseDir "mini-cursor-setup-$AppVersion.exe"
  if (-not (Test-Path $setup)) {
    $fallback = Get-ChildItem -Path $ReleaseDir -Filter '*-setup-*.exe' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($fallback) { $setup = $fallback.FullName }
  }
  if (-not (Test-Path $setup)) {
    throw "Build finished but installer not found in $ReleaseDir"
  }
  Write-Host ''
  Write-Host "Done. Halo IDE $AppVersion installer: $setup" -ForegroundColor Green
  if ($Publish) {
    Write-Host 'Published to GitHub Releases (auto-update feed: latest.yml).' -ForegroundColor Green
  }
  else {
    Write-Host 'Auto-update feed written locally as frontend/release/latest.yml (not published).' -ForegroundColor Yellow
  }
}

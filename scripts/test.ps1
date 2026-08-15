# Run backend and frontend tests (and frontend lint / typecheck).
#
# Usage:
#   .\scripts\test.ps1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
$TestProj = Join-Path $Root 'tests\MiniCursor.Api.Tests\MiniCursor.Api.Tests.csproj'

if (-not (Test-Path $TestProj)) {
  throw "Backend test project not found at $TestProj"
}

Write-Host '==> Backend tests...' -ForegroundColor Cyan
dotnet test $TestProj -c Release --nologo --verbosity minimal
if ($LASTEXITCODE -ne 0) { throw "dotnet test failed with exit code $LASTEXITCODE" }

if (-not (Test-Path (Join-Path $Frontend 'package.json'))) {
  throw "Could not find frontend at $Frontend"
}

Write-Host '==> Frontend checks...' -ForegroundColor Cyan
Push-Location $Frontend
try {
  if (-not (Test-Path 'node_modules')) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
  }

  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "frontend typecheck failed with exit code $LASTEXITCODE" }

  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "frontend lint failed with exit code $LASTEXITCODE" }

  npm test
  if ($LASTEXITCODE -ne 0) { throw "frontend tests failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'All tests passed.' -ForegroundColor Green

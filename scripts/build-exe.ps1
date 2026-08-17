# Builds a portable Halo IDE folder with Halo IDE.exe (no installer).
# Output: frontend/release/win-unpacked/
#
# Usage:
#   .\scripts\build-exe.ps1
#   .\scripts\build-exe.ps1 -Version 0.2.0

[CmdletBinding()]
param(
  [string]$Version
)

$ErrorActionPreference = 'Stop'

$packArgs = @{ Target = 'dir' }
if ($Version) { $packArgs.Version = $Version }

& (Join-Path $PSScriptRoot 'pack-app.ps1') @packArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

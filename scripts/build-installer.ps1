# Builds a Windows NSIS installer and auto-update metadata (latest.yml).
# Output: frontend/release/mini-cursor-setup-<version>.exe
#
# Usage:
#   .\scripts\build-installer.ps1
#   .\scripts\build-installer.ps1 -Version 0.2.0
#   .\scripts\build-installer.ps1 -Version 0.2.0 -Publish   # requires GH_TOKEN

[CmdletBinding()]
param(
  [string]$Version,
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'

$packArgs = @{ Target = 'nsis' }
if ($Version) { $packArgs.Version = $Version }
if ($Publish) { $packArgs.Publish = $true }

& (Join-Path $PSScriptRoot 'pack-app.ps1') @packArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

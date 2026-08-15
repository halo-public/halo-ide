# Stamp the app version in frontend/package.json and backend/MiniCursor.Api.csproj.
# Does not build or create a git tag.
#
# Usage:
#   .\scripts\set-version.ps1 0.2.0

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'version.ps1')

$Root = Split-Path -Parent $PSScriptRoot
Set-MiniCursorVersion -Root $Root -Version $Version

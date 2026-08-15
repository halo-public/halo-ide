# Bump the app version without building or tagging.
# Use this when the next release should be a major or minor, then run release.ps1.
#
# Usage:
#   .\scripts\bump.ps1 major
#   .\scripts\bump.ps1 minor
#   .\scripts\bump.ps1 patch

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('major', 'minor', 'patch')]
  [string]$Part
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'version.ps1')

$Root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $Root 'frontend'
$current = Get-MiniCursorVersion -FrontendDir $frontend
$next = Step-MiniCursorVersion -Root $Root -Part $Part

Write-Host ''
Write-Host "Bumped $Part version: $current -> $next" -ForegroundColor Green
Write-Host "Run .\scripts\release.ps1 to test, build, and publish $next (it will not bump again until v$next is tagged)." -ForegroundColor Yellow

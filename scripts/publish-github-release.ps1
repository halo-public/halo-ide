# Upload installer + auto-update feed to a GitHub Release.
# Tag v<version> is created if it does not already exist.
#
# Usage:
#   .\scripts\publish-github-release.ps1 -Version 0.2.0
#   .\scripts\publish-github-release.ps1 -Version 0.2.0 -VerifyTag
#   .\scripts\publish-github-release.ps1 -Version 0.2.0 -TargetSha <sha>
#   .\scripts\publish-github-release.ps1 -Version 0.2.0 -NotesFile .\notes.md

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$TargetSha,
  [string]$NotesFile,

  [switch]$VerifyTag
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Version must be semver, e.g. 0.1.0 or 0.2.0-beta.1"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) is required. See https://cli.github.com/'
}

function Get-ReleaseNoteArgs {
  if ($NotesFile) {
    if (-not (Test-Path $NotesFile)) {
      throw "Notes file not found: $NotesFile"
    }
    return @('--notes-file', (Resolve-Path $NotesFile).Path)
  }
  return @('--generate-notes')
}

$Root = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $Root 'frontend\release'
$tag = "v$Version"
$setup = Join-Path $ReleaseDir "mini-cursor-setup-$Version.exe"
$blockmap = "$setup.blockmap"
$yml = Join-Path $ReleaseDir 'latest.yml'

foreach ($file in @($setup, $blockmap, $yml)) {
  if (-not (Test-Path $file)) {
    throw "Missing release asset: $file. Build the installer first (scripts/build-installer.ps1)."
  }
}

$files = @($setup, $blockmap, $yml)
$prerelease = $Version -match '-'
$noteArgs = Get-ReleaseNoteArgs

$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gh release view $tag --json tagName 2>$null | Out-Null
$exists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previous

if ($exists) {
  Write-Host "==> Updating GitHub Release $tag..." -ForegroundColor Cyan
  gh release upload $tag @files --clobber
  if ($LASTEXITCODE -ne 0) { throw "gh release upload failed with exit code $LASTEXITCODE" }
  if ($NotesFile) {
    gh release edit $tag --title "Mini Cursor $Version" @noteArgs
    if ($LASTEXITCODE -ne 0) { throw "gh release edit failed with exit code $LASTEXITCODE" }
  }
}
else {
  Write-Host "==> Creating GitHub Release $tag..." -ForegroundColor Cyan
  $ghArgs = @(
    'release', 'create', $tag,
    '--title', "Mini Cursor $Version"
  )
  $ghArgs += $noteArgs
  if ($prerelease) { $ghArgs += '--prerelease' }
  if ($VerifyTag) { $ghArgs += '--verify-tag' }
  if ($TargetSha) { $ghArgs += '--target', $TargetSha }
  $ghArgs += $files

  gh @ghArgs
  if ($LASTEXITCODE -ne 0) { throw "gh release create failed with exit code $LASTEXITCODE" }
}

$url = gh release view $tag --json url --jq .url
Write-Host "Published $url" -ForegroundColor Green

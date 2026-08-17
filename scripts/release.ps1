# Cut a Halo IDE release: commit/push pending work, notes, tests, optional patch bump,
# installer, git tag, GitHub Release.
#
# Default bump is patch only when the current version is already tagged.
# After .\scripts\bump.ps1 major|minor, run this script to ship that version as-is.
#
# Usage:
#   .\scripts\release.ps1
#   .\scripts\release.ps1 -Bump patch
#   .\scripts\release.ps1 -DryRun
#   .\scripts\release.ps1 -SkipBuild          # tag + push; CI builds the installer
#   .\scripts\release.ps1 -NoPush
#   .\scripts\release.ps1 -AllowDirty         # skip auto-commit of pending work

[CmdletBinding()]
param(
  [ValidateSet('auto', 'none', 'patch', 'minor', 'major')]
  [string]$Bump = 'auto',

  [string]$Notes,

  [switch]$SkipTests,
  [switch]$SkipBuild,
  [switch]$NoPush,
  [switch]$AllowDirty,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'version.ps1')

$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root 'frontend'
Set-Location $Root

$current = Get-MiniCursorVersion -FrontendDir $Frontend
$lastTag = Get-MiniCursorLatestVersionTag
$tagged = Test-MiniCursorGitTagExists -Version $current

$part = $Bump
if ($part -eq 'auto') {
  $part = $(if ($tagged) { 'patch' } else { 'none' })
}

$version = if ($part -ne 'none') {
  Get-MiniCursorNextVersion -Version $current -Part $part
} else {
  $current
}

$pending = Get-MiniCursorGitDirty
if ($DryRun) {
  if ($pending.Count -gt 0) {
    Write-Host 'Would commit and push pending work first:' -ForegroundColor Yellow
    Write-Host ($pending -join "`n")
    Write-Host ''
  }
}

if (-not $DryRun -and (Test-MiniCursorGitTagExists -Version $version)) {
  throw "Git tag v$version already exists. Bump first (.\scripts\bump.ps1) or delete the tag."
}

if (-not $DryRun) {
  if ($AllowDirty) {
    Write-Host 'Skipping auto-commit of pending work (-AllowDirty).' -ForegroundColor Yellow
  }
  else {
    Save-MiniCursorPendingWork -Message "Save work before $version" -Push:(-not $NoPush) | Out-Null
  }
}

if ($Notes) {
  $releaseNotes = $Notes.Trim()
}
else {
  $releaseNotes = New-MiniCursorReleaseNotes -SinceTag $lastTag
}

Write-Host ''
Write-Host "Version:  $current -> $version" -ForegroundColor Cyan
Write-Host "Last tag: $(if ($lastTag) { $lastTag } else { '(none)' })"
Write-Host "Bump:     $part"
Write-Host ''
Write-Host "Release notes:" -ForegroundColor Cyan
Write-Host $releaseNotes
Write-Host ''

if ($DryRun) {
  Write-Host 'Dry run. No tests, build, commit, or tag.' -ForegroundColor Yellow
  return
}

if (-not $SkipTests) {
  & (Join-Path $PSScriptRoot 'test.ps1')
}

if ($part -ne 'none') {
  Write-Host "==> Bumping $part version..." -ForegroundColor Cyan
  $applied = Step-MiniCursorVersion -Root $Root -Part $part
  if ($applied -ne $version) {
    throw "Bumped version $applied did not match expected $version"
  }
}

$notesFile = Join-Path $Root ".release-notes-$version.md"
Write-MiniCursorNotesFile -Path $notesFile -Version $version -Notes $releaseNotes | Out-Null
Update-MiniCursorChangelog -Root $Root -Version $version -Notes $releaseNotes | Out-Null

Write-Host '==> Committing release metadata...' -ForegroundColor Cyan
git add -- frontend/package.json frontend/package-lock.json backend/MiniCursor.Api.csproj CHANGELOG.md
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }

$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
git diff --cached --quiet
$hasCommit = $LASTEXITCODE -ne 0
$ErrorActionPreference = $previous
if ($hasCommit) {
  git commit -m "Release $version"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
}
else {
  Write-Host 'No version/changelog changes to commit.' -ForegroundColor Yellow
}

if (-not $SkipBuild) {
  & (Join-Path $PSScriptRoot 'build-installer.ps1')
}

Write-Host "==> Tagging v$version..." -ForegroundColor Cyan
git tag -a "v$version" -m "Halo IDE $version"
if ($LASTEXITCODE -ne 0) { throw "git tag failed with exit code $LASTEXITCODE" }

if (-not $NoPush) {
  Write-Host '==> Pushing commit and tag...' -ForegroundColor Cyan
  git push origin HEAD
  if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }
  git push origin "v$version"
  if ($LASTEXITCODE -ne 0) { throw "git push tag failed with exit code $LASTEXITCODE" }
}
else {
  Write-Host 'Skipped push (-NoPush). Tag is local only.' -ForegroundColor Yellow
}

if (-not $SkipBuild) {
  if ($NoPush) {
    Write-Host 'Skipping GitHub Release because -NoPush. The remote tag must exist before publishing.' -ForegroundColor Yellow
  }
  else {
    & (Join-Path $PSScriptRoot 'publish-github-release.ps1') -Version $version -NotesFile $notesFile -VerifyTag
  }
}

Remove-Item -Force $notesFile -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "Released Halo IDE $version" -ForegroundColor Green
if ($SkipBuild -and -not $NoPush) {
  Write-Host "Installer will be built by the GitHub Release workflow for tag v$version." -ForegroundColor Green
}

# Shared version helpers. Dot-source from other scripts.
# Canonical app version lives in frontend/package.json; the API csproj is kept in sync.

function Get-MiniCursorVersion {
  param([Parameter(Mandatory = $true)][string]$FrontendDir)

  $pkgPath = Join-Path $FrontendDir 'package.json'
  if (-not (Test-Path $pkgPath)) {
    throw "Could not find package.json at $pkgPath"
  }
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  return [string]$pkg.version
}

function Set-MiniCursorVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Version
  )

  if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Version must be semver, e.g. 0.1.0 or 0.2.0-beta.1"
  }

  $Frontend = Join-Path $Root 'frontend'
  Push-Location $Frontend
  try {
    npm version $Version --no-git-tag-version --allow-same-version
    if ($LASTEXITCODE -ne 0) { throw "npm version failed with exit code $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }

  $csproj = Join-Path $Root 'backend\MiniCursor.Api.csproj'
  if (-not (Test-Path $csproj)) {
    throw "Could not find API project at $csproj"
  }

  $content = Get-Content $csproj -Raw
  if ($content -notmatch '<Version>') {
    throw "MiniCursor.Api.csproj is missing a <Version> element"
  }
  $updated = [regex]::Replace($content, '<Version>[^<]*</Version>', "<Version>$Version</Version>")
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText((Resolve-Path $csproj), $updated, $utf8)

  Write-Host "Version set to $Version" -ForegroundColor Green
}

function Get-MiniCursorSemVerParts {
  param([Parameter(Mandatory = $true)][string]$Version)

  if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Version must be semver, e.g. 0.1.0 or 0.2.0-beta.1"
  }

  return [pscustomobject]@{
    Major = [int]$Matches[1]
    Minor = [int]$Matches[2]
    Patch = [int]$Matches[3]
  }
}

function Get-MiniCursorNextVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)]
    [ValidateSet('major', 'minor', 'patch')]
    [string]$Part
  )

  $parts = Get-MiniCursorSemVerParts -Version $Version
  switch ($Part) {
    'major' { $parts.Major++; $parts.Minor = 0; $parts.Patch = 0 }
    'minor' { $parts.Minor++; $parts.Patch = 0 }
    'patch' { $parts.Patch++ }
  }
  return '{0}.{1}.{2}' -f $parts.Major, $parts.Minor, $parts.Patch
}

function Step-MiniCursorVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]
    [ValidateSet('major', 'minor', 'patch')]
    [string]$Part
  )

  $frontend = Join-Path $Root 'frontend'
  $current = Get-MiniCursorVersion -FrontendDir $frontend
  $next = Get-MiniCursorNextVersion -Version $current -Part $Part
  Set-MiniCursorVersion -Root $Root -Version $next
  return $next
}

function Test-MiniCursorGitTagExists {
  param([Parameter(Mandatory = $true)][string]$Version)

  $tag = git tag --list "v$Version" 2>$null
  return -not [string]::IsNullOrWhiteSpace($tag)
}

function Get-MiniCursorLatestVersionTag {
  $tag = git tag --list 'v*' --sort=-v:refname | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($tag)) { return $null }
  return [string]$tag
}

function New-MiniCursorReleaseNotes {
  param(
    [string]$SinceTag,
    [string]$Fallback = '- Maintenance release.'
  )

  $gitArgs = @('log', '--pretty=format:- %s', '--no-merges')
  if ($SinceTag) {
    $gitArgs += "$SinceTag..HEAD"
  }

  $lines = @(git @gitArgs 2>$null | Where-Object {
      $_ -and
      ($_ -notmatch '^-\s+Release\s+\d+\.\d+\.\d+') -and
      ($_ -notmatch '^-\s+Save work before ') -and
      ($_ -notmatch '^-\s+Merge ')
    })

  if ($lines.Count -eq 0) { return $Fallback }
  return ($lines -join "`n")
}

function Update-MiniCursorChangelog {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Notes
  )

  $path = Join-Path $Root 'CHANGELOG.md'
  $date = Get-Date -Format 'yyyy-MM-dd'
  $section = @"
## [$Version] - $date

$Notes

"@

  $utf8 = New-Object System.Text.UTF8Encoding $false
  if (-not (Test-Path $path)) {
    [System.IO.File]::WriteAllText($path, "# Changelog`r`n`r`n$section", $utf8)
    return $path
  }

  $existing = Get-Content $path -Raw
  $escaped = [regex]::Escape($Version)
  if ($existing -match "## \[$escaped\]") {
    $existing = [regex]::Replace(
      $existing,
      "(?s)## \[$escaped\] - [^\r\n]+\r?\n\r?\n.*?(?=\r?\n## |\z)",
      $section.TrimEnd() + "`r`n"
    )
  }
  elseif ($existing -match '(?s)(?<pre>^# Changelog.*?)(?=\r?\n## |\z)') {
    $pre = $Matches['pre'].TrimEnd()
    $rest = $existing.Substring($Matches[0].Length).TrimStart()
    $existing = $pre + "`r`n`r`n" + $section.TrimEnd() + "`r`n"
    if ($rest) { $existing += "`r`n" + $rest }
  }
  else {
    $existing = "# Changelog`r`n`r`n$section$existing"
  }

  [System.IO.File]::WriteAllText((Resolve-Path $path), $existing.TrimStart() + "`r`n", $utf8)
  return $path
}

function Write-MiniCursorNotesFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Notes
  )

  $body = @"
# Halo IDE $Version

$Notes
"@
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $body.Trim() + "`r`n", $utf8)
  return $Path
}

function Assert-MiniCursorGitClean {
  $status = git status --porcelain
  if ($status) {
    throw "Working tree is not clean. Commit or stash changes first.`n$status"
  }
}

function Get-MiniCursorGitDirty {
  $status = @(git status --porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($status.Count -eq 0) { return @() }
  return $status
}

function Get-MiniCursorOversizedStagedFiles {
  param([int64]$MaxBytes = 10MB)

  $files = @(git diff --cached --name-only --diff-filter=ACMR)
  $over = @()
  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
    $len = (Get-Item -LiteralPath $file).Length
    if ($len -gt $MaxBytes) {
      $over += [pscustomobject]@{ Path = $file; Bytes = $len }
    }
  }
  return $over
}

function Save-MiniCursorPendingWork {
  param(
    [string]$Message = 'Save work before release',
    [switch]$Push
  )

  $status = Get-MiniCursorGitDirty
  if ($status.Count -eq 0) {
    Write-Host 'Working tree is already clean.' -ForegroundColor Green
    return $false
  }

  Write-Host '==> Committing pending work...' -ForegroundColor Cyan
  Write-Host ($status -join "`n")

  git add -A
  if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }

  $over = @(Get-MiniCursorOversizedStagedFiles)
  if ($over.Count -gt 0) {
    foreach ($file in $over) {
      git restore --staged -- $file.Path
      if ($LASTEXITCODE -ne 0) { throw "git restore --staged failed for $($file.Path)" }
    }
    $list = ($over | ForEach-Object {
        '{0:N1} MB  {1}' -f ($_.Bytes / 1MB), $_.Path
      }) -join "`n"
    throw "Refusing to commit files larger than 10 MB. Add them to .gitignore and retry.`n$list"
  }

  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  git diff --cached --quiet
  $hasCommit = $LASTEXITCODE -ne 0
  $ErrorActionPreference = $previous
  if (-not $hasCommit) {
    Write-Host 'Nothing staged after git add. Working tree left as-is.' -ForegroundColor Yellow
    return $false
  }

  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }

  if ($Push) {
    Write-Host '==> Pushing pending work...' -ForegroundColor Cyan
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }
  }

  return $true
}

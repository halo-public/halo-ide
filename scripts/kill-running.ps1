# Stop leftover Halo IDE / electron:dev processes so a new debug session can start.
#
# Usage:
#   .\scripts\kill-running.ps1

[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

$Root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$RootSlash = $Root.Replace('\', '/')
$ElectronDist = Join-Path $Root 'frontend\node_modules\electron\dist\electron.exe'
$ThisPid = $PID

function Stop-PidTree([int]$ProcessId) {
  if ($ProcessId -le 0 -or $ProcessId -eq $ThisPid) { return }
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Test-HaloCommandLine([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  return $CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
    $CommandLine.IndexOf($RootSlash, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

Get-Process -Name 'Halo IDE' -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-PidTree $_.Id
}

Get-Process -Name 'MiniCursor.Api' -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-PidTree $_.Id
}

Get-CimInstance Win32_Process | ForEach-Object {
  $procId = [int]$_.ProcessId
  $name = $_.Name
  $commandLine = $_.CommandLine
  $executable = $_.ExecutablePath

  if ($procId -eq $ThisPid) { return }

  $isThisElectron = $name -match '^electron(\.exe)?$' -and (
    ($executable -and $executable.StartsWith($ElectronDist, [StringComparison]::OrdinalIgnoreCase)) -or
    (Test-HaloCommandLine $commandLine)
  )
  if ($isThisElectron) {
    Stop-PidTree $procId
    return
  }

  $isThisApi = $name -match '^dotnet(\.exe)?$' -and $commandLine -match 'MiniCursor\.Api' -and (Test-HaloCommandLine $commandLine)
  if ($isThisApi) {
    Stop-PidTree $procId
    return
  }

  $isDevStack = $name -match '^(node|npm|npm\.cmd|cmd)(\.exe)?$' -and (
    $commandLine -match 'electron:dev' -or
    $commandLine -match 'wait-on http://127\.0\.0\.1:45173' -or
    ($commandLine -match 'concurrently' -and (Test-HaloCommandLine $commandLine)) -or
    ($commandLine -match '\bvite\b' -and (Test-HaloCommandLine $commandLine))
  )
  if ($isDevStack) {
    Stop-PidTree $procId
  }
}

foreach ($port in 45173, 45154) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-PidTree $_ }
}

exit 0

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$taskName = 'StreamEngagement Connector'

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-Host 'StreamEngagement Connector auto-start removed.'
  exit 0
}

$projectPath = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectPath '.env'
if (-not (Test-Path -LiteralPath $environmentPath)) { throw 'Create the connector .env file before installing auto-start.' }
$environmentText = Get-Content -LiteralPath $environmentPath -Raw
if ($environmentText -notmatch '(?m)^APP_MODE=connector\s*$') { throw 'The .env file must contain APP_MODE=connector.' }

$runnerPath = Join-Path $PSScriptRoot 'run-connector.ps1'
$powershellPath = (Get-Command powershell.exe).Source
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`""
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $projectPath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Secure StreamEngagement bridge to OBS, Streamer.bot, and TikFinity.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'StreamEngagement Connector installed and started.'

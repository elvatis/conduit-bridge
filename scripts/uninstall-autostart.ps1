[CmdletBinding()]
param(
    [string]$TaskName = 'Conduit Bridge'
)

$ErrorActionPreference = 'Stop'
$RuntimeDir = if ($env:CONDUIT_HOME) { $env:CONDUIT_HOME } else { Join-Path $env:USERPROFILE '.conduit' }
$Launcher = Join-Path $RuntimeDir 'bin\conduit-bridge-start.ps1'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Windows logon task not found: $TaskName"
} else {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed Windows logon task: $TaskName"
}

if (Test-Path -LiteralPath $Launcher -PathType Leaf) {
    Remove-Item -LiteralPath $Launcher -Force
    Write-Host "Removed Conduit launcher: $Launcher"
}

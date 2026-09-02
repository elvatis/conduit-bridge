[CmdletBinding()]
param(
    [string]$TaskName = 'Conduit Bridge'
)

$ErrorActionPreference = 'Stop'
$RuntimeDir = if ($env:CONDUIT_HOME) { $env:CONDUIT_HOME } else { Join-Path $env:USERPROFILE '.conduit' }
$Launcher = Join-Path $RuntimeDir 'bin\conduit-bridge-start.ps1'
$PidFile = Join-Path $RuntimeDir 'conduit-bridge.pid'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Windows logon task not found: $TaskName"
} else {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed Windows logon task: $TaskName"
}

if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $ConduitPid = [int](Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)
    $ConduitProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ConduitPid" -ErrorAction SilentlyContinue
    $normalized = if ($null -ne $ConduitProcess) { $ConduitProcess.CommandLine -replace '/', '\' } else { '' }
    if ($null -ne $ConduitProcess -and $ConduitProcess.Name -eq 'node.exe' -and $normalized -like '*dist\cli.js*--port=31338*') {
        Stop-Process -Id $ConduitPid -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped Conduit Bridge process: $ConduitPid"
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $Launcher -PathType Leaf) {
    Remove-Item -LiteralPath $Launcher -Force
    Write-Host "Removed Conduit launcher: $Launcher"
}

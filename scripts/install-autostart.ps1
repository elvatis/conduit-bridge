[CmdletBinding()]
param(
    [string]$InstallDir,
    [string]$TaskName = 'Conduit Bridge'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Split-Path -Parent $PSScriptRoot
}
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$EntryPoint = Join-Path $InstallDir 'dist\cli.js'
if (-not (Test-Path -LiteralPath $EntryPoint -PathType Leaf)) {
    throw "Built CLI not found at $EntryPoint. Run npm run build first."
}

$Node = (Get-Command node -ErrorAction Stop).Source
$RuntimeDir = if ($env:CONDUIT_HOME) { $env:CONDUIT_HOME } else { Join-Path $env:USERPROFILE '.conduit' }
$LauncherDir = Join-Path $RuntimeDir 'bin'
$LogDir = Join-Path $RuntimeDir 'logs'
$LogFile = Join-Path $LogDir 'conduit-bridge.out.log'
$ErrorLogFile = Join-Path $LogDir 'conduit-bridge.error.log'
$PidFile = Join-Path $RuntimeDir 'conduit-bridge.pid'
$Launcher = Join-Path $LauncherDir 'conduit-bridge-start.ps1'
New-Item -ItemType Directory -Path $LauncherDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$safeInstallDir = $InstallDir.Replace("'", "''")
$safeNode = $Node.Replace("'", "''")
$safeEntryPoint = $EntryPoint.Replace("'", "''")
$safeLogFile = $LogFile.Replace("'", "''")
$safeErrorLogFile = $ErrorLogFile.Replace("'", "''")
$safePidFile = $PidFile.Replace("'", "''")
@"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$safeInstallDir'
`$Process = Start-Process -FilePath '$safeNode' -ArgumentList @('$safeEntryPoint', 'start', '--host=127.0.0.1', '--port=31338') -WorkingDirectory '$safeInstallDir' -RedirectStandardOutput '$safeLogFile' -RedirectStandardError '$safeErrorLogFile' -PassThru
`$Process.Id | Set-Content -LiteralPath '$safePidFile' -Encoding ASCII
try {
    `$Process.WaitForExit()
    exit `$Process.ExitCode
} finally {
    Remove-Item -LiteralPath '$safePidFile' -Force -ErrorAction SilentlyContinue
}
"@ | Set-Content -LiteralPath $Launcher -Encoding UTF8
$Action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`"" `
    -WorkingDirectory $RuntimeDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $ExistingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $ExistingPid = [int](Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)
    $ExistingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ExistingPid" -ErrorAction SilentlyContinue
    if ($null -ne $ExistingProcess -and $ExistingProcess.Name -eq 'node.exe' -and $ExistingProcess.CommandLine -like "*$EntryPoint*") {
        Stop-Process -Id $ExistingPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description 'Start Conduit Bridge for the interactive Windows desktop session.' `
    -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started Windows logon task: $TaskName"
Write-Host "Installed Conduit launcher: $Launcher"
Write-Host "Conduit logs: $LogFile and $ErrorLogFile"
Write-Host 'The bridge listens only on 127.0.0.1:31338.'

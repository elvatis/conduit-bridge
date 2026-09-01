[CmdletBinding()]
param(
    [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
    [string]$TaskName = 'Conduit Bridge'
)

$ErrorActionPreference = 'Stop'
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$EntryPoint = Join-Path $InstallDir 'dist\cli.js'
if (-not (Test-Path -LiteralPath $EntryPoint -PathType Leaf)) {
    throw "Built CLI not found at $EntryPoint. Run npm run build first."
}

$Node = (Get-Command node -ErrorAction Stop).Source
$RuntimeDir = if ($env:CONDUIT_HOME) { $env:CONDUIT_HOME } else { Join-Path $env:USERPROFILE '.conduit' }
$LauncherDir = Join-Path $RuntimeDir 'bin'
$Launcher = Join-Path $LauncherDir 'conduit-bridge-start.ps1'
New-Item -ItemType Directory -Path $LauncherDir -Force | Out-Null
$safeInstallDir = $InstallDir.Replace("'", "''")
$safeNode = $Node.Replace("'", "''")
$safeEntryPoint = $EntryPoint.Replace("'", "''")
@"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$safeInstallDir'
& '$safeNode' '$safeEntryPoint' start --host=127.0.0.1 --port=31338
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
Write-Host 'The bridge listens only on 127.0.0.1:31338.'

<#
Build the tested BitNet revision with existing Visual Studio C++ tools and LLVM.
No Conda, Python packages, model download or system installation is performed.
The small relu2 patch is specific to Microsoft's b1.58 2B-4T architecture.
#>
[CmdletBinding()]
param([string]$SourceDirectory)
$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $SourceDirectory) { $SourceDirectory = Join-Path $taskRepo '.ai/logs/bitnet-native/BitNet' }
$taskSource = [IO.Path]::GetFullPath($SourceDirectory)
$taskRevision = '0b341e582afbf9e1011f24744b554c96a3477eb5'
$taskSubmodule = '390c307752ab78fd8189f359d6954c9ba1be74af'
function Invoke-NativeChecked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
$taskClang = (Get-Command clang-cl.exe -ErrorAction Stop).Source.Replace('\', '/')
$taskVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$taskVs = & $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $taskVs) { throw 'Visual Studio C++ Build Tools are required.' }
Import-Module (Join-Path $taskVs 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $taskVs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'
$taskCmake = Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$taskNinja = (Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe').Replace('\', '/')
if (-not (Test-Path -LiteralPath $taskSource)) {
    Invoke-NativeChecked git @('clone', '--recursive', 'https://github.com/microsoft/BitNet.git', $taskSource)
    Invoke-NativeChecked git @('-C', $taskSource, 'checkout', '--detach', $taskRevision)
    Invoke-NativeChecked git @('-C', $taskSource, 'submodule', 'update', '--init', '--recursive')
}
if ((& git -C $taskSource rev-parse HEAD) -ne $taskRevision) { throw 'Existing BitNet source is not the tested revision; use a separate SourceDirectory.' }
$taskLlama = Join-Path $taskSource '3rdparty/llama.cpp'
if ((& git -C $taskLlama rev-parse HEAD) -ne $taskSubmodule) { throw 'Unexpected llama.cpp submodule revision.' }
$taskPatch = Join-Path $PSScriptRoot 'b158-2b-relu2.patch'
& git -C $taskLlama apply --reverse --check $taskPatch 2>$null
if ($LASTEXITCODE -ne 0) {
    Invoke-NativeChecked git @('-C', $taskLlama, 'apply', '--check', $taskPatch)
    Invoke-NativeChecked git @('-C', $taskLlama, 'apply', $taskPatch)
}
$taskBuild = Join-Path $taskSource 'build-native'
Invoke-NativeChecked $taskCmake @(
    '-S', $taskSource, '-B', $taskBuild, '-G', 'Ninja',
    "-DCMAKE_MAKE_PROGRAM=$taskNinja", "-DCMAKE_C_COMPILER=$taskClang", "-DCMAKE_CXX_COMPILER=$taskClang",
    '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DBITNET_X86_TL2=OFF',
    '-DLLAMA_BUILD_COMMON=ON', '-DLLAMA_BUILD_TOOLS=ON', '-DLLAMA_BUILD_EXAMPLES=ON',
    '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_SERVER=ON', '-DLLAMA_CURL=OFF', '-DGGML_OPENMP=OFF',
    '-DLLAMA_BUILD_UI=OFF', '-DLLAMA_USE_PREBUILT_UI=OFF'
)
Invoke-NativeChecked $taskCmake @('--build', $taskBuild, '--target', 'llama-server', 'llama-cli', '--parallel', '6')
Write-Output "Native BitNet server: $(Join-Path $taskBuild 'bin/llama-server.exe')"

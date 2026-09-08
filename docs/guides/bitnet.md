# Install llama-server and BitNet

This guide takes a Windows x64 desktop from missing build tools to a local
BitNet answer in Conduit. Follow the stages in order and check each result
before continuing. Commands marked `powershell` run in PowerShell, not Command
Prompt or Git Bash. Keep the same terminal open unless told otherwise.

| Stage | Result before continuing |
| --- | --- |
| 1. [Prepare the computer](#prepare-the-computer) | Git, Node.js and C++/Clang tools are available. |
| 2. [Build the native server](#build-the-native-server) | `llama-server.exe --version` succeeds. |
| 3. [Download the model](#download-the-model) | The GGUF has the expected size and SHA-256. |
| 4. [Configure the bridge](#configure-the-bridge) | Three absolute file paths are saved in `.env`. |
| 5. [Check both services](#start-and-check-both-services) | Native inference and Conduit respond; BitNet is connected. |
| 6. [Send a first request](#send-an-inference-request) | A short answer arrives through `bitnet/auto`. |
| 7. [Use it every day](#everyday-startup-and-shutdown) | Restart, optional desktop startup and stopping are understood. |

Already installed the server and model? Start at stage 4. For another operating
system, read [Linux and other installations](#linux-and-other-installations)
first. Source and model downloads need internet access; inference after setup
runs on this computer without an API key.

## Understand the components

| Name | What you install or configure |
| --- | --- |
| **llama.cpp** | A C/C++ inference engine. Microsoft's BitNet project includes a version with BitNet support. |
| **llama-server** | The executable that loads a GGUF and serves HTTP requests. This guide builds it from pinned BitNet source with Conduit's compatibility patch. |
| **BitNet b1.58 2B-4T** | The model weights, downloaded separately as `ggml-model-i2_s.gguf`. |
| **Conduit Bridge** | Dashboard/gateway at `http://127.0.0.1:31338`, forwarding `bitnet/*` requests to the native server at `http://127.0.0.1:8080`. |

The [BitNet project](https://github.com/microsoft/BitNet) builds on
[llama.cpp](https://github.com/ggml-org/llama.cpp). This BitNet build already
supplies `llama-server`; you do not need a second llama.cpp package, Meta's Llama
model weights, Ollama or LM Studio for this route. Those are separate choices.
A generic `llama-server` download is not the pinned build validated here. Use
the executable below so a different copy on `PATH` cannot be selected accidentally.

## Prepare the computer

Use Windows x64 with room for the C++ toolchain, source, build and model.
The GGUF alone is about **1.19 GB**; Visual Studio Installer reports the additional
disk space for the selected tools. Runtime memory also includes context and
working buffers, so download size is not a RAM requirement. Start with two CPU
threads and 2048 context tokens. A GPU is not required.

Install these once, skipping anything already present:

1. [Git for Windows](https://git-scm.com/downloads/win), with command-line/PATH
   integration enabled in the installer.
2. [Node.js 24 or newer](https://nodejs.org/en/download), including npm, for Conduit.
3. **Build Tools for Visual Studio**, under **Tools for Visual Studio** on the
   [Microsoft downloads page](https://visualstudio.microsoft.com/downloads/).
   Select **Desktop development with C++** in Visual Studio Installer. Include
   x64/x86 MSVC tools, a Windows SDK, **C++ CMake tools for Windows** (CMake and
   Ninja), **C++ Clang tools/compiler for Windows** and **MSBuild support for LLVM
   (clang-cl)**. Labels vary by installer version. Use **Modify** for an existing
   installation. Microsoft's [C++ installation guide](https://learn.microsoft.com/en-us/cpp/build/vscpp-step-0-installation)
   and [Clang component guide](https://learn.microsoft.com/en-us/cpp/build/clang-support-msbuild)
   explain the installer choices.

Open a fresh PowerShell after installation:

```powershell
git --version
node --version
npm.cmd --version
```

**Expected:** each prints a version; Node's major version is at least 24.
`npm.cmd` avoids selecting npm's PowerShell shim when script policy blocks it.

Locate Visual Studio and expose its bundled Clang in this terminal:

```powershell
$bitnetVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $bitnetVswhere)) { throw 'Install Visual Studio Build Tools first.' }
$bitnetVs = & $bitnetVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $bitnetVs) { throw 'Add the Desktop development with C++ workload.' }
if (-not (Get-Command clang-cl.exe -ErrorAction SilentlyContinue)) {
    $bitnetClangDir = Join-Path $bitnetVs 'VC/Tools/Llvm/x64/bin'
    if (-not (Test-Path -LiteralPath (Join-Path $bitnetClangDir 'clang-cl.exe'))) {
        $bitnetClangDir = Join-Path $bitnetVs 'VC/Tools/Llvm/bin'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $bitnetClangDir 'clang-cl.exe'))) {
        throw 'Add C++ Clang tools for Windows, then retry.'
    }
    $env:PATH = $bitnetClangDir + ';' + $env:PATH
}
clang-cl.exe --version
& (Join-Path $bitnetVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe') --version
& (Join-Path $bitnetVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe') --version
```

**Expected:** Clang, CMake and Ninja print versions. Upstream lists Clang 18+
and CMake 3.22+; this project's Windows validation used Clang 22.1.8 and Visual
Studio Build Tools 2026. An older toolchain is not guaranteed to build the
pinned source. The helper initializes Visual Studio's x64 environment itself,
but needs `clang-cl.exe` on PATH before starting. The PATH change above affects
only this terminal.

## Build the native server

Use a **Conduit source checkout**, which includes `scripts/bitnet/`. A packaged
`dist/` directory alone does not contain these native build assets.
If you do not have a checkout, open PowerShell in a writable parent folder:

```powershell
git clone https://github.com/elvatis/conduit-bridge.git
Set-Location conduit-bridge
```

For an existing checkout, change to its root instead. Do not nest another clone
inside it. Then run:

```powershell
$bitnetRepo = (Get-Location).Path
if (-not (Test-Path -LiteralPath './scripts/bitnet/build-windows.ps1')) {
    throw 'Use a Conduit checkout containing scripts/bitnet/build-windows.ps1.'
}
& ./scripts/bitnet/build-windows.ps1
```

The helper downloads source/submodules on its first run, applies the checked-in
2B activation patch, and compiles CPU release executables. Allow it to finish;
compiler progress can pause between large files. It does not install system
software, download a model or run Python/Conda.

Check the resulting executable:

```powershell
$bitnetServer = Join-Path $bitnetRepo '.ai/logs/bitnet-native/BitNet/build-native/bin/llama-server.exe'
if (-not (Test-Path -LiteralPath $bitnetServer -PathType Leaf)) { throw 'Build did not produce llama-server.exe.' }
& $bitnetServer --version
if ($LASTEXITCODE -ne 0) { throw 'llama-server could not run.' }
```

**Expected:** a version/build report and exit code 0. This checks the executable
before model loading or Conduit configuration is involved.

The helper pins BitNet to `0b341e582afbf9e1011f24744b554c96a3477eb5` and its
llama.cpp submodule to `390c307752ab78fd8189f359d6954c9ba1be74af`. It refuses a
source directory at another revision. For a separate build, use
`./scripts/bitnet/build-windows.ps1 -SourceDirectory C:/work/BitNet-conduit` with
a new directory, then set `$bitnetServer` to its
`build-native/bin/llama-server.exe`. Stop any server using the target executable
before rebuilding; see [shutdown](#everyday-startup-and-shutdown).

## Download the model

Use Microsoft's [b1.58 2B-4T GGUF file](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf/blob/main/ggml-model-i2_s.gguf),
named **`ggml-model-i2_s.gguf`**. A `.safetensors` checkpoint, an embedding model
or a small Git LFS pointer cannot replace it. The model is not bundled with
Conduit. Its [model card](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf)
describes the model and license.

This downloads a fixed Microsoft revision into your user profile, outside the
repository. It resumes interrupted downloads and keeps an existing complete file:

```powershell
$bitnetModelDir = Join-Path $env:USERPROFILE 'models/bitnet-b1.58-2B-4T'
New-Item -ItemType Directory -Path $bitnetModelDir -Force | Out-Null
$bitnetModel = Join-Path $bitnetModelDir 'ggml-model-i2_s.gguf'
$bitnetModelUrl = 'https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf/resolve/29f884c2aefd035cd498fa0750b7781e6f269032/ggml-model-i2_s.gguf?download=true'
if (-not (Test-Path -LiteralPath $bitnetModel)) {
    curl.exe --fail --location --retry 3 --continue-at - --output "$bitnetModel.part" $bitnetModelUrl
    if ($LASTEXITCODE -ne 0) { throw 'Download incomplete. Rerun this block to resume.' }
    Move-Item -LiteralPath "$bitnetModel.part" -Destination $bitnetModel
}
$bitnetExpectedHash = '4221b252fdd5fd25e15847adfeb5ee88886506ba50b8a34548374492884c2162'
if ((Get-Item -LiteralPath $bitnetModel).Length -ne 1187801280 -or
    (Get-FileHash -LiteralPath $bitnetModel -Algorithm SHA256).Hash -ne $bitnetExpectedHash) {
    throw 'Model size or SHA-256 differs. Check the download before continuing.'
}
'Model verified: 1,187,801,280 bytes; SHA-256 matches.'
```

**Expected:** `Model verified`. The size/hash match Microsoft's
[file revision](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T-gguf/commit/29f884c2aefd035cd498fa0750b7781e6f269032)
and the model used in local validation. If your network blocks command-line
downloads, use the file page's **Download** button, save at `$bitnetModel`, and
run the size/hash check. Do not save the HTML preview. For a mismatch, move the
suspect file aside and download the documented file again; keep the hash check.

## Configure the bridge

Run this in the same PowerShell to print configuration with your actual paths:

```powershell
$bitnetTemplate = Join-Path $bitnetRepo 'scripts/bitnet/chat-2b4t.jinja'
foreach ($bitnetFile in @($bitnetServer, $bitnetModel, $bitnetTemplate)) {
    if (-not (Test-Path -LiteralPath $bitnetFile -PathType Leaf)) { throw "Missing file: $bitnetFile" }
}
@"
BITNET_URL=http://127.0.0.1:8080
BITNET_SERVER_BINARY="$($bitnetServer.Replace('\', '/'))"
BITNET_MODEL_PATH="$($bitnetModel.Replace('\', '/'))"
BITNET_TOKENIZER_PRE=llama-bpe
BITNET_CHAT_TEMPLATE_PATH="$($bitnetTemplate.Replace('\', '/'))"
BITNET_THREADS=2
BITNET_CTX_SIZE=2048
BITNET_AUTOSTART=true
"@
```

Create `.env` in the checkout with your text editor and paste that output.
For an existing `.env`, update only `BITNET_*` entries and keep other settings.
Save as **`.env`**, not `.env.txt`. This block prints configuration; it does not
overwrite a file. Quoted absolute paths work with spaces. Conduit's loader does
not expand `~`, `$env:USERPROFILE` or other shell variables in `.env`, which is
why the block prints resolved paths.

| Setting | Meaning |
| --- | --- |
| `BITNET_SERVER_BINARY` | Absolute path to the native executable just built. |
| `BITNET_MODEL_PATH` | Absolute path to a regular `.gguf` file, not a symlink or directory. |
| `BITNET_TOKENIZER_PRE` | `llama-bpe` supplies older/missing tokenizer metadata for this model. |
| `BITNET_CHAT_TEMPLATE_PATH` | Absolute path to the supplied 2B-4T `.jinja` template, a regular file of at most 64 KiB. |
| `BITNET_THREADS` | Automatic startup's CPU threads: default 2, allowed 1-256. Try 4 or 8 later if appropriate for your CPU. |
| `BITNET_CTX_SIZE` | Automatic startup's context tokens: default 2048. Keep 2048 initially; a larger value does not improve the model's trained context capability. |
| `BITNET_AUTOSTART` | Starts the configured model with Conduit by default; `false` disables it. |
| `BITNET_URL` | Native server's HTTP root URL, without `/v1`; use `127.0.0.1` and port 8080 here. |

The tokenizer preset, template and architecture-specific `relu2` build patch
belong together for this 2B-4T model. A successful load alone does not establish
that another build or template produces correct answers.

Restart Conduit after editing configuration. Existing process environment
variables win over `.env`; the startup directory's `.env` wins over the runtime
directory's `.env`. For launches from different directories, use
`%USERPROFILE%/.conduit/.env` (or the directory selected by `CONDUIT_HOME`), and
avoid conflicting entries. See [storage paths](storage.md). Missing BitNet files
leave the rest of Conduit available.

## Start and check both services

From the checkout, build and start Conduit. Stop an already running instance
through its terminal or launcher first; do not start a duplicate on the same port.

```powershell
npm.cmd install
npm.cmd run build
node dist/cli.js start
```

**Keep this terminal open.** `start` runs in the foreground. Conduit starts its
HTTP listener first, then loads BitNet; allow up to 30 seconds for native
readiness. The optional model's failure does not stop the dashboard. For loading
beyond that deadline, use the [foreground diagnostic](#inspect-a-native-startup-failure).

Open a **second PowerShell** for checks. Initialize the header variable:

```powershell
$bitnetBridgeHeaders = @{}
```

For the default local installation without a bridge token, leave it empty.
If bridge authentication is enabled, enter your **bridge administrator token**
without putting it in shell history (Windows PowerShell 5.1 or PowerShell 7):

```powershell
$bitnetBridgeSecret = Read-Host 'Bridge administrator token' -AsSecureString
$bitnetBridgeHeaders = @{ Authorization = 'Bearer ' + [System.Net.NetworkCredential]::new('', $bitnetBridgeSecret).Password }
```

A scoped non-admin platform token cannot manage native processes or access every
bridge endpoint. See [platform authentication](platform.md). Send the token only
to Conduit, never to the native server on port 8080. Then check:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:31338/health -Headers $bitnetBridgeHeaders | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:31338/api/providers/status -Headers $bitnetBridgeHeaders | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
    -Headers $bitnetBridgeHeaders -Method Post -ContentType application/json `
    -Body '{"action":"status"}' | ConvertTo-Json -Depth 4
```

**Expected:** both health requests succeed, provider status lists BitNet as
connected, and managed startup reports `running: true`, `managed: true` and
`autoStart.state: "ready"`. Rerun the checks if startup is still in progress.

| `autoStart.state` | Meaning and next action |
| --- | --- |
| `starting` | Wait for loading, then repeat health and status checks. |
| `ready` | Conduit started its own child. Verify health and send a request. |
| `external` | An existing healthy service was found. `running: false, managed: false` is normal: those fields describe ownership only. Check the external server's model at `/v1/models` on port 8080. |
| `disabled` | `BITNET_AUTOSTART=false` is active. Start manually below or enable it and restart. |
| `unconfigured` | The model path was not loaded. Check `.env` filename, location and path. |
| `failed` | Check the three files, port, toolchain and compatibility settings; use the diagnostic below. |

A health probe only confirms that an HTTP service responds. Before using an
external service for private BitNet work, confirm that it is the intended local
BitNet process and model. Conduit neither adopts nor stops that process.

## Send an inference request

In the second PowerShell, inspect the native and bridge catalogs:

```powershell
(Invoke-RestMethod http://127.0.0.1:8080/v1/models).data | Select-Object id
(Invoke-RestMethod http://127.0.0.1:31338/v1/models -Headers $bitnetBridgeHeaders).data |
    Where-Object { $_.id -like 'bitnet/*' } | Select-Object id
```

Conduit always offers `bitnet/auto` and compatibility aliases such as
`bitnet/2B-4T`; their presence alone does **not** prove a model is installed.
Aliases do not download or switch models. Use `bitnet/auto` for the native
server's loaded model. Embedding aliases are not chat models and are outside
this walkthrough's validation.

Send a short request with bounded output:

```powershell
$bitnetRequest = @{
    model = 'bitnet/auto'
    messages = @(@{ role = 'user'; content = 'Answer with one number: what is 6 plus 6?' })
    max_tokens = 32
    temperature = 0
} | ConvertTo-Json -Depth 5
$bitnetReply = Invoke-RestMethod http://127.0.0.1:31338/v1/chat/completions `
    -Headers $bitnetBridgeHeaders -Method Post -ContentType application/json `
    -Body $bitnetRequest -TimeoutSec 120
$bitnetReply.choices[0].message.content
```

**Expected:** a short answer containing `12`. An HTTP success with empty,
repeating or nonsensical text still needs investigation. Check the matching
build, model hash, tokenizer and template before proceeding.

For the dashboard, open <http://127.0.0.1:31338/>, use **Ctrl+K** to open
**Webchat**, create a chat, choose **BitNet (active model)** / `bitnet/auto`, and
send the same question. Then try [session insights](session-insights.md) or
[Vault prompt scans](platform.md#vault-search-and-prompt-scans). Both need
working local BitNet; a remote API login does not enable them.

## Everyday startup and shutdown

After setup, run `node dist/cli.js start` from the configured checkout, wait for
health, and open the dashboard. You do not rebuild or download the model on
every launch. After pulling source updates, run `npm.cmd install` and
`npm.cmd run build` before restarting. Set up optional
[desktop autostart](autostart.md) after the first manual request succeeds; keep
the absolute paths accessible to the same desktop user.

**Ctrl+C in the bridge's foreground terminal** performs graceful shutdown and
stops its owned BitNet child. An external native server remains running; stop
it through its original terminal or launcher.

For manual native lifecycle control, set `BITNET_AUTOSTART=false`, restart
Conduit, then use the second PowerShell with `$bitnetBridgeHeaders` initialized
as above. `approved: true` records your deliberate process action. Run each
command when needed, rather than starting and immediately stopping the server:

```powershell
# Start only when no server already occupies this port.
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
    -Headers $bitnetBridgeHeaders -Method Post -ContentType application/json `
    -Body '{"action":"start","approved":true,"port":8080,"threads":2,"ctx_size":2048}'
```

```powershell
# Inspect the child Conduit owns.
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
    -Headers $bitnetBridgeHeaders -Method Post -ContentType application/json `
    -Body '{"action":"status"}'
```

```powershell
# Stop that owned child when finished.
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
    -Headers $bitnetBridgeHeaders -Method Post -ContentType application/json `
    -Body '{"action":"stop","approved":true}'
```

Manual `start` defaults to port 8080, two threads and 2048 context tokens;
`BITNET_THREADS`/`BITNET_CTX_SIZE` configure **automatic** startup. To use another
port, change `BITNET_URL`, restart Conduit, and pass the same port explicitly
in manual starts. Use a free port from 1024 to 65535. Automatic startup requires
a loopback HTTP root URL.

## Troubleshooting

Start with the first failed stage. Retest its checkpoint after each repair.

| Symptom | Next action |
| --- | --- |
| `git`, `node` or `npm` is missing | Finish installation, open a fresh terminal and repeat the version checks. In PowerShell use `npm.cmd`. |
| Clang, CMake or Ninja is missing | Use Visual Studio Installer **Modify** to add the listed components, then repeat stage 1 in the same terminal as the build. |
| PowerShell blocks `build-windows.ps1` | Inspect the checked-in script. If local policy permits, `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` applies to this terminal. An organization policy may need your administrator. |
| Source/submodule revision differs | Use a new `-SourceDirectory`; keep the previous checkout intact. Do not apply the patch to an arbitrary revision. |
| Build cannot write the executable | Stop the server using that build, then rebuild. Check file permissions if it remains blocked. |
| GGUF is tiny, hash differs or loading says invalid GGUF | It may be HTML, a Git pointer or an incomplete download. Download the documented GGUF and repeat the size/hash check. |
| Model/template path is rejected | Use absolute paths to regular files; verify extensions, read access and the 64 KiB template limit. |
| BitNet is unconfigured after editing `.env` | Check `.env.txt`, startup directory and environment precedence. Paths cannot contain unexpanded shell variables. Restart the actual bridge instance. |
| Port 8080 is busy | Inspect `Get-NetTCPConnection -LocalPort 8080 -State Listen`. Reuse only the intended healthy server; stop unwanted servers through their launcher or configure another port consistently. |
| Port 31338 is busy | A bridge may already be running. Use it or stop it through its launcher before starting another. |
| Health works on 31338 but fails on 8080 | Conduit started, but inference did not. Check native status and the foreground diagnostic below. |
| Requests return 401/403 | Supply the configured bridge administrator token to bridge endpoints. Keep authentication enabled. |
| A model appears in the menu but requests fail | Check native health and `/v1/models`; choose `bitnet/auto`. Aliases alone are not readiness checks. |
| Answers repeat, are empty or ignore simple instructions | Confirm pinned build, model hash, `llama-bpe` and supplied template. Keep the first request short. |
| CPU load is excessive or the desktop is sluggish | Reduce threads to 2, keep context at 2048 and restart the owned server. More threads are not always faster. |
| A previous PID record blocks startup | Inspect the recorded owner/child with their launchers. Conduit will not kill/adopt a process from a stale file. Autostart removes a record only after confirming both PIDs are absent. |

### Inspect a native startup failure

Conduit's managed child does not retain native stdout/stderr logs. To see the
actual loading error, stop any server on 8080 through its launcher, set
`BITNET_AUTOSTART=false`, and restart Conduit. In a foreground PowerShell, set
`$bitnetServer`, `$bitnetModel` and `$bitnetTemplate` to stage 4's three absolute
paths if you opened a new terminal, then run:

```powershell
& $bitnetServer -m $bitnetModel -c 2048 -t 2 -ngl 0 `
    --host 127.0.0.1 --port 8080 -cb `
    --override-kv 'tokenizer.ggml.pre=str:llama-bpe' `
    --chat-template-file $bitnetTemplate
```

Leave it running and repeat health and the first request from another terminal.
**Ctrl+C** stops this server. Conduit can reach it through `BITNET_URL` but will
not own it. Once repaired, stop the foreground server, restore
`BITNET_AUTOSTART=true`, and restart Conduit for managed startup. When seeking
help, share the failed stage, tool versions and loading error; remove
credentials, private paths and conversation text from diagnostics.

## Linux and other installations

Conduit supports Linux Desktop, but this repository's native helper is
**Windows x64 only**. Native Linux BitNet builds, ARM and GPU inference have not
been validated here. Use Microsoft's
[upstream installation instructions](https://github.com/microsoft/BitNet#installation)
for Linux, including their Python-based environment/build route. Its
prerequisites differ from the Windows helper above.

After obtaining a BitNet-compatible Linux server and matching GGUF, configure
the same `BITNET_*` settings with absolute Linux paths. Keep this model's
tokenizer/template requirements in mind; upstream builds do not automatically
include Conduit's local patch. Verify native health and a short answer before
treating that installation as usable.

For ordinary llama.cpp models, use the
[llama.cpp installation/build guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)
with a supported model. That is a separate setup from the BitNet path used by
Insights and Vault. LM Studio is another local option described in
[Getting started](getting-started.md#local-inference).

## Validated setup and limits

Native Windows validation on 2026-09-07 used Microsoft's b1.58 2B-4T GGUF,
a Ryzen Threadripper 3960X, Clang 22.1.8 and Visual Studio Build Tools 2026.
Checks covered loading, arithmetic, German translation, streaming, start/stop,
local planning and classification. Longer CPU generation was about 31-32 tokens
per second with **eight threads on that machine**, not a speed promise for others.

The 2026-09-08 documentation review checked the published model hash against
the installed 1,187,801,280-byte file, confirmed the pinned download responds
to an HTTP HEAD request, and compared flags with the native executable.
All 17 PowerShell blocks parse on Windows PowerShell 5.1 and PowerShell 7;
the tool preflight and model checksum checkpoints run on both. The generated
eight-setting configuration loads through Conduit's actual `.env` parser.
The 31 existing BitNet/lifecycle/configuration tests, production build and
documentation checks pass. This review did not repeat a clean Windows toolchain
installation, redownload the model, run a new inference or validate a Linux build.

BitNet is a small CPU model that can invent details or misfollow instructions.
It is useful for short offline tasks whose output you review. A working install
does not establish reliable reasoning, code quality, multilingual accuracy or
embedding support. See the [integration report](../validation/addendum.md) and
[session insight limits](session-insights.md) for the measured scope.

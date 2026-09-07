# Native BitNet on Windows without Conda

Validated on 2026-09-07 with the supplied `ggml-model-i2_s.gguf`, Windows,
an AMD Ryzen Threadripper 3960X, Clang 22.1.8 and Visual Studio Build Tools 2026.
Both `llama-cli.exe` and `llama-server.exe` run natively. No Conda environment,
Python environment, Python package installation or model conversion was needed.
Model files are excluded from Git by `*.gguf`.

## Build and model provenance

- [Microsoft BitNet](https://github.com/microsoft/BitNet/tree/0b341e582afbf9e1011f24744b554c96a3477eb5):
  `0b341e582afbf9e1011f24744b554c96a3477eb5`.
- Its pinned llama.cpp submodule: `390c307752ab78fd8189f359d6954c9ba1be74af`.
- Model: Microsoft's b1.58 2B-4T GGUF, 1,187,801,280 bytes.
- SHA-256: `4221b252fdd5fd25e15847adfeb5ee88886506ba50b8a34548374492884c2162`.
  This matches the official [LFS pointer](https://huggingface.co/microsoft/BitNet-b1.58-2B-4T-gguf/raw/main/ggml-model-i2_s.gguf).
  The supplied file was neither rewritten nor replaced.

Two upstream compatibility problems affected the initial run:

1. The GGUF has an old chat template and lacks pre-tokenizer metadata. The
   tested setup uses `llama-bpe` and the template published in Microsoft's
   [tokenizer configuration](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T/blob/main/tokenizer_config.json).
2. The current runtime uses SiLU for the b1.58 2B model, while Microsoft's
   [model configuration](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T/blob/main/config.json)
   declares `relu2`. This matches [upstream issue #602](https://github.com/microsoft/BitNet/issues/602).
   The included patch selects the existing squared-ReLU implementation only
   for the b1.58 2B architecture; other BitNet variants keep their prior behavior.

The unpatched runtime produced repeated text and failed arithmetic/translation
checks. Correcting the template alone did not resolve those failures. With the
activation patch and official template, the same checks pass.

The current server labels this legacy GGUF as `Q1_0` because its file-type enum
changed. Direct inspection confirms its packed matrix tensors are type 36
(`I2_S` in this build). This display label does not describe the actual tensors.

## Reproduce the build

Prerequisites: Git, `clang-cl.exe` on PATH, and Visual Studio's C++ build tools
including the Windows SDK, CMake and Ninja. The helper discovers the installed
Visual Studio directory. Run from the bridge repository:

```powershell
./scripts/bitnet/build-windows.ps1
```

The helper fetches the pinned source when absent, checks both revisions,
applies the checked-in patch idempotently, and builds release CPU executables.
Existing source at another revision is rejected; use `-SourceDirectory` with
a new directory when needed. Stop a running native server before rebuilding.

The default executable is:

```text
.ai/logs/bitnet-native/BitNet/build-native/bin/llama-server.exe
```

Source and build products remain ignored. The build uses static libraries
(`BUILD_SHARED_LIBS=OFF`) because the upstream shared-library build leaves
I2_S symbols unresolved on Windows. Tool/common/server targets are enabled,
OpenMP and the separate bundled web UI/download are disabled. CPU AVX2 and
the runtime's own thread pool are used. No system packages are installed.

The first exploratory build entered upstream's optional UI provisioning; the
reproducible helper disables it. Upstream may warn about missing embedded UI
assets or OpenSSL. The bridge uses the local HTTP API.

## Bridge configuration and operation

These settings are already configured in this machine's ignored `.env`.
For another checkout, adjust all three filesystem paths:

```dotenv
BITNET_URL=http://127.0.0.1:8080
BITNET_MODEL_PATH=C:/Users/root/workspace/conduit-bridge/ggml-model-i2_s.gguf
BITNET_SERVER_BINARY=C:/Users/root/workspace/conduit-bridge/.ai/logs/bitnet-native/BitNet/build-native/bin/llama-server.exe
BITNET_TOKENIZER_PRE=llama-bpe
BITNET_CHAT_TEMPLATE_PATH=C:/Users/root/workspace/conduit-bridge/scripts/bitnet/chat-2b4t.jinja
```

Restart the bridge after changing `.env`. The tokenizer and template settings
are optional host configuration; they cannot be supplied as arbitrary HTTP
arguments. Preset names are bounded, and templates must be absolute regular
Jinja files of at most 64 KiB.

Start through the bridge with the usual authenticated administrator access:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"start","approved":true,"threads":8,"ctx_size":2048}'
```

Use `bitnet/auto` or `bitnet/2B-4T` in bridge chat requests. `status` returns
the owned native process state; `stop` requires `approved:true`. The native
server listens at `127.0.0.1:8080`, and the bridge remains on port 31338.
Eight threads and 2048 context tokens are the tested settings, not an optimized
configuration. Native startup is explicit; it is not automatically repeated
after the bridge itself restarts.

## Observed results

The full bridge suite passes **512 tests in 62 files**, including native
argument validation and preservation of original input in generated subtasks.
Strict TypeScript checking and production builds pass. Exact hosted CI results
are linked from [PR #117](https://github.com/elvatis/conduit-bridge/pull/117).

Live evidence covers four direct/provider checks, eight bridge checks, and
one complete local orchestration request:

| Check | Observed result |
| --- | --- |
| Native model discovery | Loaded 2,412,820,480-parameter model |
| Arithmetic, direct and bridge | `7 + 5` returned exactly `12` |
| German translation, provider and model alias | `house` returned exactly `Haus` |
| Streaming | `Red, Blue, Yellow`, five chunks; first chunk about 88 ms |
| Managed lifecycle | Start about 1.55 s; stop/restart created a new owned PID |
| Explicit local task execution | Classification returned `POSITIVE` |
| Local model planning | Valid task IDs, local provider, valid dependency graph |
| Combined planning and execution | Plain offline classification returned `POSITIVE` in 1.82 s |
| Longer CPU generation | Coherent 108-token answer; about 31-32 tokens/s, eight threads |

These are short functional checks and a single-host timing sample, not a
general capability benchmark. The small model still has instruction-following
limits: wording a task as "using bitnet" led it to invent a Bitnet programming
language and ignore a requested one-word answer, despite transport completion.
The plain classification request succeeded. Review generated plans and answers.

Planning now gives explicit string-ID examples and retains the original request
with each task, because the model initially emitted numeric IDs and omitted the
sentence to classify. Graph, provider, approval and size validation remain in
force. No model output is treated as trusted application configuration.

Embedding models, other BitNet checkpoints and GPU inference were not tested.
Gemini API and loaded LM Studio planning remain separate validation work.
The native model and compiled binaries are local assets; only the build helper,
small compatibility patch, template and documentation are committed.

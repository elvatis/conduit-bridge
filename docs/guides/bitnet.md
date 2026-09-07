# BitNet on Windows

BitNet is an optional local language-model provider for Conduit Bridge. It runs
through a native `llama-server` built from Microsoft's BitNet project, stays on
your machine, and is exposed through the same bridge endpoint as the other
providers.

## What BitNet is useful for

BitNet models use a compact low-bit architecture intended to make local inference
more practical on ordinary CPU hardware. In Conduit, BitNet is a separate local
provider with no API key and no cloud fallback. It is a good fit for:

- Offline classification, extraction, and short transformations
- Private experiments where a local model is preferred
- Simple planning or task splitting when its output will be reviewed
- Testing local-provider routing and streaming

The validated 2B-4T model is a small CPU model. It can make instruction-following
mistakes, invent details, and struggle with long or complex tasks. Review plans,
code, and factual claims before using them. It is not an automatic replacement
for a larger model or a safety boundary for a workspace action.

## How it fits into Conduit

Conduit keeps BitNet separate from LM Studio:

| Component | Default address | Responsibility |
| --- | --- | --- |
| Conduit Bridge | `http://127.0.0.1:31338` | Dashboard, model routing, authorization, and OpenAI-compatible API |
| BitNet native server | `http://127.0.0.1:8080` | Local CPU inference for the configured GGUF model |
| BitNet provider | `bitnet/auto` or `bitnet/2B-4T` | The model IDs selected in Conduit requests |

Once `BITNET_MODEL_PATH` and an available native server are configured, Conduit
automatically starts local inference after its HTTP listener is up. Startup is
optional and does not block the rest of the gateway when the model or binary is
missing. A healthy existing loopback server is reused without taking ownership.
The bridge stops its own native child during graceful shutdown.

## Prerequisites

To reproduce the tested Windows build, install:

- Git
- Visual Studio Build Tools with C++, Windows SDK, CMake, and Ninja
- `clang-cl.exe` on `PATH`
- A local BitNet GGUF model file

The model is intentionally not bundled or downloaded by Conduit. GGUF files are
large local runtime assets and are excluded from Git.

## Build the native server

From the bridge repository, run:

```powershell
./scripts/bitnet/build-windows.ps1
```

The helper fetches the pinned upstream source when needed, verifies its revisions,
applies the checked-in compatibility patch, and builds CPU release executables.
It refuses an existing source tree at another revision so a rebuild cannot silently
mix sources. Use `-SourceDirectory` with a new directory when a separate checkout
is required.

The usual output is:

```text
.ai/logs/bitnet-native/BitNet/build-native/bin/llama-server.exe
```

The build is native and does not need Conda, a Python environment, package
installation, or model conversion. Stop a running BitNet server before rebuilding.

## Configure the bridge

Create or update an ignored `.env` file with absolute paths for your machine:

```dotenv
BITNET_URL=http://127.0.0.1:8080
BITNET_MODEL_PATH=C:/models/ggml-model-i2_s.gguf
BITNET_SERVER_BINARY=C:/work/conduit-bridge/.ai/logs/bitnet-native/BitNet/build-native/bin/llama-server.exe
BITNET_TOKENIZER_PRE=llama-bpe
BITNET_CHAT_TEMPLATE_PATH=C:/work/conduit-bridge/scripts/bitnet/chat-2b4t.jinja
BITNET_THREADS=8
BITNET_CTX_SIZE=2048
BITNET_AUTOSTART=true
```

Restart Conduit Bridge after editing `.env`. `BITNET_TOKENIZER_PRE` and
`BITNET_CHAT_TEMPLATE_PATH` are host-controlled compatibility settings, not
arbitrary request arguments. The bridge accepts only an absolute regular GGUF
model path and a bounded template path.

For the validated Microsoft b1.58 2B-4T GGUF, the tokenizer preset and template
are needed because that GGUF has older metadata. The build helper includes a
small architecture-specific compatibility patch for the model's `relu2`
activation. Other BitNet variants retain their prior behavior.

## Start, inspect, and stop the local server

Run these commands with an administrator platform identity when bridge
authentication is enabled. The `approved: true` field records a deliberate native
process action.

Autostart uses `BITNET_URL` to select a free loopback port, with two threads and
2048 context tokens by default. The example above selects the eight threads used
in local validation. Set `BITNET_AUTOSTART=false` to keep manual lifecycle control.
`autoStart.state` in the status response explains `ready`, `external`, `disabled`,
`unconfigured` or `failed` startup. No model is downloaded automatically.

For a manual start when no owned server is already running:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"start","approved":true,"threads":8,"ctx_size":2048}'
```

Check only the process Conduit itself owns:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"status"}'
```

Stop it explicitly when finished:

```powershell
Invoke-RestMethod http://127.0.0.1:31338/api/bitnet/server `
  -Method Post -ContentType application/json `
  -Body '{"action":"stop","approved":true}'
```

The bridge starts the server only when port 8080 is free. It writes an ownership
record under the Conduit runtime directory and refuses to adopt or kill a process
from a stale PID file. Autostart removes a stale ownership record only when both
its recorded owner and child PIDs are confirmed absent. A live external process
is never terminated or adopted.

## Send an inference request

After the status call reports `running: true`, use a BitNet model ID through the
normal bridge API:

```bash
curl http://127.0.0.1:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bitnet/2B-4T",
    "messages": [{"role": "user", "content": "Classify as positive or negative: I enjoyed this."}]
  }'
```

Available built-in aliases include `bitnet/auto`, `bitnet/2B-4T`,
`bitnet/embedding-0.6B`, and `bitnet/embedding-270M`. The currently reachable
native server may advertise additional discoverable models.

## Validated setup and limits

The native Windows setup was validated on 2026-09-07 with Microsoft's b1.58
2B-4T GGUF, a Ryzen Threadripper 3960X, Clang 22.1.8, and Visual Studio Build
Tools 2026. Short checks covered model loading, arithmetic, German translation,
streaming, lifecycle start/stop, local task planning, and a simple offline
classification request. The observed longer CPU generation rate was about
31-32 tokens per second with eight threads on that machine.

Those checks are a functional sample, not a capability benchmark. Embeddings,
other BitNet checkpoints, GPU inference, and all possible hardware combinations
need separate validation. The [additional integration report](../validation/addendum.md)
records the exact tested scope and known limits.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| The bridge reports no BitNet provider | Confirm `BITNET_URL`, restart the bridge, and inspect `GET /api/providers/status`. |
| Start rejects the model path | Use an absolute regular `.gguf` file, not a symlink or a directory. |
| Start reports the port is busy | Stop the existing model server or choose an unused valid port in the start request and update `BITNET_URL`. |
| Native server exits during startup | Verify `BITNET_SERVER_BINARY`, model read access, tokenizer preset, and template path. |
| Responses repeat or ignore instructions | Use the documented 2B-4T template and compatibility build; reduce the task to a short, explicit instruction and review the output. |

For the larger provider and local-routing model, return to the
[documentation index](../README.md).

# Getting started

Conduit Bridge is a local desktop service. It starts one listener on
`127.0.0.1:31338`, presents a browser dashboard, and exposes an
OpenAI-compatible `/v1` API to local clients.

## Prerequisites

- Node.js 24 or newer
- Windows Desktop or Linux Desktop
- At least one provider you intend to use: an API key, an authenticated coding
  CLI, LM Studio, or optional BitNet

macOS is not a supported target for the command-line product.

## Install and start

From a checkout of this repository:

```bash
npm install
npm run build
node dist/cli.js start
```

Open <http://127.0.0.1:31338/>. The dashboard should show the provider status
and a chat composer. Verify the service separately if a client cannot connect:

```bash
node dist/cli.js status
curl http://127.0.0.1:31338/health
```

The default bind is loopback only. Keep it that way unless you have deliberately
configured a bearer token and network controls for a different bind.

## Connect a provider

Choose the simplest connection method you already have.

### Coding CLI

Install and sign in to the official provider CLI as the same desktop user that
runs Conduit. The dashboard detects the installed command and its login state.

| Provider | CLI transport |
| --- | --- |
| Claude Code | `cli-claude` |
| Codex CLI | `cli-codex` |
| Antigravity / Gemini-compatible CLI | `cli-gemini` |
| Grok CLI | `cli-grok` |

CLI providers use the CLI's own authentication. Their subscription, account
selection, limits, and terms stay with that provider. They do not require an API
key in Conduit.

### Direct API

Use the Settings page to save a key through the write-only credential form. For
a managed setup, set one of these environment variables before starting Conduit:

| Provider | Environment variable |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Perplexity | `PERPLEXITY_API_KEY` |

Saved Settings credentials are placed in the protected vault. Environment
variables remain useful for short-lived or managed deployments and take
precedence over `.env` files.

### Local inference

Set `LM_STUDIO_URL` for a running LM Studio OpenAI-compatible endpoint.
Installing Conduit alone does not install a local inference engine or model.

For BitNet CPU inference, follow [Install llama-server and BitNet](bitnet.md).
The walkthrough starts with the Windows C++/Clang prerequisites, builds the
BitNet-compatible `llama-server`, downloads and checks the exact GGUF, prints
configuration with your own paths, and verifies a first chat. Each stage has
an expected result and linked troubleshooting. The BitNet build already
includes llama.cpp; a separate Llama model or Ollama installation is not needed.
Linux guidance and its current validation limits are stated separately.

Conduit connects to BitNet at `http://127.0.0.1:8080`, while clients continue
using the bridge at `http://127.0.0.1:31338/v1`. Use `bitnet/auto` for the loaded
model. Its presence in the catalog is not evidence of a working installation;
complete the guide's health and first-answer checks. BitNet has a separate URL
and lifecycle from LM Studio.

## Send a first request

First ask the bridge for the exact model IDs it can currently use:

```bash
curl http://127.0.0.1:31338/v1/models
```

Then replace the example model ID with one from that response:

```bash
curl http://127.0.0.1:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cli-codex/gpt-5.6-sol",
    "messages": [{"role": "user", "content": "Say hello in German."}]
  }'
```

The same endpoint can be configured in an OpenAI-compatible editor or client by
using `http://127.0.0.1:31338/v1` as its base URL. If the bridge has an
`authToken`, send it as a standard `Authorization: Bearer ...` header.

## Work with a repository

For a CLI request that needs a project directory, send an existing absolute
`cwd` and choose the intent explicitly:

```json
{
  "model": "cli-claude/claude-sonnet-5",
  "messages": [{"role": "user", "content": "Plan a safe fix for the failing test."}],
  "cwd": "C:/work/example",
  "mode": "plan"
}
```

`chat` is the default read-only conversation mode. `plan` requests the provider's
planning behavior when available. `agent` is for deliberate workspace work and
requires a valid `cwd`. A working directory narrows the intended scope but is
not an operating-system sandbox. Use a restricted account, VM, or container for
untrusted work.

## Next steps

- Learn where retained data lives and how to back it up in
  [Storage and backups](storage.md).
- Try a reviewed workflow in [Pipeline examples](pipelines.md).
- Configure desktop startup through [Autostart](autostart.md).
- Browse the [documentation index](../README.md) for platform, tool, and client
  details.

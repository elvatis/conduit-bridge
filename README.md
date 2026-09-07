# Conduit Bridge

[![AAHP Verify](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml/badge.svg)](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml)
[![supply-chain-guard](https://img.shields.io/badge/supply--chain--guard-enabled-blue)](https://github.com/homeofe/supply-chain-guard)

**Current version:** 0.9.1

Conduit Bridge is a local, OpenAI-compatible gateway for the AI tools you
already use. It gives desktop clients one loopback endpoint while keeping API
keys, authenticated coding CLIs, local models, conversations, and workspace
access under explicit local control. It runs on Windows Desktop and Linux
Desktop at `127.0.0.1:31338`.

## What it does

| Need | Conduit Bridge provides |
| --- | --- |
| One client endpoint | OpenAI-compatible chat, responses, embeddings, model discovery, metrics, events, and comparison endpoints. |
| Provider choice | Direct APIs, authenticated coding CLIs, LM Studio, and optional local BitNet inference remain separate and independently configurable. |
| Productive local work | A dashboard for chat, models, provider health, projects, budgets, pipelines, governance, and diagnostics. |
| Controlled automation | Bounded agent runs, approval gates, scoped workspaces, versioned skills, provider profiles, and usage estimates. |
| Private local state | Encrypted retained platform data and credentials, with explicit backup, restore, and storage-backend selection. |
| Fast code lookup | Optional local `tgrep` indexing with a native ripgrep fallback. No source code is sent to a model to perform a search. |

## Quick start

Install Node.js 24 or newer, then build and start the bridge:

```bash
npm install
npm run build
node dist/cli.js start
```

Open [the local dashboard](http://127.0.0.1:31338/) and select a connected
model. The bridge listens only on loopback by default.

Confirm that it is healthy and inspect the model IDs available to your account:

```bash
node dist/cli.js status
curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/models
```

For a fuller first-run walkthrough, including provider setup and a first chat
request, see [Getting started](docs/guides/getting-started.md).

## Choose a provider

The provider name describes the transport that Conduit uses. A CLI login and an
API key are intentionally independent: signing in to a coding CLI never
silently enables the matching paid API.

| Transport | Providers | Setup |
| --- | --- | --- |
| Direct API | `claude-api`, `codex-api`, `gemini-api`, `openrouter-api`, `perplexity-api` | Save a key through Settings or set the documented environment variable. |
| Coding CLI | `cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok` | Install and authenticate the provider's official CLI as the same desktop user. |
| Local | `lmstudio`, `bitnet` | Start the local model service. BitNet setup is optional and explicit. |

The dashboard lists each transport separately. It also groups model menus with
CLI models first, so an installed coding CLI remains the natural starting point
for a new chat.

See [provider setup and model catalogs](docs/guides/getting-started.md#connect-a-provider)
for environment-variable names, model discovery, and model overrides.

## Use it from an OpenAI-compatible client

Set the client's base URL to:

```text
http://127.0.0.1:31338/v1
```

Then use a model ID returned by `GET /v1/models`:

```bash
curl http://127.0.0.1:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cli-codex/gpt-5.6-sol",
    "messages": [{"role": "user", "content": "Explain this error in one paragraph."}]
  }'
```

CLI requests optionally accept an absolute `cwd` and `mode`:

```json
{
  "model": "cli-claude/claude-sonnet-5",
  "messages": [{"role": "user", "content": "Review the current test failure."}],
  "cwd": "C:/work/project",
  "mode": "plan"
}
```

`chat` is read-only conversation mode, `plan` uses the provider's planning mode
where available, and `agent` permits workspace work only when `cwd` is supplied.
API and local transports ignore `cwd` and `mode`. The detailed endpoint reference
is in [the integration guide](docs/reference/integrations.md).

## Common tasks

| Task | Guide |
| --- | --- |
| Install, connect a provider, and send a first request | [Getting started](docs/guides/getting-started.md) |
| Run local BitNet CPU inference | [BitNet on Windows](docs/guides/bitnet.md) |
| Index and search a workspace with `tgrep` | [tgrep code search](docs/guides/tgrep.md) |
| Understand files, SQLite, backups, and `CONDUIT_HOME` | [Storage and backups](docs/guides/storage.md) |
| Run reviewed multi-step workflows | [Pipeline examples](docs/guides/pipelines.md) |
| Configure platform conversations, memory, skills, and runs | [Platform guide](docs/guides/platform.md) |
| Enable desktop autostart | [Autostart](docs/guides/autostart.md) |
| Use executable tools and GitHub Projects | [Tools and Projects](docs/guides/tools-and-projects.md) |
| Implement the VS Code protocol | [VS Code bridge](docs/reference/vscode-bridge.md) |

The complete documentation map is available at [docs/README.md](docs/README.md).

## Data, storage, and backups

Conduit does not require a remote database service. On Windows its runtime
directory is `%USERPROFILE%\\.conduit`; on Linux it is `~/.conduit`. Set
`CONDUIT_HOME` before starting the bridge to place all runtime data elsewhere.

New retained platform data uses the encrypted file `platform-state.enc` by
default. SQLite is an opt-in backend and uses `platform.sqlite` in that same
directory. The active backend is shown in **Settings and diagnostics** and at
`GET /v1/platform/storage`.

Before switching backends, download an encrypted backup, save the selected
backend, restart the bridge, and restore the backup. Saving a backend preference
does not move data automatically. Read [Storage and backups](docs/guides/storage.md)
before changing that setting.

Credentials saved through Settings go to the protected credential vault; the
regular configuration stores references rather than the credential values.

## BitNet and local code search

[BitNet](https://github.com/microsoft/BitNet) is an optional family of efficient
local language models. With the supplied native `llama-server` integration,
Conduit can run BitNet CPU inference on your own machine and expose it alongside
other local models. It is useful for lightweight offline classification, short
planning, and private experiments. It is not a substitute for reviewing model
output or for a larger model on complex work. The [BitNet guide](docs/guides/bitnet.md)
covers the model, reproducible Windows build, configuration, start command,
verification, and limits.

[`tgrep`](https://github.com/microsoft/tgrep) is a separate optional local code
search tool. It builds a per-workspace trigram index outside the source tree and
answers regex-style searches quickly. Conduit uses its loopback JSON-RPC daemon
when available, its CLI when installed, and ripgrep as the final fallback. Read
the [tgrep guide](docs/guides/tgrep.md) for indexing, daemon management, security
boundaries, and troubleshooting.

## Pipelines and agent runs

Pipelines let you compose several provider steps with dependencies, limits, and
approval checkpoints. The included examples demonstrate a controlled file write
and review, a pause for approval, and a parallel debate:

```bash
node scripts/demo-pipelines.mjs \
  --model <model-id> \
  --peer-model <model-id> \
  --allow-write-demo \
  --approve-demo
```

Use model IDs from your own `/v1/models` response. The script creates a fresh
scratch workspace and retains a local result report for inspection. The
[pipeline guide](docs/guides/pipelines.md) explains each example, its safeguards,
and how to inspect a run in the dashboard.

## Configuration

The bridge works without a configuration file. Dashboard Settings is the
preferred place to store API credentials. For managed or headless startup, copy
the relevant placeholders from [`.env.example`](.env.example) into an ignored
`.env` file:

```dotenv
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
LM_STUDIO_URL=http://127.0.0.1:1234
BITNET_URL=http://127.0.0.1:8080
```

The bridge reads a `.env` in its startup directory, then one in its runtime
directory. Existing process environment variables always win. Never commit an
actual key or place one in a URL or command argument.

For desktop autostart, follow [the autostart guide](docs/guides/autostart.md).

## Release overview

The canonical, complete history is [CHANGELOG.md](CHANGELOG.md). This short
overview helps choose an upgrade path.

| Version | Highlights |
| --- | --- |
| 0.9.1 | Release and documentation gates now run in CI, security scanning is enforced, and release tags are checked before publishing. |
| 0.9.0 | Model records gained `context_window` and `max_output_tokens` metadata. |
| 0.8.1 | Model records gained transport-specific `max_prompt_chars` where a CLI imposes one. |
| 0.8.0 | Windows CLI prompt delivery was fixed; model catalogs gained runtime discovery and local overrides. |
| 0.7.0 | Chat completions gained explicit `chat`, `plan`, and `agent` modes. |
| 0.6.0 | CLI chat requests gained an optional workspace `cwd`. |
| 0.5.2 | Provider transports were separated into API, CLI, and local categories; browser-session providers were removed. |

### 0.9.1

The current release strengthens the release path and documentation checks. It
does not change provider request behavior. See [the 0.9.1 release notes](CHANGELOG.md#091---2026-09-03)
for the complete Added, Changed, and Fixed entries.

## Develop and verify

```bash
npm run typecheck
npm run build
npx --no-install aahp check .
npm run scan:secrets
```

Use focused Vitest files while working locally. The full suite runs in CI because
it is intentionally slow on this Windows development machine. Contributor and
release information is in [CONTRIBUTING.md](CONTRIBUTING.md) and
[the release guide](docs/operations/releasing.md).

## License

Apache-2.0

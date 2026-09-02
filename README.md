# Conduit Bridge

[![AAHP Verify](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml/badge.svg)](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml)
[![supply-chain-guard](https://img.shields.io/badge/supply--chain--guard-enabled-blue)](https://github.com/homeofe/supply-chain-guard)
[![scanned by supply-chain-guard](https://img.shields.io/badge/scanned%20by-supply--chain--guard-2ea44f?logo=npm&logoColor=white)](https://github.com/homeofe/supply-chain-guard)

Conduit Bridge is a local OpenAI-compatible gateway for direct provider APIs,
authenticated coding CLIs, and LM Studio. It runs on Windows Desktop and Linux
Desktop and exposes one loopback listener at `127.0.0.1:31338`.

## Provider model

Authentication is deliberately separated by transport:

| Category | Providers | Authentication |
| --- | --- | --- |
| API | `claude-api`, `codex-api`, `gemini-api`, `openrouter-api`, `perplexity-api` | Dedicated API key in Settings or a provider environment variable |
| CLI | `cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok` | The installed CLI's own login |
| Local | `lmstudio` | Running local LM Studio endpoint |

CLI authentication never makes the similarly named API provider appear
configured. If a user has both an authenticated CLI and an API key, both
providers are visible and usable independently.

Browser-session providers and all `web-*` model routes have been removed.
They were not reliable enough across provider security checks for a
community-maintained gateway.

## Requirements

- Node.js 24 or newer
- Windows Desktop or Linux Desktop
- Any provider CLIs you want to use, installed and authenticated normally
- API keys only for the direct API providers you choose

## Install and run

```bash
npm install
npm run build
node dist/cli.js start
```

Open <http://127.0.0.1:31338/>. The dashboard has separate navigation pages for
API, CLI, and local providers.

Check the running bridge:

```bash
node dist/cli.js status
curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/models
```

## Configure API credentials

Use the write-only Settings forms in the dashboard. Credentials may also be
provided with:

| Provider | Environment variable |
| --- | --- |
| `claude-api` | `ANTHROPIC_API_KEY` |
| `codex-api` | `OPENAI_API_KEY` |
| `gemini-api` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `openrouter-api` | `OPENROUTER_API_KEY` |
| `perplexity-api` | `PERPLEXITY_API_KEY` |

The bridge reports only the credential source, never the credential value.
Values stored through Settings live in `%USERPROFILE%\.conduit\config.json`
on Windows or `~/.conduit/config.json` on Linux.

## CLI providers

Authenticate each installed tool using its official login flow:

- `cli-claude` — Claude Code
- `cli-codex` — Codex CLI
- `cli-gemini` — the configured Gemini-compatible CLI
- `cli-grok` — Grok CLI

Conduit invokes these tools non-interactively for requests. Provider accounts,
subscriptions, usage limits, and terms remain controlled by each provider.

## OpenAI-compatible API

Client base URL:

```text
http://127.0.0.1:31338/v1
```

Important endpoints:

```text
GET  /health
GET  /v1/status
GET  /v1/models
GET  /v1/capabilities
GET  /v1/metrics
POST /v1/chat/completions
POST /v1/responses
POST /v1/embeddings
POST /v1/compare
WS   /v1/events
```

Use the exact model IDs returned by `GET /v1/models`, such as
`cli-grok/grok-4.6`, `api-perplexity/sonar`, or `lmstudio/auto`.

`POST /v1/chat/completions` accepts optional `cwd` (absolute existing path)
and `mode` (`chat` | `plan` | `agent`). CLI providers run in `cwd` so editors
like conduit-vscode can pass the workspace folder.

- `chat` (default): read-only chat proxy. Native plan/read-only flags.
- `plan`: each CLI's native plan function (Claude `--permission-mode plan`,
  agy `--mode plan`, Grok `--permission-mode plan`, Codex read-only sandbox).
- `agent`: workspace write. Requires `cwd`. Aliases: `agentic: true` → agent,
  `plan: true` → plan.

API and LM Studio transports ignore `cwd` and `mode`.

## Configuration

The default configuration is:

```json
{
  "host": "127.0.0.1",
  "port": 31338,
  "logLevel": "info",
  "apiKeys": {},
  "allowedOrigins": ["http://localhost", "http://127.0.0.1"],
  "authToken": "",
  "rateLimit": { "perMinute": 60, "maxConcurrent": 16 }
}
```

Keep the listener on loopback. External binds require an authentication token
and careful network controls.

## Desktop autostart

Windows:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

Linux Desktop:

```bash
npm run build
./scripts/install-autostart.sh
```

See [docs/AUTOSTART.md](docs/AUTOSTART.md) for verification and uninstall.

## Development and security checks

```bash
npm test
npm run typecheck
npm run build
git diff --check
npm run scan:secrets
npm run scan:secrets:history
npm audit --omit=dev
```

Prompts, responses, tokens, cookies, and credentials must never be committed or
written to operational logs. Runtime state belongs below `.conduit`.

## Changelog

### Unreleased

CLI `mode` on chat completions: `chat`, `plan`, or `agent`. Agent requires `cwd`.

### 0.6.0

Optional `cwd` on chat completions for CLI providers. See
[CHANGELOG.md](CHANGELOG.md).

### 0.5.2

Desktop gateway for independent API, CLI, and local transports. Browser-session
`web-*` providers and Playwright are removed. Control-plane fixes: CSRF honors
`allowedOrigins`, dashboard works with `authToken`, CLI connected means
authenticated, activity redacts secrets, and `CONDUIT_HOME` is shared. See
[CHANGELOG.md](CHANGELOG.md) for the full list.

### 0.5.1

See [CHANGELOG.md](CHANGELOG.md#051---2026-08-21).

## License

Apache-2.0

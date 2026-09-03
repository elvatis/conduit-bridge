# Conduit Bridge

[![AAHP Verify](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml/badge.svg)](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml)
[![supply-chain-guard](https://img.shields.io/badge/supply--chain--guard-enabled-blue)](https://github.com/homeofe/supply-chain-guard)
[![scanned by supply-chain-guard](https://img.shields.io/badge/scanned%20by-supply--chain--guard-2ea44f?logo=npm&logoColor=white)](https://github.com/homeofe/supply-chain-guard)

**Current version:** 0.9.1

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

- `cli-claude` - Claude Code
- `cli-codex` - Codex CLI
- `cli-gemini` - the configured Gemini-compatible CLI
- `cli-grok` - Grok CLI

Conduit invokes these tools non-interactively for requests. Provider accounts,
subscriptions, usage limits, and terms remain controlled by each provider.

### CLI model catalogs

`cli-gemini` and `cli-grok` learn their catalogs at runtime from `agy models`
and `grok models`, so a new model release appears on its own. `cli-claude` and
`cli-codex` cannot - neither binary has a model-listing subcommand - so their
lists ship as defaults.

Any of the four can be overridden from `~/.conduit/models.json` (or the path in
`CONDUIT_MODELS_FILE`) with no rebuild:

```json
{
  "cli-claude": ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  "cli-codex": [{ "id": "gpt-5.6-sol", "displayName": "GPT-5.6 Sol" }]
}
```

Add whichever id the vendor ships next; the bridge does not need to know it in
advance, and the ids above are only the current defaults. To see what a CLI
offers today:

| CLI | how to list its models |
| --- | --- |
| `agy` | `agy models` |
| `grok` | `grok models` |
| `codex` | run `codex`, then `/model` - it has no non-interactive listing |
| `claude` | no listing of any kind; use this file |

`cli-codex` discovers its catalog over HTTP from ChatGPT's own Codex model
endpoint, which reports the account's real entitlements.

A prefix names the **transport**, not the vendor. `agy` resells Anthropic and
GPT-OSS models alongside Google's, and those are advertised too - reaching
Claude Sonnet through an Antigravity subscription is a different quota, auth
and rate limit than reaching it through an Anthropic one, which is the point:

```
cli-gemini/claude-sonnet-4-6   Claude Sonnet 4.6 (Thinking) (agy CLI)   owned_by: agy
cli-claude/claude-sonnet-5     claude-sonnet-5 (Claude Code CLI)        owned_by: claude-code
```

Ids stay unique because the prefixes differ, and `owned_by` names the CLI that
answers rather than guessing the model's author from its id - `gpt-oss-120b` is
OpenAI's open-weight model but is not obtainable from OpenAI, so calling it
`openai` would advertise a route that does not exist. To restrict a provider
to one vendor, pin it in `models.json`.

Naming a provider **pins** it: that list is served verbatim and runtime
discovery is skipped for it - the escape hatch for a CLI that is offline or
whose `models` output cannot be parsed. Providers the file does not mention are
unaffected. Edits are picked up on the next `POST /v1/models/refresh`, without
restarting the bridge. An entry that is malformed, empty, or has no valid model
ids is ignored in favour of the built-in defaults.

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

### 0.9.1

- Governance only; no runtime change. The AAHP gates that had been reporting
  SKIP since this repository was created now run in CI: version-sync against
  three documented sites, doc-links, and the NEXT_ACTIONS freshness check.
- `aahp check` runs in CI at all, for the first time. It had never run, so
  forbidden-patterns was failing on main unseen with 51 banned em dash
  characters across 50 lines. Those are removed.
- The AAHP gate no longer exempts Dependabot. It stayed a required check while
  reporting success without looking, which branch protection renders as green.
- `.github/workflows/release.yml` gates the tag path, which had no gate at all:
  tags are unprotected and main had no required status checks. It publishes no
  asset, because this project ships none.
- Required status checks now exist on main, verified by a throwaway pull request
  that was correctly blocked.
- New `CLAUDE.md`; SECURITY.md gained a Supported Versions section.

### 0.9.0

`/v1/models` reports `context_window` and `max_output_tokens`, so a client no
longer needs its own model table. See [CHANGELOG.md](CHANGELOG.md).

### 0.8.1

`/v1/models` reports `max_prompt_chars` where the transport bounds the prompt.
See [CHANGELOG.md](CHANGELOG.md).

### 0.8.0

Unbreaks the CLI providers on Windows (the prompt reached them as its first line
only), separates `chat` from `plan`, stops `cwd` falling back to the home
directory, and replaces the hardcoded model catalogs with runtime discovery plus
an overridable `models.json`. Providers with no credential no longer advertise
models. See [CHANGELOG.md](CHANGELOG.md).

### 0.7.0

CLI `mode` on chat completions: `chat`, `plan`, or `agent`. Agent requires `cwd`.
See [CHANGELOG.md](CHANGELOG.md).

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

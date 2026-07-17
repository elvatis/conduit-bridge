# conduit-bridge

[![AAHP Verify](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml/badge.svg)](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml)

**Current version:** `0.2.6`

Standalone OpenAI-compatible HTTP proxy that bridges local AI sessions (Grok, Claude, Gemini, ChatGPT) via persistent headless browser contexts, plus direct API providers (Anthropic, Google, OpenAI Codex), OpenAI-compatible aggregators (OpenRouter, Perplexity), and local backends (LM Studio, Grok CLI).

No OpenClaw required. Works on any machine with Node.js 20+ and Chromium.

> Part of the [Conduit](https://github.com/elvatis/conduit-vscode) ecosystem, powers the conduit-vscode VS Code extension.

---

## How It Works

conduit-bridge launches Chromium via Playwright, logs into AI provider websites on your behalf, and exposes them as a local OpenAI-compatible API. Sessions are persisted to disk so you only need to log in once.

```
Your app / VS Code extension
        ↓  OpenAI API (HTTP)
conduit-bridge :31338
        ↓  Playwright (headless Chromium)
Grok / Claude / Gemini / ChatGPT
```

---

## Available Models

Web providers use browser session cookies (no API key); API providers require an API key in `~/.conduit/config.json` (`anthropicApiKey`, `googleApiKey`, OAuth via the OpenAI Codex CLI).

### Web (browser-automated)

| Model ID | Provider | Description |
|---|---|---|
| `web-grok/grok-fast` | Grok | Grok Fast |
| `web-grok/grok-expert` | Grok | Grok Expert |
| `web-grok/grok-heavy` | Grok | Grok Heavy |
| `web-grok/grok-auto` | Grok | Grok Auto |
| `web-claude/claude-opus` | Claude | Claude Opus 4.8 |
| `web-claude/claude-sonnet` | Claude | Claude Sonnet 5 |
| `web-claude/claude-haiku` | Claude | Claude Haiku 4.5 |
| `web-claude/claude-sonnet-4-5` | Claude | Claude Sonnet 4.5 |
| `web-claude/claude-opus-4-5` | Claude | Claude Opus 4.5 |
| `web-gemini/gemini-3.5-flash` | Gemini | Gemini 3.5 Flash |
| `web-gemini/gemini-3.5-pro` | Gemini | Gemini 3.5 Pro |
| `web-gemini/gemini-3.1-pro` | Gemini | Gemini 3.1 Pro |
| `web-chatgpt/gpt-5.5-instant` | ChatGPT | GPT-5.5 Instant |
| `web-chatgpt/gpt-5.5-thinking` | ChatGPT | GPT-5.5 Thinking |
| `web-chatgpt/gpt-5.5-pro` | ChatGPT | GPT-5.5 Pro |

### API (direct SDK)

| Model ID | Provider | Description |
|---|---|---|
| `api-claude/claude-fable-5` | Claude API | Claude Fable 5 |
| `api-claude/claude-opus-4-8` | Claude API | Claude Opus 4.8 |
| `api-claude/claude-sonnet-5` | Claude API | Claude Sonnet 5 |
| `api-claude/claude-opus-4-7` | Claude API | Claude Opus 4.7 |
| `api-claude/claude-opus-4-6` | Claude API | Claude Opus 4.6 |
| `api-claude/claude-sonnet-4-6` | Claude API | Claude Sonnet 4.6 |
| `api-claude/claude-haiku-4-5` | Claude API | Claude Haiku 4.5 |
| `api-claude/claude-sonnet-4-5` | Claude API | Claude Sonnet 4.5 |
| `api-gemini/gemini-3.5-flash` | Gemini API | Gemini 3.5 Flash |
| `api-gemini/gemini-3.1-flash-lite` | Gemini API | Gemini 3.1 Flash-Lite |
| `api-gemini/gemini-3.1-pro` | Gemini API | Gemini 3.1 Pro |
| `api-codex/gpt-5.5` | Codex API | GPT-5.5 |
| `api-codex/gpt-5.5-pro` | Codex API | GPT-5.5 Pro |
| `api-codex/gpt-5.4` | Codex API | GPT-5.4 |
| `api-codex/gpt-5.4-mini` | Codex API | GPT-5.4 mini |
| `api-codex/gpt-5.4-pro` | Codex API | GPT-5.4 Pro |

### OpenAI-compatible aggregators

One API key each; any `<prefix>/<model>` is accepted (passthrough), so you're never limited to the curated list below. Keys are read from config (`conduit-bridge config apiKeys.<provider> <key>`) or the corresponding env var.

| Model ID (example) | Provider | Key |
|---|---|---|
| `api-openrouter/anthropic/claude-opus-4-8` | OpenRouter | `OPENROUTER_API_KEY` |
| `api-openrouter/openai/gpt-5.5` | OpenRouter | `OPENROUTER_API_KEY` |
| `api-openrouter/deepseek/deepseek-r1` | OpenRouter | `OPENROUTER_API_KEY` |
| `api-perplexity/sonar-pro` | Perplexity | `PERPLEXITY_API_KEY` |
| `api-perplexity/sonar-reasoning-pro` | Perplexity | `PERPLEXITY_API_KEY` |
| `api-perplexity/anthropic/claude-opus-4-8` | Perplexity | `PERPLEXITY_API_KEY` |

### Local (no API key)

| Model ID | Provider | Notes |
|---|---|---|
| `lmstudio/auto` | LM Studio | Uses whichever model is loaded in LM Studio |
| `lmstudio/<model>` | LM Studio | Any model reported by LM Studio's `/v1/models` (discovered live). Set `LM_STUDIO_URL` to override `http://127.0.0.1:1234` |
| `cli-grok/grok-4.5` | Grok CLI | Runs the local `grok` CLI (`--prompt-file` headless mode). Requires the CLI installed + `grok login` |
| `cli-grok/grok-4` / `grok-3` / `grok-3-fast` / `grok-3-mini` / `grok-3-mini-fast` | Grok CLI | Additional Grok CLI models |

The live model list is always available at `GET /v1/models`.

---

## Installation

```bash
# From source (conduit-bridge is run from source, not published to npm)
git clone https://github.com/elvatis/conduit-bridge
cd conduit-bridge
npm install
npm run build
```

---

## Usage

### Start the proxy
```bash
node dist/cli.js start
# or after npm install -g:
conduit-bridge start
```

Options:
```
--port=31338        Port to listen on (default: 31338)
--host=127.0.0.1    Host to bind to
--log-level=info    Log level: silent | info | debug
```

### Log into a provider (first time)
```bash
conduit-bridge login grok
conduit-bridge login claude
conduit-bridge login gemini
conduit-bridge login chatgpt
```
A browser window opens. Log in as you normally would. The session is saved to `~/.conduit/profiles/` and restored automatically on next start.

### Check status
```bash
conduit-bridge status
```

---

## API

The proxy implements the OpenAI API:

### `GET /health`
```json
{ "status": "ok", "service": "conduit-bridge", "version": "0.2.6" }
```

### `GET /v1/models`
Returns all available models in OpenAI format.

### `GET /v1/status`
Returns rich provider status:
```json
{
  "running": true,
  "port": 31338,
  "version": "0.2.6",
  "uptime": 3600,
  "providers": [
    {
      "name": "grok",
      "connected": true,
      "hasProfile": true,
      "sessionValid": true,
      "models": ["web-grok/grok-3", "web-grok/grok-3-fast", "..."]
    }
  ]
}
```

### `POST /v1/chat/completions`
Standard OpenAI chat completions. Supports `stream: true`.
```json
{
  "model": "web-grok/grok-3",
  "messages": [{"role": "user", "content": "Hello!"}],
  "stream": true
}
```

### `POST /v1/login/:provider`
Triggers login flow (opens headful browser).
```
POST /v1/login/grok
POST /v1/login/claude
POST /v1/login/gemini
POST /v1/login/chatgpt
```

### `POST /v1/logout/:provider`
Closes the browser context for that provider.

---

## Security

conduit-bridge is secure by default and binds to `127.0.0.1` only. The options
below are opt-in and backward compatible: leaving them unset behaves exactly as
before.

### Secure defaults

- **Chromium sandbox stays ON.** The OS-level Chromium sandbox is no longer
  disabled by default (the old `--no-sandbox` default was removed).
- **Site isolation stays ON.** The flag that disabled site isolation
  (`--disable-features=IsolateOrigins,site-per-process`) was removed from the
  defaults.
- **CORS is restricted to localhost.** The proxy no longer returns a wildcard
  `Access-Control-Allow-Origin: *`. It reflects the request `Origin` header only
  when the origin is in the allowlist; otherwise no CORS origin is sent.
  Requests without an `Origin` header (curl, server-side OpenAI clients) are
  unaffected and keep working.

### Options

| Option | Config key | CLI / env | Default | Effect |
|---|---|---|---|---|
| Local API auth | `authToken` | `--auth-token=<token>` | `""` (off) | When set, all `/v1/*` endpoints require `Authorization: Bearer <token>` (401 otherwise). `/health` stays open. |
| CORS allowlist | `allowedOrigins` | config file | `["http://localhost","http://127.0.0.1"]` | Origins allowed to receive a reflected CORS header. The server's own `host:port` loopback origins are always included. |
| Chromium sandbox opt-out | `chromiumNoSandbox` | `--no-sandbox=true` / `CONDUIT_NO_SANDBOX=1` | `false` | When true, launches Chromium with `--no-sandbox`. Only enable for environments that require it (e.g. running as root inside a container). |

### Enabling local auth

```bash
# Persist a token in ~/.conduit/config.json
conduit-bridge config authToken my-secret-token

# Or set it per-invocation
conduit-bridge start --auth-token=my-secret-token
```

Then call the API with the token:

```bash
curl http://127.0.0.1:31338/v1/models \
  -H "Authorization: Bearer my-secret-token"
```

### Re-enabling the Chromium sandbox opt-out

Only if your environment genuinely needs it (for example root inside a
container):

```bash
CONDUIT_NO_SANDBOX=1 conduit-bridge start
# or
conduit-bridge start --no-sandbox=true
# or set "chromiumNoSandbox": true in ~/.conduit/config.json
```

---

## Library Usage

```typescript
import { BridgeServer, loadConfig } from '@elvatis/conduit-bridge';

const cfg = loadConfig({ port: 31338 });
const server = new BridgeServer(cfg);
await server.start();

// Later:
const status = await server.registry.getStatus();
```

---

## File Locations

| Path | Description |
|---|---|
| `~/.conduit/config.json` | Bridge configuration |
| `~/.conduit/profiles/<provider>-profile/` | Playwright persistent browser profiles (cookies) |
| `~/.conduit/<provider>-expiry.json` | Session expiry metadata |

---

## Changelog

### Unreleased
- Add four new providers, ported from the `openclaw-cli-bridge-elvatis` project:
  - **OpenRouter** (`api-openrouter/*`) — OpenAI-compatible aggregator (Anthropic, OpenAI, Google, xAI, DeepSeek, Meta, …) behind `OPENROUTER_API_KEY`
  - **Perplexity** (`api-perplexity/*`) — OpenAI-compatible; native `sonar*` web-search models plus proxied upstreams, behind `PERPLEXITY_API_KEY`
  - **LM Studio** (`lmstudio/*`) — local OpenAI-compatible server with live model discovery; no key. Override the endpoint with `LM_STUDIO_URL`
  - **Grok CLI** (`cli-grok/*`) — drives the local `grok` CLI in `--prompt-file` headless mode; requires the CLI installed
- Passthrough routing: any `api-openrouter/…`, `api-perplexity/…`, `lmstudio/…`, or `cli-grok/…` model id routes to its provider even when not in the curated `/v1/models` list (via a new optional `ownsModel()` hook)
- No new runtime dependencies (reuses the `openai` SDK, `fetch`, and `node:child_process`)

### 0.2.6 - 2026-07-01
- Refresh the non-Claude providers to their mid-2026 lineups (model IDs verified against official vendor docs on 2026-07-01):
  - Gemini API: add `gemini-3.5-flash` (GA) and `gemini-3.1-flash-lite`; drop the fabricated `gemini-3.0-flash` / `gemini-3.0-thinking` IDs (not real Gemini API models); point `gemini-3.1-pro` at `gemini-3.1-pro-preview`
  - OpenAI/Codex API: add `gpt-5.5` and `gpt-5.5-pro` (GA); drop `codex-mini` (removed from the API 2026-02-12), `o3`, and the `-thinking`/`-instant` names that are ChatGPT effort labels rather than API model IDs
  - Web labels refreshed: Grok Fast/Expert/Heavy/Auto, Gemini 3.5 Flash / 3.5 Pro, ChatGPT GPT-5.5 Instant/Thinking/Pro
- Web selection remains advisory (the browser providers do not switch the model in the UI)

### 0.2.5 - 2026-07-01
- Add Claude Fable 5 (`api-claude/claude-fable-5`) and Claude Opus 4.7 (`api-claude/claude-opus-4-7`) to the Claude API provider

### 0.2.4 - 2026-07-01
- Add Claude Opus 4.8 (`api-claude/claude-opus-4-8`) and Claude Sonnet 5 (`api-claude/claude-sonnet-5`) to the Claude API provider
- Refresh the web Claude labels to the current claude.ai tiers (Opus 4.8, Sonnet 5)
- Fix stale Claude API model strings: `claude-sonnet-4-6`, `claude-opus-4-6`, and `claude-sonnet-4-5` were mapped to non-existent date-suffixed snapshots (would 404); now use the bare aliases

### 0.2.3 - 2026-05-17
- Bump @anthropic-ai/sdk to ^0.95.1
- Bump openai to ^6.37.0
- Bump vitest to ^4.1.5 and @types/node to ^25.6.2
- Closes Dependabot PRs #19, #20, #21, #22

### 0.2.2 - 2026-05-05
- Bump @anthropic-ai/sdk to ^0.94.0
- Bump typescript to ^6.0.2 (typecheck still clean, no API changes)
- Closes Dependabot PRs #8 and #15

### 0.2.1 - 2026-05-05
- Security: bump @anthropic-ai/sdk to ^0.91.1 (GHSA-p7fg-763f-g4gf, insecure default file permissions in BetaLocalFilesystemMemoryTool)
- Security: bump vite (transitive via vitest) to 8.0.5 (GHSA-4w7w-66w2-5vf9 path traversal in .map handling)
- Bump playwright to ^1.59.1, esbuild to ^0.28.0, @types/node to ^25.6.0

### 0.2.0
- Added direct API providers: `claude-api`, `gemini-api`, `codex-api`
- Refreshed web model lineup: Grok Expert/Fast/Heavy/4.20 Beta, Claude 4.5/4.6, Gemini 3.x, GPT-5.x
- Switched to `tsc --noEmit` typecheck plus esbuild bundling for `dist/`
- Provider keepalive plus session expiry tracking
- Hardened URL parsing in proxy router

### 0.1.0 - 2026-03-12
- Initial release
- HTTP proxy server with OpenAI-compatible API
- 4 web providers: Grok, Claude, Gemini, ChatGPT (15 models total)
- Persistent browser profiles with automatic session restore
- CLI: `conduit-bridge start|status|login|config`
- Library API for embedding in other tools (conduit-vscode)

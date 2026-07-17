# conduit-bridge

[![AAHP Verify](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml/badge.svg)](https://github.com/elvatis/conduit-bridge/actions/workflows/aahp-verify.yml)

**Current version:** `0.2.6`

Standalone OpenAI-compatible HTTP proxy that bridges local AI sessions (Grok, Claude, Gemini, ChatGPT) via persistent headless browser contexts, plus direct API providers (Anthropic, Google, OpenAI Codex).

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

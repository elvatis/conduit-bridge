# conduit-bridge

**Current version:** `0.2.0` — pre-release

Standalone OpenAI-compatible HTTP proxy that bridges local AI sessions (Grok, Claude, Gemini, ChatGPT) via persistent headless browser contexts.

No OpenClaw required. Works on any machine with Node.js 20+ and Chromium.

> Part of the [Conduit](https://github.com/elvatis/conduit-vscode) ecosystem — powers the conduit-vscode VS Code extension.

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

| Model ID | Provider | Description |
|---|---|---|
| `web-grok/grok-3` | Grok | Grok 3 (default) |
| `web-grok/grok-3-fast` | Grok | Grok 3 Fast |
| `web-grok/grok-3-mini` | Grok | Grok 3 Mini |
| `web-grok/grok-2` | Grok | Grok 2 |
| `web-claude/claude-sonnet` | Claude | Claude Sonnet |
| `web-claude/claude-opus` | Claude | Claude Opus |
| `web-claude/claude-haiku` | Claude | Claude Haiku |
| `web-gemini/gemini-2-5-pro` | Gemini | Gemini 2.5 Pro |
| `web-gemini/gemini-2-5-flash` | Gemini | Gemini 2.5 Flash |
| `web-gemini/gemini-3-pro` | Gemini | Gemini 3 Pro |
| `web-gemini/gemini-3-flash` | Gemini | Gemini 3 Flash |
| `web-chatgpt/gpt-4o` | ChatGPT | GPT-4o |
| `web-chatgpt/gpt-o3` | ChatGPT | GPT o3 |
| `web-chatgpt/gpt-o4-mini` | ChatGPT | GPT o4-mini |
| `web-chatgpt/gpt-5` | ChatGPT | GPT-5 |

---

## Installation

```bash
# From source (until npm publish)
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
{ "status": "ok", "service": "conduit-bridge", "version": "0.2.0" }
```

### `GET /v1/models`
Returns all available models in OpenAI format.

### `GET /v1/status`
Returns rich provider status:
```json
{
  "running": true,
  "port": 31338,
  "version": "0.2.0",
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

### 0.1.0 — 2026-03-12
- Initial release
- HTTP proxy server with OpenAI-compatible API
- 4 providers: Grok, Claude, Gemini, ChatGPT (15 models total)
- Persistent browser profiles with automatic session restore
- CLI: `conduit-bridge start|status|login|config`
- Library API for embedding in other tools (conduit-vscode)

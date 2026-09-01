# Conduit Bridge

Conduit Bridge is a standalone OpenAI-compatible gateway for browser sessions, provider APIs, coding CLIs, and LM Studio.

No OpenClaw installation is required. It runs on any machine with Node.js 24 or newer and Chromium.

## What it provides

- One OpenAI-compatible base URL: `http://127.0.0.1:31338/v1`
- Browser providers for Grok, Claude, Gemini, ChatGPT, and Perplexity
- Direct API providers for Anthropic, Google, OpenAI, OpenRouter, and Perplexity
- Local CLI providers for Grok CLI, Codex CLI, Claude Code, and Gemini or Antigravity CLI
- LM Studio passthrough
- Streaming chat completions, Responses, and embeddings
- Ordered fallbacks and multi-model orchestration
- Persistent metrics, sanitized activity, model catalog refresh, and a local dashboard
- Interactive browser login locally or through an SSH tunnel

## Architecture

All user-facing traffic uses port `31338`:

- Dashboard and Help
- OpenAI-compatible API
- Provider status and settings
- WebSocket activity events
- Browser-login page frames and input

Browser login does not require a remote-desktop stack. Conduit starts ordinary headed Chromium, then attaches over a private loopback DevTools endpoint. The browser keeps its native identity and reports `navigator.webdriver === false`.

On a desktop, Chromium is visible locally. On a remote Linux server, Xvfb provides an internal rendering target. The built-in viewer sends JPEG frames and validated pointer and keyboard events through port `31338`.

## Requirements

- Node.js 24 or newer
- npm
- Chromium installed by Playwright
- Linux remote server only: Xvfb

## Install

```bash
git clone https://github.com/elvatis/conduit-bridge.git
cd conduit-bridge
npm install
npx playwright install chromium
npm run build
```

Start the bridge:

```bash
node dist/cli.js start --host=127.0.0.1 --port=31338
```

Open:

```text
http://127.0.0.1:31338/
```

## Local desktop use

Windows, macOS, and desktop Linux need no separate display service.

1. Start Conduit Bridge.
2. Open the dashboard.
3. Open **Providers**.
4. Choose **Start login**.
5. Choose **Open login browser** or use the local Chromium window.
6. Complete sign-in.
7. Choose **Check login status**.

Profiles are stored below `~/.conduit/profiles/` and reused after restart.

## Remote Linux over SSH

Keep the service bound to `127.0.0.1`. From your workstation:

```bash
ssh -L 31338:127.0.0.1:31338 <server>
```

Then open `http://127.0.0.1:31338/` on your workstation.

A server without a desktop needs Xvfb:

```bash
Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
DISPLAY=:99 node dist/cli.js start --host=127.0.0.1 --port=31338
```

Example user services:

```ini
# ~/.config/systemd/user/conduit-xvfb.service
[Unit]
Description=Conduit Bridge virtual display

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
```

```ini
# ~/.config/systemd/user/conduit-bridge.service
[Unit]
Description=Conduit Bridge
After=network-online.target conduit-xvfb.service
Wants=network-online.target conduit-xvfb.service

[Service]
Type=simple
WorkingDirectory=/path/to/conduit-bridge
Environment=DISPLAY=:99
ExecStart=/usr/bin/node /path/to/conduit-bridge/dist/cli.js start --host=127.0.0.1 --port=31338
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
```

Enable them:

```bash
systemctl --user daemon-reload
systemctl --user enable --now conduit-xvfb conduit-bridge
```

Only the bridge listener must be forwarded. Xvfb opens no TCP listener in this configuration.

## Browser login behavior

The dashboard exposes these states:

- `starting`
- `browser_ready`
- `waiting_for_user`
- `verifying`
- `authenticated`
- `challenge_detected`
- `blocked`
- `timeout`
- `failed`
- `cancelled`

Security checks are detected and reported. Conduit never solves, clicks, replays, suppresses, or bypasses them.

Session restore uses the same native browser identity as login. It does not override the user agent or platform. Authentication combines provider-specific positive signals with logged-out vetoes instead of trusting one selector.

See [Browser Login](docs/BROWSER-LOGIN.md) for lifecycle, security details, and troubleshooting.

## Model namespaces

The model prefix selects the transport:

| Prefix | Transport | Examples |
|---|---|---|
| `web-*` | Persistent browser session | `web-grok/grok-fast`, `web-claude/claude-sonnet`, `web-perplexity/sonar-pro` |
| `api-*` | Direct API or aggregator | `api-claude/claude-sonnet-5`, `api-openrouter/openai/gpt-5.6-sol` |
| `cli-*` | Installed local CLI | `cli-codex/gpt-5.6-sol`, `cli-claude/first-account/claude-sonnet-5` |
| `lmstudio/*` | LM Studio passthrough | `lmstudio/auto`, `lmstudio/<model>` |

Use `GET /v1/models` as the current source of truth. Catalog entries can be:

- `verified`: returned by a live provider catalog
- `documented`: known from provider material but not verified for the current account
- `dynamic`: arbitrary passthrough IDs are accepted

## API

### Core

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Unauthenticated process health |
| `GET` | `/v1/status` | Provider and restore status |
| `GET` | `/v1/models` | Model catalog |
| `POST` | `/v1/models/refresh` | Refresh supported public catalogs |
| `GET` | `/v1/capabilities` | Provider effort capabilities |
| `GET` | `/v1/metrics` | Persistent local metrics |
| `GET` | `/v1/activity` | Sanitized activity |
| `WS` | `/v1/events` | Live login and activity events |

### OpenAI-compatible

| Method | Route |
|---|---|
| `POST` | `/v1/chat/completions` |
| `POST` | `/v1/responses` |
| `POST` | `/v1/embeddings` |

Chat requests support:

- `stream: true` for SSE
- `fallback_models` for ordered recovery
- `effort` or `reasoning_effort` where supported
- cancellation when the client disconnects

### Login

| Method | Route |
|---|---|
| `POST` | `/v1/login/:provider` |
| `GET` | `/v1/login/:provider/status` |
| `POST` | `/v1/login/:provider/recheck` |
| `POST` | `/v1/login/:provider/cancel` |
| `GET` | `/v1/login/:provider/viewer` |
| `GET` | `/v1/login/:provider/frame` |
| `POST` | `/v1/login/:provider/input` |
| `POST` | `/v1/logout/:provider` |

The frame and input routes are implementation details used by the built-in viewer. They expose no raw DevTools protocol.

### Orchestration

| Method | Route |
|---|---|
| `GET`, `POST` | `/v1/orchestrator` |
| `POST` | `/v1/orchestrator/run` |
| `GET` | `/v1/orchestrator/history` |
| `POST` | `/v1/compare` |

## CLI

```text
conduit-bridge start
conduit-bridge status
conduit-bridge login <provider>
conduit-bridge login <provider> --status
conduit-bridge login <provider> --recheck
conduit-bridge login <provider> --cancel
conduit-bridge login <provider> --local
conduit-bridge config
```

`--local` opens a browser in the CLI process and is intended for a machine with a visible desktop. On a remote server, use the running bridge and its dashboard viewer.

## Configuration

The default configuration file is `~/.conduit/config.json`.

| Key | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | Listener address |
| `port` | `31338` | Dashboard and API port |
| `profileBaseDir` | `~/.conduit/profiles` | Browser profiles |
| `logLevel` | `info` | `silent`, `info`, or `debug` |
| `chromiumNoSandbox` | `false` | Explicit Chromium sandbox opt-out |
| `authToken` | empty | Bearer token required for external binds |
| `allowedOrigins` | loopback origins | Browser origin allowlist |
| `rateLimit.perMinute` | `60` | Per-client request limit |
| `rateLimit.maxConcurrent` | `16` | Per-client concurrency limit |
| `login.windowSize` | `1400x900` | Browser rendering size |
| `login.timings` | built-in defaults | Login state time budgets |

API credentials can be provided through protected environment variables or the dashboard's write-only Settings form. The API never returns stored credential values.

## Security model

- Loopback bind by default
- One SSH-forwarded user-facing port
- Bearer authentication required for non-loopback binds
- Explicit CORS origin allowlist
- Cross-site state changes rejected
- WebSocket Origin validation
- Provider browser profiles separated by provider
- Cookie checks scoped to the provider origin and cookie names only
- URL queries and fragments stripped from diagnostics
- No prompt, response, cookie, token, or credential content in metrics and activity
- Secret scan covers tracked and untracked files

The browser viewer carries sensitive sign-in pages. Treat access to port `31338` like access to the local account running Conduit Bridge.

## Relationship to other projects

[conduit-vscode](https://github.com/elvatis/conduit-vscode) is an optional VS Code client. It is not required to run this bridge.

The archived `openclaw-cli-bridge-elvatis` repository was reviewed for reusable ideas. Conduit Bridge uses the sound parts of its browser lifecycle, such as starting Chromium separately and attaching afterwards. It does not copy its stealth flags, unconditional sandbox opt-out, cookie transfer, or selector-only authentication checks.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run scan:secrets
npm run scan:secrets:history
npm audit
git diff --check
```

## License

Apache-2.0

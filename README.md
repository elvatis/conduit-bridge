# Conduit Bridge

Conduit Bridge is a standalone OpenAI-compatible gateway for browser sessions, provider APIs, coding CLIs, and LM Studio.

No OpenClaw installation is required. The current supported host platforms are
Windows Desktop and Linux Desktop, with Node.js 24 or newer and Chromium.

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

Chromium runs visibly on the supported desktop. This is the recommended setup.
If OpenClaw or another client runs on a remote server, an SSH reverse tunnel can
expose the local bridge on that server's loopback port without copying cookies.
Headless servers, macOS, and other operating systems are outside the current
support scope.

## Requirements

- Node.js 24 or newer
- npm
- Chromium installed by Playwright
- Windows Desktop or Linux Desktop

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

## Supported desktop use

Windows Desktop and Linux Desktop need no separate display service.

1. Start Conduit Bridge.
2. Open the dashboard.
3. Open **Providers**.
4. Choose **Start login**.
5. Choose **Open login browser** or use the local Chromium window.
6. Complete sign-in.
7. Choose **Check login status**.

Configuration, profiles, metrics, and generated launchers are stored below
`~/.conduit/` and reused after restart. Set `CONDUIT_HOME` before starting the
bridge to use a different central runtime directory.

## Desktop autostart

The repository includes installers for the two supported desktop platforms.
Run them after `npm run build` and from the checked-out project directory.

### Linux Desktop

Install a graphical-session autostart entry:

```bash
./scripts/install-autostart.sh
```

The optional first argument selects the project directory:

```bash
./scripts/install-autostart.sh /path/to/conduit-bridge
```

The OS entry is written to `~/.config/autostart/conduit-bridge.desktop`. It
starts the Conduit launcher at `~/.conduit/bin/conduit-bridge-start`, which
keeps the runtime entry point in the central `.conduit` directory. It starts
after the next desktop login. Remove both with:

```bash
./scripts/uninstall-autostart.sh
```

### Windows Desktop

Run PowerShell from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

This creates a launcher at `%USERPROFILE%\.conduit\bin\conduit-bridge-start.ps1`
and starts a per-user Task Scheduler logon task named `Conduit Bridge`. To
remove both:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

Both installers start the bridge on `127.0.0.1:31338` and run it in the
interactive desktop user's context, so Chromium can open its local window.
See [Desktop Autostart](docs/AUTOSTART.md) for troubleshooting and the remote
OpenClaw tunnel setup.

## Recommended: local bridge with a remote client

When the browser and daily workstation are on Windows Desktop or Linux Desktop,
run Conduit Bridge there. Browser profiles, cookies, local CLIs, and the visible
Chromium window then stay on the workstation.

If OpenClaw runs on a remote server, expose the local bridge to the server with an SSH reverse tunnel:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -R 127.0.0.1:31338:127.0.0.1:31338 <server>
```

The server can keep using:

```text
http://127.0.0.1:31338/v1
```

Port 31338 must be free on the server, so do not run a second remote Conduit Bridge instance at the same time. The bridge is available to the server only while the workstation and SSH tunnel are online.

This avoids cookie export entirely. A dashboard page cannot safely read another site's `HttpOnly` cookies, encrypted browser storage, IndexedDB data, service-worker state, or device-bound tokens. Copying only cookies would also produce incomplete and fragile provider sessions.

## Unsupported host modes

Conduit Bridge currently supports Windows Desktop and Linux Desktop only. A
Linux server without a graphical desktop, Xvfb-based operation, macOS, and
other operating systems are not supported deployment targets yet. For a
remote OpenClaw server, keep the bridge on the supported desktop and use the
reverse tunnel above.

## Model catalog

The dashboard groups models first by transport and then by the exact provider route. Each provider group shows whether it is ready, how many models it exposes, the complete model ID, availability, and catalog source. Search, transport, and provider filters reduce large catalogs without hiding the routing prefix.

Examples:

- `web-grok/grok-fast` routes through the Grok browser provider.
- `api-openrouter/openai/gpt-5.6-sol` routes through the OpenRouter API provider.
- `cli-codex/gpt-5.6-sol` routes through the local Codex CLI.
- `lmstudio/auto` routes through the local LM Studio endpoint.

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

`--local` opens a browser in the CLI process and is intended for a supported
machine with a visible desktop. Prefer running the complete bridge on that
workstation and reverse-forwarding port 31338 to a remote client.

## Configuration

The default configuration file is `~/.conduit/config.json`.

| Key | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | Listener address |
| `port` | `31338` | Dashboard and API port |
| `profileBaseDir` | `~/.conduit/profiles` | Browser profiles |
| `CONDUIT_HOME` | `~/.conduit` | Central runtime directory for config, profiles, metrics, and launchers |
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

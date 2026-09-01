# STATUS - conduit-bridge

## Current Version

0.5.1 with an unreleased feature set on branch `fix/browser-login-single-port`.

Conduit Bridge is run from source and is not published to npm.

## Current Architecture

Standalone OpenAI-compatible gateway for browser, API, CLI, and local model providers.

- No OpenClaw dependency
- Node.js 24 or newer
- Chromium through Playwright
- Dashboard, API, events, metrics, and browser-login viewer on port 31338
- Recommended remote-client mode: local workstation bridge plus SSH reverse tunnel to server loopback 31338
- Desktop Chromium locally on Windows Desktop or Linux Desktop
- Desktop autostart installers use the central `~/.conduit` runtime directory
- Private random loopback DevTools endpoints for attached Chromium processes
- Persistent browser profiles below `~/.conduit/profiles/`

## Browser Login

Browser login now starts ordinary headed Chromium and attaches after launch.

- Native user agent and platform
- `navigator.webdriver === false` enforced
- No user-agent override
- No stealth flags
- Provider-specific authentication signals
- Stale profile-lock handling
- Built-in JPEG and input viewer through port 31338
- Atomic serialized input with coalesced pointer movement and scrolling
- Static viewer document with no reflected route values
- Active provider sessions override obsolete terminal login-attempt states
- Detection-only security-check handling

Project integration with x11vnc, noVNC, websockify, VNC sockets, and ports 5900 and 6080 has been removed.

## Providers

| Family | Providers |
|---|---|
| Browser | Grok, Claude, Gemini, ChatGPT, Perplexity |
| API | Anthropic, Google, OpenAI, OpenRouter, Perplexity |
| CLI | Grok CLI, Codex CLI, Claude Code, Gemini or Antigravity CLI |
| Local | LM Studio |

## API Surface

| Area | Routes |
|---|---|
| Core | `/health`, `/v1/status`, `/v1/models`, `/v1/capabilities` |
| OpenAI | `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` |
| Login | `/v1/login/:provider`, `/status`, `/recheck`, `/cancel`, `/viewer`, `/frame`, `/input` |
| Operations | `/v1/metrics`, `/v1/activity`, `/v1/events` |
| Orchestration | `/v1/orchestrator`, `/run`, `/history`, `/v1/compare` |

## Verification

- Typecheck: pass
- Build: pass
- Tests: 348 pass across 23 files
- Secret scan: tracked and untracked files pass
- Secret history scan: pass
- npm audit: zero vulnerabilities
- git diff check: pass
- Live dashboard health: pass
- Live Grok viewer: JPEG frame and input on port 31338 pass
- Live Grok request: `web-grok/grok-fast` returned `pong`
- Runtime listeners 5900 and 6080: absent

Live browser restore on the current host:

| Provider | Result |
|---|---|
| Grok | connected |
| Gemini | connected |
| Perplexity | connected |
| Claude | provider security check |
| ChatGPT | profile currently shows sign-in |

## Known Limitations

- Claude can still require a person to complete its security check.
- ChatGPT authentication is deliberately conservative and currently reports signed out on this host.
- Attached Chromium needs a private random loopback DevTools listener while active. It is internal and is not a user-facing service port.
- Legacy system packages remain installed on the current deployment host because package removal requires administrator authentication. Their services and project integration are removed.
- macOS and headless Linux server operation are explicitly outside the current support scope.

## Documentation

- README fully describes standalone desktop and remote SSH use.
- README and Help recommend keeping the bridge on the workstation and reverse-forwarding it to remote OpenClaw.
- `docs/AUTOSTART.md` documents Windows Task Scheduler and Linux graphical-session autostart.
- Runtime configuration, profiles, metrics, and generated launchers live below `~/.conduit` by default. `CONDUIT_HOME` can relocate the root.
- The dashboard model catalog groups models by transport and provider with readiness, source, filtering, and Playground selection.
- Dashboard Help and standalone Help match the current architecture.
- `docs/BROWSER-LOGIN.md` documents lifecycle, desktop login, SSH forwarding, security, and troubleshooting.
- CHANGELOG records the added, changed, removed, fixed, and security-relevant behavior.

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Structured browser login with ten observable states, provider-scoped status, cancel and recheck routes, duplicate-attempt protection, and live WebSocket updates.
- Built-in browser viewer on port 31338. It serves JPEG page frames and accepts only validated pointer, wheel, keyboard, and text input.
- Browser login and restore launch ordinary headed Chromium first, attach afterwards, and reject a browser that reports `navigator.webdriver === true`.
- Graphical-session diagnostics for desktop sessions, Xvfb, Chromium availability, window-manager state, and stale or foreign profile locks.
- Dashboard pages for provider login, usage, orchestration, integration tests, recommendations, activity, settings, and Help.
- Persistent local metrics, bounded run history, request limiting, fallbacks, model catalog refresh, and provider effort capabilities.
- Perplexity browser provider and neutral isolated Claude CLI account routes.
- `docs/BROWSER-LOGIN.md` with local desktop, remote SSH, Xvfb, systemd, security, and troubleshooting guidance.

### Changed
- Local workstation deployment plus an SSH reverse tunnel is now the recommended way to serve a remote OpenClaw client while keeping the complete browser profile local.
- The dashboard model catalog now groups large catalogs by transport and provider, adds transport and provider filters, shows provider readiness and catalog source, and links models directly to the Playground.
- Browser authentication now combines provider-specific positive signals, origin-scoped cookie names, expected host and path, and logged-out vetoes. Selector presence alone no longer marks a session authenticated.
- Session restore uses the browser's native user agent and platform. Historical Windows identity overrides and stealth flags are gone.
- Browser login on a remote server now uses the same SSH-forwarded port as the API and dashboard.
- The dashboard navigation no longer shows the `Local-first model infrastructure` footer.
- Dashboard Help, standalone Help, README, and browser-login documentation now describe the current standalone and remote-server architecture.
- Session restore recognizes provider security checks and stops retrying into a confirmed refusal.
- Chromium sandbox fallback is visible and reported once when the host cannot start the browser with its OS sandbox.
- Shutdown cancels active browser logins and releases profile locks.

### Removed
- All project integration with x11vnc, noVNC, websockify, VNC sockets, and the stable ports 5900 and 6080.
- The `login.vncSocketPath` configuration field and VNC-specific login diagnostics.
- The dynamically patched Help page and its stale viewer instructions.

### Fixed
- Viewer input is serialized, pointer movement and scrolling are coalesced, and clicks use one atomic event so SSH latency cannot reorder mouse-button actions.
- The built-in login viewer is now a static document and never reflects a route value into HTML or inline JavaScript.
- A valid provider session now overrides and clears an older cancelled, failed, blocked, or timed-out browser-login attempt in both the API and dashboard.
- Stale Chromium profile locks are detected with `lstat` and removed only when safe.
- Browser spawn failures no longer crash the bridge process.
- A failed login no longer leaves a provider frozen for the lifetime of the bridge.
- Login routes match query strings correctly and return useful status when no attempt has run.
- Recheck and cancel messages are no longer overwritten by an immediate dashboard refresh.
- Client disconnects cancel in-flight provider requests.
- Streaming and non-streaming fallback behavior now records consistent metrics and activity.

### Security
- State-changing requests from foreign web origins are rejected.
- WebSocket upgrades validate Origin.
- URL queries and fragments are stripped from login diagnostics.
- Viewer access uses the bridge's existing authentication and origin policy and exposes no raw DevTools protocol.
- Cookie checks are scoped to the active provider origin and compare names only.
- Metrics and activity do not store prompts, responses, cookies, tokens, or credentials.
- Secret scans include untracked files.
- Browser security checks are detection-only. Conduit never solves, clicks, replays, suppresses, or bypasses them.

## [0.5.1] - 2026-08-21

### Changed
- Upgraded AAHP conformance to `@elvatis_com/aahp` 3.10.0 exact pin
- Updated AAHP Verify workflow (`.github/workflows/aahp-verify.yml`) with AAHP 3.10.0 contract (`AAHP_BASE_SHA`, `permissions: contents: read`, `persist-credentials: false`, and `inputs.base`)
- Bumped dependencies: `@anthropic-ai/sdk` to `^0.117.1`, `@types/node` to `^26.2.0`, `esbuild` to `^0.28.2` (resolves PR #91, #92, #93)
- Pinned and verified native network-interception specs in `src/providers/interception.ts` across live providers (closes #71)

### Fixed
- Added `BardChatUi` matching to `GEMINI_INTERCEPT` for live `batchexecute` streaming endpoints
- Hardened Gemini editor input in `src/providers/gemini.ts` using `insertText` to prevent `locator.fill` errors on non-input container elements
- Security: resolved CodeQL alerts #10 & #11 (`js/incomplete-url-substring-sanitization`) by strictly parsing URL hostnames in `BaseProvider._looksLoggedOut` and Claude navigation checks

## [0.5.0] - 2026-08-09

### Added
- Coding CLI providers: `cli-codex` (`codex` / `@openai/codex`), `cli-claude`
  (`claude` / `@anthropic-ai/claude-code`), `cli-gemini` (`agy` Antigravity CLI)
- Shared `src/providers/cli-util.ts` for PATH resolution and subprocess timeouts
- Cross-provider reasoning effort via `effort` / `reasoning_effort` on chat
  completions (`src/effort.ts`)
- `docs/RELEASING.md` - release process for humans and agents
- Root `CHANGELOG.md` (this file)
- Secret-scan gate and CI workflow (`scripts/scan-secrets.mjs`)
- `.nvmrc` pinned to Node 24

### Changed
- Model catalogs refreshed for GPT-5.6 Sol/Terra/Luna, Claude Fable 5 / Opus 5 /
  Sonnet 5 / Haiku 4.5, Gemini 3.6 Flash, Grok 4.5, OpenRouter/Perplexity
- Node engines floor `>=20` -> `>=24.0.0`
- `openai` dependency `^6.48.0` -> `^7.4.0`
- `@elvatis_com/aahp` exact pin `3.9.2`
- `@anthropic-ai/sdk` -> `^0.115.0`, `playwright` -> `^1.62.1`
- supply-chain-guard stays on floating `homeofe/supply-chain-guard@v5` with
  Dependabot ignore (threat-intel delivery)

### Fixed
- Login/logout HTTP routes include CLI provider names with install guidance

## [0.4.0] - 2026-07-17

### Added
- Network-layer response interception for web providers (#62 / T-005)
- `.env` loading for provider keys

### Changed
- TypeScript 6 -> 7; dependency bumps (openai 6.48, anthropic 0.111, vitest 4.1.10)

## [0.3.0] - 2026-07-17

### Added
- OpenRouter, Perplexity, LM Studio, Grok CLI providers
- Security hardening (CORS allowlist, auth token, Chromium sandbox on)
- Session expiry tracking on `/v1/status`
- First vitest suite

## [0.2.6] - 2026-07-01

### Changed
- Provider model lineup refresh (Gemini 3.5, GPT-5.5, web labels)

## [0.2.5] - 2026-07-01

### Added
- Claude Fable 5 + Opus 4.7 on API provider

## [0.2.4] - 2026-07-01

### Added
- Claude Opus 4.8 + Sonnet 5

### Fixed
- Stale API model strings

## [0.2.3] - 2026-05-17

### Changed
- Dependency bumps (anthropic, openai, vitest, @types/node)

## [0.2.2] - 2026-05-05

### Changed
- Dependency bumps (anthropic, typescript)

## [0.2.1] - 2026-05-05

### Security
- Bump @anthropic-ai/sdk and vite for advisories

### Changed
- Dependency bumps (playwright, esbuild, @types/node)

## [0.2.0] - 2026-05-01

### Added
- Direct API providers (claude-api, gemini-api, codex-api)

## [0.1.0] - 2026-03-12

### Added
- Initial release

[Unreleased]: https://github.com/elvatis/conduit-bridge/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/elvatis/conduit-bridge/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/elvatis/conduit-bridge/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/elvatis/conduit-bridge/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/elvatis/conduit-bridge/compare/v0.2.6...v0.3.0
[0.2.6]: https://github.com/elvatis/conduit-bridge/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/elvatis/conduit-bridge/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/elvatis/conduit-bridge/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/elvatis/conduit-bridge/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/elvatis/conduit-bridge/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/elvatis/conduit-bridge/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/elvatis/conduit-bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/elvatis/conduit-bridge/releases/tag/v0.1.0

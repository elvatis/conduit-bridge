# Changelog

All notable changes to this project are documented in this file and mirrored
in the README Changelog section.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-09-02

### Added

- Chat completions accept optional `cwd` (absolute existing path). CLI providers
  (`cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok`) run in that directory
  so conduit-vscode background agents see the workspace. API and LM Studio
  transports ignore it. (#100)

## [0.5.2] - 2026-09-02

### Changed

- Replaced the browser-session architecture with explicit API, CLI, and local
  provider transports.
- Standardized Grok CLI as `cli-grok`.
- Separated API credential discovery from CLI authentication. A CLI login no
  longer marks its API counterpart configured.
- Added independent API, CLI, and local provider pages to the dashboard.
- Updated AAHP to 3.12.0 and supply-chain-guard to the rolling `@v6` tag.
- Bumped `@anthropic-ai/sdk` to `^0.122.0`, `@types/node` to `^26.4.1`, and
  `vitest` to `^4.1.11`.
- Rewrote desktop setup, autostart, Help, and migration documentation.
- CLI `connected` now means installed and authenticated, not merely on PATH.
- Orchestrator history stores a short redacted preview instead of full transcripts.
- `BridgeServer.start()` no longer throws on unsupported platforms; the CLI still exits.

### Removed

- All `web-*` model routes and browser-session providers.
- Interactive sign-in, session restore, profile management, and viewer routes.
- Playwright and all browser automation configuration.
- Legacy `grok-cli` provider ID in favor of `cli-grok`.

### Fixed

- API credential state refreshes immediately after a key is saved.
- Provider status now reports the actual API credential source without exposing
  secret values.
- CSRF checks honor `allowedOrigins` for same-site POSTs from another local port.
- Dashboard HTML stays reachable when `authToken` is set; the page collects the
  token and sends it on `/v1/*` and the event socket. `status` reuses the token.
- Activity messages redact credential-shaped tokens.
- `conduit-bridge config authToken` no longer coerces numeric-looking strings.
- Unknown `POST /v1/tests/cli` providers return 404 instead of 500.
- `CONDUIT_HOME` is shared by config, metrics, run-history, CLI accounts, and
  autostart launchers.
- Windows autostart hides the console window and matches Node paths with `/` or `\`.
- HTTP routes match on path, ignoring query strings.
- Debate strategy critiques prior answers; compare/orchestrator/cli-test share
  the request limiter.

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

[Unreleased]: https://github.com/elvatis/conduit-bridge/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/elvatis/conduit-bridge/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/elvatis/conduit-bridge/compare/v0.5.1...v0.5.2
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

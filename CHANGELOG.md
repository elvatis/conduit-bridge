# Changelog

All notable changes to this project are documented in this file and mirrored
in the README Changelog section.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/elvatis/conduit-bridge/compare/v0.5.0...HEAD
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

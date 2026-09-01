# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Replaced the browser-session architecture with explicit API, CLI, and local
  provider transports.
- Standardized Grok CLI as `cli-grok`.
- Separated API credential discovery from CLI authentication. A CLI login no
  longer marks its API counterpart configured.
- Added independent API, CLI, and local provider pages to the dashboard.
- Updated AAHP to 3.12.0 and supply-chain-guard to 6.0.9.
- Rewrote desktop setup, autostart, Help, and migration documentation.

### Removed

- All `web-*` model routes and browser-session providers.
- Interactive sign-in, session restore, profile management, and viewer routes.
- Playwright and all browser automation configuration.
- Legacy `grok-cli` provider ID in favor of `cli-grok`.

### Fixed

- API credential state refreshes immediately after a key is saved.
- Provider status now reports the actual API credential source without exposing
  secret values.

## [0.5.1] - 2026-09-01

### Added

- OpenAI-compatible gateway routes, provider orchestration, metrics, activity,
  desktop autostart, and the local operations dashboard.

[Unreleased]: https://github.com/elvatis/conduit-bridge/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/elvatis/conduit-bridge/releases/tag/v0.5.1

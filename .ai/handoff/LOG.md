# Work log

_Reverse chronological._

## 2026-09-02 - v0.7.0

- Version bump for the `mode` request field (#101). GitHub Release only.

## 2026-09-02 - CLI chat/plan/agent mode

- `POST /v1/chat/completions` accepts `mode` (`chat` | `plan` | `agent`).
- Aliases: `agentic: true`, `plan: true`. Agent requires absolute existing `cwd`.
- All four CLI providers map through `cliPermissionArgs`. Grok is plan-by-default.
- conduit-vscode Plan chat sends `mode: plan`; spawn/fix-issue send `mode: agent`.

## 2026-09-02 — v0.5.2 release

- Squash-merged PR #99 onto main (`a4a7a46`).
- Applied Dependabot bumps: `@anthropic-ai/sdk` 0.122.0, `@types/node` 26.4.1,
  `vitest` 4.1.11. Closed #97 as superseded (AAHP already 3.12.0).
- Version bump, changelog, GitHub Release v0.5.2.

## 2026-09-02 — control-plane review follow-up

- CSRF now consults `allowedOrigins` before treating `same-site` as forbidden.
- Dashboard HTML is served without bearer auth; JS collects a token and sends
  it on fetch and as `conduit-token.*`. `status` reuses `cfg.authToken`.
- ActivityLog and orchestrator history run through `redactSecrets`.
- CLI session probes cred files / env, not PATH-only.
- grok-cli uses shared `runCli` so Windows abort taskkills the tree.
- `parseConfigValue` no longer coerces `authToken` to Number.
- Unknown `POST /v1/tests/cli` providers return 404.
- `runtimeDir()` honors `CONDUIT_HOME` for config, metrics, history, accounts,
  and autostart launchers.
- Windows autostart uses `-WindowStyle Hidden` and a slash-normalized
  uninstall matcher.
- Independence test plants CLI OAuth files; settings omit key values.
- SCG unpinned to `@v6`; Dependabot ignore and AAHP Dependabot no-op restored.
- README AAHP badge points at this repo; 0.5.1 changelog restored.
- Debate critiques prior answers; compare/orchestrator/cli-test are limited.
- Routes match on path. Library start no longer throws on unsupported OS.
- Focused tests 79 passing; CSRF mutation red then green; tsc clean.

## 2026-09-02 — provider architecture cleanup

- Removed all `web-*` providers and interactive sign-in routes.
- Removed the Playwright dependency and the browser runtime.
- Split provider status into API, CLI, and local categories.
- Standardized the Grok CLI provider ID as `cli-grok`.
- Stopped API providers from reading CLI OAuth credential files.
- Added separate dashboard navigation pages for API, CLI, and local providers.
- Kept direct API keys write-only and exposed only their sanitized source.
- Rewrote README, Help, migration, autostart, changelog, and handoff material.
- Updated AAHP to 3.12.0 and supply-chain-guard to 6.0.9.
- Windows test suite passed with 85 tests.
- Typecheck, build, diff check, both secret scans, production audit, AAHP
  doctor, and AAHP precommit verification passed.
- Live Windows status showed all four CLI providers independently connected,
  while API providers reflected only their own Bridge or environment keys.
- Windows autostart install, health, tracked PID, logs, stop, and uninstall
  completed successfully.
- Resolved the new CodeQL HTML-filtering alert in the dashboard syntax test by
  matching script tags case-insensitively.

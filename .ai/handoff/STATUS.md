# Status

_Updated: 2026-09-02_

Branch: `fix/browser-login-single-port`

Conduit Bridge is a Windows Desktop and Linux Desktop OpenAI-compatible
gateway. Its supported transports are direct APIs, authenticated local CLIs,
and LM Studio. The sole listener is `127.0.0.1:31338`.

## Provider inventory

- API: `claude-api`, `codex-api`, `gemini-api`, `openrouter-api`,
  `perplexity-api`
- CLI: `cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok`
- Local: `lmstudio`

API credentials and CLI authentication are independent. All `web-*`
providers and their automation runtime have been removed.

## Dependency baseline

- AAHP: 3.12.0
- supply-chain-guard workflow/action baseline: 6.0.9
- Playwright: removed

## Verification

- Windows unit tests: 85 passing
- TypeScript typecheck and production build: passing
- `git diff --check`: passing
- Current-tree and full-history secret scans: passing
- Production dependency audit: 0 vulnerabilities
- AAHP 3.12.0 doctor and precommit verification: passing
- Windows live status: API/CLI/local separation verified
- Windows autostart: task, health, PID, logs, stop, and uninstall verified

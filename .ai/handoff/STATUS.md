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

## Control-plane review follow-up (this session)

Implemented the review of this branch vs `origin/main`: CSRF honors
`allowedOrigins`; dashboard HTML stays reachable with `authToken` and sends
the token on `/v1/*` plus the event socket; activity and orchestrator history
redact secrets; CLI `connected` requires a cred file or CLI-usable env var,
not merely PATH; grok-cli abort uses shared `runCli` (Windows taskkill);
numeric-looking `authToken` stays a string; unknown CLI test providers 404;
`CONDUIT_HOME` is shared by config, metrics, run-history, accounts, and
autostart; Windows autostart hides the console; SCG is on rolling `@v6`;
README badge points at this repo; 0.5.1 notes restored; debate critiques
prior answers; fan-out routes share the limiter; HTTP matches on path;
`BridgeServer.start()` no longer throws on darwin.

## Dependency baseline

- AAHP: 3.12.0
- supply-chain-guard workflow/action baseline: rolling `@v6` (not SHA-pinned)
- Playwright: removed

## Verification

- Focused vitest files covering the review fixes: 79 passing, plus registry
  and effort (14). CSRF mutation: old `same-site` gate failed 403, restored
  fix passed 200.
- TypeScript typecheck: passing
- Full local suite not run on this Windows host (estate rule). Push and let
  Linux CI produce the full-suite verdict.

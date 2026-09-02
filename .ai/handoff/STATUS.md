# Status

_Updated: 2026-09-02_

Branch: `feat/cli-run-mode`

CLI chat completions now take `mode`: `chat` (read-only proxy, default),
`plan` (native CLI plan function), `agent` (workspace write, requires `cwd`).
Aliases: `agentic: true`, `plan: true`. Grok is no longer always-write; it
matches the others unless `mode=agent`. API/LM Studio ignore `mode`.

conduit-vscode should send `mode: plan` from Plan chat and `mode: agent` from
spawn/fix-issue. VS Code chat Agent mode stays host-side (do not send agent).

**v0.6.0** adds optional `cwd` on `POST /v1/chat/completions` so CLI providers
run in the editor workspace (conduit-vscode #86). API/LM Studio ignore it.

Released **v0.5.2** remains the previous desktop gateway. Transports: direct
APIs, authenticated local CLIs, and LM Studio. Sole listener: `127.0.0.1:31338`.

## Provider inventory

- API: `claude-api`, `codex-api`, `gemini-api`, `openrouter-api`,
  `perplexity-api`
- CLI: `cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok`
- Local: `lmstudio`

API credentials and CLI authentication are independent. All `web-*`
providers and their automation runtime have been removed.

## Release v0.5.2

Squash-merged PR #99 (`a4a7a46`). Applied remaining Dependabot bumps on main
(`@anthropic-ai/sdk` 0.122.0, `@types/node` 26.4.1, `vitest` 4.1.11). AAHP
Dependabot PR #97 closed as superseded (already 3.12.0). Tag and GitHub
Release cut from this commit.

## Dependency baseline

- AAHP: 3.12.0
- supply-chain-guard: rolling `@v6`
- Playwright: removed

## Verification

- PR #99 CI on `b1ac722`: AAHP, Secret Scan, SCG, CodeQL green
- Main CI on `a4a7a46`: AAHP, Secret Scan, SCG, CodeQL green
- Typecheck after SDK/vitest bumps: passing
- Full local suite not run on this Windows host

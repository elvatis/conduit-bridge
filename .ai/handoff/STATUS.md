> Note (2026-07-17, claude-opus-4-8): Add per-provider session expiry tracking (T-004, #34). BaseProvider records a last-known-good login timestamp on verified success and detects expiry via a login-page redirect or loss of the verify selector, exposing loggedIn + lastVerified + status (active/expired/unknown) through a sessionInfo getter. Surfaced additively in ProviderStatus (session + loginType) and the /v1/status response via registry.getStatus; API-key providers report not_applicable. Existing /status fields unchanged (backward compatible). Files: src/types.ts, src/providers/base.ts, src/registry.ts, src/index.ts. Build passes (tsc + esbuild); repo has no test files.
> Note (2026-07-17, claude-opus-4-8): Security hardening (#23, reported by @Jaaaky). Four secure-by-default, backward-compatible fixes: (1) removed --no-sandbox from the Chromium STEALTH_ARGS defaults; sandbox stays ON, opt back in via BridgeConfig.chromiumNoSandbox or CONDUIT_NO_SANDBOX=1. (2) removed --disable-features=IsolateOrigins,site-per-process so site isolation stays ON (kept only --disable-blink-features=AutomationControlled for stealth). (3) replaced wildcard CORS with an allowlist: request Origin reflected only if in BridgeConfig.allowedOrigins (default localhost origins) plus the server host:port; no-Origin requests (curl, server-side clients) unchanged. (4) optional bearer-token auth via BridgeConfig.authToken (empty = off): when set, /v1/* require Authorization: Bearer <token> (401 otherwise), /health stays open. New config fields added to types.ts + config.ts defaults; CLI gains --auth-token and --no-sandbox; README Security section added. Build clean (tsc + esbuild). No version bump (separate PR owns versioning).

> Note (2026-07-17, claude-opus-4-8): Removed the Auto-Publish (npm) workflow so conduit-bridge stops attempting npm publishes (every one failed E404 on the missing @elvatis scope; it was never on npm and is not meant to be). conduit-bridge stays a normal PUBLIC tool run from source, NOT marked private. Also fixed the version drift: README header + DASHBOARD were at 0.2.3 / 0.1.0 while package.json + changelog were 0.2.6; all current-version refs now 0.2.6 (historical changelog kept). Dropped task T-006.

> Note (2026-07-14, claude-opus-4-8): Synced the canonical AAHP gate scripts from homeofe/improvements (v3.5.0 fixes: aahp-manifest.sh --phase documentation + cross_repo_ref preservation, lint-handoff.sh SC2034), AAHP_HANDOFF_FILES preserved, and refreshed the local hook tooling (scripts/hooks/, install-hooks.sh, verify-hooks.sh). Fleet re-sync.

> Note (2026-07-14, claude-opus-4-8): Synced the canonical Layer 3 tolerance fix from homeofe/improvements. verify-handoff.sh now downgrades a non-ancestor MANIFEST.last_session.commit from FAIL to WARN so a squash-merge or rebase-merge no longer trips AAHP Verify Layer 3 on main; Layers 1-2 still gate real staleness.

# STATUS — conduit-bridge

## Current Version: 0.2.6 (published to npm on GitHub Release)

> 2026-06-29 (claude-opus-4-8): ignore .ai/logs handoff scratch (.gitignore).
> 2026-07-01 (claude-opus-4-8): add Claude Opus 4.8 + Sonnet 5 to the web and API Claude providers; fix stale claude-api model strings (4.6/4.5 were mapped to non-existent -20250514 snapshots that would 404, now bare aliases); README + changelog; v0.2.4.
> 2026-07-01 (claude-opus-4-8): add Claude Fable 5 + Opus 4.7 to the claude-api provider (API-only; web selection is a no-op so per-version web labels are not added); v0.2.5. Note: SDK 0.98.0 has no server-side `fallbacks` support, so Fable 5 is added plain (no refusal fallback). vite/esbuild Dependabot alerts were already patched in the lockfile (npm audit 0).
> 2026-07-01 (claude-opus-4-8): refresh non-Claude providers to mid-2026 lineups (web-researched, sources in PR); v0.2.6. Gemini API: drop fabricated gemini-3.0-flash/-thinking, add gemini-3.5-flash (GA) + 3.1-flash-lite, 3.1-pro -> 3.1-pro-preview. OpenAI/Codex API: add gpt-5.5 + gpt-5.5-pro (GA), drop codex-mini (removed 2026-02-12) + o3 + effort-label ids. Web labels refreshed (Grok Auto, Gemini 3.5, GPT-5.5). API IDs NOT runtime-validated (no provider keys) -> PR left OPEN for Emre's review.

## Architecture Overview
Standalone OpenAI-compatible HTTP proxy for headless browser AI sessions.
No OpenClaw dependency. Designed to run locally on the developer's machine.

## Provider Status
| Provider | Adapter | Login Flow | Verify Selector | Models |
|---|---|---|---|---|
| Grok | GrokProvider | x.com/i/grok | `textarea[placeholder]` | grok-3, grok-3-fast, grok-3-mini, grok-2 |
| Claude | ClaudeProvider | claude.ai/new | `.ProseMirror` | claude-sonnet, claude-opus, claude-haiku |
| Gemini | GeminiProvider | gemini.google.com/app | `.ql-editor` | gemini-2-5-pro, gemini-2-5-flash, gemini-3-pro, gemini-3-flash |
| ChatGPT | ChatGPTProvider | chatgpt.com | `#prompt-textarea` | gpt-4o, gpt-o3, gpt-o4-mini, gpt-5 |

## API Endpoints
| Method | Path | Description |
|---|---|---|
| GET | /health | Health check → `{status:"ok"}` |
| GET | /v1/models | List all 15 models |
| GET | /v1/status | Rich provider status (connected, hasProfile, uptime) |
| POST | /v1/chat/completions | OpenAI-compatible chat (stream + non-stream) |
| POST | /v1/login/:provider | Trigger login (opens headful browser) |
| POST | /v1/logout/:provider | Close provider context |

## Build Status
- TypeScript strict + ESM ✅
- Build: `npm run build` → `dist/index.js` + `dist/cli.js` ✅
- Tests: none yet (T-003)
- Default port: 31338 (avoids conflict with OpenClaw cli-bridge on 31337)
- Profile storage: `~/.conduit/profiles/<provider>-profile/`
- Config: `~/.conduit/config.json`

## Known Issues / Gaps
- No tests yet (T-003)
- Response polling is selector-based (fragile if UI changes) — needs proper streaming intercept (T-005)
- No session expiry tracking yet (T-004)
- Not published to npm (auto-publisher removed 2026-07-17; T-006 dropped)
- README missing on GitHub (fixed this session)

## Release History
| Version | Date | Notes |
|---|---|---|
| 0.1.0 | 2026-03-12 | Initial build — server, registry, 4 providers, CLI |

<!-- aahp-gate -->
_AAHP verify gate: v3.0.2 synced 2026-06-20._

> 2026-06-21 install-hooks.sh: Windows drive-letter path fix propagated from AAHP.

> 2026-06-21 ci: add supply-chain-guard v5.2.35 Action workflow (fail-on critical).

> 2026-06-21 ci(aahp): fix unquoted next_task_id + lint-handoff noreply@ PII exclusion.

> 2026-06-27 ci: re-pin supply-chain-guard action to v5.2.37 (be1d718b17cc38e4bce7fa48579b7112e557943b) and enable Dependabot github-actions weekly updates.

> 2026-06-27 chore(aahp): full AAHP gate onboarding. Added the AAHP Verify badge to README and refreshed the handoff manifest so the commit-pointer tracks HEAD; the prior #37 supply-chain-guard commit had left the manifest dormant at d425433. Toolchain scripts (aahp-manifest.sh, verify-handoff.sh, _aahp-lib.sh, lint-handoff.sh) and the aahp-verify.yml workflow were already present and self-consistent, so they were left untouched.

> 2026-06-30 feat(verify): added reviewed expiring PII allowlist, rolled out from AAHP v3.2.0.

> 2026-06-30 ci: exempt Dependabot from the aahp-verify handoff gate (keep supply-chain-guard/codeql/build).
- 2026-07-03: ci: supply-chain-guard now tracks the moving @v5 release branch instead of a stale SHA pin (owner rule: consumers pin @v5, the release workflow moves it - currently v5.6.1). Ends the recurring stale/broken-pin churn (v5.2.35 crash wave). Config change only.

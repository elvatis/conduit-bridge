> Note (2026-07-17, claude-opus-4-8): Adversarial multi-agent review of the #62 interception refactor -> fixed 3 confirmed defects in src/providers/interception.ts + the 4 web providers: (1) [medium] NetworkCapture bound page.on('response') in its constructor but detach() only ran in a try/finally the providers entered AFTER arm()+submit, so a throw in keyboard.press/page.url leaked the listener on the long-lived reused page (accumulating handlers). Fixed by moving arm()+submit inside the try/finally in grok/claude/gemini/chatgpt so detach() always runs. (2) [low] parseGeminiStream strategy-2 unescaped with an ordered replace chain that collapsed `\\` last, corrupting `\\n` -> backslash+newline; replaced with a single JSON.parse pass. (3) [low] that path also dropped any candidate containing `\uXXXX` (lost non-ASCII text); the JSON.parse pass now decodes it. 67/67 tests still green; tsc + esbuild clean.

> Note (2026-07-17, claude-opus-4-8): Took over PR #62 (T-005 / issue #35, network-layer response interception) now that the desktop agent is stopped. Merged current main into refactor/response-interception-35; the only code conflict was src/providers/base.ts, where #62's startNetworkCapture and main's session-expiry methods (#34) both added a block at the same spot — kept both. Also broadened vitest.config.ts include to `src/**/*.test.ts` so #62's co-located interception.test.ts actually runs (it was being skipped by the `test/**`-only glob). Full suite 67/67 (52 + 15 interception), tsc + esbuild clean. Caveat carried forward from the PR: the Claude/Grok/Gemini backend endpoint patterns are ASSUMED and still need live-site verification; the DOM-polling fallback keeps behaviour from regressing until then.

> Note (2026-07-17, claude-opus-4-8): Added the supply-chain-guard marketplace badge to the README (next to AAHP Verify), per the action's marketplace listing — links to homeofe/supply-chain-guard.

> Note (2026-07-17, claude-opus-4-8): Docs refresh (post-0.3.0). README "How It Works" intro + architecture diagram now cover all four backend families (web / api / lmstudio / cli-grok), not just the browser flow. Fixed a factual error in the Available-Models intro (API keys live under `apiKeys.<provider>`, not `anthropicApiKey`/`googleApiKey`) and documented the real key-resolution order (config -> CLI-tool creds -> env var). Added a Usage section for API + local providers, added `--auth-token`/`--no-sandbox` to the start-options list, noted that `/v1/login/:provider` returns setup guidance for non-web providers, refreshed the `/v1/status` example with the `session`/`loginType` fields, and removed the stale `~/.conduit/<provider>-expiry.json` File-Locations row (cookieFile() has no callers; expiry is in-memory via /v1/status). FOLLOW-UP for a human: CONTRIBUTING.md says "No em dashes in documentation" but the codebase uses them pervasively (base.ts alone has 11) — either enforce or drop the rule; left as-is to avoid a noisy cross-file purge of the other agent's code.

> Note (2026-07-17, claude-opus-4-8): Bump 0.2.6 -> 0.3.0 (minor: new providers + the security/expiry/vitest work that landed since the last release). Updated package.json, README (version header, changelog 0.3.0 entry, /health + /v1/models JSON examples) and DASHBOARD. Folded into PR #63; a v0.3.0 GitHub release is cut on merge to reconcile the drift (files said 0.2.6 but the latest GitHub release was v0.2.5 — no 0.2.6 release ever existed). Build + 52 tests green.

> Note (2026-07-17, claude-opus-4-8): Merged origin/main into feat/new-providers (PR #63, the 4-provider port described below). Integrated security #23, session-expiry #34, and the vitest suite #33: resolved src/types.ts (kept lmStudioUrl alongside the new security fields + SessionInfo), src/cli.ts help (merged provider + security sections), and extended test/registry.test.ts ALL_PROVIDERS 7 -> 11 for the new providers. Full suite green 52/52 (10 new provider tests + 42 existing); tsc + esbuild clean.

> Note (2026-07-17, claude-opus-4-8): Reconciled test/server.test.ts CORS tests with the new allowlist behavior from #23 (they asserted the old wildcard *; now they verify allowlisted-origin reflection via a raw request plus foreign-origin rejection). Full suite green: 42/42.

> Note (2026-07-17, claude-opus-4-8): Added a vitest unit test suite (T-003, issue #33). New devDependency already present in the lockfile; added vitest.config.ts and npm scripts "test": "vitest run" and "test:watch": "vitest". 42 tests across test/config.test.ts (loadConfig defaults/overrides, saveConfig round-trip and merge precedence, path helpers, homedir mocked to a temp dir), test/logger.test.ts (level gating, ISO timestamp, onLine subscribe/unsubscribe, configureLogger singleton), test/registry.test.ts (provider registration, model lookup, unknown-model handling, status snapshot) and test/server.test.ts (HTTP handler with a mocked registry so no browser launches: CORS/OPTIONS, health, models, status, chat 200/400/404/503, SSE stream, api-key login rejection, logout, 404). tsconfig scoped to include ["src"] so tsc build ignores the config/test files. npm run build and npm test both green.
> Note (2026-07-17, claude-opus-4-8): Add per-provider session expiry tracking (T-004, #34). BaseProvider records a last-known-good login timestamp on verified success and detects expiry via a login-page redirect or loss of the verify selector, exposing loggedIn + lastVerified + status (active/expired/unknown) through a sessionInfo getter. Surfaced additively in ProviderStatus (session + loginType) and the /v1/status response via registry.getStatus; API-key providers report not_applicable. Existing /status fields unchanged (backward compatible). Files: src/types.ts, src/providers/base.ts, src/registry.ts, src/index.ts. Build passes (tsc + esbuild); repo has no test files.
> Note (2026-07-17, claude-opus-4-8): Security hardening (#23, reported by @Jaaaky). Four secure-by-default, backward-compatible fixes: (1) removed --no-sandbox from the Chromium STEALTH_ARGS defaults; sandbox stays ON, opt back in via BridgeConfig.chromiumNoSandbox or CONDUIT_NO_SANDBOX=1. (2) removed --disable-features=IsolateOrigins,site-per-process so site isolation stays ON (kept only --disable-blink-features=AutomationControlled for stealth). (3) replaced wildcard CORS with an allowlist: request Origin reflected only if in BridgeConfig.allowedOrigins (default localhost origins) plus the server host:port; no-Origin requests (curl, server-side clients) unchanged. (4) optional bearer-token auth via BridgeConfig.authToken (empty = off): when set, /v1/* require Authorization: Bearer <token> (401 otherwise), /health stays open. New config fields added to types.ts + config.ts defaults; CLI gains --auth-token and --no-sandbox; README Security section added. Build clean (tsc + esbuild). No version bump (separate PR owns versioning).

> Note (2026-07-17, claude-opus-4-8): Removed the Auto-Publish (npm) workflow so conduit-bridge stops attempting npm publishes (every one failed E404 on the missing @elvatis scope; it was never on npm and is not meant to be). conduit-bridge stays a normal PUBLIC tool run from source, NOT marked private. Also fixed the version drift: README header + DASHBOARD were at 0.2.3 / 0.1.0 while package.json + changelog were 0.2.6; all current-version refs now 0.2.6 (historical changelog kept). Dropped task T-006.

> Note (2026-07-17, claude-opus-4-8): T-005 (#35) replace selector polling with proper response interception. Added a Playwright-native network-interception capability in the base (src/providers/interception.ts + BaseProvider.startNetworkCapture): NetworkCapture observes page.on('response') for each provider's backend completion endpoint and parses the assistant text from the finished SSE/chunked body, and streamMerged makes network capture the PRIMARY path while the existing in-page reader keeps smooth token streaming and DOM selector polling stays as the automatic fallback. Wired grok/claude/gemini/chatgpt (public chat/chatStream unchanged; added a DOM fallback to claude which had none). Added interception.test.ts (15 vitest cases, parsers + merge + fallback). Endpoint patterns: chatgpt /backend-api/conversation VERIFIED (ref #23), claude /completion, grok /rest/app-chat/conversations, gemini batchexecute/StreamGenerate are ASSUMED and need live-site verification before production trust.

> Note (2026-07-14, claude-opus-4-8): Synced the canonical AAHP gate scripts from homeofe/improvements (v3.5.0 fixes: aahp-manifest.sh --phase documentation + cross_repo_ref preservation, lint-handoff.sh SC2034), AAHP_HANDOFF_FILES preserved, and refreshed the local hook tooling (scripts/hooks/, install-hooks.sh, verify-hooks.sh). Fleet re-sync.

> Note (2026-07-14, claude-opus-4-8): Synced the canonical Layer 3 tolerance fix from homeofe/improvements. verify-handoff.sh now downgrades a non-ancestor MANIFEST.last_session.commit from FAIL to WARN so a squash-merge or rebase-merge no longer trips AAHP Verify Layer 3 on main; Layers 1-2 still gate real staleness.

# STATUS — conduit-bridge

## Current Version: 0.3.0 (run from source; GitHub Release only, not npm)

> 2026-06-29 (claude-opus-4-8): ignore .ai/logs handoff scratch (.gitignore).
> 2026-07-01 (claude-opus-4-8): add Claude Opus 4.8 + Sonnet 5 to the web and API Claude providers; fix stale claude-api model strings (4.6/4.5 were mapped to non-existent -20250514 snapshots that would 404, now bare aliases); README + changelog; v0.2.4.
> 2026-07-01 (claude-opus-4-8): add Claude Fable 5 + Opus 4.7 to the claude-api provider (API-only; web selection is a no-op so per-version web labels are not added); v0.2.5. Note: SDK 0.98.0 has no server-side `fallbacks` support, so Fable 5 is added plain (no refusal fallback). vite/esbuild Dependabot alerts were already patched in the lockfile (npm audit 0).
> 2026-07-01 (claude-opus-4-8): refresh non-Claude providers to mid-2026 lineups (web-researched, sources in PR); v0.2.6. Gemini API: drop fabricated gemini-3.0-flash/-thinking, add gemini-3.5-flash (GA) + 3.1-flash-lite, 3.1-pro -> 3.1-pro-preview. OpenAI/Codex API: add gpt-5.5 + gpt-5.5-pro (GA), drop codex-mini (removed 2026-02-12) + o3 + effort-label ids. Web labels refreshed (Grok Auto, Gemini 3.5, GPT-5.5). API IDs NOT runtime-validated (no provider keys) -> PR left OPEN for Emre's review.
> 2026-07-17 (claude-opus-4-8): NEW PR (branch feat/new-providers) — port 4 providers from openclaw-cli-bridge-elvatis. openrouter-api (`api-openrouter/*`, OPENROUTER_API_KEY, openai SDK + custom baseURL/headers); perplexity-api (`api-perplexity/*`, sonar* + proxied upstreams, PERPLEXITY_API_KEY); lmstudio (`lmstudio/*`, keyless, live /v1/models discovery, LM_STUDIO_URL override); grok-cli (`cli-grok/*`, local `grok` CLI --prompt-file headless, cross-platform subprocess). Added optional `ProviderAdapter.ownsModel()` so any `<prefix>/<model>` routes by prefix (passthrough) even when not in the curated /v1/models list. No new deps (openai SDK + fetch + node:child_process). Added the repo's first vitest suite (test/providers.test.ts, 10 tests: catalogs, ownsModel, registry routing, grok-cli prompt flattening). tsc + esbuild + tests green; smoke-tested end-to-end (live LM Studio discovery of 14 models, passthrough routing -> 503 not 404, graceful 503/404, local-provider login guidance). Ran an adversarial multi-agent review -> fixed 4 grok-cli defects: deterministic temp-file name collision (now randomBytes + 0o600/wx), cmd.exe missing outer-quote pair (broke spaced install paths), Windows timeout killing only the cmd wrapper (now taskkill /T /F), and dead SIGKILL escalation (`!proc.killed` always false -> gate on a `closed` flag). Provider model IDs are curated (passthrough accepts any id) and NOT all runtime-validated (no API keys) -> PR left OPEN for Emre's review.

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
- Tests: provider-wiring vitest suite added on feat/new-providers (test/providers.test.ts, 10 tests — first tests in repo); broader provider/browser coverage still open (T-003)
- Default port: 31338 (avoids conflict with OpenClaw cli-bridge on 31337)
- Profile storage: `~/.conduit/profiles/<provider>-profile/`
- Config: `~/.conduit/config.json`

## Known Issues / Gaps
- No tests yet (T-003; interception module now has vitest coverage, rest still open)
- Response capture: network interception is now the primary path with DOM polling as fallback (T-005, PR #62). Provider backend endpoints beyond ChatGPT still need live-site verification.
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

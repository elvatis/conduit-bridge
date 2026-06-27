# STATUS — conduit-bridge

## Current Version: 0.1.0 (GitHub only — pre-release, not yet on npm)

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
- No npm publish yet (T-006)
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

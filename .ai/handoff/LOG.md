# LOG.md — conduit-bridge

_Reverse chronological. Latest session first._

---

## Session 1 — 2026-03-12 — Initial Build (Akido / claude-sonnet-4-6)

**Goal:** Scaffold conduit-bridge as standalone proxy extracted from openclaw-cli-bridge-elvatis.

**Decisions:**
- Standalone package with zero OpenClaw dependency (users shouldn't need the full gateway)
- Port 31338 by default (avoids conflict with OpenClaw's cli-bridge on 31337)
- Profiles stored in `~/.conduit/profiles/` (separate from `~/.openclaw/`)
- `BaseProvider` abstract class handles all Playwright lifecycle — providers only implement `chat()` / `chatStream()`
- `pollForResponse()` helper shared via `grok.ts` imports (DRY, avoids duplication)
- Sequential restore on startup, 2s delay between providers (anti-OOM, same lesson learned from cli-bridge)
- Logger has `onLine()` subscription API so conduit-vscode can pipe logs to Output Channel

**What was built:**
- `src/types.ts` — all shared interfaces
- `src/config.ts` — `~/.conduit/config.json` load/save
- `src/logger.ts` — subscribable logger
- `src/providers/base.ts` — BaseProvider (Playwright, login, restore, verify)
- `src/providers/grok.ts` — Grok adapter + `buildUserMessage`, `pollForResponse` helpers
- `src/providers/claude.ts` — Claude adapter
- `src/providers/gemini.ts` — Gemini adapter
- `src/providers/chatgpt.ts` — ChatGPT adapter
- `src/registry.ts` — ProviderRegistry (manages all 4, sequential restore)
- `src/server.ts` — BridgeServer (HTTP, all routes)
- `src/index.ts` — public API exports
- `src/cli.ts` — CLI (start/status/login/config)
- `README.md` — full documentation
- `.ai/handoff/` — AAHP protocol files

**Commit:** `40eae33` — feat: initial conduit-bridge standalone proxy (v0.1.0)

**Known gaps at end of session:**
- No tests (T-003)
- Response polling fragile (T-005)
- No npm publish (T-006)
- No session expiry tracking (T-004)

# LOG.md — conduit-bridge

_Reverse chronological. Latest session first._

---

## Session 2, 2026-09-01, browser login and single-port remote access

**Goal:** Repair browser login and restore, remove the remote-desktop stack, and make remote SSH use work through port 31338.

**Decisions:**
- Start ordinary headed Chromium and attach only after launch.
- Enforce `navigator.webdriver === false`.
- Keep random DevTools listeners private to loopback and expose no raw DevTools route.
- Render remote login with Xvfb and a Conduit-owned JPEG and input viewer.
- Keep port 31338 as the only user-facing listener.
- Remove all project dependencies, services, sockets, configuration, and documentation for the previous remote-desktop path.
- Reuse only the safe lifecycle ideas from the archived CLI bridge.

**Implementation:**
- Added observable login state, status, cancel, recheck, dashboard controls, and live events.
- Added native-identity restore, stale-lock recovery, challenge detection, and multi-signal authentication.
- Added provider-scoped viewer, frame, and validated input routes.
- Removed all route-value reflection from the viewer document after CodeQL review.
- Reconciled browser-login attempt state with provider session state so an active session cannot be shown as cancelled or failed.
- Added metrics, activity, orchestration, fallbacks, request limits, model refresh, Perplexity browser support, and isolated CLI accounts.
- Rewrote README, dashboard Help, standalone Help, browser-login guide, and changelog.
- Removed the navigation footer text requested by the maintainer.

**Verification:**
- 341 tests pass across 21 files.
- Typecheck, build, both secret scans, npm audit, and diff check pass.
- Grok, Gemini, and Perplexity restore on the live host.
- Grok viewer returned a real JPEG frame through 31338 and accepted bounded input.
- A real `web-grok/grok-fast` request returned `pong`.
- Ports 5900 and 6080 have no listener.

**Remaining:**
- Claude requires a manual security check.
- ChatGPT currently shows a sign-in affordance and is treated as signed out.
- Xauthority hardening remains for shared hosts.
- Inactive legacy system packages require administrator access to purge.

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

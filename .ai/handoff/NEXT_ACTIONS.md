# NEXT_ACTIONS.md — conduit-bridge

_Last updated: 2026-03-12_

## Status Summary

| Status  | Count |
|---------|-------|
| Done    | 2     |
| Ready   | 4     |
| Blocked | 0     |

---

## ⚡ Ready — Work These Next

### T-003: [high] — Add test suite (vitest)

- **Goal:** Basic test coverage for server routes, registry, and config.
- **What to do:**
  1. Add `tests/server.test.ts` — health, models, status endpoints (mock registry)
  2. Add `tests/config.test.ts` — loadConfig defaults, saveConfig roundtrip
  3. Add `tests/registry.test.ts` — providerForModel, allModels
  4. `npm test` must pass
- **Definition of done:** `npm test` green, at least 20 tests.

### T-004: [medium] — Session expiry tracking

- **Goal:** Track when browser sessions will expire (cookie expiry) per provider.
- **Context:** cli-bridge has this via `*-expiry.json` files in `~/.conduit/`.
- **What to do:**
  1. Add `saveExpiry(provider, expiresAt: Date)` / `loadExpiry(provider)` to `config.ts`
  2. After successful login, detect cookie expiry from browser and save
  3. Expose `cookieExpiresAt` in `ProviderStatus`
  4. Add `/v1/status` field for each provider
- **Definition of done:** Status endpoint shows expiry date per provider.

### T-005: [high] — Replace selector polling with proper response interception

- **Goal:** More reliable response capture using network intercept or streaming DOM observer.
- **Context:** Current `pollForResponse()` is fragile — UI selector changes break it.
- **What to do:**
  1. For Grok: intercept XHR/fetch response from `api.x.com/2/grok/add_response*`
  2. For Claude: intercept SSE stream from `claude.ai/api/organizations/*/messages`
  3. For Gemini: intercept response from `gemini.google.com/api/*`
  4. For ChatGPT: intercept SSE from `chatgpt.com/backend-api/conversation`
  5. Fall back to DOM polling only if intercept fails
- **Definition of done:** Responses are captured via network layer, not DOM polling.

### T-006: [medium] — Publish to npm + write README

- **Goal:** Make `@elvatis/conduit-bridge` available on npm. README already added.
- **Prerequisite:** T-003 (tests) must be done first.
- **What to do:**
  1. Verify all version strings match
  2. `npm publish --access public`
  3. Update STATUS.md
- **Definition of done:** `npm install @elvatis/conduit-bridge` works.

---

## 🚫 Blocked

_No blocked tasks._

---

## ✅ Recently Completed

| Task  | Title                                        | Date       |
|-------|----------------------------------------------|------------|
| T-001 | Scaffold project + AAHP handoff              | 2026-03-12 |
| T-002 | Initial implementation (server, 4 providers) | 2026-03-12 |

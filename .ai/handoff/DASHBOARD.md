# DASHBOARD — conduit-bridge

_Quick-glance state for autonomous agents. Last updated: 2026-03-12_

## 🚦 Current State

| Item | Value |
|---|---|
| Version | 0.2.6 |
| Build | ✅ passes (`npm run build`) |
| Tests | ❌ none yet (T-003) |
| npm published | N/A (not published to npm) |
| GitHub | ✅ https://github.com/elvatis/conduit-bridge |
| Next task | T-003 — Add test suite |

## 📦 Providers

| Provider | Adapter | Status |
|---|---|---|
| Grok | GrokProvider | ✅ implemented |
| Claude | ClaudeProvider | ✅ implemented |
| Gemini | GeminiProvider | ✅ implemented |
| ChatGPT | ChatGPTProvider | ✅ implemented |

## ⚡ Unblocked Tasks (priority order)
1. **T-003** [high] — Add vitest test suite
2. **T-005** [high] — Network intercept instead of DOM polling
3. **T-004** [medium] — Session expiry tracking
(T-006 npm publish dropped 2026-07-17: not published to npm)

## 🔗 Related Projects
- `conduit-vscode` — VS Code extension that embeds/manages this bridge
- `openclaw-cli-bridge-elvatis` — Server-side version (OpenClaw plugin, same concept)

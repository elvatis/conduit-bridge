# TRUST.md — conduit-bridge

_What has been manually verified vs. assumed._

## Verified ✅
- TypeScript compiles with zero errors (`npm run build`)
- dist/index.js and dist/cli.js generated correctly
- Package exports and bin entries in package.json correct
- BaseProvider Playwright session management logic (derived from battle-tested cli-bridge)
- Sequential startup restore with 2s delay (anti-OOM pattern verified in cli-bridge v1.3.5)

## Assumed / Not Yet Verified ⚠️
- Browser selectors for all 4 providers (derived from cli-bridge, but not tested locally)
  - Grok: `textarea[placeholder]` + `[data-testid="tweetText"]`
  - Claude: `.ProseMirror` + `.font-claude-message`
  - Gemini: `.ql-editor` + `model-response .markdown`
  - ChatGPT: `#prompt-textarea` + `[data-message-author-role="assistant"] .markdown`
- Login flow (headful browser opening correctly on all platforms)
- Response polling accuracy (T-005 should replace with network intercept)
- Config file creation on first run on Windows/macOS

## Security Notes
- Profiles in `~/.conduit/profiles/` contain browser cookies — treat as sensitive
- Never commit `~/.conduit/` to any repo
- No auth required for local proxy (127.0.0.1 only by default)
- If `host` is changed to `0.0.0.0`, add API key auth before exposing to network

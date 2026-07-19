# TRUST.md - conduit-bridge

_What has been manually verified vs. assumed._

> Tracks verification status of critical system properties. Every claim carries a
> Status and, since the Grounded Reflection Layer, an orthogonal Provenance field.

---

## Confidence Levels

| Level | Meaning |
|-------|---------|
| **verified** | An agent executed code, ran tests, or observed output to confirm this |
| **assumed** | Derived from docs, config files, or chat, not directly tested |
| **untested** | Status unknown; needs verification |

---

## Provenance (Draft v0.1, proposed)

The Grounded Reflection Layer adds an orthogonal *provenance* field recording HOW a
claim was checked, separate from the Status above. Provenance tokens, weakest to
strongest: `model_claim`, `self_reviewed`, `cross_model_reviewed`, `source_verified`,
`tool_verified`, `test_verified`, `runtime_observed`, `human_confirmed`.
`cross_model_reviewed` maps to status `assumed`, never `verified`; only
`source_verified` / `tool_verified` / `test_verified` / `runtime_observed` /
`human_confirmed` can support `verified` (grounded). Recorded in the Provenance column
of the register below, using `-` when unknown. TTL and expiry stay governed by the
Trust Decay rule (README section 2.5). See GROUNDING.md for the anchor matrix and
README section 2.10 for the doctrine.

Provenance is currently `-` (unknown) for every row: this migration adds the column
without re-verifying any existing claim.

---

## Verification Register

| Property | Status | Provenance | Last Verified | Agent | TTL | Expires | Notes |
|----------|--------|------------|---------------|-------|-----|---------|-------|
| TypeScript compiles with zero errors (`npm run build`) | verified | - | - | - | - | - | |
| dist/index.js and dist/cli.js generated correctly | verified | - | - | - | - | - | |
| Package exports and bin entries in package.json correct | verified | - | - | - | - | - | |
| BaseProvider Playwright session management logic | verified | - | - | - | - | - | Derived from battle-tested cli-bridge |
| Sequential startup restore with 2s delay | verified | - | - | - | - | - | Anti-OOM pattern verified in cli-bridge v1.3.5 |
| Browser selectors for all 4 providers | assumed | - | - | - | - | - | Derived from cli-bridge, not tested locally; see selector list below |
| Login flow (headful browser opens on all platforms) | assumed | - | - | - | - | - | |
| Response polling accuracy | assumed | - | - | - | - | - | T-005 should replace with network intercept |
| Config file creation on first run (Windows/macOS) | assumed | - | - | - | - | - | |

Browser selectors (assumed, derived from cli-bridge, not tested locally):

- Grok: `textarea[placeholder]` + `[data-testid="tweetText"]`
- Claude: `.ProseMirror` + `.font-claude-message`
- Gemini: `.ql-editor` + `model-response .markdown`
- ChatGPT: `#prompt-textarea` + `[data-message-author-role="assistant"] .markdown`

---

## Security Notes

- Profiles in `~/.conduit/profiles/` contain browser cookies: treat as sensitive
- Never commit `~/.conduit/` to any repo
- No auth required for local proxy (127.0.0.1 only by default)
- If `host` is changed to `0.0.0.0`, add API key auth before exposing to network

---

*Trust degrades over time. Re-verify periodically, especially after major refactors.*

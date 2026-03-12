# CONVENTIONS.md — conduit-bridge

## Language & Runtime
- TypeScript strict mode, ESM (`"type": "module"`)
- Node 16 module resolution (`"moduleResolution": "Node16"`)
- Target: ES2022
- Node.js >= 20 required

## Package
- Name: `@elvatis/conduit-bridge`
- npm scope: `@elvatis`
- Binary: `conduit-bridge` (via `bin.conduit-bridge` in package.json)
- Default port: `31338` (different from OpenClaw cli-bridge's `31337`)

## File Layout
```
.ai/handoff/          ← AAHP protocol files (this folder)
src/
  providers/
    base.ts           ← BaseProvider abstract class (Playwright context management)
    grok.ts           ← Grok adapter + shared helpers (buildUserMessage, pollForResponse)
    claude.ts         ← Claude adapter
    gemini.ts         ← Gemini adapter
    chatgpt.ts        ← ChatGPT adapter
  config.ts           ← loadConfig / saveConfig (~/.conduit/config.json)
  logger.ts           ← Logger class with onLine() subscription (for VS Code output)
  registry.ts         ← ProviderRegistry (manages all 4 adapters)
  server.ts           ← BridgeServer (HTTP server + route handlers)
  types.ts            ← Shared TypeScript types
  index.ts            ← Public API exports
  cli.ts              ← CLI entry point (start/status/login/config)
dist/                 ← Built output (gitignored)
package.json
tsconfig.json
```

## Code Style
- Named exports everywhere; no default exports except `types.ts`
- Provider adapters extend `BaseProvider` — never duplicate session logic
- All Playwright interactions wrapped in try/catch — never let a browser error crash the server
- Logs via `logger` singleton — never `console.log` in library code
- Sequential browser spawning — never `Promise.all` multiple providers
- `pollForResponse()` lives in `grok.ts` and is imported by other providers (DRY)

## Provider Implementation Rules
- `verifySelector` must match the main input element (textarea / editor)
- `restoreSession()` is profile-gated — if `!hasProfile`, return false immediately
- Sequential restore delay: 2000ms between providers (anti-OOM)
- Login timeout: 5 minutes (user logs in manually in headful browser)
- Response polling: 500ms interval, 3 stable polls = done, 120s hard timeout

## Release Checklist (mandatory for every publish)

### Before release
1. `npm run typecheck` — must pass (zero type errors)
2. `npm test` — all tests must pass
3. Bump version in ALL of:
   - `package.json` → `"version"`
   - `README.md` → `**Current version:** \`X.Y.Z\``
   - `.ai/handoff/STATUS.md` → Current Version line + Release History table

### Release steps
```bash
git add -u
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z — <summary>" --notes "<notes>" --latest
npm publish --access public
```

> ⚠️ `git tag + push` does NOT create a GitHub Release. `gh release create` is MANDATORY.
> ⚠️ npm does not allow overwriting versions. Get it right first time.

## Security Rules
- Never log or expose API keys / session cookies
- Profiles stored in `~/.conduit/profiles/` — not in the repo
- Config at `~/.conduit/config.json` — gitignored
- No credentials in source code

## Architecture Constraints
- `conduit-bridge` must have ZERO dependency on OpenClaw
- Playwright is the only browser automation dependency
- Must work offline (no outbound connections except to AI provider websites)
- BridgeServer must be embeddable (imported as library by conduit-vscode)

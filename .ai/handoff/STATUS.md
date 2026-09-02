# Status

_Updated: 2026-09-02_

## Unreleased — `fix/cli-transport-modes-discovery`

Four stacked defects made conduit-vscode appear dead in Ask, Edit, Plan and
Agent. All four are bridge-side; the extension needs no change.

1. **Prompt transport.** `claude` resolves to `claude.cmd`, so `runCli` routed
   it through `cmd.exe /c`, which ends its command line at the first newline —
   exit 0, no stderr. Since `flattenMessages` puts the system prompt first and
   the user turn last, the CLI received the system prompt alone. Prompt now
   rides stdin; `runCli` refuses a multi-line argv arg on the cmd.exe path.
2. **chat was mapped to plan.** `cliPermissionArgs` branched only on `agent`.
   chat / plan / agent are now distinct.
3. **`agentCwd` fell back to `homedir()`**, giving a CLI agent the whole user
   profile. Unusable or absent `cwd` now lands in an empty sandbox dir.
4. **The CLI catalogs were hardcoded and stale** — cli-gemini advertised a
   `gemini-3.5` family agy rejects and omitted the `3.7` family agy serves;
   cli-grok advertised `grok-4.3`, which `grok models` no longer reports. Both
   are now discovered at runtime, TTL-cached, refreshed via
   `POST /v1/models/refresh` (which forces past the TTL).

### Which providers discover, and which cannot

| provider | discovery | why |
| --- | --- | --- |
| `cli-gemini` | `agy models` | tab-separated `id<TAB>Display Name` |
| `cli-grok` | `grok models` | bullet list under an "Available models:" header |
| `cli-claude` | none | `claude` has no model-listing subcommand |
| `cli-codex` | none | `codex` has no model-listing subcommand |

`claude` and `codex` were checked against the real binaries: their subcommand
lists contain no `models` and no `--list-models`, so there is nothing to
discover from.

All four catalogs now live in `src/model-catalog.ts` as data, and any of them
can be overridden from `~/.conduit/models.json` (or `$CONDUIT_MODELS_FILE`)
with **no rebuild** — which is what removes the per-release build for the two
providers that cannot discover. Naming a provider PINS it: the list is served
verbatim and discovery is skipped for it, which doubles as the escape hatch for
an offline CLI or unparsable `models` output. Providers the file omits are
unaffected. Edits land on the next `POST /v1/models/refresh`, no restart.

A pin outranks an already-discovered catalog, not just the next discovery —
getting that wrong made the pin look accepted and then silently ignored, which
is how it was found.

Also: `agy` ignores the process cwd entirely (it runs in
`~/.gemini/antigravity-cli/scratch`), so `--add-dir` is now passed — the editor's
open folder was invisible to every `cli-gemini` turn before this. `quoteWin` no
longer drops empty arguments; `--effort` is not sent alongside a tier-suffixed
agy model id (agy refuses the combination); the argv bound scales to the
transport instead of applying a Windows constant on Linux; stdin has an error
handler so an early child exit fails the run, not the process.

`--effort` is doubly guarded, because a discovered catalog can contain ids no
shape heuristic anticipates. agy refuses the flag two different ways — a
tier-suffixed id "conflicts with --effort", and some models (the Anthropic ones
agy serves) do not support it at all — both exit 1 with empty stdout. The tier
check avoids the common wasted call; a stderr-matched retry without the flag
covers the rest, so a model agy adds later cannot break the provider.

### Known gap — agy chat mode is write-capable

`agy` exposes no read-only mode (`--mode` takes only `plan` or `accept-edits`),
so `cli-gemini` chat cannot be made read-only by a flag. With no permission flag
it will create a file when a prompt asks for one, including at an absolute path
outside the workspace. Two candidate mitigations were tested and neither works:
`--sandbox` restricts the terminal, not file writes (per agy's own help), and
`allowNonWorkspaceAccess: false` in `~/.gemini/antigravity-cli/settings.json`
did not block an absolute-path write in print mode.

Accepted deliberately: the alternative is `--mode plan` for chat, which is the
defect this branch set out to fix. Claude, Codex and grok all have real
read-only chat modes; the gap is agy-only. Revisit if agy gains a read-only mode
or a tool-deny flag.

### Operational note

The global `conduit-bridge` install is a **symlink into this workspace**, so the
running server is whatever `dist/` holds, and `/health` reports the version from
`package.json` rather than the built bundle — a stale `dist/` reports the new
version while running old code. Run `npm run build` and restart after pulling.

---

**v0.7.0** adds `mode` (`chat` | `plan` | `agent`) on `POST /v1/chat/completions`.
Agent requires `cwd`. Grok is plan-by-default. Pair with conduit-vscode 0.9.0.

CLI chat completions take `mode`: `chat` (read-only proxy, default),
`plan` (native CLI plan function), `agent` (workspace write, requires `cwd`).
Aliases: `agentic: true`, `plan: true`. Grok is no longer always-write; it
matches the others unless `mode=agent`. API/LM Studio ignore `mode`.

conduit-vscode Plan chat sends `mode: plan`. Spawn/fix-issue send `mode: agent`.
VS Code chat Agent mode stays host-side (`mode: chat`).

**v0.6.0** adds optional `cwd` on `POST /v1/chat/completions` so CLI providers
run in the editor workspace (conduit-vscode #86). API/LM Studio ignore it.

Released **v0.5.2** remains the previous desktop gateway. Transports: direct
APIs, authenticated local CLIs, and LM Studio. Sole listener: `127.0.0.1:31338`.

## Provider inventory

- API: `claude-api`, `codex-api`, `gemini-api`, `openrouter-api`,
  `perplexity-api`
- CLI: `cli-claude`, `cli-codex`, `cli-gemini`, `cli-grok`
- Local: `lmstudio`

API credentials and CLI authentication are independent. All `web-*`
providers and their automation runtime have been removed.

## Release v0.5.2

Squash-merged PR #99 (`a4a7a46`). Applied remaining Dependabot bumps on main
(`@anthropic-ai/sdk` 0.122.0, `@types/node` 26.4.1, `vitest` 4.1.11). AAHP
Dependabot PR #97 closed as superseded (already 3.12.0). Tag and GitHub
Release cut from this commit.

## Dependency baseline

- AAHP: 3.12.0
- supply-chain-guard: rolling `@v6`
- Playwright: removed

## Verification

- PR #99 CI on `b1ac722`: AAHP, Secret Scan, SCG, CodeQL green
- Main CI on `a4a7a46`: AAHP, Secret Scan, SCG, CodeQL green
- Typecheck after SDK/vitest bumps: passing
- Full local suite not run on this Windows host

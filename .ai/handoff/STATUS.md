# Status

_Updated: 2026-09-02_

## v0.8.0 — CLI transport, modes, cwd and model discovery

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

| provider | discovery | source |
| --- | --- | --- |
| `cli-gemini` | yes | `agy models` — tab-separated `id<TAB>Display Name` |
| `cli-grok` | yes | `grok models` — bullet list under "Available models:" |
| `cli-codex` | yes | `GET chatgpt.com/backend-api/codex/models?client_version=<codex --version>` |
| `cli-claude` | no | no listing of any kind; catalog file only |

### One prefix, one TRANSPORT — resold models are kept

`agy models` also reports `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and
`gpt-oss-120b-medium`. An earlier commit filtered those out on the grounds that
`cli-gemini/claude-sonnet-4-6` "collides" with the `cli-claude` namespace. That
was wrong and has been reverted.

There is no collision. Every advertised id is `<prefix>/<model>`, the prefixes
are distinct string constants, and `providerForModel` (registry.ts) resolves by
exact id first and by `ownsModel` prefix second — so the two ids are different
strings reaching different provider classes. Measured: with the filter ON,
`cli-gemini/claude-sonnet-4-6` was absent from `/v1/models` yet a POST to
`/v1/chat/completions` with that id still routed and answered, because
`ownsModel` matches the whole prefix regardless of the catalog. The filter only
removed the models from the picker; it never removed the route.

Reaching Claude Sonnet through an Antigravity subscription — different quota,
auth and rate limits than an Anthropic one — is a capability, not an accident.
`noteForeignVendors` now logs the cross-vendor rows and returns them unchanged,
on both routes (discovery and models.json).

What made the labelling honest instead:
- `/v1/models` now emits `display_name`, which it never did. Without it the
  picker could only show the bare slug, so a resold model appeared under a
  Gemini heading with nothing to identify it. It now reads
  `Claude Sonnet 4.6 (Thinking) (agy CLI)`.
- `owned_by` reports the CLI that answers (`agy`, `claude-code`, `codex`,
  `grok`), not a guess at the model's author. Inferring the author from the id
  prefix conflates who built a model with where it can be obtained, and those
  differ: `gpt-oss-120b-medium` is OpenAI's open-weight model, is served here
  by agy, and is not available from OpenAI at all — labelling it `openai` would
  advertise a route that does not exist. The author stays legible in the id and
  the display name; what a caller cannot otherwise tell is which subscription
  answers.
- `--effort` is suppressed for any non-`gemini-` id as well as tier-suffixed
  ones. agy rejects the flag for the resold models, so sending it guaranteed a
  failed spawn plus a retry. Verified: an effort-bearing turn on
  `cli-gemini/claude-sonnet-4-6` now succeeds with zero retries.

Anyone who does want a single-vendor namespace pins the provider in
`models.json`, which is honoured verbatim.

### Why not api.openai.com/v1/models for cli-codex

That endpoint lists API-*platform* models for an API key, which is a different
entitlement set from a ChatGPT subscription — measured: the platform advertises
`gpt-5.5-pro`, and a ChatGPT account rejects it with "not supported when using
Codex with a ChatGPT account". It is the right source for `api-codex` (which
authenticates with a key) and the wrong one for `cli-codex`. With the codex OAuth
token it returns 403 `Missing scopes: api.model.read` anyway.

The codex endpoint is undocumented and version-gated, so every failure falls back
to the catalog file rather than breaking the provider. It honours the endpoint's
own `visibility: "hide"` marker, which is what excludes `gpt-reserve` and
`codex-auto-review`.

`api.anthropic.com/v1/models` was tried for cli-claude with the Claude Code OAuth
token: it answered 401 "OAuth access token has expired", so whether a fresh token
carries the right scope is unverified. Not implemented; claude stays on the file.

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

`gpt-5.5-pro` was dropped from the cli-codex defaults: run against the real
binary it returns "not supported when using Codex with a ChatGPT account". The
other four were each verified usable. Availability is plan-dependent, so a plan
that does include it can add it in models.json. The `api-codex/gpt-5.5-pro`
entry is deliberately untouched — that provider authenticates with an API key,
not a ChatGPT account, and is a different availability set.

### API providers: discovery, and no advertising without a credential

`claude-api`, `gemini-api` and `codex-api` were the last hardcoded catalogs and
the last providers advertising models nobody could reach.

- **Discovery.** Each now refreshes from its vendor's documented list:
  `api.anthropic.com/v1/models` (`x-api-key` + `anthropic-version`, returns
  `{data:[{id, display_name}]}`), `generativelanguage.googleapis.com/v1beta/models`
  (`x-goog-api-key` header — deliberately not the `?key=` query form, which would
  put the credential in a URL; returns `{models:[{name:"models/…", displayName}]}`
  and is filtered to entries supporting `generateContent`), and
  `api.openai.com/v1/models`, which is OpenAI-shaped and reuses the existing
  `refreshModelCatalog` helper. All three fall back to the shipped list on any
  failure.
- **UNVERIFIED LIVE.** No API key is configured for any of the three on this
  machine, so only the parsers are tested, against the vendors' documented
  response shapes. The first person with a key should confirm
  `POST /v1/models/refresh` actually repopulates them.
- **No credential, no advertisement.** `ProviderAdapter.hasCredentials()` is a
  synchronous "could this request possibly be authorised" check;
  `registry.allModels()` skips providers that answer false. Before this, 16
  models sat in the picker whose request could only fail on auth — the same
  defect as a hardcoded id the CLI no longer serves. `/v1/models` went 516 → 500.
- Hiding is not silencing: `providerForModel` still resolves those ids, so a
  request answers `provider_unavailable` with "Configure its API credential"
  rather than "unknown model", and `/v1/status` plus the new
  `allModelsIncludingUnavailable()` still list them.

Note the mapping fix that came with it: `chat()` in all three fell back to
`MODEL_MAP[req.model] ?? req.model`, which would have sent the prefixed id
(`api-claude/…`) upstream as a model name for any *discovered* model. It now
strips the prefix.

### agy takes the prompt as JSON on stdin, not on argv

`agy -p <prompt>` put the whole prompt on the command line, which Windows caps
at 32767 characters — nowhere near enough for coding, where the prompt carries
files. It now rides stdin as one NDJSON frame:

    {"event":"user","message":{"role":"user","content":"..."}}

with `--input-format stream-json --output-format stream-json` and an attached
empty `-p=` to select print mode without consuming the next argument. The answer
comes back in a `{"event":"result","result":{status,response,error}}` frame, and
that frame is the oracle: a failed run can still exit 0, and an `--effort`
refusal now appears there rather than on stderr.

Measured end to end through the bridge, with a marker on the last line so a
dropped tail is visible instead of silent:

    160148 chars  tail arrived
    181722 chars  tail arrived
    192576 chars  tail arrived
    203363 chars  "The input was truncated before reaching a final line"
    257365 chars  truncated

So agy cuts just past 200000 — its own limit, not the OS's. `max_prompt_chars`
reports 180000 for agy, six times the old argv ceiling, with room below the last
measured success. The legacy `gemini` binary keeps the argv bound, because there
the command line really is the limit.

### /v1/models reports a transport prompt ceiling

`agy` takes the prompt on argv, so the OS command line bounds it — 30000 chars
for agy.exe on Windows, 7000 through a .cmd shim, 120000 on Linux — while the
models themselves advertise token windows in the millions. A client cannot
derive that: it depends on the binary and the platform, not the model. Left to
guess, conduit-vscode sized its context off the token window and the bridge
rejected the request at a fraction of it, which in agent mode killed the loop.

`/v1/models` now carries `max_prompt_chars` for models whose transport really
has a ceiling. stdin and prompt-file transports (cli-claude, cli-codex,
cli-grok) omit it, because for them there is none.

### /v1/models reports the limits too

`context_window` and `max_output_tokens` now ship alongside `max_prompt_chars`.
Discovered where a provider reports them — the Codex endpoint returns the
account's real `context_window` (272000 here), OpenRouter returns
`context_length` — and otherwise from a single prefix table in
model-catalog.ts, which `~/.conduit/models.json` can override per model:

    { "cli-claude": [{ "id": "claude-opus-6", "contextWindow": 2000000 }] }

Prefixes match longest-first, so `claude-haiku` gets 200000 while the rest of
`claude-` gets a million, and a resold model keeps its own family's numbers —
`cli-gemini/gpt-oss-120b-medium` reports 128000, not Gemini's million.

This is what lets a client stop shipping its own copy. conduit-vscode carried
MODEL_LIMITS, PROVIDER_FALLBACK_LIMITS and MODEL_DISPLAY_NAMES, all of which went
stale the moment catalogs became discovered rather than pinned.

### Checking a CLI's models by hand

    agy models        # tab-separated table
    grok models       # bullet list
    codex             # then /model or /models in the TUI — no non-interactive form
    claude            # no listing at all; see model-catalog.ts / models.json

### CI now runs the test suite

`.github/workflows/test.yml` runs typecheck, vitest and a real `npm run build` on
Linux and Windows. Before it, nothing in CI executed the tests — aahp-verify,
CodeQL and the scanners were the entire gate, so a red suite could merge green.
The Windows leg matters because the subprocess layer is Windows-specific (the
cmd.exe truncation that caused this outage would not fail on Linux at all).

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

**v0.7.0** added `mode` (`chat` | `plan` | `agent`) on `POST /v1/chat/completions`.
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

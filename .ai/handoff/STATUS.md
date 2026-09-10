> CLI & TUI Enterprise Overhaul and CI Stabilization (2026-09-10, PR #120): Delivered complete 3-phase systems, CLI/TUI and full-stack architecture implementation on `codex/agent-orchestrator-dashboard`. (1) Phase 1 Bugfix & CI Stabilization: Hardened `src/ui/i18n.ts` with null-guards, removed 4 obsolete summary DOM calls in `src/dashboard.ts`, added markup regression test `test/dashboard-markup.test.ts`, verified 57/57 Playwright UI tests and all Vitest suites. (2) Phase 2 Logging & High-End Help Screen: Installed `warning-filter.ts` suppressing experimental Node SQLite warnings, suppressed `.env` log dumps, instituted strict zero-noise interactive mode routing logs to `.conduit/logs/bridge.log` with console muting, and implemented ANSI help screen (`conduit-bridge help`) with 2-column command layout, live PATH availability verification for CLI binaries (`cli-gemini`, `cli-claude`, `cli-codex`, `cli-grok`), API backends, local engines, and workflow examples. (3) Phase 3 Ultimate Interactive TUI Architecture: Implemented `TuiDifferentialRenderer` with virtual double buffering and delta line diffing (100% jitter- and flicker-free typing without full-screen redraws), 60 FPS throttled render loop with synchronous test flush, full inference state machine (`IDLE` -> `THINKING` -> `STREAMING_TOKENS` -> `TOOL_INVOCATION` -> `DIFF_APPLY` -> `DONE`) with ms timer and live tokens/s telemetry, collapsible tool invocation cards with exit codes and syntax-highlighted diffs (`+` green, `-` red, `@@` cyan), grouped fuzzy model picker (`Ctrl+P`), workspaces (`Ctrl+W`), and local insights (`Ctrl+I`). Validation: 76/76 test files, 746/746 Vitest tests green, 57/57 Playwright UI browser tests green, `npm run build` green, AAHP lint clean.

> Execution workspaces, model abstraction, CLI experience and cockpit overhaul (2026-09-10, PR #120): Delivered complete implementation on branch `codex/agent-orchestrator-dashboard` under existing PR #120. (1) Model abstraction: realized `ModelDescriptor`, `ProviderRuntime`, `RuntimeSession`, `SessionState`, capability descriptors (tools, executionEvents, interactiveApproval, steering), and model swap planning. (2) Git workspace: protected cache eviction during active workspace mutations with `isMutating()` guard. (3) Execution continuation & event persistence: added `action: 'continue'` to resume execution on existing run IDs without re-executing completed iterations, durable persistence of step events across restarts, and `GET /v1/platform/runs/:id/events`. (4) Fail-closed agent resilience: implemented chat fallback with strict fail-closed behavior for agent mode (no tool replay across models). (5) Ultimate CLI experience: interactive TUI with runs/workspaces views, single-key run controls (`[Enter]`, `[A]`, `[C]`, `[X]`, `[R]`), execution slash commands (`/run`, `/continue`, `/approve`, `/cancel`, `/workspaces`, `/status`), plus scriptable subcommands (`conduit-bridge run`, `runs`, `sessions`, `workspaces`, `models`). (6) Dashboard overhaul: transformed Overview into unified Home Cockpit with Attention Required banner, Active/Recent Runs table, Workspaces/Git status, and relabeled Playground as API Proxy Console. (7) Validation: 75 test files passed, 726/726 unit and integration tests green, production build passed.

> Session continuity follow-up (2026-09-10): Implemented PR #120 merge-gate fixes on this branch only. Explicit `profileId`/`agentId` null now clears leftover pins on the next turn; native CLI session keys hash `profile.id` instead of the live profile object; Git mutations no longer inherit the Bash/Shell deny list; operator-token navigation includes Insights; the composer reports a fresh native session after a CLI provider change. `GET /v1/models` and `/v1/platform/models` now attach `capabilities` (modes, effort, streaming, nativeResume, local). Completed-run command evidence already survived store reload; a restart test now locks that. Validation: targeted Vitest 101+57 related files green; Git Bash mutation cut went 403 then 200 after restore; production build passed; rebuilt loopback bridge on 31338 reports health ok, BitNet 8080 health ok, 7 retained sessions, and capability metadata on advertised models. Continue-turn, platform-path fallback, and named long-lived workers remain deferred. No new branch or PR.

> Guided native installation (2026-09-08): Reviewed README and rewrote docs/guides/bitnet.md as a staged Windows x64 llama-server/BitNet walkthrough. It covers toolchain installer choices and PATH checks, the pinned helper, a resumable Microsoft GGUF download with size/SHA-256, generated absolute-path configuration, separate native/bridge readiness and ownership, the first PowerShell/Webchat request, manual lifecycle, daily startup and diagnostic recovery. Linux/native-build limits remain explicit. Updated getting-started, documentation index and .env.example; repaired duplicated README release text and stale visual description. Validation: all 17 PowerShell blocks parse on PowerShell 5.1/7; preflight/checksum checkpoints run on both, model size/hash match the existing file, download HEAD returns 200, production dotenv parsing accepts all eight emitted settings, and all 27 checked section links resolve. Existing focused tests pass 31/31; build, secret scan, dependency audit and governance pass. No runtime settings, services or model files changed. Updating PR #120; preceding demo head 37a3fe3 passed all eight hosted checks. No merge or release.

> Demo refresh (2026-09-08): Regenerated assets/demo.gif from the corrected dashboard. The English tour now covers filtered insights, numbered source links, opening the exact original message, Help examples, introduction re-entry and page search. Its seven synthetic messages are checked by the current evidence classifier; assertions require four supported categories and reject the question/test echoes. Recording asserts no provider or mutation requests. Dialog captions remain readable above their backdrops. Visually inspected source frames and decoded GIF frames; verified 1200x800, 407 frames, 40.7 seconds, about 2.01 MiB. README and recording documentation updated. Existing application validation on a059862 passed 690 tests, 57 browser cases and all eight hosted checks. Updating PR #120 with the refreshed media; no merge or release.

> Selection/category repair (2026-09-08): Reproduced native BitNet misclassification with 18 synthetic English/German cases, initially 7 correct. Conservative complete-sentence evidence gates now exclude information questions, unmade choices, hypothetical suggestions, test echoes and quoted/code examples. BitNet selects only existing statement IDs, binding original wording, category and provenance through extraction and reduction. Bounded input groups preserve category diversity, handle Unicode/negation across transport boundaries and reject duplicate or unknown IDs. Format 3 rebuilds earlier reports. The fixed native suite passes all 18 cases plus three aggregation/source scenarios in 21 inference calls. Full Vitest passes 690 tests/72 files (30.82s); nine affected browser/accessibility cases pass (53.8s), including long excerpts and original-message focus/content. Build, Secret Scan and dependency audit pass. The current seven test/help chats yield no supported insights from 34 messages; earlier misleading entries are gone and the empty report survives a real restart with the same timestamp. Both services are healthy. Updating PR #120; no merge or release. See docs/validation/session-insights.md for limits and reproducible native checks.

> Earlier usability implementation (2026-09-08): Added first-visit introduction with Help re-entry, keyboard page search, accessible controls, dedicated examples and local BitNet summaries with encrypted progress, cancellation/resume and strict owner/source/credential revalidation. Original full validation passed 633 tests and 57 browser cases. The selection/category follow-up above supersedes the initial five-item native report and its model-driven categories.

> Supply chain and settings follow-up (2026-09-08): Reviewed PR #120 scanner comment. Isolated provenance into a job with only SHA-pinned GitHub download/attestation actions; build has no write permissions, publishing depends on attestation, checkout does not persist credentials. Added two documented line-specific exceptions for the local UI import false positive and the required isolated OIDC permission. Exact CI scanner 6.0.15 reports zero findings at low minimum, score 0 and two suppressions; removing the comments restores exactly the two findings. actionlint, secret scan and governance checks pass. Expanded navigation is left aligned. Credential forms have 16px input/save-icon gaps, accessible names and usable widths including dynamic tooltips. All 48 browser tests pass (47.0s); 24 rows additionally pass a six-width/two-language geometry audit. Production build passes. Local bridge restarted idle, preserving seven chats; bridge and BitNet return 200. No merge or release.

> Text, language and design follow-up (2026-09-08): Centered select labels and balanced pipeline fields. Added Apple-inspired glass navigation/popovers, opaque content, capsule buttons, segmented choices, system type and clearer switches/sliders. German copy now covers dynamic Effort controls and levels, all 17 shipped presets, installed template originals, 23 tool descriptions, Git actions, empty states and chart dates; edited content and wire values are preserved. Complete local suites pass 613 tests/70 files (32.94s) and 48 browser cases (44.3s); the final installed-preset follow-up passes all 45 affected contracts and four language browser cases. Build passes and the English GIF is regenerated. Updating PR #120; previous head 77c34c3 passed every hosted check. No merge or release.

> Note (2026-09-08, codex/agent-orchestrator-dashboard): Added the full-page Elvatis execution workspace, shared Effort/Faster speed controls, public Codex execution events, persistent chat projects, repository analytics and Git/worktree views. The final design pass aligns buttons/icons, fixes responsive settings and popovers, and adds navigation resizing with persistence and keyboard controls. Windows: 611 tests/70 files and 44 browser tests pass after the second inspection, with all 22 pages and six workspace tabs checked in English/German at 390/768/1280/1920/3840px. Build passes. Added isolated Chromium CI, English demo.gif with reproducible recording, and workspace examples. The rebuilt local bridge runs on 31338 with seven retained chats; BitNet remains healthy on 8080. MIT PR #119 merged separately. PR #120 is open; no release. See docs/validation/execution-workspace.md and the runtime gap analyses.

PR #120 is open for the workspace branch. Hosted Linux, Chromium, CodeQL and
security checks passed on its first head. Hosted Windows exposed two temporary
path alias expectations in the new Git/analytics fixtures; they now assert
canonical paths and explicitly exercise junction/symlink registration.
Both complete affected test files pass locally (34 tests).

Second inspection (2026-09-08): Fixed stale accessible sidebar width after
reset, keyboard/focus handling in three legacy dialogs, Git dialog naming,
nested model/Effort menus and narrow dialog footers. Fixed background polling
erasing failed-action errors; action and refresh errors now clear independently.
Added ten browser regressions. Full Windows validation passes: 611 tests in
70 files, 44 browser tests and production build. The one real-Git merge fixture
has a bounded 15-second allowance after a demonstrated load timeout. The local
bridge is rebuilt on 31338 with seven chats preserved; BitNet is healthy on 8080.
Updating existing PR #120; its previous head ab51b53 had all hosted checks green.

# Current update - MIT license (2026-09-08)

The repository owner requested changing the project license from Apache-2.0 to MIT. LICENSE now contains MIT with the original Elvatis / Emre Kohler copyright attribution. The root package manifest, root lockfile metadata and README agree. Third-party dependency license declarations remain unchanged. Linux and Windows tests, CodeQL, Secret Scan and Supply Chain Guard passed on the license commit; this follow-up refreshes the required handoff state and manifest.

> Note (2026-09-07, Dependabot #113): Updated `actions/download-artifact` from v7 to v8; refreshed the handoff manifest for this workflow dependency change.

> Note (2026-09-07, Dependabot #115): Updated `vitest` from 4.1.11 to 5.0.0; refreshed the handoff manifest for this dependency change.

> Note (2026-09-07, Dependabot #116): Updated `@anthropic-ai/sdk` from 0.122.0 to 0.123.0; refreshed the handoff manifest for this dependency change.

> Note (2026-09-07): Before merging PR #117, fixed four new CodeQL findings, removed credential material from CLI config output, pinned Supply Chain Guard to a commit, and added release build provenance attestation. Focused security tests, build, Secret Scan and AAHP check pass; GitHub checks are rerunning on the updated head.

> Note (2026-09-07): `cli-gemini` now recognizes the Antigravity CLI credential file used by `agy`, with a regression test. This keeps authenticated model discovery and chat execution aligned on the current `main` baseline.

> Note (2026-09-07): Conversations now always persist locally in encrypted SQLite by default, with legacy file import and no conversation TTL. Vault adds SQLite FTS5/tgrep search and recurring local BitNet prompt suggestions. Configured Llama inference autostarts with Conduit. Windows: 547 tests/64 files, build and two real native start-stop cycles pass; see `docs/validation/vault.md`.

> Note (2026-09-07, feat/provider-agent-management): v0.10.0 work includes the Elvatis Conduit dashboard rebrand, named work routing, native BitNet, tgrep, persistent sessions, scoped skills, provider profiles, governed runs, budgets and diagnostics. The prior orchestration and governance platform remains part of this release.

> Note (2026-09-03, claude-opus-5): Cut v0.9.1. Governance only, zero src changes since v0.9.0 - the running v0.9.0 was already functionally current, so this release ships documentation and gate configuration and nothing else. Also pinned CLAUDE.md as a fourth version site, mutation-proved: reverting its version line turns version-sync red. conduit-vscode pins the same file, and it had gone stale there at 0.9.0 against a package.json of 0.10.1, which is the exact defect this pins against. First release cut by .github/workflows/release.yml in this repository; it publishes no asset by design.

> Note (2026-09-03, claude-opus-5): Added .github/workflows/release.yml. A tag push bypasses branch protection entirely here: tags are unprotected (rulesets is empty) and main has NO required status checks at all, so a tag could be cut at any commit in any state with nothing looking at it. The workflow refuses a tag that does not match package.json and package-lock.json, is not an ancestor of origin/main, or has no matching CHANGELOG.md section, then runs aahp verify/check/doctor plus typecheck, tests and build before publishing the GitHub Release with notes from the changelog. It publishes NO asset on purpose: this project is not on npm and ships no artifact, all 14 releases carry zero assets by design per docs/RELEASING.md, and porting conduit-vscode asset assertion would fail on every release forever. Lightweight tags (v0.2.5, v0.3.0, v0.4.0) fall back to the tag name for the title instead of failing. OPERATIONAL: GitHub loads the workflow from the TAGGED COMMIT, so the first tag cut before this file exists runs nothing, silently.

> Note (2026-09-03, claude-opus-5): Renamed the secret-scan job display name to "Secret Scan". Both secret-scan.yml and supply-chain-guard.yml declared a job named "Scan", so two check runs shared one name. A required status check is matched by that string, which means requiring "Scan" could have been satisfied by whichever of the two reported, and the other could fail without blocking a merge. Prerequisite for adding required checks to this repository, which currently has NONE.

> Note (2026-09-03, claude-opus-5): Turned on the governance gates that had been reporting SKIP since this repository existed. version-sync was never configured, and aahp check never ran in CI at all - only verify and doctor - so forbidden-patterns had been failing on main unseen with 51 banned em dash characters on 50 lines. The version anchors version-sync pins did not exist: README had no Current version banner, this file had no Current Version header, and its only boundary match for 0.9.0 was a coincidental mention of conduit-vscode, now v-prefixed and forbidden by a new rule. Also removed the Dependabot exemption: the gate stayed a required check while no-opping to success for dependabot[bot], which branch protection displays as green. aahp doctor now reports 7 of 7 gates. Every enabled gate was mutation-proved - nine mutations, each turning its gate red, unmodified tree green. Three of those proofs were wrong on the first pass and read exactly like blind gates, so the corrected constructions are recorded in the PR. Not in this change: the 84 em dashes in .ts, 19 of them in runtime strings, which is a behaviour change and needs its own review.

> Note (2026-09-03, claude-opus-5): Added .claude/settings.local.json to .gitignore. The file is not tracked here, but nothing in the repository was excluding it either - only a global ~/.gitignore on one machine, which is per-machine state: a checkout on another machine would have committed it on its first "git add -A". That is exactly how conduit-vscode published the same file for five months (2026-03-15 to 2026-09-03), exposing the operator username and an internal host name. Repository-local rules are the only ones that travel with the repository.

# Status

## Current Version: 0.10.0

_Updated: 2026-09-07_

## Addendum: planning, CLI sessions, BitNet and code search

- Hosted Windows CI exposed aliased temporary-path output in code search. Search
  roots and result paths now share canonical workspace coordinates; regression
  coverage uses a real junction/symlink ancestor and verifies absolute cwd too.
- Registered eleven executable skills and eleven providers. Added persistent
  per-provider cloud quotas/cost estimates, validated task splitting/execution,
  keyword routing, notifications, scoped daily journals and native CLI continuity.
- Added BitNet's local HTTP adapter and owned native server management, plus
  tgrep TCP/CLI indexed search with ripgrep fallback and approved index lifecycle.
- Added authenticated /api/orchestrate, /api/skills, /api/providers/status,
  /api/bitnet/server and /api/tgrep endpoints; existing policy/accounting applies.
- Windows 512 tests in 62 files and production build pass. Nine real service
  scenarios and seven native tgrep cases pass. Claude, Codex and agy each resumed
  one native session across two turns; a real parallel dependency plan completed.
- BitNet 2B-4T now runs natively on Windows without Conda. The checked-in build
  helper applies a narrowly scoped upstream relu2 correction; host-only tokenizer
  and chat-template settings preserve the supplied, ignored GGUF unchanged.
  Patch files are pinned to LF; reverse application was verified against a
  Windows CRLF source checkout to keep the native build reproducible.
  Four direct/provider checks, eight bridge checks and one full local planning/
  execution request pass. Sustained generation measured about 31-32 tokens/s.
- Planning now specifies string task IDs and retains original input in every
  generated task. Small-model instruction-following limits are documented in
  docs/BITNET-NATIVE-WINDOWS.md. Gemini API credentials and a loaded LM Studio
  model remain unavailable. No external webhook was sent.
- Read docs/ADDENDUM-INTEGRATIONS.md and docs/ADDENDUM-VALIDATION.md. Optional
  administrator-started loopback inference/search daemons are explicitly requested
  additions; the gateway port stays unchanged. No merge or release.

## Tools, GitHub Projects and VS Code extension pass

- Added six typed executable tools with host authorization: Perplexity search,
  workspace filesystem, GitHub Actions, public page fetch, scoped KV memory and
  bounded subprocess execution. Prompt catalog attachments remain separate.
- Added remote GitHub Projects v2 queries/item mutations and local workspace
  associations; service GITHUB_TOKEN is separate from bridge/operator auth.
- Added accessible settings tooltips and the authenticated /vscode protocol for
  streaming chat, edit proposals, approved agent runs and usage queries.
- Windows 470 tests/build pass; genuine Linux 469 pass, one Windows-only DPAPI skip,
  build pass. Ten live service smoke checks pass, including real Perplexity search,
  Claude streaming, Codex edit proposals and an approved Codex physical file write.
- GitHub remote mutations are fixture-tested only: the local service has no
  GITHUB_TOKEN and returns the expected 503. See docs/INTEGRATIONS-VALIDATION.md.
- Hosted Windows CI exposed a short-path versus canonical-path fixture mismatch; the subprocess cwd assertion now uses the canonical directory. Runtime behavior is unchanged.
- The real Windows DPAPI test has a 40-second integration-test allowance for two bounded OS subprocess calls; this replaces an unreliable five-second default on hosted runners.
- No new package dependencies, ports, database decision, merge or release.
## PR #117 provider and agent platform

- Implemented portable session Webchat, scoped reviewed memory, versioned skills
  and prompts, agent attachments, bounded runs, artifacts and evaluations.
- Added encrypted transactional state with file, SQLite, injected Prisma and
  volatile memory backends. Database selection stays open. Windows DPAPI,
  Linux Secret Service and explicit headless keys protect the vault master key.
- Added scoped operator authentication, revocation-aware queued execution,
  named provider profiles, isolated credentials, CLI diagnostics and executable
  selection. Codex Windows workspace-write execution now passes the real test.
- Final Windows suite: 379 tests in 35 files pass; typecheck and build pass.
  Linux: full suite/build pass, then final UI delta 18/18 pass; combined coverage
  378 pass and one Windows-only DPAPI skip. Live Linux Secret Service untested.
- All 12 real Windows provider matrix cases pass across Claude, Codex, agy/Gemini
  and Grok: shared conversation, two-iteration loop, physical file write/read.
  The earlier three Claude approval/debate examples also passed.
- Browser QA verifies retention across service restart, memory approval, CLI
  diagnostics, catalog rendering and narrow-screen layout. The service is running.
- Branch sync is authorized. Review `docs/PLATFORM-GUIDE.md`, implementation status
  in `docs/PROVIDER-AGENT-ROADMAP.md`, and `docs/PLATFORM-VALIDATION.md` before merge.
  No version bump, release or merge was performed.
## Enterprise Multi-Agent Orchestration & Governance Platform (feat/provider-agent-management)

1. **Repository Governance & Pipeline Templates**:
   - 9 built-in governance templates: Standard Governance, Documentation Generation, Documentation Review, Refactoring Review, Automated PR Review, Release Readiness, Architecture & Design Review, Dependency Risk Assessment, and Supply Chain Security Posture.
   - Repository-specific pipeline bindings and policy overrides (`requireSecuritySignoff`, `mandatoryGates`).
   - Live human approval gates (`waiting_approval`) with pause/resume support (`/v1/pipelines/runs/action`).
   - Immutable audit trail recording each approval and rejection with operator feedback, timestamp, and correlation ID (`/v1/governance/audit`, JSON/Markdown export at `/v1/governance/audit/export`).

2. **Pipeline Budget Controls & Spending Limits**:
   - `BudgetManager` enforcing daily and monthly USD spend caps, per-run cost ceilings, and token limits.
   - Real-time threshold calculation (Safe, Warning, Exceeded) with configurable Hard Stop (execution rejection) vs Soft Warning (operator notification).
   - Live visual budget meters on the dashboard with spend percentages and automatic UTC midnight/monthly rollover.

3. **Automatic Host Tool Discovery & Categorized Catalog**:
   - Auto-detection of developer binaries on Windows and Linux system PATH (git, node, npm, python, docker, etc.).
   - Tool classification taxonomy (Read Only, Workspace Modify, System Modify, Network Access, External Service) and security risk ratings (Low, Medium, High, Critical).
   - Dynamic discovery endpoint (`POST /v1/tools/discover`) and unified catalog (`GET /v1/tools`).

4. **Working Directory & Workspace Management**:
   - Validated workspace registry with disk existence checks and write-permission verification.
   - Filesystem directory browser endpoint (`POST /v1/workspaces/browse`) for safe folder traversal.
   - Quick-select integration into Playground and Pipeline execution runners.

5. **Usage Statistics & Real-Time Visual Analytics**:
   - Pure vanilla SVG dashboard charts without external CDN dependencies.
   - Model request volumes and average latencies, token and cost share progress, pipeline run outcomes breakdown, and operational events by severity.
   - Aggregated analytics endpoint (`GET /v1/analytics/overview`).

6. **Activity Streams & Operational Telemetry**:
   - End-to-end correlation tracking with `traceId` linking chat requests, pipeline executions, and audit logs.
   - Filter chips (Info, Success, Warning, Error) and live log search.
   - Full activity log export in JSON and Markdown formats (`/v1/activity/export`).

## v0.8.0 - CLI transport, modes, cwd and model discovery

Four stacked defects made conduit-vscode appear dead in Ask, Edit, Plan and
Agent. All four are bridge-side; the extension needs no change.

1. **Prompt transport.** `claude` resolves to `claude.cmd`, so `runCli` routed
   it through `cmd.exe /c`, which ends its command line at the first newline -
   exit 0, no stderr. Since `flattenMessages` puts the system prompt first and
   the user turn last, the CLI received the system prompt alone. Prompt now
   rides stdin; `runCli` refuses a multi-line argv arg on the cmd.exe path.
2. **chat was mapped to plan.** `cliPermissionArgs` branched only on `agent`.
   chat / plan / agent are now distinct.
3. **`agentCwd` fell back to `homedir()`**, giving a CLI agent the whole user
   profile. Unusable or absent `cwd` now lands in an empty sandbox dir.
4. **The CLI catalogs were hardcoded and stale** - cli-gemini advertised a
   `gemini-3.5` family agy rejects and omitted the `3.7` family agy serves;
   cli-grok advertised `grok-4.3`, which `grok models` no longer reports. Both
   are now discovered at runtime, TTL-cached, refreshed via
   `POST /v1/models/refresh` (which forces past the TTL).

### Which providers discover, and which cannot

| provider | discovery | source |
| --- | --- | --- |
| `cli-gemini` | yes | `agy models` - tab-separated `id<TAB>Display Name` |
| `cli-grok` | yes | `grok models` - bullet list under "Available models:" |
| `cli-codex` | yes | `GET chatgpt.com/backend-api/codex/models?client_version=<codex --version>` |
| `cli-claude` | no | no listing of any kind; catalog file only |

### One prefix, one TRANSPORT - resold models are kept

`agy models` also reports `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and
`gpt-oss-120b-medium`. An earlier commit filtered those out on the grounds that
`cli-gemini/claude-sonnet-4-6` "collides" with the `cli-claude` namespace. That
was wrong and has been reverted.

There is no collision. Every advertised id is `<prefix>/<model>`, the prefixes
are distinct string constants, and `providerForModel` (registry.ts) resolves by
exact id first and by `ownsModel` prefix second - so the two ids are different
strings reaching different provider classes. Measured: with the filter ON,
`cli-gemini/claude-sonnet-4-6` was absent from `/v1/models` yet a POST to
`/v1/chat/completions` with that id still routed and answered, because
`ownsModel` matches the whole prefix regardless of the catalog. The filter only
removed the models from the picker; it never removed the route.

Reaching Claude Sonnet through an Antigravity subscription - different quota,
auth and rate limits than an Anthropic one - is a capability, not an accident.
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
  by agy, and is not available from OpenAI at all - labelling it `openai` would
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
entitlement set from a ChatGPT subscription - measured: the platform advertises
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
with **no rebuild** - which is what removes the per-release build for the two
providers that cannot discover. Naming a provider PINS it: the list is served
verbatim and discovery is skipped for it, which doubles as the escape hatch for
an offline CLI or unparsable `models` output. Providers the file omits are
unaffected. Edits land on the next `POST /v1/models/refresh`, no restart.

A pin outranks an already-discovered catalog, not just the next discovery -
getting that wrong made the pin look accepted and then silently ignored, which
is how it was found.

`gpt-5.5-pro` was dropped from the cli-codex defaults: run against the real
binary it returns "not supported when using Codex with a ChatGPT account". The
other four were each verified usable. Availability is plan-dependent, so a plan
that does include it can add it in models.json. The `api-codex/gpt-5.5-pro`
entry is deliberately untouched - that provider authenticates with an API key,
not a ChatGPT account, and is a different availability set.

### API providers: discovery, and no advertising without a credential

`claude-api`, `gemini-api` and `codex-api` were the last hardcoded catalogs and
the last providers advertising models nobody could reach.

- **Discovery.** Each now refreshes from its vendor's documented list:
  `api.anthropic.com/v1/models` (`x-api-key` + `anthropic-version`, returns
  `{data:[{id, display_name}]}`), `generativelanguage.googleapis.com/v1beta/models`
  (`x-goog-api-key` header - deliberately not the `?key=` query form, which would
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
  models sat in the picker whose request could only fail on auth - the same
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
at 32767 characters - nowhere near enough for coding, where the prompt carries
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

So agy cuts just past 200000 - its own limit, not the OS's. `max_prompt_chars`
reports 180000 for agy, six times the old argv ceiling, with room below the last
measured success. The legacy `gemini` binary keeps the argv bound, because there
the command line really is the limit.

### /v1/models reports a transport prompt ceiling

`agy` takes the prompt on argv, so the OS command line bounds it - 30000 chars
for agy.exe on Windows, 7000 through a .cmd shim, 120000 on Linux - while the
models themselves advertise token windows in the millions. A client cannot
derive that: it depends on the binary and the platform, not the model. Left to
guess, conduit-vscode sized its context off the token window and the bridge
rejected the request at a fraction of it, which in agent mode killed the loop.

`/v1/models` now carries `max_prompt_chars` for models whose transport really
has a ceiling. stdin and prompt-file transports (cli-claude, cli-codex,
cli-grok) omit it, because for them there is none.

### /v1/models reports the limits too

`context_window` and `max_output_tokens` now ship alongside `max_prompt_chars`.
Discovered where a provider reports them - the Codex endpoint returns the
account's real `context_window` (272000 here), OpenRouter returns
`context_length` - and otherwise from a single prefix table in
model-catalog.ts, which `~/.conduit/models.json` can override per model:

    { "cli-claude": [{ "id": "claude-opus-6", "contextWindow": 2000000 }] }

Prefixes match longest-first, so `claude-haiku` gets 200000 while the rest of
`claude-` gets a million, and a resold model keeps its own family's numbers -
`cli-gemini/gpt-oss-120b-medium` reports 128000, not Gemini's million.

This is what lets a client stop shipping its own copy. conduit-vscode carried
MODEL_LIMITS, PROVIDER_FALLBACK_LIMITS and MODEL_DISPLAY_NAMES, all of which went
stale the moment catalogs became discovered rather than pinned.

### Checking a CLI's models by hand

    agy models        # tab-separated table
    grok models       # bullet list
    codex             # then /model or /models in the TUI - no non-interactive form
    claude            # no listing at all; see model-catalog.ts / models.json

### CI now runs the test suite

`.github/workflows/test.yml` runs typecheck, vitest and a real `npm run build` on
Linux and Windows. Before it, nothing in CI executed the tests - aahp-verify,
CodeQL and the scanners were the entire gate, so a red suite could merge green.
The Windows leg matters because the subprocess layer is Windows-specific (the
cmd.exe truncation that caused this outage would not fail on Linux at all).

Also: `agy` ignores the process cwd entirely (it runs in
`~/.gemini/antigravity-cli/scratch`), so `--add-dir` is now passed - the editor's
open folder was invisible to every `cli-gemini` turn before this. `quoteWin` no
longer drops empty arguments; `--effort` is not sent alongside a tier-suffixed
agy model id (agy refuses the combination); the argv bound scales to the
transport instead of applying a Windows constant on Linux; stdin has an error
handler so an early child exit fails the run, not the process.

`--effort` is doubly guarded, because a discovered catalog can contain ids no
shape heuristic anticipates. agy refuses the flag two different ways - a
tier-suffixed id "conflicts with --effort", and some models (the Anthropic ones
agy serves) do not support it at all - both exit 1 with empty stdout. The tier
check avoids the common wasted call; a stderr-matched retry without the flag
covers the rest, so a model agy adds later cannot break the provider.

### Known gap - agy chat mode is write-capable

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
`package.json` rather than the built bundle - a stale `dist/` reports the new
version while running old code. Run `npm run build` and restart after pulling.

---

**v0.7.0** added `mode` (`chat` | `plan` | `agent`) on `POST /v1/chat/completions`.
Agent requires `cwd`. Grok is plan-by-default. Pair with conduit-vscode v0.9.0.

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

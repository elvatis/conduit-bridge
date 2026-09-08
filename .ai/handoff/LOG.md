# Work log

_Reverse chronological._

## 2026-09-08 - PR #120 Windows fixture correction

- Published the requested workspace PR after integrating the MIT main update.
- Linux, Chromium UI, CodeQL, AAHP and security checks passed. Hosted Windows
  exposed short-name versus canonical temporary-path assertions in two new tests.
- Corrected expected paths and strengthened both cases with explicit aliased
  workspace roots. Production path handling and authorization are unchanged.
- Both affected test files pass locally: 34 tests, including real Git/worktree
  actions in isolated repositories and scoped HTTP authorization.

## 2026-09-08 - UI controls, navigation and functional coverage

- Aligned control heights, padding, icon centers, popovers and responsive forms
  throughout the Elvatis dashboard; execution input stays below run evidence.
- Added pointer and keyboard navigation resizing, persistence, cancellation
  and reset, plus short-window scrolling without overlapping navigation links.
- Fixed Effort positioning/focus-scroll behavior and the analytics identity
  initialization race exposed by browser regression tests.
- Added 34 isolated Playwright checks and Linux Chromium CI. All 22 navigation
  sections and six platform tabs fit five viewport widths in both languages.
- Reran all 611 Vitest tests in 70 files and the 34 browser tests after the
  final design corrections; all pass. Production build passes.
- Added English assets/demo.gif with a reproducible Playwright/FFmpeg script,
  bounded review/pipeline examples and contributor/validation documentation.
- Rebuilt and restarted the local bridge on 31338 after confirming every run
  had finished. Seven retained chats and the separate BitNet service survive.
- Preparing the user-requested feature PR; release and runtime gap follow-ups
  remain separate work.

## 2026-09-08 - Execution and repository workspace

- Created codex/agent-orchestrator-dashboard from fetched main cb87534.
- Added execution task hierarchy, provider event details, plan drawer, shared
  effort popup and independent Fast-mode transport/settings/accounting support.
- Integrated registered-repository analytics and Git/worktree browsing with
  scoped read authorization, admin Git actions and explicit repository policy.
- Made workspace pages fill available width and height, including responsive
  chat/execution and direct analytics pages. All provider effects in browser
  QA were disabled; Git reads used real local history.
- Added durable operator-owned chat projects, assignment and title search.
  Browser fixtures verify a moved chat retains its messages and workspace.
- Corrected wide-screen typography, SVG axis scaling and commit graph row
  continuity. Git navigation remains visible; the repository toolbar spans the
  page. Chat history now loads when opening a direct Git/analytics link.
- Completed Codex and Claude Code gap audits with official sources and
  acceptance criteria. Current work does not claim task/turn or tool-dialog parity.
- Completed docs/guides/integration-assessment.md: Canvas/SQLite adapter,
  durable prompt patterns and scoped GitHub/Akido integration packages. Akido
  help is reachable with 98 exposed tools; no integration was installed.
- Added complete PR title/label hold preflight and explicit Git branch starts.
- Merged separate MIT license PR #119 after required checks; GitHub About and
  recognized MIT license verified. Restored native BitNet and rebuilt the local
  bridge on 31338; both health endpoints pass and seven chats remain available.
- Validation: 611 tests/70 files, 31 final targeted checks, build, Secret Scan
  and whitespace check pass; nine responsive page/viewport combinations pass.
  Evidence: docs/validation/execution-workspace.md. No feature push or release.
- AAHP precommit verification passes in the isolated candidate worktree.
  Root-directory lint reports an upstream miniaudio documentation arrow as a
  conflict marker inside ignored BitNet artifacts; see the validation report.

## 2026-09-07 - GHAS hardening before merge

- Fixed CodeQL findings for incomplete Markdown escaping in governance and
  activity exports, uppercase script tags in the dashboard test harness, and
  credential material in the CLI config display. Config output now exposes only
  provider and bridge-token status and omits secret references and verifiers.
- Moved the optional matrix/demo bearer lookup into a network-free loopback auth
  helper, validated control characters, pinned Supply Chain Guard to its reviewed
  v6 commit, and added a signed build-provenance subject to the release workflow.
- Relevant security/configuration tests, build, Secret Scan and AAHP check pass.

## 2026-09-07 - cli-gemini Antigravity credential detection

- Merged the `cli-gemini` authentication probe fix from PR #114. The probe now
  recognizes the Antigravity CLI token file used by `agy` in addition to the
  legacy Gemini CLI credential path.
- Added a regression test for an Antigravity-only credential installation.

## 2026-09-07 - Durable vault and native inference startup

- Default encrypted SQLite imports legacy file state without deleting the source.
  All platform conversations persist until explicit deletion; legacy ephemeral
  and TTL settings no longer erase history. Save user requests before inference
  and retain failed/interrupted output with explicit status.
- Added a bilingual Vault view, full-message SQLite FTS5 and scoped native tgrep
  regex search. Local hourly BitNet scans keep a durable cursor and propose
  evidence-linked drafts with constrained JSON output and current authorization.
- Configured native Llama inference autostarts with the bridge, reuses healthy
  external servers without ownership and stops its own child on graceful shutdown.
- Verified migration of six existing conversations/28 messages; later restart
  preserved seven conversations/34 messages. Two isolated real native start-stop
  cycles preserved six messages, scan state and a suggestion; tgrep 1.0.4 passed.
- Browser checks cover German/English, exact source navigation and corrected
  Windows UTF-8 labels. Full suite: 547 tests/64 files; production build passes.
  README and the platform/storage/BitNet guides document behavior and limits.


## 2026-09-07 - Native BitNet without Conda

- Pinned native compatibility patches to LF after reproducing a CRLF patch
  failure. Verified LF patches against CRLF source without changing runtime code.
- Built pinned Microsoft BitNet natively using installed Clang/Visual Studio
  tools and static libraries. Added a reproducible helper, official chat template
  and scoped b1.58 2B relu2 patch after live tests confirmed upstream issue #602.
- Verified the supplied GGUF against Microsoft's SHA-256; it remains unchanged
  and is excluded by *.gguf. Local .env config points to the native executable.
- Added validated host tokenizer/template options to the server manager. Real
  chat, streaming, aliasing, lifecycle and plain local orchestration now pass;
  observed about 31-32 generated tokens/s with eight CPU threads.
- Clarified planner ID types and retained original request data in subtasks.
  Full Windows suite: 512 tests/62 files; typecheck/build pass. Documented the
  small model's provider-name wording failure rather than claiming universal
  instruction compliance. No merge, release or package dependency change.

## 2026-09-07 - Canonical code-search paths

- Corrected relative search results for workspaces below an aliased ancestor,
  discovered by hosted Windows CI. Canonicalized absolute cwd conversion too.
- Extended the existing authorization test with a real junction/symlink ancestor;
  focused tests, strict typecheck and production build pass.

## 2026-09-07 - Addendum integrations

- Adapted elvatis-mcp patterns into typed native bridge modules: persistent
  rate limits and CLI sessions, prompt splitting, dependency execution, routing,
  daily memory and local/webhook notifications. No MCP or SSH dependency added.
- Registered BitNet and added approved native BitNet/tgrep server management.
  Verified upstream tgrep uses TCP JSON-RPC and automatic port discovery; live
  testing corrected daemon reindex to use reload rather than a competing CLI build.
- Scoped retained CLI sessions passed real two-turn Claude, Codex and agy checks.
  Corrected Codex's Windows-safe sandbox argument after its first native test.
- Windows full suite: 510/62 pass. Nine real service checks and seven native tgrep
  checks pass; auto planning also correctly reaches heuristics when Gemini API
  authentication and loaded local models are absent. BitNet remains fixture-only.
- README, integration guide, validation report and this handoff describe actual
  interfaces, ownership and persistence limits. Branch remains
  feat/provider-agent-management; no merge, release or new package dependency.

## 2026-09-07 - PR #117 fixes, real pipeline demos and management roadmap

- Appended the Astra product/stability and Daybreak security review to PR #117.
- Fixed the reviewed pipeline, policy, accounting, workspace, Windows argument,
  persistence and dashboard issues on the existing local branch.
- Stopped the scheduled local service, built the branch, and restarted it.
- Full suite passes: 281 tests in 24 files. Real Claude Sonnet 5 calls passed the
  write/verify, approval/execute and parallel debate/synthesis examples (seven steps).
- Live Codex testing exposed a flag conflict (fixed), then a local npm CLI versus
  desktop config compatibility problem (documented, user config preserved).
- Added reproducible examples, a demo runner, measured validation and a proposed
  SQLite/credentials/session/memory/skills/loops roadmap using read-only inspection
  of the sibling ai.elvatis.com implementation.
- Corrected stale next actions: PR #117 already exists and six required checks are
  enabled. No repository settings changes, push, merge, release or version bump.

## 2026-09-07 - Enterprise governance templates, budget controls, workspace browsing, tool discovery, and visual analytics

- Implemented 9 repository-specific governance pipeline templates (standard-governance, doc-generation, doc-review, refactoring-review, pr-review, release-readiness, architecture-review, dependency-risk, supply-chain-security) with parallel reviews, mandatory approval gates, and repository policy overrides.
- Added BudgetManager (`src/budget.ts`) enforcing daily and monthly USD limits, per-run cost and token caps, safe/warning/exceeded thresholds, hard stops vs soft warnings, and persistence.
- Added WorkspaceManager (`src/workspaces.ts`) validating directory existence, write permissions, path normalization, and safe filesystem browsing.
- Added automatic system tool discovery on host PATH (`src/cli-mode.ts`) detecting git, node, npm, python, docker, and developer tools with security risk levels (low/medium/high/critical) and classification tags.
- Added endpoints: `GET|POST /v1/budgets`, `GET|POST|DELETE /v1/repositories`, `GET /v1/governance/audit`, `GET /v1/governance/audit/export`, `GET|POST|DELETE /v1/workspaces`, `POST /v1/workspaces/browse`, `POST /v1/tools/discover`, `GET /v1/activity/export`, `GET /v1/analytics/overview`.
- Upgraded dashboard with pure SVG analytics charts (model request volume/latencies, spend share, pipeline run outcomes, event severity), budget gauges, repository manager modal, directory browser, and log search with traceId correlation pills.
- Added comprehensive unit and integration suite in `test/governance.test.ts` (17 tests). All 225 suite tests passing.

## 2026-09-07 - Provider agent controls, collapsible dashboard UI, tool picker, and multi-step agent pipelines

- Added per-provider agent policies (`agentEnabled`, `defaultMode`, `disallowedTools`) with persistence in `agentPolicies` within BridgeConfig.
- Added `GET /v1/settings/agent-policy` and `POST /v1/settings/agent-policy` endpoints to inspect and govern agent execution per provider.
- Added 403 `permission_denied` protection on `POST /v1/chat/completions` when agent mode is disabled by policy.
- Added `GET /v1/tools` returning categorized catalog of 23 known tools across 7 categories (File Operations, Shell / Terminal, Web Access, MCP Tools, Workspace Editing, Notebook Operations, Custom Provider Tools).
- Implemented multi-step agent pipelines in `src/pipelines.ts` with template interpolation (`{{prompt}}`, `{{previous_output}}`, `{{prior_steps}}`), built-in presets (`tri-vendor-review`, `code-gen-test`, `debate-consensus`), dependency execution, and human approval checkpoint support (`waiting_approval` with pause/resume).
- Added pipeline endpoints: `GET /v1/pipelines`, `POST /v1/pipelines`, `DELETE /v1/pipelines/:id`, `POST /v1/pipelines/run`, `GET /v1/pipelines/runs`, `POST /v1/pipelines/runs/action`.
- Upgraded dashboard with icon-based navigation, collapsible sidebar (expanded vs collapsed mode with localStorage persistence), structured searchable tool picker replacing free-text inputs, customizable navigation visibility with workspace presets (All, Developer, Simple/Chat, Ops/Governance), and interactive pipeline builder and execution runner.
- Targeted tests (78 tests across pipelines, server, cli-mode, preserve) all passing. Zero em dashes introduced.

## 2026-09-02 - v0.8.0

- CLI transport, modes, cwd and model discovery (#103). GitHub Release only.
- Requires `npm run build` after pulling: the global install symlinks into the
  workspace and serves `dist/`, while `/health` reports the package.json version
  - a stale `dist/` therefore claims the new version while running old code.

## 2026-09-02 - CLI transport, modes and model discovery

- Prompts ride stdin for `cli-claude`; `cmd.exe` truncated them at the first
  newline, so the CLI saw the system prompt alone (exit 0, no stderr).
- `chat` no longer emits plan flags. `agentCwd` no longer falls back to home.
- `agy` needs `--add-dir` to see the workspace at all; it ignores process cwd.
- Model catalogs are discovered (`agy models`, `grok models`, the Codex and the
  three vendor `models` endpoints) or read from `~/.conduit/models.json`.
- Providers without a credential stop advertising models; they still route.
- OPEN: the API-provider discovery paths are unverified live - no key is
  configured for `claude-api`, `gemini-api` or `codex-api` on this machine.

## 2026-09-02 - v0.7.0

- Version bump for the `mode` request field (#101). GitHub Release only.

## 2026-09-02 - CLI chat/plan/agent mode

- `POST /v1/chat/completions` accepts `mode` (`chat` | `plan` | `agent`).
- Aliases: `agentic: true`, `plan: true`. Agent requires absolute existing `cwd`.
- All four CLI providers map through `cliPermissionArgs`. Grok is plan-by-default.
- conduit-vscode Plan chat sends `mode: plan`; spawn/fix-issue send `mode: agent`.

## 2026-09-02 - v0.5.2 release

- Squash-merged PR #99 onto main (`a4a7a46`).
- Applied Dependabot bumps: `@anthropic-ai/sdk` 0.122.0, `@types/node` 26.4.1,
  `vitest` 4.1.11. Closed #97 as superseded (AAHP already 3.12.0).
- Version bump, changelog, GitHub Release v0.5.2.

## 2026-09-02 - control-plane review follow-up

- CSRF now consults `allowedOrigins` before treating `same-site` as forbidden.
- Dashboard HTML is served without bearer auth; JS collects a token and sends
  it on fetch and as `conduit-token.*`. `status` reuses `cfg.authToken`.
- ActivityLog and orchestrator history run through `redactSecrets`.
- CLI session probes cred files / env, not PATH-only.
- grok-cli uses shared `runCli` so Windows abort taskkills the tree.
- `parseConfigValue` no longer coerces `authToken` to Number.
- Unknown `POST /v1/tests/cli` providers return 404.
- `runtimeDir()` honors `CONDUIT_HOME` for config, metrics, history, accounts,
  and autostart launchers.
- Windows autostart uses `-WindowStyle Hidden` and a slash-normalized
  uninstall matcher.
- Independence test plants CLI OAuth files; settings omit key values.
- SCG unpinned to `@v6`; Dependabot ignore and AAHP Dependabot no-op restored.
- README AAHP badge points at this repo; 0.5.1 changelog restored.
- Debate critiques prior answers; compare/orchestrator/cli-test are limited.
- Routes match on path. Library start no longer throws on unsupported OS.
- Focused tests 79 passing; CSRF mutation red then green; tsc clean.

## 2026-09-02 - provider architecture cleanup

- Removed all `web-*` providers and interactive sign-in routes.
- Removed the Playwright dependency and the browser runtime.
- Split provider status into API, CLI, and local categories.
- Standardized the Grok CLI provider ID as `cli-grok`.
- Stopped API providers from reading CLI OAuth credential files.
- Added separate dashboard navigation pages for API, CLI, and local providers.
- Kept direct API keys write-only and exposed only their sanitized source.
- Rewrote README, Help, migration, autostart, changelog, and handoff material.
- Updated AAHP to 3.12.0 and supply-chain-guard to 6.0.9.
- Windows test suite passed with 85 tests.
- Typecheck, build, diff check, both secret scans, production audit, AAHP
  doctor, and AAHP precommit verification passed.
- Live Windows status showed all four CLI providers independently connected,
  while API providers reflected only their own Bridge or environment keys.
- Windows autostart install, health, tracked PID, logs, stop, and uninstall
  completed successfully.
- Resolved the new CodeQL HTML-filtering alert in the dashboard syntax test by
  matching script tags case-insensitively.

## 2026-09-07: provider and agent platform implementation

Implemented encrypted pluggable state, cross-platform vault keys, canonical
retained/ephemeral sessions, reviewed scoped memory, pinned skill/prompt catalog,
agent definitions, durable bounded runs, artifacts/evaluations, scoped operators,
provider profiles and five installable coding pipelines. The production database
choice remains open. Fixed loop-step snapshot bookkeeping and Windows Codex
sandbox selection after real failures, then reran all four providers successfully.
Windows 379 tests/build pass; Linux full suite/build plus final UI delta pass.
All 12 real Windows matrix cases pass; see docs/PLATFORM-VALIDATION.md for evidence
and explicit Prisma/Linux Secret Service limitations. Service rebuilt and running.
The user authorized syncing feat/provider-agent-management; no merge or release.

## 2026-09-07: executable tools, GitHub Projects, help and VS Code protocol

Implemented the supplied integration prompt against the existing encrypted state
and authorization model. Six executable tools, Projects v2 item APIs/workspace
links, typed accessible tooltips, and a dedicated authenticated /vscode socket
are covered by 470 Windows tests and 469 Linux passes plus one Windows-only skip.
All ten live smoke checks pass, including Perplexity search, Claude streaming,
Codex inline proposal and an approved Codex file write. GitHub service token is
not configured, so remote mutations use transport fixtures; no remote project
was changed. No new dependencies, extra listener, release or merge. Protocol,
usage and measured limitations are documented in docs/TOOLS-AND-PROJECTS.md,
docs/vscode-bridge.md and docs/INTEGRATIONS-VALIDATION.md.

## 2026-09-07: canonical subprocess cwd fixture on hosted Windows

Hosted Ubuntu passed. Windows CI found the command test comparing RUNNER~1 to
runneradmin even though both identify the same temporary directory. The assertion
now expects realpathSync.native(root), matching the runtime's intentional
canonicalization. Focused real-process tests pass; runtime code is unchanged.

## 2026-09-07: bounded time allowance for real DPAPI integration test

Hosted Windows passed the corrected cwd test, then the real DPAPI round trip
completed after 16 seconds and exceeded Vitest's unrelated five-second default.
Only that OS integration test now allows 40 seconds, covering its two production
subprocess calls (15 seconds each) and startup overhead. Runtime cryptographic
behavior and subprocess deadlines are unchanged.

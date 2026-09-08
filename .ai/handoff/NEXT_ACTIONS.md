> Current work: Commit the validated scanner/navigation/settings repair to PR #120. Continue the authorized usability work: spacing, accessible compact actions, first-visit introduction offer with Help re-entry, dedicated examples and local BitNet session insights. Hosted checks must be green before any separately authorized merge.

> Current follow-up: Review the text centering, Apple-inspired control patterns and expanded German localization in PR #120. Local validation: 613 tests and 48 browser cases, plus the final targeted installed-template rerun. Recheck hosted CI on the updated head before any separately authorized merge.

> Current feature work (2026-09-08): Review codex/agent-orchestrator-dashboard and docs/guides/execution-workspace.md. Local validation passes 611 tests/70 files and 44 browser tests after the second inspection. All pages/tabs pass English/German layout checks from 390 to 3840px. Navigation resizing, button alignment, settings coverage, an English reproducible GIF and workspace examples are included. PR #120 is the current review point; no release. The original v0.10.0 release/PR work below is historical. Next runtime priorities remain task/turn continuity, provider streaming, specific tool approvals and task/worktree/review binding in the Codex/Claude Code gap analyses. These reports are audits, not completed implementations. Current UI runs locally on 31338. MIT PR #119 is merged. Review docs/operations/command-guards.md before future PR merges.

# Next actions

Second inspection is implemented: named native dialogs with focus/Escape,
accurate divider reset feedback and persistent failed-action errors. Latest
local checks pass 611 tests/70 files and 44 browser tests, including ten added
regressions. The bridge is rebuilt with retained chats and healthy BitNet.

Review [PR #120](https://github.com/elvatis/conduit-bridge/pull/120), including
the English demo and complete validation record. Confirm hosted checks on its
current head before considering a merge. The user requested creation of the
PR; merging and releasing are not part of this task.

The new integration assessment is in docs/guides/integration-assessment.md.
Start with versioned workflow/layout persistence and a scoped GitHub read
service, followed by the Canvas UI and local cross-session prompt patterns.
These are proposed follow-ups, not shipped capabilities.

Current version: **v0.10.0**

_Updated: 2026-09-07_

1. Review PR #117 on `feat/provider-agent-management`, including the provider/agent platform, Elvatis Conduit dashboard and `docs/guides/platform.md`. Storage defaults to encrypted SQLite with one-time legacy-file import; explicit encrypted-file and injected Prisma backends remain supported. Production memory-only storage is rejected.
2. Verify hosted CI on the synced branch before merge. Windows 547 tests/64 files and build pass. Native BitNet now passes chat, streaming, lifecycle and local planning/execution checks; see `docs/guides/bitnet.md` and PR #117 for exact evidence.
3. Inspect the retained `Four-provider handoff ce0f4121` conversation and completed runs in the running local dashboard. All 12 real Claude, Codex, agy/Gemini and Grok matrix cases passed, including context handoff, bounded loops and physical file verification.
4. Choose the deployment storage backend when operational requirements are known. Real Prisma deployment, live Linux Secret Service integration and Linux CLI authentication remain explicit environment-specific validation work. Do not treat adapter contract tests as production database evidence.
5. Implement the documented `/vscode` client in the sibling extension when ready. Configure a service `GITHUB_TOKEN` and designated test project for live GitHub Projects validation; transport/permission tests currently use fixtures. Release v0.10.0 only after the required CI checks are green.
6. Native BitNet and tgrep are configured locally. The available Llama server
   now starts automatically with the bridge; BITNET_AUTOSTART=false disables it. Rebuild with `scripts/bitnet/build-windows.ps1`
   after stopping it. Review upstream #602 before removing the 2B relu2 patch.
   Live LM Studio/Gemini API planning still needs a loaded model/credentials.
Do not reintroduce `web-*` provider transports, cookie extraction or VNC
components. Playwright is permitted as an isolated development test/recording
dependency; it is not a runtime provider or an authenticated browser bridge.
Keep the gateway port unchanged; optional BitNet/tgrep daemon ports are explicit
administrator-controlled integrations requested in the addendum.

## Open after the 2026-09-03 governance parity pass

Both repositories were audited against each other and 26 of 32 asymmetries
were closed across six pull requests. Every gate that was switched on was
mutation-proved (18 proofs, each turning its gate red on the exact staleness
it exists to catch, with the unmodified tree green). What is left needs a
decision or source work, so it is recorded here rather than assumed.

1. **Required checks now exist.** Read-only verification on 2026-09-07 found
   `aahp-verify`, `Test (ubuntu-latest)`, `Test (windows-latest)`, `Secret Scan`,
   `Scan`, and `Analyze (javascript-typescript)`, with `strict: false`. The old
   404/no-required-checks statement below is historical. A merge-blocking mutation
   proof and a decision about strict branch freshness remain follow-ups.

2. **79 em dash characters in 25 `.ts` files** at the 2026-09-07 review snapshot, on 77 lines, 19 of them on
   non-comment lines: CLI output, provider error strings, and a note string
   that leaves the process on `/v1/models`. `em-dash.include` deliberately
   does not cover `*.ts` yet, because fixing them changes observable output.
   Own commit, own review.

3. **Tags are unprotected** (`rulesets` is `[]`). `release.yml` gates the tag
   path now, but its "dispatch only from main" check lives in the same file
   anyone with write access could edit. Only a ruleset on `refs/tags/v*`
   closes that, and a workflow cannot create one.

4. **The first tag after `release.yml` landed must be cut at a commit that
   contains it.** GitHub loads the workflow from the tagged commit, so a tag
   on an earlier commit runs nothing: no run, no red X, no notification.


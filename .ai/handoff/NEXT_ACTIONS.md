# Next actions

Current version: **v0.9.1**

_Updated: 2026-09-07_

1. Review PR #117 on `feat/provider-agent-management`, including the provider/agent platform and `docs/PLATFORM-GUIDE.md`. Storage remains selectable: encrypted file default, native SQLite, supplied-client Prisma adapter or volatile memory.
2. Verify hosted CI on the synced branch before merge. Latest tools/Projects/VS Code validation: Windows 470 tests/build pass; Linux 469 pass and one Windows-only DPAPI skip, build pass. Ten new live integration smoke checks pass. See `docs/INTEGRATIONS-VALIDATION.md`.
3. Inspect the retained `Four-provider handoff ce0f4121` conversation and completed runs in the running local dashboard. All 12 real Claude, Codex, agy/Gemini and Grok matrix cases passed, including context handoff, bounded loops and physical file verification.
4. Choose the deployment storage backend when operational requirements are known. Real Prisma deployment, live Linux Secret Service integration and Linux CLI authentication remain explicit environment-specific validation work. Do not treat adapter contract tests as production database evidence.
5. Implement the documented `/vscode` client in the sibling extension when ready. Configure a service `GITHUB_TOKEN` and designated test project for live GitHub Projects validation; transport/permission tests currently use fixtures. No release, merge or version bump is part of this pass.
Do not reintroduce `web-*`, Playwright, cookie extraction, VNC components, or
additional user ports.

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


# Next actions

Current version: **v0.9.1**

_Updated: 2026-09-07_

1. Review the local fixes for existing PR #117 on `feat/provider-agent-management`; see `docs/PR117-VALIDATION.md`. Build and 281 tests pass. Three real Claude Sonnet 5 pipeline demos passed and the local service is running.
2. Publish the reviewed branch changes to PR #117 and verify hosted CI before merge. The earlier review report is already appended to the PR description; the new fixes and validation documents are still local.
3. Resolve the local Codex executable mismatch: npm CLI 0.152.1 cannot parse the newer desktop feature configuration, while native 0.153.4 can. Preserve user configuration; consider executable selection and explicit config isolation as follow-ups.
4. Use `docs/PROVIDER-AGENT-ROADMAP.md` to plan SQLite state storage, protected credential references, session webchat, scoped memory, versioned skills and bounded repair loops. The sibling `ai.elvatis.com` has useful session/memory/prompt interfaces; no new database or retained-chat implementation is included here.
5. Evaluate cross-project integration with `local-model-tooling`, then plan the next version release after merge. No release or version bump was made in this validation pass.

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


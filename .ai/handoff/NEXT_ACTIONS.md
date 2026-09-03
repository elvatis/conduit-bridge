# Next actions

Current version: **v0.9.1**

_Updated: 2026-09-02_

1. After v0.9.1 is tagged, no follow-up unless a regression is reported.

Do not reintroduce `web-*`, Playwright, cookie extraction, VNC components, or
additional user ports.

## Open after the 2026-09-03 governance parity pass

Both repositories were audited against each other and 26 of 32 asymmetries
were closed across six pull requests. Every gate that was switched on was
mutation-proved (18 proofs, each turning its gate red on the exact staleness
it exists to catch, with the unmodified tree green). What is left needs a
decision or source work, so it is recorded here rather than assumed.

1. **Required status checks: there are NONE.** `gh api
   repos/elvatis/conduit-bridge/branches/main/protection/required_status_checks`
   returns 404, "Required status checks not enabled". CI runs on every pull
   request and blocks nothing, so every gate added on 2026-09-03 is advisory.
   The name collision that stood in the way is fixed: `Scan` and `Secret Scan`
   are now distinct. Needs a repository settings change, so it needs Emre.
   After setting them, verify with a throwaway pull request carrying one em
   dash and confirm the merge is actually blocked. A required check that does
   not block is the same failure this pass was cleaning up.

2. **84 em dash characters in 26 `.ts` files**, on 82 lines, 19 of them on
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


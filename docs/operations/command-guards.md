# Command safeguards from observed failures

The machine's Claude Code trap hook informed two concrete repository changes.
Git workspace branch creation names its start commit explicitly (`HEAD`), as
worktree creation already did. Push remains limited to the current branch's
upstream and rejects force/mirror behavior.

`scripts/check-pr-merge.mjs` reads the complete PR title, every label, draft
state, head commit and checks through structured GitHub CLI output. Human hold
markers such as WIP, NICHT MERGEN, DO NOT MERGE, PROPOSAL, blocked and
needs-human-evidence prevent a merge even at the end of a long title. Missing
or unfinished checks also block. By default it only reports its findings:

```powershell
node scripts/check-pr-merge.mjs 123 --repo elvatis/conduit-bridge
```

After an authorized merge request, `--merge` performs a squash merge tied to
the inspected head SHA. GitHub branch protection still applies. The script
does not enable auto-merge, bypass required checks or substitute for review.
Metadata can change between inspection and merge; GitHub's head-match check
protects the commit identity, while title/label holds are a preflight check.

Keep native Windows filesystem operations in one shell, use literal paths and
verify workspace boundaries before moving or deleting trees. Avoid ambiguous
Git Bash `/tmp` paths passed to Windows executables and in-place text rewriting
with escape-sensitive shell commands. The implementation uses structured
arguments and subprocess APIs without a shell for Git operations.

The machine hook itself was not installed or modified by this work. Its blanket
test restriction does not match the measured repository: 611 tests completed
in 29.04 seconds on this Windows run. Focused checks remain appropriate while
editing, with a complete suite for an integrated change. Host-specific timings
and fail-open or comment-based global bypass rules are not copied as policy.

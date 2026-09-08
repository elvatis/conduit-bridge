# Execution and repository workspace validation

Recorded 2026-09-08 on Windows, branch codex/agent-orchestrator-dashboard,
based on origin/main cb87534dcaf9d03e70226c00ff1e5c9262db9a92.
These checks cover the local changes, not a deployed release.

## Automated checks

- Complete Vitest suite: 611 tests in 70 files passed (29.04 seconds).
- After correcting sidebar history initialization for direct Git links,
  all 31 dashboard/platform UI checks passed and the build was repeated.
- Production build and TypeScript checking passed.
- Secret scan passed across tracked and untracked files.
- Git diff whitespace check passed.
- Configured AAHP governance gates: six ran, no failures. The precommit
  handoff verifier passed against an isolated worktree containing the complete
  candidate source/documentation snapshot. In the main working directory,
  that verifier reports a false conflict-marker match in an ignored upstream
  BitNet dependency: miniaudio.h line 2043 begins with a decorative row of
  right arrows inside documentation. The dependency and checker were not
  modified. The isolated worktree excludes ignored build/dependency artifacts,
  matching the files a clean checkout would receive.

The suite exercises canonical effort values and the independent Fast switch,
stream/non-stream API request options, retained CLI-session flags, explicit
false overrides, profiles, presets, evaluations and orchestrator settings.
Budget tests prove Fast-mode estimates affect admission before provider calls.
Execution tests cover split UTF-8/JSON events, redaction, bounded telemetry,
command output, cancellation, persisted results and HTTP owner isolation.

Twelve real Git-fixture tests cover merge graphs, refs, first-parent diffs,
unborn repositories, literal filenames, renames, binary/truncated/untracked
files, worktree reference files, detached HEAD, sibling/symlink boundaries,
branch/worktree creation and local-bare-remote operations. Push tests cover
no-force divergence, mirror configuration and unrelated tags.

Ten repository analytics tests cover immutable blob counts, cache singleflight,
source/test classification, branch and root boundaries, history/file limits,
incomplete coverage, range/metric behavior and clustered/mobile axis labels.

HTTP tests prove authenticated scoped reads, filtered repository catalogs,
registered roots, opaque worktree validation, invalid modes, admin-only Git
mutations, cross-site rejection and governed-repository write restrictions.
HTTP mutation tests spy on the service; they do not mutate the working project.

Project tests cover durable grouping, ownership, preserved messages/workspaces,
revision checks, conversation branching and nonempty-project deletion refusal.
UI contracts cover escaped/searchable groups and assignment requests. Merge
guard tests cover hold markers beyond a long title prefix, label holds, drafts,
missing/pending checks and missing commit identity.

## Browser inspection

The loopback development preview rejects every non-GET request. It uses actual
read-only Git services for repository views and fixtures for provider catalogs,
so browser QA cannot launch an agent or mutate Git state.

Observed:

- German desktop Effort popover, independent Fast toggle and live effort value.
- The full popover fits a 390-pixel chat viewport.
- Real repository analysis: 26 snapshots from 119 inspected first-parent
  commits; snapshot keyboard inspection and pinning work. Clustered x-axis
  dates were corrected and visually rechecked.
- Real Git history, parent-derived graph, branch/worktree metadata, changed
  files, first-parent unified diff, line numbers and syntax coloring.
- Narrow Git layout stacks its panes. The final shared layout also removes
  the accidental global main-element minimum height from the nested Git pane.
- Full-page workspace and chat were rechecked after removing width limits.
  The normal dashboard is shown directly; the temporary embedded responsive
  test frame is not shipped.
- Final viewport matrix: Chat, Repository analytics and Git workspace at
  3840x2160, 1920x1080 and 390x844, all with no horizontal page overflow or
  browser script errors. Chart axis screen scaling is 1:1 on both axes.
- Git navigation remains visible, its controls span the page and graph edges
  join across the resized commit rows without stretching node circles.
- Isolated browser fixtures verify creating a project, moving an existing
  conversation, reopening after reload, project search and unchanged context
  and workspace. No production project or conversation was changed by QA.

The execution sample is labeled illustrative. Real-provider telemetry behavior
was tested with deterministic CLI fixtures rather than new paid provider calls.
No live Fast-mode charge, production Git mutation, push or deployment was
performed for this validation.

The local bridge was rebuilt and restarted on its normal port 31338. Native
BitNet was restored on 8080 after the previous bridge process was stopped;
health and a real short arithmetic response succeeded. The MIT license change
was separately merged as PR #119 after all required GitHub checks passed;
GitHub reports MIT and the requested updated repository description.
The live browser verified seven retained chats alongside Git history after
restart, with the registered conduit-bridge workspace selected automatically.

## Functional limits

Pause updates affects the display only. Task continuation, active-turn steering,
a full durable item stream, per-tool approval dialogs and task/worktree/review
binding remain separate runtime work. The two gap analyses document that scope.

Usage values are planning estimates rather than vendor invoices. LOC reports
measure committed source volume, not coverage or software quality. Historical
sampling and incomplete scans remain visible in the interface.

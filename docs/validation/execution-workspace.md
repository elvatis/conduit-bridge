# Execution and repository workspace validation

Recorded 2026-09-08 on Windows, branch codex/agent-orchestrator-dashboard,
started from main cb87534dcaf9d03e70226c00ff1e5c9262db9a92 and integrated with
the MIT license update 2d2479b.
These checks cover the local changes, not a deployed release.

## Automated checks

- Complete Vitest suite after the final design corrections: 611 tests in
  70 files passed (32.75 seconds).
- New Playwright suite: 34 browser tests passed (32.8 seconds), using Microsoft
  Edge on Windows. CI also runs the suite with Chromium on Linux.
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

## Browser interaction and layout matrix

The checked-in suite in `test/browser/` bundles the current dashboard source.
Every HTTP and WebSocket request is intercepted within the isolated browser;
unregistered writes and external requests fail. Fixtures model saved settings,
failures and permission roles. Browser writes do not reach the local bridge,
provider accounts, real conversations or a Git repository.

| Area | Verified behavior |
| --- | --- |
| Responsive layout | All 22 navigation sections and six workspace tabs in English and German at 390, 768, 1280, 1920 and 3840 CSS pixels; no page overflow or browser errors; SVG icon centering within 1.5 pixels. |
| Navigation | Pointer resize, saved width after reload, cancellation, keyboard steps during animation, reset, viewport bounds, collapse, mobile Escape/focus, short-window scrolling, visibility preferences and language persistence. |
| Model and Effort controls | Search, keyboard selection, effort slider, separate Faster speed value, unavailable models, popup bounds and return focus at mobile and desktop widths. |
| Execution | Text attachments, invalid file types and limits, rejected form values, complete request settings, draft retention after queue failure, sample isolation, command details and display pause. |
| Approval roles | Admin/reviewer approvals submit feedback; operator/viewer approval controls remain disabled. Backend suites separately enforce authorization. |
| Budgets and credentials | All six budget fields, dirty values across refresh, invalid thresholds, API key clearing after success and retry after a failed save. |
| Projects and memory | Create a project, assign/reopen/search a retained conversation, preserve messages and workspace, require memory scope, create a candidate and approve its revision. |
| Vault and storage | Save scan settings, retain dirty inputs, search, queue a scan, select the file backend and reject malformed restore JSON before sending it. |
| Provider profiles and agents | Name, provider, model, CLI path, credential, concurrency, enabled state, permission mode, instructions, Effort/Fast defaults and preserving an existing credential on later saves. |
| Orchestration and pipelines | Role and fallback settings, independent effort/speed values, tool restrictions, two-step pipeline creation, dependency order and an approval checkpoint. |
| Git and analytics | Branch disclosure, history/changes, file diff, create-branch dialog cancellation, direct analytics loading, ranges, metric/series selection, keyboard inspection, pin/unpin and CSV download. |

The tests exposed and now guard against three functional defects: popover
positioning used a stale hardcoded width, automatic focus scrolling closed
long-form Effort popovers, and direct analytics navigation raced identity
initialization. Navigation keyboard changes also now use the requested width
so quick repeated keys remain exact while CSS transitions run.

The visual pass aligns icon centers, control heights, corner radii and gaps
across toolbar, form, modal and navigation controls. Model catalogs and settings
reflow to the available content width. Execution settings no longer cover the
recorded evidence. Compact desktop controls grow for coarse pointers, and
reduced-motion preferences suppress control and resize animations.

Screenshots accompany layout cases under `.ai/logs/browser-results`; failed
tests retain traces and the HTML report. See
[contributor instructions](../../CONTRIBUTING.md#dashboard-verification).

## Local browser inspection

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
- Earlier real-service viewport matrix: Chat, Repository analytics and Git workspace at
  3840x2160, 1920x1080 and 390x844, all with no horizontal page overflow or
  browser script errors. Chart axis screen scaling is 1:1 on both axes.
- Git navigation remains visible, its controls span the page and graph edges
  join across the resized commit rows without stretching node circles.
- Isolated browser fixtures verify creating a project, moving an existing
  conversation, reopening after reload, project search and unchanged context
  and workspace. No production project or conversation was changed by QA.

The execution sample is labeled illustrative. The English GIF and reproducible
`assets/demo.mjs` use the same isolated fixtures as the browser tests. The
recording covers chat, Effort, execution events, Git history/diff, analytics and
navigation resizing, with illustrative captions. Final source frames were
visually inspected; output is 1200 x 800 at 10 fps, approximately 1.6 MiB.

Real-provider telemetry behavior
was tested with deterministic CLI fixtures rather than new paid provider calls.
No live Fast-mode charge or production Git mutation was performed by browser
validation. Feature branch publication and PR creation are separate from these
isolated tests; they do not publish a release or deploy the application.

The local bridge was rebuilt and restarted on its normal port 31338. Native
BitNet was restored on 8080 after the previous bridge process was stopped;
health and a real short arithmetic response succeeded. The MIT license change
was separately merged as PR #119 after all required GitHub checks passed;
GitHub reports MIT and the requested updated repository description.
The live browser verified seven retained chats alongside Git history after
restart, with the registered conduit-bridge workspace selected automatically.
After the final controls/navigation pass, the bridge was rebuilt and restarted
again after confirming all nine runs were completed. Health checks pass on
31338 and 8080; seven chats remain retained, the served HTML includes the resize
control, and the actual execution page was visually rechecked in the browser.
The two new workspace JSON examples also pass parsing, pipeline validation,
prompt/dependency substitution and approval-boundary checks.

## Functional limits

Pause updates affects the display only. Task continuation, active-turn steering,
a full durable item stream, per-tool approval dialogs and task/worktree/review
binding remain separate runtime work. The two gap analyses document that scope.

Usage values are planning estimates rather than vendor invoices. LOC reports
measure committed source volume, not coverage or software quality. Historical
sampling and incomplete scans remain visible in the interface.

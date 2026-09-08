# Execution and repository workspace

The Conduit dashboard uses the full available page beside its collapsible
navigation. Chat, Execution, Git workspace and Repository analytics share the
Elvatis navy, cyan and copper palette and adapt to narrow viewports. No embedded
preview frame is part of the shipped dashboard.

## Chats and projects

The collapsible **Chat history** stays beside the workspace pages. Search finds
chat titles and projects. Use **New project** to create a group, then expand it
to start a chat or rename the project. The **Project** selector above a chat
moves an existing conversation into a group while retaining its messages,
provider context and execution workspace. Choose **No project** to ungroup it.

Projects and assignments persist through the platform store, which defaults to
encrypted SQLite. Each project belongs to its operator; moving a conversation
into another operator's project is rejected. Revisions detect concurrent edits.
Projects can be deleted after their conversations have been moved out.

## Follow agent work

Open **Execution** to inspect bounded agent runs and pipeline workflows.
The task tree shows recorded statuses, dependency relationships, selected worker
output, elapsed time and available execution events. The plan drawer uses
recorded workflow steps or an explicit provider checklist.

A new instruction creates a new bounded run. Choose the registered workspace,
model, permission mode and limits before sending. Manual mode requests a run
approval; Auto follows repository policy. Approve, reject and cancel retain the
server's existing authorization and execution limits.

Codex CLI runs expose public command, message and plan events. Command details
show the recorded command, timing, available output and exit code. Providers
without structured events are identified in the view. This interface does not
display private reasoning. Output is redacted and bounded; the retained event
set is limited to 64 items per run step.

**Pause updates** pauses the display refresh only. Cancel stops the run.
Continuing the selected agent task as a new turn and steering a running turn
remain future runtime work. **Explore a sample** is clearly marked illustrative
data and never executes agents.

## Effort and faster speed

Every model selection used to configure execution has the shared Effort popover.
The keyboard-accessible slider preserves the canonical effort value across
providers and resets values the new provider cannot support. Multi-model
evaluation uses the common supported effort levels.

**Faster speed** is independent of Effort and is off for a new explicit UI
request. Agent and provider-profile defaults can supply a saved preference;
role overrides preserve an explicit false value. Availability is currently
recognized for supported GPT families through Codex CLI/OpenAI API and Opus 5
or 4.8 through Claude CLI/Anthropic API. Unsupported selections disable the
switch and the server rejects unsupported enabled requests before dispatch.
Account access and the installed CLI still determine whether the vendor honors
the request.

Codex CLI uses the session service tier, OpenAI API uses the priority tier,
Claude CLI receives its per-process fastMode setting, and Anthropic API uses its
Fast mode beta configuration. Conduit does not switch the selected model to
enable Fast mode. See the vendors' [OpenAI Fast mode documentation](https://developers.openai.com/api/docs/guides/fast-mode)
and [Claude Code Fast mode documentation](https://code.claude.com/docs/en/fast-mode)
for availability and billing.

Budget reservations and recorded usage include a threefold Fast-mode planning
premium in bridge-estimate-v2. This is a consistent local heuristic, not a vendor
invoice or a guaranteed spending ceiling. Native agent tool activity can incur
additional provider usage.

## Git workspace

Register the exact Git repository or worktree root as a workspace. Conduit
keeps **Git workspace** visible above **Repository analytics** in navigation,
including a helpful empty state for a workspace without a Git root. Selecting
another workspace inspects its Git state without changing an agent's working
directory.

Workspace selection, branch/worktree controls and Changes/History span the top
of the page. The history and diff use the page below, with no nested window.
Branch and worktree groups expand on demand. The default workspace is preferred
on first load when registered; an explicit selection is retained for the view.

The view includes:

- Local and remote branches, attached or detached worktrees, and a graph derived
  from actual commit parents.
- History with refs, authors and timestamps, plus commit files and unified diffs.
  Merge commits are compared with their first parent.
- Changes with status, renamed paths, untracked text previews, syntax coloring
  and old/new line numbers. Changes combine the index and working tree against
  HEAD; cancelling staged and unstaged edits can therefore yield no net patch.
- Explicit Fetch, fast-forward Pull, non-force Push, Create branch and Add
  worktree actions. These require workspace admin access and pass repository
  policy checks. Filtering or creating a branch does not switch the checkout.

Related worktrees outside the configured root appear as metadata. Register and
select their own workspace to inspect them. New worktree destinations are
derived inside .conduit-worktrees under the authorized root. The view omits
known nested worktrees from the parent's untracked file list without changing
Git ignore files.

History defaults to the newest 180 commits and is bounded at 300. Diff previews
are limited to 240 KiB and identify truncation and binary files. Git commands run
without a shell, interactive credential prompts, diff helpers or textconv; these
UI mutations disable repository hooks. Push targets only the current branch's
configured upstream and does not push unrelated branches or tags.

## Repository analytics

Register a repository under **Tools & administration > Governance** and ensure
its root is accessible through a registered workspace. The repository selector
shows only entries within the operator's workspace access.

**Repository analytics** reads committed source blobs, using current and sampled
historical snapshots. It separates production and tests, provides nonblank and
total LOC, ratios, growth, file counts, directory distribution, movement between
snapshots and CSV export. Date presets and the two-ended history brush change
the selected range. Hover, click or use the arrow keys and Enter to inspect and
pin a snapshot with its commit hash.

The previous/next buttons and pin button offer the same snapshot inspection
without a pointer. Production/Test buttons toggle series. Axis coordinates use
the actual chart dimensions so resizing does not stretch their labels. Base
text is 16 CSS pixels and increases modestly to 17 on wide 4K layouts.

The method excludes non-source files, generated/vendor/build/fixture paths,
binaries, symlinks and uncommitted changes. Comments count as lines. LOC and the
test-to-production ratio describe code volume, not test quality or coverage.
The method disclosure names exclusions and shows incomplete scans.

Each scan is bounded to 1,200 first-parent commits, at most 32 daily snapshots,
64 MiB of newly inspected blobs and a 25-second scan deadline. Two scans can run
concurrently; results are cached for two minutes. All time means the inspected
history when the history limit is reached. Skipped files produce lower-bound
counts, and growth is hidden when selected snapshots are incomplete.

## API access

| Route | Access |
| --- | --- |
| GET /v1/analytics/repositories | Catalog filtered by workspace view access. |
| GET /v1/analytics/repository?repository=id&branch=HEAD | Registered repository and workspace view access. |
| GET /api/git-workspace/snapshot?workspaceId=id | Registered workspace view access. |
| GET /api/git-workspace/diff?workspaceId=id&mode=history&commit=sha | Registered workspace view access; optional returned file path and opaque worktree ID. |
| POST /api/git-workspace/action | Workspace admin capability, same-origin write protection and repository policy; JSON action/workspaceId and optional name/worktree. |
| GET /v1/platform/projects | Visible operator-owned chat projects. |
| POST /v1/platform/projects | Operator/admin; name creates an owned project. |
| PATCH or DELETE /v1/platform/projects/:id | Owner/admin; PATCH supports expectedRevision; delete requires an empty project. |
| PATCH /v1/platform/sessions/:id | Existing session permissions; projectId or null changes grouping with expectedRevision. |

Request paths never grant filesystem access: repository and workspace roots
come from server registration. Files and worktrees are resolved against returned
Git records and canonical workspace boundaries.

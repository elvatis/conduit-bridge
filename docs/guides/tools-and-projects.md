# Executable tools and GitHub Projects

The versioned skill catalog stores instructions. The executable tool registry
adds eleven explicit tools to the same host: `web-search`, `filesystem`,
`github-actions`, `browser`, `memory`, `sandbox`, `code-search`, `notify`,
`prompt-splitter`, `split-execute` and `routing-rules`. A catalog attachment does not
automatically grant tool permissions or execute these actions. Clients use the
typed registry or the authenticated HTTP endpoints to invoke them.
See [integration validation](../validation/integrations.md) for measured results.
The [integration reference](../reference/integrations.md) covers the five added tools,
daily journal actions, planning/execution, CLI continuity, BitNet and indexed search.

## Tool API

`GET /v1/platform/tools` returns each name, description, effect and input schema.
`POST /v1/platform/tools/{name}/execute` accepts this envelope:

```json
{
  "workspaceId": "registered-workspace-id",
  "approved": true,
  "arguments": { "action": "write", "path": "hello.txt", "content": "Hello tools!" }
}
```

Use a platform or bridge bearer in the `Authorization` header. Workspace identity
comes from the registered workspace, not an arbitrary argument path. File writes,
workflow dispatch and command execution require `approved: true` on that exact
invocation. The field records deliberate caller authorization; it is not a
durable human approval workflow. Repositories requiring governance gates must use
their assigned pipelines for mutations. Do not expose an administrator token to
model-generated requests or automatically set approval on their behalf.

| Tool | Arguments and behavior |
| --- | --- |
| `web-search` | `query`, optional `model` (`api-perplexity/sonar` or `sonar-pro`) and `maxOutputTokens` (64-1024). Uses the existing Perplexity provider and shared budget accounting. Requires its independent API key. |
| `filesystem` | `action`: `read`, `write` or `list`; relative `path`; write `content` and optional `overwrite`. Regular files are limited to 64 KiB. Links, traversal, credential files and control directories are refused. Parent directories must already exist. |
| `github-actions` | Administrator-only `dispatch`, `list-runs` or `get-run` with `owner` and `repo`. Dispatch needs a workflow filename/ID and `ref`, with up to ten string inputs. Polling requires an explicit `runId`; `waitMs` is at most 30000. |
| `browser` | Public HTTP(S) `url`, optional `maxTextChars` (1-50000). Fetches text without JavaScript, cookies or browser login. Checks and pins DNS destinations and validates redirects. Private/reserved networks are refused. |
| `memory` | `get`, `set`, `list` or `delete`; `key`; optional `scope`: `user` or `workspace`; JSON `value` for set. Updates/deletes require the current `expectedRevision`. Each value is at most 16 KiB, with 100 entries per scope. |
| `sandbox` | Administrator-only executable name, string `args`, optional relative `cwd` and `timeoutMs` (100-60000). Uses a separate subprocess, bounded output, a minimal environment and cancellation. Native executable required; no implicit shell wrappers. |

The command tool's name is **not a promise of OS confinement**. Its working
directory stays within the workspace, but an approved executable still has the
service account's filesystem and network privileges. Do not run untrusted code
through it as if it were a container. Timeout cancellation terminates the ordinary
process tree; it does not contain a hostile process that deliberately escapes.

KV memory uses the configured transactional platform store, including encryption
when durable storage is enabled. It is separate scratch data and never silently
becomes approved conversation memory. The memory-only backend remains volatile.
Filesystem overwrite uses a verified open handle; it is not atomic replacement.

GitHub dispatch acceptance does not identify the resulting run. Candidate listings
are not correlated automatically; pass an explicit run ID when polling. The
integration never retries a remote mutation automatically.

The page tool returns untrusted source text. Search returns the provider's answer;
source URLs are included only when present in that answer. The current text-only
provider adapter does not expose separate citation metadata.

## Remote Projects v2

Set `GITHUB_TOKEN` in the service environment. It is independent of bridge and
operator authentication. The client sends it only to `https://api.github.com`,
does not follow redirects and does not log request headers or upstream errors.
The token needs permission for the projects and repositories being accessed.
Classic tokens use `read:project` for queries and `project` for mutations;
GitHub App/fine-grained permissions depend on the resources and operation.
See [GitHub's Projects API documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects).

| Method and path | Behavior |
| --- | --- |
| `GET /api/github-projects?owner=NAME&ownerType=organization` | List a page of organization projects. Use `ownerType=user` for a user. |
| `GET /api/github-projects/{projectId}` | Project metadata and field definitions. |
| `GET /api/github-projects/{projectId}/items` | Issue, pull request and draft items with field values. |
| `POST /api/github-projects/{projectId}/items` | Add `{ "contentId": "issue-or-pr-node-id" }` or create `{ "title": "Draft", "body": "Text" }`. |
| `PATCH /api/github-projects/{projectId}/items/{itemId}/fields/{fieldId}` | Set `{ "value": { "text": "Done" } }`, `number`, `date`, `singleSelectOptionId` or `iterationId`; `value: null` clears the field. |
| `DELETE /api/github-projects/{projectId}/items/{itemId}` | Remove project membership; leaves the underlying issue/PR intact. |
| `GET /api/github-projects/workspaces/{workspaceId}` | Read the saved remote association. |
| `PUT /api/github-projects/workspaces/{workspaceId}` | Save `{ "githubProject": { "projectId": "PVT_...", "projectUrl": "https://github.com/orgs/OWNER/projects/1", "org": "OWNER", "repo": "OWNER/REPO" } }`. Checks the remote project identity first. |
| `DELETE /api/github-projects/workspaces/{workspaceId}` | Remove the local association, leaving the remote project intact. |

List endpoints accept `first` (1-100) and an opaque `after` cursor. Follow
`pageInfo.hasNextPage` and `pageInfo.endCursor` explicitly. Item responses include
the first twenty field values and report whether additional values exist.

Administrators can discover projects and perform remote mutations. Scoped
viewers/operators may read a linked project by supplying `workspaceId` in the
query; the project must match that authorized workspace. Linking changes metadata
only, never the local root. This version does not create or delete whole projects,
nor implement every GitHub field type.

## Embedding

```ts
import { createSkillRegistry } from '@elvatis/conduit-bridge';

const registry = createSkillRegistry();
const descriptors = registry.list();
// Host-created context binds operator, registered workspace, store, AbortSignal,
// current authorization policy and an accounted model executor.
const result = await registry.execute('memory', {
  action: 'set', key: 'last-check', value: { passed: true }, expectedRevision: 0,
}, trustedContext);
```

The embedding host must supply a real authorization callback; the registry calls
it before executing. The HTTP server also rechecks current operator permissions,
workspace policy, rate/concurrency limits and explicit mutation approval.

## Interface and extension integration

Dashboard settings use a typed tooltip registry with keyboard-focusable help,
hover/focus text and preserved input descriptions. It works with the existing
server-rendered HTML, without a UI framework dependency.

The [VS Code protocol](../reference/vscode-bridge.md) adds `/vscode` for streaming conversations,
inline-edit proposals, bounded agent sessions and usage queries. The sibling
extension was inspected as an integration reference; it still needs a client
implementation for this new protocol.

The separation of procedural instructions from executable tools and explicit
host authorization was informed by the public architecture of
[Hermes Agent](https://github.com/NousResearch/hermes-agent) and
[OpenClaw](https://github.com/openclaw/openclaw). No implementation code or new
runtime dependencies were copied from either project.

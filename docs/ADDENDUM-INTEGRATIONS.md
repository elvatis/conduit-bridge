# Task planning, CLI continuity, BitNet and indexed search

The bridge now registers eleven executable skills and eleven providers. These
are ordinary TypeScript host integrations, with no MCP transport, SSH,
WhatsApp/Telegram dependency or automatic model download.

## HTTP entry points

All routes use platform bearer authentication, workspace scopes, CSRF checks,
the shared request/concurrency limiter and bounded request bodies. The tokenless
loopback administrator behavior remains the same as the rest of the platform.

| Route | Behavior |
| --- | --- |
| `POST /api/skills/:skillName` | Alias for `/v1/platform/tools/:skillName/execute`. Body: `{arguments, workspaceId?, approved?}`. |
| `POST /api/orchestrate` | Split a prompt, optionally execute its tasks. Preview is the default. |
| `GET /api/providers/status` | Provider health, including BitNet as a local provider. |
| `POST /api/bitnet/server` | Administrator start, stop or status of the owned BitNet server. |
| `POST /api/tgrep/index` | Explicit workspace index build; `force:true` requests a complete rebuild. |
| `POST /api/tgrep/server` | Administrator start, stop or status of the owned tgrep daemon. |
| `GET /api/github-projects/workspaces/:id/search?pattern=...` | Local code search for the authorized workspace. No code is sent to GitHub. |

Native process operations and task-plan execution require an administrator plus
`approved:true`. Repository governance can require use of its governed pipeline
instead. File reads and search require workspace view access. Daily memory writes
require operate access; webhooks require approved mutation access. The
integration request deadline is 65 seconds; disconnect/shutdown cancels owned
model/subprocess work. An already accepted tgrep rebuild can continue inside an
external daemon after its requesting socket is cancelled.

## Planning and execution

Preview:

```json
{
  "prompt": "Implement a parser\n- Review the parser",
  "strategy": "heuristic",
  "workspaceId": "your-workspace-id"
}
```

Send this to `POST /api/orchestrate`. The response contains `tasks`, the strategy
used and a provider recommendation. Add `execute:true` and `approved:true` to run
the generated plan, or submit a reviewed/edited plan directly:

```json
{
  "workspaceId": "your-workspace-id",
  "approved": true,
  "arguments": {
    "tasks": [
      {"id":"a","agent":"cli-codex","prompt":"Suggest a parser implementation.","dependsOn":[]},
      {"id":"b","agent":"cli-claude","prompt":"Review the proposed parser.","dependsOn":["a"]}
    ]
  }
}
```

Send that body to `POST /api/skills/split-execute`. A task has `id`, `agent`,
`prompt`, `dependsOn` and an optional explicit `model`. Provider names use the
bridge's actual spelling, such as `cli-codex` and `gemini-api`; model IDs remain
separate, such as `cli-codex/...` and `api-gemini/...`.

- `heuristic` uses keyword routing and sequential numbered/bulleted task parts.
  It makes no planning-model request and never silently drops excess tasks.
- `gemini` uses the existing Gemini API adapter. `local` uses LM Studio, with
  BitNet fallback. Explicit strategies fail if their analysis cannot succeed.
- `auto` tries Gemini API, then local inference, then heuristic analysis.
  Local/private/offline intent bypasses cloud analysis; policy, budget and quota
  denials stop fallback. Such plans accept only local task providers.
- All graphs are validated before execution: 1-12 tasks, unique bounded IDs,
  known dependencies, no cycles and supported providers. Independent
  `openclaw_run` tasks are omitted; a dependency on an omitted task is rejected.
  Legacy `codex_run`, `gemini_run`, `claude_run` and `local_llm_run`
  names map to bridge providers.
- Ready tasks run in groups of at most three. Failed descendants are skipped;
  results remain in plan order. Dependency output is passed as untrusted data.
  Task output is bounded to 16 KiB, with 64,000 characters of accumulated input.
- Execution uses provider chat mode. CLI capabilities differ, so this is not an
  OS sandbox or a promise that every CLI is incapable of mutation. Use the
  existing approved agent-run/pipeline APIs for deliberate file-writing runs.

Every model request reuses host authorization, provider routing, budgets and
usage accounting. Cloud planning/execution calls additionally reserve a quota
slot before dispatch in `runtimeDir()/rate-limits.json`. Failed attempts retain
their admission because upstream work may already have happened.

Default rolling ceilings are 10 calls/minute, 100/hour and 500/day per provider.
Configure `agentRateLimits` in bridge configuration, for example:

```json
{"agentRateLimits":{"cli-codex":{"perMinute":5,"perHour":30,"perDay":200,"costPerCall":0.02}}}
```

Zero disables a particular request ceiling. Local providers have no cloud quota.
Cost records use the shared `bridge-estimate-v1` estimate after completed calls;
the configured per-call estimate remains for incomplete calls. These are not
provider invoices. `RateLimiter.summary()` exposes recent calls and running
totals to embedders. Atomic JSON replacement and an exclusive mutation lock
prevent concurrent callers from spending the same slot. Corrupt data and busy
locks fail closed; inspect abandoned locks after an unclean process exit.

## Native CLI session continuity

Retained platform conversations can resume Claude, Codex and Gemini/agy CLI
sessions. Stateless requests, ephemeral conversations and agent-mode runs keep
their existing transport behavior. Session keys bind the authenticated owner,
conversation, profile, provider, model, executable, workspace and permissions.

`runtimeDir()/cli-sessions.json` stores native IDs, timestamps, request counts and
transcript hashes. It does not store prompt/answer text. A matching history prefix
allows sending only the new messages; model switches, edits, summaries or changed
instructions that alter that prefix start fresh sessions. Idle expiry is two
hours and a native session serves at most 50 completed requests. Concurrent use
is refused, and failure invalidates the lease without an automatic replay.

Resume arguments use explicit IDs: Claude `--resume`, Codex `exec resume` and agy
`--conversation` (legacy Gemini uses `--resume`). Codex retained chat explicitly
keeps read-only sandbox configuration and omits its stateless `--ephemeral` flag.
If a CLI version does not return a recognized native ID, the next request sends
the full history instead of guessing a recent session.

The native CLIs own their transcript files and their authentication. Deleting a
bridge conversation does not delete native CLI transcripts. Only retained chat
enables this additional persistence, and the bridge never resumes another user's
latest CLI session by inference.

## Local daily memory and notifications

The existing encrypted transactional key/value memory remains available through
`get`, `set`, `list` and `delete`. New `memory` actions are:

```json
{"action":"write","note":"A local development decision","scope":"user"}
{"action":"readToday","scope":"user"}
{"action":"search","query":"decision","days":7,"scope":"workspace"}
```

Daily journals are local, plaintext, redacted JSONL files at
`runtimeDir()/memory/YYYY-MM-DD.jsonl`, keyed by UTC date. Access filters by a
hash of the authenticated user or selected workspace scope. Limits are 4 KiB
per note, 2 MiB per date, 31 searched dates and 100 returned entries. These notes
are not automatically approved or attached to conversation memory. Operators
manage retention of the daily files explicitly; there is no background deletion.

`notify` accepts `{message, channel?:"log"|"webhook"}`. Log-only is the default.
Webhooks use `CONDUIT_NOTIFY_WEBHOOK_URL`, HTTPS POST JSON `{message}`, a five-second
timeout and no redirects. Callers cannot supply destination URLs. Completion
notifications contain counts, not task content. No external notification was
sent during implementation validation.

## BitNet

`BitNetProvider` shares the local OpenAI-compatible transport with LM Studio.
Set `BITNET_URL` (default `http://127.0.0.1:8080`). The catalog contains
`bitnet/auto`, `bitnet/2B-4T`, `bitnet/embedding-0.6B` and
`bitnet/embedding-270M`, plus discoverable chat models. Named compatibility
aliases are dynamic requests, not proof that a model is installed. Embedding
aliases do not add an embeddings endpoint or turn embedding models into chat
models. Both local transports strip reasoning tags from full and streamed text.

For optional managed startup, install/build BitNet's native `llama-server`, set
`BITNET_SERVER_BINARY` and an absolute `BITNET_MODEL_PATH` to its GGUF, then send:

```json
{"action":"start","approved":true,"port":8080,"threads":2,"ctx_size":2048}
```

`modelPath` can override the configured GGUF path for an approved admin call.
`stop` also requires approval; `status` does not. Startup binds loopback, sets
CPU-only layers and waits up to 30 seconds for health. Ports already in use are
rejected. Set `BITNET_URL` to the selected port when using a nondefault port.
The helper never downloads or compiles models or native executables.

PID records are written to `bitnet-server.pid` and `tgrep-server.pid`. Only live
children owned by the current manager can be stopped. After an unclean restart,
inspect any old record and process before removing the record; a PID alone is
never treated as permission to terminate an unrelated process.

## tgrep code search

Current upstream tgrep exposes newline-delimited JSON-RPC over loopback TCP,
not an HTTP REST API. It uses one `tgrep` executable with `index`, `serve`,
`status` and query commands. The daemon chooses its own port; the bridge reads
its `serve.json` discovery record. Supplying a fixed port to `startTgrepServer`
is rejected instead of emitting an unsupported upstream flag.

Set `TGREP_BINARY` to an installed native executable. `TGREP_INDEX_PATH` optionally
selects a directory inside the authorized workspace. Index data lives outside
the source tree under `runtimeDir()/tgrep/<canonical-root-hash>/`. Leave `TGREP_URL`
empty for per-workspace discovery. For an existing daemon, `tcp://127.0.0.1:PORT`
selects its port; `http://127.0.0.1:PORT` is accepted as legacy address spelling
but still speaks TCP JSON-RPC. External index mutation additionally requires
`TGREP_INDEX_PATH` to identify that daemon's workspace.

```json
{"arguments":{"action":"search","pattern":"class\\s+Parser","maxResults":20},"workspaceId":"your-workspace-id"}
```

Send that to `/api/skills/code-search`. Search first uses the known daemon,
then native tgrep query output, then `rg --json --no-config`. Install ripgrep
if it should be available as fallback. Results have `file`, `line`, `column`
and `snippet`; columns follow ripgrep's one-based UTF-8 byte offsets.

Search is regular-expression/trigram retrieval, not semantic embedding search.
Limits are 200 results, 1,000 characters per snippet, 64 KiB searchable files,
2 MiB transport output, five seconds per daemon query and ten seconds per CLI
query. The bridge re-reads returned snippets through workspace file validation,
rejecting traversal, links, control directories and credential paths. Indexing
uses upstream ignore rules plus excluded control trees; native index storage is
local and is not claimed to be encrypted.

`filesystem` also supports `{action:"search", path:".", pattern:"..."}` through
the same implementation. Explicit index/reindex can run up to 60 seconds. For a
live daemon, its `reload` method performs the rebuild under the daemon's own
lock; starting a competing CLI index build would be rejected by upstream.

## Sources and compatibility

The designs were adapted to bridge contracts after inspecting
[elvatis-mcp](https://github.com/elvatis/elvatis-mcp) (Apache-2.0),
[Microsoft BitNet's server launcher](https://github.com/microsoft/BitNet/blob/main/run_inference_server.py)
(MIT), and [Microsoft tgrep](https://github.com/microsoft/tgrep) (MIT).
No upstream module was copied verbatim. tgrep 1.0.4 was exercised as a separate
portable test binary; no dependency or binary is bundled into this package.
See [validation evidence](ADDENDUM-VALIDATION.md) for tested paths and limits.

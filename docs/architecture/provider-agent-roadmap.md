# Provider and agent platform: implementation status

Updated 2026-09-07. The platform described in the original proposal is now
implemented in this working branch. See [Platform guide](../guides/platform.md) for
usage, REST examples and storage integration. This status describes code and its
limits; it does not imply that every proposed feature or provider capability has
been verified in production.

## Implemented foundations

| Area | Available behavior |
| --- | --- |
| Storage | Transactional snapshots, revision conflicts, encrypted file default, optional native SQLite, injected Prisma adapter, volatile memory adapter, encrypted backup/restore |
| Credentials | Encrypted vault, Windows DPAPI or Linux Secret Service key protection, explicit headless key, write-only credential forms |
| Conversations | Backend-owned transcript, model/provider switching, streaming, stop, retry/edit through branching, search, export/delete, explicit retention and expiry |
| Context | Recent complete turns, reviewed summary, explicit approved memories and pinned skills, destination context allowance, selected/omitted message inspection |
| Memory | User/workspace/agent/provider/profile scopes, provenance, candidate review, authenticated review identity, expiry and renewed review after edits |
| Catalog | Built-in skills/prompts, immutable skill/prompt versions, agents with pinned attachments, provider/mode/tool compatibility checks |
| Execution | Durable queue, bounded iterations, deadline/token/cost limits, cancellation, idempotency, no-progress detection, approvals and interrupted-run recovery |
| Evidence | Per-iteration output and hashes, downloadable run artifacts, request metrics, instruction-following evaluations |
| Operations | Named provider profiles, credential references, CLI executable selection, effort defaults, concurrency/cooldown, diagnostics, operator roles and workspace checks |
| Coding presets | Bugfix/regression, implementation/review, API contract, documentation and design comparison pipelines with evidence prompts and approval gates |

The dashboard exposes Webchat, Memory, Agents & skills, Runs & artifacts, and
Storage & diagnostics on the existing bridge listener. API, CLI and local
transports retain their own authentication. Operator credentials are managed
through the REST API; there is no dashboard operator management form.

## Storage decision remains open

The production database/ORM choice is **open**. The default is an encrypted file
snapshot; normal installations need no SQL server or Prisma package. Native
SQLite is optional. Prisma accepts a generated client supplied by an embedding
application and an encryption codec. Its [schema contract](../../examples/storage/schema.prisma)
stores one encrypted snapshot and revision, rather than normalized entity tables.
Prisma tests use a contract fake, not a real Prisma database deployment.

Platform writes acknowledge durable commits and detect conflicting revisions.
This is a single-host service, not a distributed scheduler or an exactly-once
side-effect system. Running work interrupted by a restart is marked interrupted;
agent side effects require inspection before another run.

Backend changes require explicit backup, restart and restore. Legacy gateway
pipeline, activity, metrics and other JSON stores are not silently converted to
the platform store. Legacy API credentials have a separate verified migration to
the vault. `.env` is optional plaintext input, not encrypted credential storage.

## Boundaries and follow-up work

- Conversations carry visible messages and reviewed summaries, not hidden
  reasoning or guaranteed provider-native resumption. File uploads, rich Markdown
  rendering and multimodal attachment storage are not implemented here.
- Memory attachment is explicit. Embedding retrieval and automatic extraction
  jobs are absent; generated facts can be submitted as review candidates.
- Catalog entries do not install tools, execute bundled resources or grant
  permissions. Agents have revision checks; skills/prompts have retained versions.
- Artifacts contain model output, not automatic snapshots of repository files,
  diffs or command logs. A success-string match is a stop condition, not proof
  that tests or an implementation passed.
- CLI profiles select executables/defaults and use each CLI's login. Separate
  per-profile OAuth stores and automatic provider failover are not provided.
- The evaluation fixture checks a small instruction-following response. Broader
  quality benchmarks, billing reconciliation and externally retained
  tamper-evident audits remain follow-up work.
- Platform roles apply to `/v1/platform/*`; scoped operator tokens do not confer
  administrator access to the legacy gateway routes.

## Validation and delivery

Automated tests cover storage contracts, secrets, role boundaries, profiles,
catalog versions, memory review, retention/context and actual HTTP lifecycles
with mocked providers. Live provider smoke tests and loop/file exercises are
separate checks. Their results are recorded in the [validation report](../validation/platform.md); partial or
pending runs are not a blanket compatibility claim.

The sibling `ai.elvatis.com` project was read-only design inspiration for portable
sessions, memory review and the prompt library. It is not a runtime dependency;
its team/database infrastructure was not imported into the bridge.

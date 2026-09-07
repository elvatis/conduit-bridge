# Provider and agent management roadmap

Proposal following PR 117, 2026-09-07. This document describes future work;
SQLite, retained conversations, skills and autonomous loops are not implemented
by the current fixes.

## Storage and credentials

The bridge already loads `.env` from its startup directory and runtime directory.
Real environment variables win, then the earlier file. `.env.example` is tracked;
actual `.env` files are ignored. Runtime settings currently use JSON, including
API keys supplied through the settings interface. This is plaintext storage with
file-permission precautions, not an encrypted credential vault.

Use SQLite for application state: provider profiles, nonsecret settings, agent
definitions, conversations, messages, memory, skill versions, pipeline versions,
runs, step attempts, approval decisions and the budget ledger. Store it in the
runtime directory outside source control. Transactions should couple state
transitions, budget reservations and durable events. Include schema migrations,
backup/restore and a repeatable, validated import of existing JSON data.

SQLite suits this single-host service. A database shared directly over a network
or a deployment with many concurrent writers would merit PostgreSQL instead.
[SQLite deployment guidance](https://www.sqlite.org/whentouse.html).

Prisma is an optional ORM and migration tool that can use SQLite; it is not a
separate database or an encryption system. Introduce repository interfaces first,
then choose the driver/ORM with packaging and supported Node versions in mind.
[Prisma SQLite support](https://docs.prisma.io/docs/orm/core-concepts/supported-databases/sqlite).

Provider secrets should be opaque references to an OS secret store, such as
Windows Credential Manager, with adapters for other supported platforms. Keep
CLI OAuth credentials owned by their CLI. For headless deployment, support an
explicit external secret provider. Never silently fall back from protected storage
to plaintext. Secret migration must verify the new entry before removing the old
copy and explain backups, rotation and recovery.
[Windows credential management](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management).

Keep `.env` as an optional development/deployment input. Document one effective
precedence rule and show each setting's source without displaying secrets. A new
SQL database alone does not protect credentials or private prompts.

## Conversation sessions and webchat

Build a first-party webchat on the existing bridge port. One backend-owned
conversation transcript is authoritative. Each message records its provider,
model, attachments, selected skills and execution attempt. Changing the model
keeps the same conversation ID and assembles its context for the destination
adapter. This uses existing API/CLI/local transports.

Start with streaming, stop, retry, edit/branch, searchable session history,
Markdown/code rendering, attachments, export/delete and per-turn usage. Explain
which conversation content will reach the newly selected provider. Provider-native
session IDs belong to a provider profile and may accelerate continuation, but
cannot replace the portable transcript.

Persistence must be explicit. Preserve ephemeral chat and the current summary-only
pipeline-history default. Retained conversations need encryption at rest, retention
controls, and deletion/export behavior. Switching models cannot transfer hidden
reasoning or recreate discarded context; visible transcripts and summaries are
what the bridge can carry.

## Memory and context assembly

Separate three concepts:

- Session context: the current conversation, recent turns and a versioned summary.
- Long-term memory: explicit user, workspace or agent facts with provenance,
  timestamps, scope, expiry and edit/delete controls.
- Provider-profile state: native session handles, capability overrides and optional
  provider-scoped memories. Memory is not automatically shared across profiles.

The context assembler selects material within the destination model's token
budget. Show what was included or summarized. Retrieved memory is untrusted data,
cannot grant tool permissions, and must obey workspace/access boundaries. Start
with ordinary search; introduce embeddings after their need is demonstrated.
Optional automatic capture should create candidates in a review inbox before
they become durable instructions or facts.

## Agents, skills and prompt catalog

Make an agent a versioned configuration: purpose, instructions, provider/model
profile, skill attachments, tool permissions, workspace, memory scope and budget.
A model is the inference engine used by an agent, so default skill attachment
belongs to the agent or pipeline step, with model capability checks.

Each skill needs an ID/version, purpose, input/output contracts, instructions,
resource references, required tools, compatible execution modes and evaluation
examples. Pin the selected version into every run. Preview instructions before
execution and resolve conflicting skill instructions explicitly. Installing a
skill must not silently grant tools or execute bundled scripts. Begin with a
small tested catalog instead of a large unverified prompt collection.

Useful coding and review presets:

- Bug reproduction -> minimal fix -> regression test -> independent review.
- Plan -> implementation -> tests -> review -> bounded repair -> final evidence.
- API contract -> implementation -> compatibility/security review.
- Documentation checked against actual code and runnable examples.
- Competing designs -> trade-off review -> recorded decision.

Reviewers should receive the original requirement, actual diff and test evidence,
with appropriate access controls, rather than relying solely on another model's
summary. A review verdict needs file/evidence references and explicit blockers.

## Bounded loops and durable execution

Keep DAG dependencies acyclic. Represent a repair loop as an explicit bounded
stage with iteration records. Require maximum iterations, a shared total run
budget, total deadline, cancellation, a success predicate and no-progress
detection. Final synthesis counts toward those limits. Tool failures are not
permission to weaken policy.

Durable execution needs queue leases, crash recovery, idempotency keys and explicit
retry rules. Never blindly retry a step that may have written a file, sent a
message or created a remote resource. Resuming after restart requires retained
execution context and a reviewed recovery policy; SQLite alone cannot make side
effects exactly once. Approval binds to the exact run/step/version and is evaluated
again when permission or repository policy changes.

## Other missing product foundations

- Provider profiles: multiple accounts, credential rotation, capability discovery,
  health diagnostics, rate limits, cooldowns and explicit fallback policy.
- CLI compatibility: executable/version diagnostics and deliberate isolation from
  incompatible user config, including hooks and MCP configuration.
- Evaluation: fixture tasks, capability tests, quality regressions, latency and
  provider-reported versus estimated usage; separate billing from planning budgets.
- Artifacts: run-linked files/diffs, provenance, preview, retention and export.
- Operations: graceful shutdown, queue inspection, backup verification and recovery.
- Team deployments: authenticated operator identity, role/workspace permissions
  and trustworthy audit retention before claiming multi-user governance. The
  current operator label alone is not an authenticated human identity.

## Reference implementation and delivery order

Read-only inspection of the sibling `ai.elvatis.com` repository found useful
patterns in `apps/api/src/sessions/session-repository.ts`,
`apps/api/src/api/routes.ts`, `apps/web/src/App.tsx`,
`apps/api/src/memory/memory-service.ts`, `apps/web/src/MemoryPanel.tsx`,
`apps/api/src/prompts/prompt-repository.ts`, `apps/web/src/PromptLibrary.tsx`
and `apps/api/src/agents/agent-executor.ts`.

Its backend uses PostgreSQL with `pg` and SQL migrations, not Prisma. Adapt the
portable session and service contracts; avoid copying its full team/database
infrastructure or its executor's extra completion after reaching a loop limit.

1. Finish PR 117: security/stability fixes, tested pipeline lifecycle and real demos.
2. Storage foundation: SQLite repositories, credential-store interface, migrations,
   backup and explicit configuration precedence.
3. Session webchat: portable transcript, model switching and opt-in persistence.
4. Scoped memory and versioned skills/prompt library with context inspection.
5. Durable queue, bounded repair loops and evaluation suite.

Keep each stage independently reviewable with migration and failure-mode tests.

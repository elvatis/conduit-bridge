# Platform guide

The platform adds Webchat, Vault, Memory, Agents & skills, Runs & artifacts, and
Storage & diagnostics to the dashboard at
`http://127.0.0.1:31338/`. It uses the gateway's API, CLI and local model adapters.
Follow the [README](../../README.md) to start the bridge, then select a connected
model in Webchat. See the [validation report](../validation/platform.md) for tested
behavior, live provider results and remaining limits.

## Authentication and discovery

The API lives under `/v1/platform/`. The configured bridge bearer token acts as
local administrator. A loopback connection without a configured bridge token is
also local administrator access. Configure a bridge token before relying on
operator separation on a shared machine.

Administrators create scoped credentials with `POST /v1/platform/operators`.
The dashboard does not include an operator management form.
The response contains the token once; configuration retains a salted verifier.
Recreating an operator ID rotates its credential; deleting it revokes access.
Registered workspace IDs or `*` control workspace access.

| Role | Capabilities |
| --- | --- |
| `viewer` | Read permitted models, catalog items and visible records |
| `operator` | Viewer access plus own conversations/runs and permitted memory operations |
| `reviewer` | Viewer access plus run approvals and permitted memory reviews; cannot start executions |
| `admin` | All platform actions, including catalog/profile/operator/storage administration |

Non-admin conversations are private to their owner. Reviewers can inspect and
approve runs within workspace permissions. User memory belongs to its
authenticated user; workspace memory follows workspace permissions. Provider,
profile and agent memory require administrator access.

Scoped tokens discover models at `GET /v1/platform/models`. They do not work on
legacy routes such as `/v1/models` or `/v1/settings`. Use exact returned model IDs.

## REST example setup

These JavaScript examples run with Node 24 as an `.mjs` script. Supply
`BRIDGE_TOKEN` with an existing credential and `BRIDGE_MODEL` with a connected
model ID. Keep credentials out of source control. Calls execute requests and
retain records where described below.

```js
const base = process.env.BRIDGE_URL || 'http://127.0.0.1:31338';
const headers = { 'Content-Type': 'application/json' };
if (process.env.BRIDGE_TOKEN) headers.Authorization = `Bearer ${process.env.BRIDGE_TOKEN}`;
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + '/v1/platform' + path, {
    method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(value)}`);
  return value;
}
const { data: models } = await api('/models');
const model = process.env.BRIDGE_MODEL;
if (!models.some(item => item.id === model)) {
  throw new Error('Choose BRIDGE_MODEL from /v1/platform/models');
}
```

## Conversations, switching and context

Every session is retained on this device until explicit deletion. User messages
are committed before provider execution. Failed requests and received partial
answers remain stored with a status; they are excluded from future model context.
Conversation TTL no longer deletes history. Only one turn can be active per
session. Sending a completed turn advances its revision twice: pending and complete.

```js
let { session } = await api('/sessions', { title: 'Design discussion', model });
let reply = await api(`/sessions/${session.id}/messages`, {
  content: 'The design name is Orion.', maxOutputTokens: 256,
});
session = reply.session;
const { context } = await api(`/sessions/${session.id}/context`, {
  content: 'What name did we choose?', model, maxOutputTokens: 256,
});
console.log(context.selectedMessageIds, context.omittedMessageIds);

// Substitute another connected model ID to carry visible history to it.
reply = await api(`/sessions/${session.id}/messages`, {
  content: 'What name did we choose?', model, maxOutputTokens: 256,
});
session = reply.session;
({ session } = await api(`/sessions/${session.id}`, {
  title: 'Design discussion: Orion', revision: session.revision,
}, 'PATCH'));
```

Revision checks reject stale edits. Context inspection reports messages, selected
memory IDs, summary use and estimated tokens. Estimates use characters divided
by four with message overhead, so provider tokenization can differ. Older whole
turns are omitted to fit the allowance. Hidden reasoning is not transferred.

`POST /sessions/:id/summary` accepts reviewed `content`, `throughMessageId`
pointing to a completed assistant message, and current `revision`. Future context
uses this summary instead of earlier messages; the transcript remains intact.

For streaming, send the message body with `stream: true` and read
`text/event-stream`. Each `data:` JSON event has type `saved`, `delta`, `done` or `error`.
`saved` confirms the user request is durably stored before inference.
Deltas contain `delta`; done includes the completed turn/session. The helper
above handles ordinary JSON responses only.

| Operation | Endpoint/body |
| --- | --- |
| List or inspect | `GET /sessions`, `GET /sessions/:id` |
| Stop reply | `POST /sessions/:id/cancel` with `{}` |
| Export JSON | `GET /sessions/:id/export` |
| Delete | `DELETE /sessions/:id` |
| Branch through a message | `POST /sessions/:id/branch` with `{ "messageId": "..." }` |
| Branch for an edit | Same request with `messageId` and `content` branches **before** that message; then send edited content to the returned session |

Branch creation does not send `content`. Retry/edit controls branch and send a
new turn, preserving the original. Legacy requests for `ephemeral` are normalized
to `retained`; they never remove stored history. Branches and exports are independent.

## Vault search and prompt scans

| Action | Endpoint |
| --- | --- |
| Search words or a phrase | `GET /vault/search?query=acceptance%20criteria&mode=text` |
| Search a regex with native tgrep/ripgrep | `GET /vault/search?query=acceptance.*criteria&mode=regex` |
| Inspect schedule, counts and suggestions | `GET /vault` |
| Change recurring scans | `PATCH /vault/settings` with `enabled` and/or `intervalMinutes` |
| Start a scan in the background | `POST /vault/scan` with `{}`; returns 202 |
| Dismiss an owned suggestion | `DELETE /vault/suggestions/:id` |

Search covers the full message text in every authorized conversation, including
failed requests. It returns source session/message IDs, snippets, match counts
and the actual search engine. An administrator can search all permitted owners;
non-admins can search only their own conversations. `limit` defaults to 50 and
accepts 1 to 200. Text mode treats the query as a literal word or phrase; regex
mode uses a request-scoped temporary projection, with native timeout/output limits.
The projection is deleted after the request. See [storage](storage.md) for details.

The default scan interval is 60 minutes; configurable intervals are 5 to 10080
minutes. Schedules persist and resume while the bridge service runs. The local
administrator is enrolled at startup and an operator is enrolled when creating
a conversation or opening Vault. Each scan reads up to six excerpts of 650
characters from that owner's messages, and the cursor moves through the full
history over successive scans. It starts a new pass after reaching the end.
The scan is deliberately sampled, not a claim that every long message was fully
analyzed. Search always uses the complete message text.

Analysis is fixed to `bitnet/auto` on a loopback `BITNET_URL`, with no tool grants,
no cloud fallback, a 120-second execution limit and shared admission/accounting.
The server must already be available. Message text is quoted as untrusted data;
model output uses native JSON-schema decoding and is validated with real source
references. Authorization is
checked before inference and again before saving. Credential changes invalidate
previous schedules until the current operator saves the settings again.
Suggestions are encrypted with the platform state, deduplicated, and capped at
100 per owner. Sources that disappear or become inaccessible hide the suggestion.
Accepting a suggestion in the UI creates an unsent draft; it never edits a prompt
library entry or sends a message automatically.

## Reviewed memory

Create facts in Memory, review candidates, then explicitly attach approved IDs.
There is no automatic retrieval/capture job. Memory is untrusted reference data
and cannot grant tools.

```js
const { memory: candidate } = await api('/memories', {
  title: 'Design name', content: 'The design is named Orion.', scope: 'user',
  provenance: { sourceType: 'conversation', sourceRef: session.id },
});
// This call needs review permission; admin can review another user's memory.
const { memory } = await api(`/memories/${candidate.id}`, {
  status: 'approved', revision: candidate.revision,
}, 'PATCH');
await api(`/sessions/${session.id}/messages`, {
  content: 'Use the recorded name.', memoryIds: [memory.id], maxOutputTokens: 256,
});
```

Scopes are `user`, `workspace`, `agent`, `provider` and `profile`. User scope is
bound to the caller regardless of submitted `scopeId`; other scopes need the
exact corresponding ID. Context rejects candidates, expired entries and scope
mismatches. Editing reviewed title, content or lifetime resets candidate status
and clears approval metadata. `GET /memories?query=...` searches; PATCH edits;
DELETE removes. PATCH `status: "rejected"` records rejection. Review identity
comes from the bearer credential, not a submitted name.

## Skills, prompts and agents

Agents & skills includes built-in coding/review instructions. Administrators can add
skills and prompt templates. New versions preserve existing pinned attachments.
Fetch versions with `GET /skills/:id?version=1` or the equivalent prompts route.

```js
const { skill } = await api('/skills', {
  name: 'Concise evidence', body: 'Report the observed result and one supporting fact.',
  modes: ['chat', 'plan', 'agent'], requiredTools: [],
});
const { agent } = await api('/agents', {
  name: 'Design reviewer', model, mode: 'chat',
  instructions: 'Review the supplied design against its stated requirements.',
  skillRefs: [{ id: skill.id, version: skill.version }], promptRefs: [],
});
await api(`/sessions/${session.id}/messages`, {
  content: 'Review the current design.', agentId: agent.id, maxOutputTokens: 256,
});
```

Agents select provider/model/profile and mode. Agent edits use `expectedRevision`;
skill/prompt edits use `expectedVersion`. Required tools and modes are checked
when resolving instructions. Direct `skillRefs` on a message/run also pin
`{id, version}`. Catalog records do not install executables or widen tool policy.

## Bounded runs, evidence and approvals

Runs retain input and iteration output in the selected durable store. Volatile
stores are available only through explicit test/embedding injection.
`POST /runs` returns HTTP 202 with an ID before completion. Poll it or open
Runs & artifacts.

```js
const { run } = await api('/runs', {
  prompt: 'Review the supplied design. Finish with DONE when the review is complete.',
  model, mode: 'chat', maxIterations: 2, maxDurationMs: 120_000,
  maxTokens: 4000, maxOutputTokens: 512, maxCostUsd: 0.10,
  successPattern: 'DONE', requiresApproval: true,
  idempotencyKey: 'design-review-example-1',
});
// Use a reviewer/admin credential for this call.
await api(`/runs/${run.id}/actions`, { action: 'approve', feedback: 'Scope checked.' });
console.log(await api(`/runs/${run.id}`));
```

`successPattern` is a literal substring, not a regex or proof of correctness.
Without it, one successful response completes the run. Limits, unchanged output
and cancellation stop iterations; there is no hidden final completion. Reusing
an idempotency key with different input conflicts. Cost/token accounting uses
planning estimates, not guaranteed provider billing.

Actions are `approve`, `reject`, `cancel` and `retry`. Retry of a terminal
chat/plan run creates another run. Agent side effects require workspace inspection
and an explicit new run. Agent mode requires a registered workspace or governed
repository; restrictions are rechecked at execution. Repositories requiring
governed execution use their assigned pipeline instead of a generic run.

`GET /runs/:id` includes iteration status/content and artifact metadata.
`GET /artifacts/:id` or `/artifacts/:id?download=1` returns model output, not
automatic file diffs or command logs. Collect actual evidence separately when
needed. `POST /evaluations` with `{models: [model]}` starts a small `EVAL_OK`
instruction-following fixture, not a coding-quality benchmark. Administrators
list presets at `GET /presets?model=...`, install with
`POST /presets/:id/install` and `{model}`, then use the
[pipeline API](pipelines.md).

## Provider profiles and operators

Administrators create profiles in Storage & diagnostics or with `POST /profiles`:

```js
const { profile } = await api('/profiles', {
  name: 'Review profile', provider: models.find(item => item.id === model).provider,
  model, defaultEffort: 'low', maxConcurrent: 2, cooldownMs: 5000,
});
```

Use `profileId` on a session/run. Model overrides must match its provider. API
profiles accept write-only `apiKey` and retain vault references; responses report
presence/source. PATCH supports `clearCredential`. CLI profiles may select an
existing absolute `cliExecutable`; authentication stays with the CLI. Active
profiles cannot be changed/deleted. Disabled profiles, concurrency limits and
cooldowns reject new execution. There is no automatic provider/account fallback.
`GET /diagnostics` is admin-only.

An admin issues scoped credentials with:

```js
const issued = await api('/operators', {
  id: 'reviewer-1', displayName: 'Review operator', role: 'reviewer',
  workspaceIds: ['*'],
});
// Deliver issued.token securely to its operator; do not log it.
```

## Encryption, storage selection and backups

The runtime directory is `%USERPROFILE%\.conduit` on Windows or `~/.conduit` on
Linux; `CONDUIT_HOME` overrides it. New retained platform state defaults to
`platform-state.enc`. Its authenticated encryption key is protected with Windows
DPAPI or Linux Secret Service (`secret-tool` and an available unlocked service).
New credential writes fail if secure storage is unavailable; there is no silent
plaintext fallback for those writes.

Headless deployments can supply `CONDUIT_VAULT_KEY` through their secret delivery
mechanism: 32 random bytes encoded as base64 or hex. Configuration fields
`securityStorage.vaultKeyEnvironmentVariable` and `vaultKeyId` select the key
source/namespace. Keep key material stable and recoverable. Replacing the key or
losing its OS identity can make existing data unreadable. A platform backup does
not include the separate credential vault or its key material.

`.env` is optional plaintext input. The CLI reads startup-directory `.env`, then
runtime-directory `.env`; process variables win, and earlier files beat later
ones. These files are not encrypted by the platform. Settings API keys now use
vault references. Legacy plaintext keys are migrated only after verifying the
protected copy; migration failure preserves existing configuration and reports
the storage error. Other legacy gateway stores are not automatically migrated
or encrypted by the platform backend.

Storage & diagnostics supports encrypted file and native SQLite. SQLite is the
default and stores the encrypted snapshot in `platform.sqlite` without Prisma.
Its first default startup imports a legacy encrypted file if no database state
exists. Later manual backend changes take effect after restart:

1. Stop active conversations/runs. Save `GET /storage/backup` to a protected file;
   it returns the complete encrypted `{format, data}` backup object.
2. Select `POST /storage/config` with `{ "backend": "sqlite" }` (or `file`),
   then restart.
3. POST the full backup object to `/storage/restore` and verify restored records.
   Restore replaces platform state, so export destination data first. Decryption
   requires matching key configuration.

`GET /storage` reports the active backend/readiness. The volatile memory adapter
is limited to injected test/embedding stores and cannot be selected in production. Backup/restore excludes
external provider logins, vault/key material, repository files and legacy stores.

## Embedding with a supplied Prisma client

The package exports `PrismaSnapshotBackend`, `TransactionalStateStore` and
`BridgeServer` without a forced Prisma dependency. The embedding application
chooses Prisma version, datasource, generator, migrations and connection adapter.
Add the [BridgeState model](../../examples/storage/schema.prisma) to that schema and
generate the client. The contract needs `bridgeState.findUnique/create/updateMany`.

This executable embedding factory accepts the caller's initialized generated
client and uses the same cipher purpose/key settings as HTTP backups:

```js
import {
  BridgeServer, PrismaSnapshotBackend, TransactionalStateStore,
  createContentCipher, loadConfig, loadDotEnv, runtimeDir,
} from '@elvatis/conduit-bridge';

export async function startWithPrisma(prisma) {
  loadDotEnv();
  const config = loadConfig();
  const cipher = createContentCipher({
    purpose: 'platform-state', directory: runtimeDir(),
    keyEnvironmentVariable: config.securityStorage?.vaultKeyEnvironmentVariable,
    keyId: config.securityStorage?.vaultKeyId,
  });
  const platformStore = new TransactionalStateStore(
    new PrismaSnapshotBackend(prisma, cipher),
  );
  await platformStore.ready();
  const bridge = new BridgeServer(config, { platformStore });
  await bridge.start();
  return bridge;
}
// Caller: const bridge = await startWithPrisma(yourGeneratedClient);
// Shutdown: await bridge.stop(); await yourGeneratedClient.$disconnect();
```

The caller owns client connection lifecycle. A `prisma` backend config cannot
create a client and is rejected without an injected store. The adapter uses
revision compare-and-swap on one encrypted snapshot, not normalized entity
tables. Current tests use a structural client fake; validate migrations,
connections and recovery against your chosen real database before deployment.

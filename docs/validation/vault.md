# Vault, persistence and native startup validation

Validated on Windows with Node.js 24.14.1 on 2026-09-07.

## Automated checks

The full repository suite passes: **547 tests in 64 files**, plus TypeScript
checking and the production build. Focused coverage includes:

- Default durable retention, legacy ephemeral/TTL normalization, storage failures,
  saved interrupted output, recovery of pending requests and context exclusion.
- One-time encrypted file import into SQLite, unchanged legacy source, encrypted
  contents and preservation of newer database records on subsequent starts.
- Unicode/literal full-text queries, owner/workspace boundaries, scoped native
  projections and cleanup on successful and failed regex searches.
- Saved scan intervals/cursors, bounded passes through history, disabled schedules,
  cancellation, changed authorization, invalid evidence and duplicate suggestions.
- Fixed local BitNet routing, refusal of remote inference URLs, constrained JSON
  decoding, source ownership and suggestions becoming unsent drafts.
- Native startup, explicit opt-out, reuse without ownership, unavailable optional
  installations, CPU/loopback arguments and owned-child shutdown.
- UTF-8 dashboard assets, bilingual labels and escaped search/suggestion content.

Run the suite with `npm test`, then build with `npm run build`.

## Real service and model checks

An encrypted backup was captured before replacing the running bridge. Its six
existing conversations and 28 messages survived the initial file-to-SQLite
migration. A later restart preserved all seven then-current conversations and
34 messages, including messages added while validation was in progress.

The existing Microsoft BitNet b1.58 2B-4T GGUF and native compatibility build
started automatically with the bridge. A synthetic retained chat returned
`READY`; both SQLite FTS5 and native tgrep 1.0.4 found the stored message through
the live authenticated API. The full-text UI result opened the exact original
message. German and English Vault views were checked in the browser.

A separate runtime directory exercised two complete start/stop cycles with the
real Llama executable and tgrep. The first cycle created three native chat turns
and produced a structured prompt suggestion from six excerpts. The second cycle
recovered all six messages, the suggestion and the completed scan state. Each
cycle automatically started a new native PID; graceful bridge shutdown terminated
that owned child. tgrep also worked with the runtime under an ignored repository
folder, after explicitly exempting its private projection from parent ignore rules.

## Practical limits

These checks establish the exercised persistence and integration paths. BitNet
2B output quality remains limited: an early unconstrained response merely repeated
a codeword. Scans now use native JSON-schema decoding, validate evidence and reject
undersized prompt text, but suggestions still require human judgment. They never
modify the prompt library or send a message automatically.

Scans analyze up to six 650-character excerpts per interval, advancing across the
history. This is sampled analysis; search covers full message text. Scheduling
requires the bridge to be running. Forced process termination cannot recover a
stream fragment that never reached a durable commit, and may leave temporary
regex files. Normal failure/cancellation removes the projection. See
[storage and backups](../guides/storage.md) for the current capacity limits and
key recovery requirements.

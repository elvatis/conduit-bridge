# Storage and backups

Conduit Bridge does not need a server database. Its configuration and
platform state stay in one local runtime directory that is private to the user
running the bridge.

## Where the data is stored

By default, the runtime directory is:

| Platform | Default directory |
| --- | --- |
| Windows | `%USERPROFILE%\\.conduit` |
| Linux | `~/.conduit` |

Set `CONDUIT_HOME` before starting the bridge to move the entire runtime tree.
For example, on Windows PowerShell:

```powershell
$env:CONDUIT_HOME = 'D:\\ConduitData'
node dist/cli.js start
```

Keep the same value for autostart and manual launches. Changing it creates or
selects a different local state tree; it does not copy existing data.

## Platform-state backend

The platform backend stores all platform conversations, approved memories, profiles,
skills, agent records, runs, and other platform-neutral state. Its selected
backend determines the main data file.

| Backend | Default path | Behavior |
| --- | --- | --- |
| Encrypted file | `platform-state.enc` | Explicit compatibility option. An authenticated encrypted snapshot. |
| SQLite | `platform.sqlite` | Default. The complete canonical snapshot is encrypted before storage; no plaintext message columns. |
| Memory | No durable file | Test/embedding injection only. Rejected as a production dashboard backend. |
| Prisma | Chosen by embedding application | Available only when an embedding host supplies its own generated Prisma client. |

On a default Windows installation, the active backend is therefore
`%USERPROFILE%\\.conduit\\platform.sqlite`. A new default SQLite database imports
the old encrypted `platform-state.enc` once and preserves that file. Existing
SQLite data is never overwritten by a legacy import. Check the active backend in
the dashboard under **Settings and diagnostics**, or call:

```bash
curl http://127.0.0.1:31338/v1/platform/storage
```

The response identifies the active backend and whether it is ready. It does not
expose decrypted platform content.

## Conversation retention and search

Conversations have no automatic expiry. Legacy `ephemeral` settings are
normalized to `retained`, and conversation `ttlMs`/`expiresAt` values are ignored.
Memory items retain their separate TTL and review policy. The user message is
committed before provider dispatch. Completed replies, failed requests and
received partial output on cancellation remain stored, with explicit status.
After a crash, a pending request is marked interrupted; an uncommitted in-flight
stream fragment cannot be recovered. Failed/interrupted content remains searchable
but is excluded from future model context.

The full-text SQLite FTS5 index is rebuilt in RAM from authorized messages for
each search. It does not expose decrypted message text on disk. Native tgrep needs
files, so regex mode makes a temporary private projection and index for the current
request. It never uses the code-search daemon or another workspace's index.
A forced process termination can leave a temporary projection; treat the entire
runtime directory as private. Normal success, failure and cancellation remove it.
The canonical database and portable backups remain encrypted.

The current snapshot adapter has a 32 MiB state limit, with 500 conversations,
200 messages and 1,000,000 message characters per conversation. Limits reject new
writes explicitly; they do not delete old conversations. Export before deliberate
cleanup. SQLite currently stores an encrypted snapshot, not individual queryable
plaintext message rows.

## Other runtime files

The directory also contains small operational records when their feature is in
use. They are not all present in every installation.

| File or folder | Purpose |
| --- | --- |
| `config.json` | Bridge settings and references to stored credentials. It should not contain newly saved credential values. |
| `cli-sessions.json` | CLI session IDs, timestamps, counters, and transcript hashes for retained-session continuation. It does not store prompt or answer text. |
| `budget-usage.json`, `rate-limits.json` | Local usage estimates and request-admission records. |
| `repositories.json`, `audit-trail.json` | Registered repository governance and audit records. |
| `vault-search/` | Temporary scoped text files for regex searches; removed after each request. |
| `tgrep/` | Per-workspace tgrep indexes and daemon discovery files, outside the source tree. |
| `bitnet-server.pid`, `tgrep-server.pid` | Temporary ownership records for locally managed native processes. |
| `logs/` | Standard output and error logs written by desktop autostart. |

Provider credential values saved through the dashboard belong to the protected
credential vault. `config.json` keeps opaque vault references. Protect the whole
runtime directory, its backups, and any `.env` file as local sensitive data.

## Change backend safely

Changing the dashboard selection only saves the preference for the next restart.
It does not migrate or delete state. Use this sequence:

1. Stop active conversations and agent runs.
2. Download an encrypted backup from **Settings and diagnostics**.
3. Select `Encrypted file` or `SQLite` and save the preference.
4. Restart Conduit Bridge.
5. Restore the complete backup into the newly active backend.
6. Verify the restored conversations, memories, profiles, and runs before
   discarding the old copy.

The backup is encrypted and requires compatible key material to restore. It does
not include external provider logins, an API provider's account state, repository
files, or the separate credential-vault key. Export the destination data first:
restore replaces the selected backend's platform state.

## Encryption and recovery

On Windows, new protected storage uses a key guarded by the current user's DPAPI.
On Linux it uses an unlocked Secret Service when available. Headless deployments
can provide a stable 32-byte key through `CONDUIT_VAULT_KEY` or the configured
key environment-variable name.

Losing the corresponding operating-system identity or configured key can make
the encrypted data unreadable. Conduit intentionally does not fall back to
plaintext for a failed protected credential write. Plan backups before changing
user accounts, hosts, or key configuration.

For the broader platform model, see [the Platform guide](platform.md). For
desktop launch paths and log locations, see [Autostart](autostart.md).

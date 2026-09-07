# Storage and backups

Conduit Bridge does not need a server database. Its configuration and retained
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

The platform backend stores retained conversations, approved memories, profiles,
skills, agent records, runs, and other platform-neutral state. Its selected
backend determines the main data file.

| Backend | Default path | Behavior |
| --- | --- | --- |
| Encrypted file | `platform-state.enc` | Default. An authenticated encrypted snapshot with no database service to operate. |
| SQLite | `platform.sqlite` | Opt-in local SQLite file. The snapshot content remains encrypted before storage. |
| Memory | No durable file | Data disappears when the service stops. Useful for tests and temporary sessions. |
| Prisma | Chosen by embedding application | Available only when an embedding host supplies its own generated Prisma client. |

On a default Windows installation, the active encrypted-file backend is therefore
`%USERPROFILE%\\.conduit\\platform-state.enc`. Check the active backend in
the dashboard under **Settings and diagnostics**, or call:

```bash
curl http://127.0.0.1:31338/v1/platform/storage
```

The response identifies the active backend and whether it is ready. It does not
expose decrypted platform content.

## Other runtime files

The directory also contains small operational records when their feature is in
use. They are not all present in every installation.

| File or folder | Purpose |
| --- | --- |
| `config.json` | Bridge settings and references to stored credentials. It should not contain newly saved credential values. |
| `cli-sessions.json` | CLI session IDs, timestamps, counters, and transcript hashes for retained-session continuation. It does not store prompt or answer text. |
| `budget-usage.json`, `rate-limits.json` | Local usage estimates and request-admission records. |
| `repositories.json`, `audit-trail.json` | Registered repository governance and audit records. |
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
3. Select `Encrypted file`, `SQLite`, or `Memory` and save the preference.
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

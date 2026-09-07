# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in this project, please report it responsibly:

1. **Do not open a public issue.** Instead, send an email to **security@elvatis.com** with:
   - A clear description of the vulnerability
   - Steps to reproduce
   - Expected and actual behavior
   - Any PoC code or attachments (zip) if safe to share

2. We will acknowledge receipt within **48 hours** and provide a timeline for fixes.

3. Do not publicly disclose the issue until we have had a reasonable time to address it.

We appreciate responsible disclosure.


## Supported Versions

Only the latest release is supported. This project is not published to npm;
releases are Git tags with a matching GitHub Release, so "latest" means the
highest version tag on `main`.

| Version | Supported |
| --- | --- |
| 0.9.x | yes |
| older | no |

Report against the latest release. A fix ships in the next release rather
than as a patch to an older tag.

## Handling API Keys and Retained Content

This is a **public** repository and the bridge talks to several paid AI APIs, so a
single committed key is a live credential leak.

- Credentials saved through Conduit are written to an authenticated encrypted vault.
  `config.json` stores only opaque `vault:v1:` references. The vault master key is
  protected with current-user DPAPI on Windows or Secret Service on Linux. A headless
  Linux host without Secret Service must inject an explicit 32-byte key through
  `CONDUIT_VAULT_KEY` (or the configured environment-variable name); Conduit does not
  fall back to plaintext storage.
- Real environment variables are suitable for ephemeral provider credentials and
  managed secret injection. A `.env` file is plaintext even when it is gitignored;
  restrict its filesystem permissions and prefer the encrypted vault or a platform
  secret manager for retained credentials.
- `.env.example` documents the supported variables and must contain **placeholders
  only**, never a working key.
- Never paste a key into a README, an issue, a test fixture or a config file.
- `npm run scan:secrets` scans the tracked tree for credential-shaped strings, and
  `npm run scan:secrets:history` also scans every blob in git history. The same
  scanner runs in CI (`.github/workflows/secret-scan.yml`) on every push and pull
  request, so a leak fails the build instead of shipping.

If a key does reach a public commit, treat it as compromised: **rotate it at the
provider first**, then clean up the repository. Rotation is the fix; deleting the
commit is not, because the value is already public.

Retained sessions, memories, agent profiles, and provider-neutral state use the same
purpose-separated authenticated encryption before file, SQLite, or Prisma storage.
Authentication failures stop the load; corrupted ciphertext is never treated as
plaintext. Retention is opt-in, bounded by size and optional expiry, and supports
explicit export and deletion. Backups remain encrypted.

## Local Bridge Boundary

Bind the bridge to loopback unless remote access is intentional. A non-loopback
bind requires bearer-token authentication. State-changing HTTP requests reject
foreign and opaque (`Origin: null`) browser origins, request bodies are limited to
1 MiB, and dashboard responses deny framing and MIME sniffing. WebSocket clients
must authenticate with the bearer header or the `conduit-token.<token>`
subprotocol; tokens in WebSocket query strings are not accepted because URLs are
commonly retained in logs and history.

## CLI and Workspace Permissions

Agent policies accept only known tool names. Windows command arguments containing
quotes or control characters are rejected before a `.cmd` or `.bat` shim is
invoked. Every fallback provider is checked against its own agent policy.

Each CLI provider can select an absolute executable path. Relative or unusable
overrides fail closed instead of silently selecting another PATH entry, and read-only
diagnostics report the resolved path and CLI version. Codex runs with
`--ignore-user-config`: its login remains available, while user MCP servers, hooks,
feature flags, and permission settings cannot replace the model, effort, and sandbox
policy supplied by the bridge. Each provider subprocess receives only its own API-key
environment variables; other providers' credentials are omitted, and version
diagnostics receive no provider credentials.

Pipeline working directories are resolved through symlinks and Windows junctions
and must remain inside the selected repository or a registered workspace.
Repository pipeline allowlists, agent overrides, mandatory approval gates, and
per-run cost limits are enforced by the server.

A working directory is a scope check, not an operating-system sandbox. Native CLI
agents can still have the permissions of the user running the bridge. Use a
container, virtual machine, or restricted operating-system account when executing
untrusted prompts or tools. The community write demo therefore requires the
explicit `--allow-write-demo` option.

## Local Retention and Budgets

Live pipeline details contain the prompt and provider output so an approval can
resume in the same process. Durable pipeline history stores summary metadata only;
it omits prompts, templates, and model output. A running or paused pipeline found
after restart is marked interrupted and must be started again.

Usage and cost values are conservative local estimates, not provider invoices.
The budget ledger reserves estimated capacity before each provider call, counts
fallback attempts, and validates persisted values before using them for a hard
stop. Keep the runtime directory private even though its files are created with
owner-only permissions where the platform supports them.

## Platform Operators and Memory Boundaries

Optional platform operators use high-entropy bearer tokens whose configuration keeps
only salted SHA-256 verifiers. Comparisons use constant-time primitives. Roles are
viewer, operator, reviewer, and admin; each configured identity also has an explicit
workspace allowlist. Routes must derive the audit identity from the authenticated
token and check both capability and workspace, never accept an operator name or user
scope from a request body. The existing bridge bearer maps to `local-admin`, and an
auth-disabled loopback request keeps that compatibility identity.

Retrieved memory is untrusted reference data. Only approved, unexpired memory in the
authenticated user, workspace, agent, provider, or profile scope may enter a prompt.
Cross-provider replay requires explicit selection and redaction. Raw client-supplied
skill instructions must not be promoted into a system prompt; routes resolve approved
stored skill IDs or restrict raw instructions to an administrator.

# Conduit Bridge documentation

This directory is organized by the question being answered. Start with a guide
when setting up or operating a bridge, use the reference material when building
a client, and consult validation reports only when you need historical test
evidence.

## Guides

| Document | Use it for |
| --- | --- |
| [Getting started](guides/getting-started.md) | Installation, provider connection, dashboard, and first OpenAI-compatible request. |
| [Platform guide](guides/platform.md) | Durable conversations, searchable vault, recurring prompt scans, memories, skills, profiles, and bounded runs. |
| [Storage and backups](guides/storage.md) | Runtime files, encrypted file storage, SQLite, backup/restore, and `CONDUIT_HOME`. |
| [BitNet on Windows](guides/bitnet.md) | Local BitNet CPU inference, native build, configuration, and lifecycle. |
| [tgrep code search](guides/tgrep.md) | Local code indexing, daemon operation, ripgrep fallback, and limits. |
| [Pipeline examples](guides/pipelines.md) | Controlled write, approval, and parallel-workflow examples. |
| [Tools and Projects](guides/tools-and-projects.md) | Executable tools, GitHub Projects, permissions, and limits. |
| [Autostart](guides/autostart.md) | Windows and Linux desktop autostart. |
| [Browser migration](guides/browser-migration.md) | Why browser-session providers were removed and how to migrate. |

## Reference

| Document | Use it for |
| --- | --- |
| [Integrations](reference/integrations.md) | HTTP entry points, orchestration, CLI continuity, native local services, and routing. |
| [VS Code bridge](reference/vscode-bridge.md) | WebSocket protocol and client implementation. |

## Operations and design

| Document | Use it for |
| --- | --- |
| [Release process](operations/releasing.md) | Versioning, changelog entries, tags, and GitHub Releases. |
| [Provider and agent roadmap](architecture/provider-agent-roadmap.md) | The implemented platform design and intended next work. |
| [Changelog](../CHANGELOG.md) | Changes between released versions. |
| [Security policy](../SECURITY.md) | Supported versions, credential handling, and disclosure. |

## Validation evidence

[Vault and persistence validation](validation/vault.md) records native restart,
SQLite migration, tgrep search and local prompt-scan checks.

These reports record point-in-time results. They are useful for reproduction and
known limits, but they do not replace current CI or a validation run on your own
environment.

| Report | Scope |
| --- | --- |
| [Provider and agent platform](validation/platform.md) | Provider matrix, encrypted storage, and dashboard verification. |
| [Additional integrations](validation/addendum.md) | Native BitNet, tgrep, local routing, tools, and CLI-session checks. |
| [Tools and GitHub Projects](validation/integrations.md) | Tool and project integration coverage. |
| [Pipeline examples](validation/pr117.md) | Recorded pipeline example evidence. |

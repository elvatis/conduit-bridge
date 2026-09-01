# Conduit Bridge: Trust Register

_Updated: 2026-09-02_

## Runtime and build

| Property | Status | Provenance | Last Verified | Agent | TTL | Expires | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Windows and Linux Desktop platform gate | verified | test_verified | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Automated platform tests |
| API/CLI/local registry separation | verified | test_verified | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Registry and provider tests |
| `cli-grok` canonical ID and routing | verified | runtime_observed | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Tests and Windows status |
| API credentials do not reuse CLI OAuth files | verified | test_verified | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Resolver source and tests |
| Single loopback listener | verified | runtime_observed | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Windows health and socket checks |
| Windows autostart lifecycle | verified | runtime_observed | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Task, PID, logs, stop, uninstall |
| Tests, typecheck, and build pass | verified | test_verified | 2026-09-02 | gpt-5.6-sol | 14d | 2026-09-16 | 85 tests |

## Security

| Property | Status | Provenance | Last Verified | Agent | TTL | Expires | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API key values remain write-only over HTTP | verified | test_verified | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Settings and server tests |
| Current tree contains no detected secrets | verified | tool_verified | 2026-09-02 | gpt-5.6-sol | 14d | 2026-09-16 | 15-pattern scan |
| Git history contains no detected secrets | verified | tool_verified | 2026-09-02 | gpt-5.6-sol | 30d | 2026-10-02 | Full-history scan |
| Production dependency audit is clean | verified | tool_verified | 2026-09-02 | gpt-5.6-sol | 14d | 2026-09-16 | 0 vulnerabilities |

Re-verify claims after relevant code, dependency, platform, or installer changes.

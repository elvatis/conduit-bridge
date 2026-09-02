# Dashboard

_Updated: 2026-09-02_

The dashboard uses separate navigation pages for:

- API providers
- CLI providers
- Local providers
- Models, Playground, Usage, Orchestrator, Integration tests, Activity,
  Settings, and Help

Provider readiness uses `connected` and `loginType` with the values
`api-key`, `cli`, or `local`. API cards show a sanitized credential
source. Settings accepts write-only API keys and explicitly states that CLI
authentication is separate.

There are no sign-in controls, profile states, viewer controls, or browser
diagnostics.

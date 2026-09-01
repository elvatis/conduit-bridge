# NEXT_ACTIONS.md - conduit-bridge

_Last updated: 2026-09-01_

## Status Summary

| Status | Count |
|---|---|
| Done | 8 |
| Ready | 2 |
| Blocked | 1 |

## Ready

### T-007: Validate fresh Claude and ChatGPT browser sign-in

- Use the built-in viewer through an SSH tunnel.
- Complete provider security checks manually.
- Verify restore after a full bridge restart.
- Confirm a real `web-claude/*` and `web-chatgpt/*` request.

### T-008: Validate Windows Desktop autostart

- Switch the checkout to `fix/browser-login-single-port`.
- Run the PowerShell installer from a built checkout.
- Confirm the per-user logon task starts the bridge as the interactive desktop user.
- Confirm Chromium opens locally and browser login can be completed.

## Out of scope

### T-009: Headless Linux and macOS support

- Explicitly not supported by the current product scope.
- Revisit only with a separate architecture and validation plan.

## Recently Completed

| Task | Title | Date |
|---|---|---|
| T-001 | Scaffold project and AAHP handoff | 2026-03-12 |
| T-002 | Initial bridge implementation | 2026-03-12 |
| T-003 | Vitest coverage | 2026-07-17 |
| T-004 | Session expiry tracking | 2026-07-17 |
| T-005 | Network interception with DOM fallback | 2026-07-17 |
| T-006 | npm publishing dropped by decision | 2026-07-17 |
| T-010 | Native-identity browser restore | 2026-09-01 |
| T-011 | Single-port built-in login viewer and documentation refresh | 2026-09-01 |
| T-012 | Explicit desktop support scope and autostart installers | 2026-09-01 |

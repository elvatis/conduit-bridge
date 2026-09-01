# DASHBOARD - conduit-bridge

_Quick-glance state. Last updated: 2026-09-01_

## Current State

| Item | Value |
|---|---|
| Version | 0.5.1 plus unreleased changes |
| Branch | `fix/browser-login-single-port` |
| Build | pass |
| Tests | 348 pass, 23 files |
| Audit | zero vulnerabilities |
| Secret scans | current tree and full history pass |
| npm published | no |
| GitHub | https://github.com/elvatis/conduit-bridge |
| User-facing port | 31338 on loopback |

## Browser Runtime

| Item | State |
|---|---|
| Login identity | native, `navigator.webdriver === false` |
| Remote login | built-in viewer through 31338 |
| Preferred remote client mode | local bridge plus reverse SSH tunnel |
| Viewer HTML | static, no reflected route values |
| Viewer input | serialized, atomic clicks, coalesced movement and wheel |
| Supported desktop | Windows Desktop and Linux Desktop |
| Desktop autostart | Linux `.desktop` and Windows Task Scheduler, launchers under `.conduit/bin` |
| Stable ports 5900 and 6080 | absent |
| Separate remote-desktop services | removed |
| Session restore | ordinary Chromium plus private loopback attachment |
| Login state reconciliation | active session overrides obsolete attempt state |

## Live Provider State

| Provider | State |
|---|---|
| Grok | connected and live request proven |
| Gemini | connected |
| Perplexity | connected |
| Claude | security check requires a person |
| ChatGPT | sign-in required |

## Next

1. Validate fresh Claude and ChatGPT logins on a supported Windows Desktop.
2. Review the desktop autostart flow from a clean Windows checkout.
3. Keep headless Linux and macOS explicitly unsupported until separately designed.

## Model Catalog

- Grouped first by transport, then by exact route provider
- Search plus transport and provider filters
- Provider readiness, model availability, and catalog source visible
- Direct selection into Playground

## Related Projects

- `conduit-vscode`: optional VS Code client
- `openclaw-cli-bridge-elvatis`: archived reference only

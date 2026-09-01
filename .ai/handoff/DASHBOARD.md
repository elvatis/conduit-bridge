# DASHBOARD - conduit-bridge

_Quick-glance state. Last updated: 2026-09-01_

## Current State

| Item | Value |
|---|---|
| Version | 0.5.1 plus unreleased changes |
| Branch | `fix/browser-login-single-port` |
| Build | pass |
| Tests | 339 pass, 21 files |
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
| Remote display | Xvfb only |
| Stable ports 5900 and 6080 | absent |
| Separate remote-desktop services | removed |
| Session restore | ordinary Chromium plus private loopback attachment |

## Live Provider State

| Provider | State |
|---|---|
| Grok | connected and live request proven |
| Gemini | connected |
| Perplexity | connected |
| Claude | security check requires a person |
| ChatGPT | sign-in required |

## Next

1. Validate fresh Claude and ChatGPT logins.
2. Add Xauthority hardening for shared hosts.
3. Purge inactive legacy host packages with administrator access.

## Related Projects

- `conduit-vscode`: optional VS Code client
- `openclaw-cli-bridge-elvatis`: archived reference only

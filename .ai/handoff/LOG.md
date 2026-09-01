# Work log

_Reverse chronological._

## 2026-09-02 — provider architecture cleanup

- Removed all `web-*` providers and interactive sign-in routes.
- Removed the Playwright dependency and the browser runtime.
- Split provider status into API, CLI, and local categories.
- Standardized the Grok CLI provider ID as `cli-grok`.
- Stopped API providers from reading CLI OAuth credential files.
- Added separate dashboard navigation pages for API, CLI, and local providers.
- Kept direct API keys write-only and exposed only their sanitized source.
- Rewrote README, Help, migration, autostart, changelog, and handoff material.
- Updated AAHP to 3.12.0 and supply-chain-guard to 6.0.9.
- Windows test suite passed with 85 tests.
- Typecheck, build, diff check, both secret scans, production audit, AAHP
  doctor, and AAHP precommit verification passed.
- Live Windows status showed all four CLI providers independently connected,
  while API providers reflected only their own Bridge or environment keys.
- Windows autostart install, health, tracked PID, logs, stop, and uninstall
  completed successfully.
- Resolved the new CodeQL HTML-filtering alert in the dashboard syntax test by
  matching script tags case-insensitively.

# Next actions

_Updated: 2026-09-02_

1. Land `feat/cli-run-mode` with the matching conduit-vscode PR. Merge vscode
   first (it sends `mode`; older bridges ignore the field), then this bridge
   (Grok is no longer always-write).
2. After both merge, cut a bridge minor for the new `mode` request field.

Do not reintroduce `web-*`, Playwright, cookie extraction, VNC components, or
additional user ports.

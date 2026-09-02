# Browser-provider migration

Browser-session providers are no longer part of Conduit Bridge. The
`web-grok`, `web-claude`, `web-gemini`, `web-chatgpt`, and
`web-perplexity` routes were removed after desktop testing showed that
provider security checks and reusable unattended sessions could not be made
reliable enough for a community tool.

Conduit no longer launches or automates installed browsers. It does not read,
copy, or maintain browser cookies and it has no Playwright runtime dependency.

Use one of the supported transports:

- Authenticated provider tools: `cli-claude`, `cli-codex`, `cli-gemini`,
  and `cli-grok`
- Direct provider APIs: `claude-api`, `codex-api`, `gemini-api`,
  `openrouter-api`, and `perplexity-api`
- Local models: `lmstudio`

CLI authentication and API keys are independent. An authenticated CLI does not
configure its API counterpart; when both are available, both providers appear
separately in the dashboard.

## Platform support

The CLI product (`conduit-bridge start`) supports Windows Desktop and Linux
Desktop only and exits on other platforms, including macOS. That is a breaking
change for Mac embedders that previously called `new BridgeServer(cfg).start()`.
`BridgeServer.start()` itself no longer throws on an unsupported platform, so
`conduit-vscode` and other library users can skip the gate. Call
`assertSupportedPlatform()` if you want the CLI product's restriction.

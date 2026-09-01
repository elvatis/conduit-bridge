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

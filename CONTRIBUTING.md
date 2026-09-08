# Contributing

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository and create a feature branch from `main`.
2. Use Node.js 24 or newer and install dependencies: `npm ci --ignore-scripts`.
3. Run `npm test` and `npm run build`.
4. For dashboard changes, install Chromium with `npx playwright install chromium`
   and run `npm run test:ui`.
5. Keep changes focused and update the relevant guide and examples.

## Dashboard verification

The Playwright suite loads the current dashboard source into an isolated
browser and intercepts every network request. Provider responses and writes
use explicit fixtures; the suite never connects to a live bridge or account.
Playwright is a development dependency, not a provider transport.

The suite checks every navigation section and platform tab in English and
German at 390, 768, 1280, 1920 and 3840 CSS pixels. Interaction tests cover
settings, permissions, failed saves, keyboard use, project persistence,
execution controls, Git browsing and analytics export. Add a regression that
exercises the failing behavior when fixing a functional defect.
Dialog checks also cover 320 x 480 and 1280 x 720 viewports, accessible names,
initial and restored focus, inactive background controls, and Escape handling
for nested menus and popovers. Execution checks retain failed-action messages
across a completed refresh and clear them after a successful retry.

On Windows, an installed Edge can replace the downloaded test browser:

```powershell
$env:CONDUIT_TEST_BROWSER = 'msedge'
npm run test:ui
```

CI runs Vitest and the production build on Linux and Windows, plus the browser
suite with Chromium on Linux. Layout screenshots, failure traces and the HTML
report are stored under `.ai/logs/browser-results` and `.ai/logs/browser-report`.
CI retains the browser report for seven days. Open it with
`npx playwright show-report .ai/logs/browser-report`.

Use `npm run demo:record` to refresh the English GIF after visible changes.
See [the recording instructions](assets/README.md) for FFmpeg requirements and
[the validation record](docs/validation/execution-workspace.md) for test scope.

## Pull Request Process

1. Open a Pull Request against `main` with a clear description.
2. Link any relevant issues.
3. Ensure tests pass and documentation is updated.

## Releases

See **[the release guide](docs/operations/releasing.md)** for the full process (version bump,
changelog, tag, GitHub Release). This package is **not** published to npm.

## Code Style

- Follow existing patterns in the codebase.
- No em dashes in comments or documentation.

For major changes, open an issue first to discuss design and scope.

# conduit-bridge

- Current version: `0.9.1`
- Not published to npm. Releases are Git tags plus GitHub Releases; see `docs/RELEASING.md`.

## Code Style

- No em dashes (U+2014); use a regular hyphen. Enforced by `aahp check`
  (forbidden-patterns). This file existing is the likeliest reason conduit-vscode
  had zero violations while this repo had 51.
- Write the sibling repo's version v-prefixed (`conduit-vscode v0.10.1`), so a
  mention of the other project cannot be counted as this project's version by
  the version-sync gate.

## Before committing

- `npm run typecheck` plus the one test file covering the change. Do NOT run the
  full suite locally: this box measures roughly 2.8 tests per minute. Push and
  let Linux CI produce the verdict.
- `npx --no-install aahp manifest .` after any `.ai/handoff/` edit, or Layer 1
  fails on the checksums.
- `npx --no-install aahp check .` must be green. It runs in CI as of this change,
  so a violation now blocks the build instead of accumulating unseen.

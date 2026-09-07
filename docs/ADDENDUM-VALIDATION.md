# Addendum integration validation

Date: 2026-09-07. Branch: `feat/provider-agent-management`.

## Automated verification

- Windows: **510 passing tests in 62 files**, with a production build and strict
  TypeScript checking. The complete suite includes the prior 470 tests.
- New regression coverage checks atomic quota reservations and persistence,
  all three rolling windows, session ownership/history/expiry and native resume
  arguments, graph validation and concurrent dependency waves, policy denial,
  local-only fallback, streamed reasoning tags, code-search path validation,
  daily journal scope, notification consent, HTTP aliases and native lifecycle.
- The new HTTP tests verify that orchestration requests reach existing provider
  accounting and that unapproved/non-admin native operations are rejected.
- Hosted Windows/Ubuntu test/build and governance/scanner results are recorded
  with exact commit links in [PR #117](https://github.com/elvatis/conduit-bridge/pull/117).
  A successful Test workflow is not a substitute for other required PR checks.

The first hosted Windows run exposed result paths computed against an aliased
temporary directory. Code search now uses canonical workspace paths for both
absolute cwd conversion and result names. A real junction/symlink ancestor in
the regression fixture exercises this case without weakening file authorization.

## Real local service checks

Nine service scenarios passed on the Windows bridge at `127.0.0.1:31338`:

| Scenario | Evidence | Duration |
| --- | --- | ---: |
| Eleven executable tools | Real HTTP catalog includes all original and added tools | 5 ms |
| BitNet registration | Provider status identifies BitNet as local; it is currently offline | 260 ms |
| Code search | Real HTTP call used installed ripgrep and found a physical TypeScript fixture | 170 ms |
| Daily memory | Write/search recovered the scoped journal note | 29 ms |
| Local routing preview | Offline task remained assigned to BitNet without cloud execution | 9 ms |
| Claude CLI resume | Two exact `SESSION_TEST_7Q` replies; one native ID, request count 2 | 11.270 s |
| Codex CLI resume | Two exact replies; one native ID, request count 2 | 8.658 s |
| Gemini/agy resume | Two exact replies; one native ID, request count 2 | 12.032 s |
| Real dependency graph | Claude and Codex branches returned `PLAN_A` and `PLAN_B`; synthesis returned both | 15.910 s |

The first Codex run was blocked before inference because its new sandbox config
argument contained quotes forbidden by the Windows command guard. The correction
uses the supported unquoted `sandbox_mode=read-only` argument. A focused native
rerun passed, and provider regression tests now assert safe argv and retained
read-only configuration. The other eight passing service cases did not require
repeating their real model calls.

An additional auto-planning probe returned a valid heuristic plan. The Gemini
API is not authenticated, and the reachable LM Studio server reported **no
loaded models**. This verifies fallback to heuristic behavior; it does not claim
successful live Gemini API or local-LLM plan generation.

## Real tgrep checks

Seven native checks passed with the official portable **tgrep 1.0.4** binary:
index build, daemon start, TCP JSON-RPC search, force rebuild, daemon stop,
native CLI search and ripgrep fallback. Search results were checked against
physical files, including a file added after the initial index.

The original force-rebuild attempt incorrectly launched `tgrep index` while the
daemon owned its index lock. The corrected implementation uses the daemon's
documented `reload` method. All seven native cases passed after this correction.
The daemon was stopped at the end of the test.

Downloaded Windows x86_64 release archive SHA-256, verified against the GitHub
release asset digest:

```text
9b8d5488b1c342c10f222806de84a78049e8d8e8bdd35e34a0f872560c700b56
```

The binary was used in an ignored temporary tooling directory and is not bundled
or added as a package dependency. Upstream [release](https://github.com/microsoft/tgrep/releases/tag/v1.0.4)
and [protocol/CLI documentation](https://github.com/microsoft/tgrep).

## Reproduction and limits

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run scan:secrets
npx --no-install aahp check .
```

Native setup and API envelopes are documented in
[ADDENDUM-INTEGRATIONS.md](ADDENDUM-INTEGRATIONS.md). To reproduce the live tests,
use an isolated registered workspace, explicit retained conversations for native
resume, and an installed tgrep executable. The Windows integration harnesses
retain ignored local JSON evidence and use only synthetic test content.

- No BitNet binary/GGUF is installed here. BitNet HTTP/stream behavior and
  lifecycle are fixture-tested, including PID ownership, occupied ports and
  cancellation; actual BitNet CPU inference is not claimed.
- Gemini API and LM Studio model-assisted planning are fixture-tested. The local
  service lacks Gemini API authentication and an actively loaded local model.
- No external webhook notification was sent. Delivery uses mocked HTTPS tests;
  real completion notifications were log-only.
- Native session metadata contains hashes and IDs; the CLIs own their retained
  transcripts. Ephemeral platform conversations do not enable native resume.
- Daily JSONL journals are plaintext and redacted. They do not replace encrypted
  KV memory and do not become automatically approved conversation facts.
- tgrep searches regex/trigrams rather than semantic embeddings. Larger files,
  results and index builds remain bounded as described in the guide.
- Native subprocess execution is not OS confinement. External daemon work can
  outlive a cancelled request, and PID records do not authorize process adoption.
- No release, merge, version bump or package dependency change was performed.

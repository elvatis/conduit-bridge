# Provider and agent platform validation

Validation date: 2026-09-07. Branch: `feat/provider-agent-management`.
This supplements the earlier pipeline corrections in [PR117 validation](PR117-VALIDATION.md).

## Automated coverage

The final Windows full suite passed 379 tests across 35 files with the production
TypeScript check and both bundles passing. Coverage includes actual HTTP routing,
scoped operator tokens, credential rotation/revocation, session ownership,
stream cancellation, version conflicts, memory approval, immutable catalog pins,
profile isolation, bounded loops, restart interruption, artifact persistence,
encrypted snapshots, native SQLite and the injected Prisma adapter contract.

The Prisma test uses a structural client fixture. It does not establish that a
particular generated client, database engine or deployment has been tested.

Ubuntu WSL2 x86_64 with glibc 2.39 and verified official Node 24.20.0 passed
typecheck, the full suite (377 passed, one Windows-only DPAPI test skipped), and
both bundles before the final preset UI addition. Linux Secret Service was not
tested against a live daemon because `secret-tool` is absent in this image.
The final UI delta then passed all 18 selected Linux tests, bringing combined
coverage to 378 passed and one Windows-only skip out of 379 tests.
The explicit headless key path and unavailable-storage handling have automated
coverage. Live CLI calls below were performed on Windows.

## Four-provider live matrix

All 12 cases passed in the final run, beginning at 13:31:16 UTC. Each provider
used its installed CLI and existing login, with no fallback substitution.

| CLI and model | Shared conversation | Two-iteration loop | Write and peer verification |
| --- | --- | --- | --- |
| Claude 2.1.212 / `claude-sonnet-5` | PASS, 6.495 s | PASS, 9.107 s | PASS, 15.127 s |
| Codex 0.152.1 / `gpt-5.6-sol` | PASS, 4.970 s | PASS, 9.178 s | PASS, 30.231 s |
| agy 1.1.27 / `gemini-3.8-flash-low` | PASS, 5.794 s | PASS, 12.162 s | PASS, 16.772 s |
| Grok 1.0.13 / `grok-4.6` | PASS, 6.379 s | PASS, 14.407 s | PASS, 33.347 s |

One retained session moved across all four providers. Each recalled the synthetic
codeword `PINE42` from the canonical transcript. Every loop persisted exactly two
completed iterations, `NEEDS_REVIEW` followed by `MATRIX_DONE`, with downloadable
output artifacts. Every write case created the expected physical file in a fresh
workspace and its read-only peer confirmed the content.

The retained session is titled `Four-provider handoff ce0f4121`. Local evidence is
`.ai/logs/provider-matrix/conduit-matrix-X5ruko/provider-matrix-results.json`.
Earlier failed attempts were retained: they exposed a loop-step persistence bug
and the missing Codex Windows sandbox backend. Both were fixed before this full
rerun. The raw reports are ignored local evidence, not published transcripts.

## Browser inspection

The live dashboard showed all four installed CLI versions and encrypted file
storage as ready. A retained conversation with messages from all four providers
survived an actual service restart. Memory creation and approval succeeded in
the browser. The curated skills rendered with their pinned versions.
The final preset controls listed all five workflows; installing the documentation
verification preset with an available CLI model succeeded from the browser.
At viewport widths of 320 and 390 pixels, the document had no horizontal overflow.
The actual encrypted state file contained none of the synthetic conversation
codeword, memory text or loop-success marker when inspected as raw bytes.

## Execution and retention boundaries

Each live matrix run uses fresh scratch workspaces and synthetic prompts, with
small token, time, iteration and planning-cost limits. The write fixture checks
the physical `hello.txt` contents as well as the read-only peer response.
No model is silently substituted when a case fails.

The Windows Codex adapter isolates unrelated user configuration and explicitly
selects its unelevated Windows sandbox for workspace-write execution. Existing
CLI login state is preserved. No automatic approval bypass is enabled.

Protected storage uses a Windows DPAPI-wrapped key, Linux Secret Service, or an
explicit administrator-provided 32-byte key for headless use. Unavailable secure
storage fails closed. An encrypted backup needs the original key context.

The new platform retains explicitly selected chat and run content in encrypted
state. Legacy pipeline history still retains metadata summaries only; service
restart interrupts legacy running and approval-paused executions. The durable
platform queue also interrupts in-flight runs rather than automatically replaying
potential side effects. Queued work is reauthorized before execution.

Cost and token estimates remain planning values, not provider invoices.

## Reproduce the live matrix

Start the built bridge using the installed CLI authentication, then run:

```powershell
node scripts/provider-matrix.mjs --models cli-claude/claude-sonnet-5,cli-codex/gpt-5.6-sol,cli-gemini/gemini-3.8-flash-low,cli-grok/grok-4.6 --allow-agent-writes --workspace-parent .ai/logs/provider-matrix
```

Use currently advertised models from `/v1/platform/models`. The script creates
profiles, a retained conversation, run records and scratch workspaces. Its JSON
report remains under the ignored scratch directory; the dashboard retains the
corresponding conversation and run records for inspection.

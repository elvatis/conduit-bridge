# Tools, Projects and VS Code validation

Validated on 2026-09-07 on `feat/provider-agent-management`, after the platform
foundation at `96fd849`. See [Tools and Projects](TOOLS-AND-PROJECTS.md) and the
[VS Code protocol](vscode-bridge.md) for usage.

## Automated verification

- Windows: **470 tests passed in 48 files**, TypeScript checking and both bundles passed.
- Ubuntu WSL2 x86_64, Node 24.20.0: **469 passed, one skipped in 48 files**;
  TypeScript checking and both bundles passed.
- The skipped Linux test exercises real Windows current-user DPAPI and is
  explicitly Windows-only. Live Linux Secret Service remains a separate
  untested environment dependency; `secret-tool` is absent in this WSL image.
- Repository credential scan passed with tracked and untracked source included.

The first hosted Windows run found a fixture assumption: the runner's temporary
directory used a Windows short path while the child reported its canonical long
path. The assertion now compares against the canonical directory, preserving the
check that execution used the selected workspace. No runtime behavior changed.
The real Windows DPAPI integration test also has its own 40-second allowance for
two subprocess calls that each have a 15-second production limit. This avoids
mistaking a slow hosted process startup for a failed cryptographic round trip.

Coverage includes strict argument validation, executable registry authorization,
workspace traversal/junction/hardlink refusal, opened-file identity checks,
overwrite consent, bounded real subprocess execution and termination, credential
environment isolation, public-network destination and redirect checks, encrypted
scoped KV memory and revision conflicts, fixed-origin GitHub requests, GraphQL
variables, pagination, field mutation types and authenticated HTTP integration.

VS Code checks include real TCP/WebSocket upgrade and platform dispatch as well
as masked frame parsing, fragmentation, ping/close handling, message bounds,
revocation, cancellation, stream responses and existing platform authorization.
The Linux suite exercises real Linux processes and sockets, not Windows shims.

## Live service smoke checks

The existing scheduled service was rebuilt and restarted on
`127.0.0.1:31338`. Ten checks passed between 14:48:00 and 14:48:29 UTC.

| Check | Result | Elapsed |
| --- | --- | --- |
| Discover all six executable tools | PASS | 0.004 s |
| Write/read `hello-tools.txt`, verify physical content | PASS | 0.037 s |
| Scoped KV memory set/get/delete | PASS | 0.052 s |
| Native bounded subprocess returns `PROCESS_OK` | PASS | 0.079 s |
| Public fetch retrieves Example Domain text | PASS | 0.062 s |
| Real Perplexity Sonar search | PASS | 4.862 s |
| `/vscode` handshake and usage query | PASS | 0.009 s |
| Streaming chat through Claude Sonnet 5 | PASS, `WS_BRIDGE_OK` | 4.085 s |
| Inline edit proposal through Codex GPT-5.6 Sol | PASS, replacement constant; no file application | 5.359 s |
| Agent start, approval, Codex file write and physical verification | PASS, `VS_CODE_AGENT_OK` | 13.718 s |

The final agent run is `run-1e4dc222-9741-43d6-87db-e270e36ac740` in the dashboard.
It was observed waiting for approval before execution. The temporary workspace
and synthetic evidence were retained locally as `conduit-integration-smoke-sLAaOz`;
they are not committed or published as user transcripts.

The Perplexity request used its existing configured API credential. CLI requests
used normal installed Claude/Codex authentication. No fallback model substitution
was used and the tests had small output/time/cost limits.

## Browser inspection

Settings help appeared when its keyboard-focusable indicator received focus and
closed on Escape. Existing secret fields remained write-only. The completed
VS Code agent run appeared in Runs & artifacts. Registry coverage comprises
80 semantic help entries mapped to 91 static controls and 11 dynamic selectors.

## Limits of this evidence

GitHub Projects and workflow mutation responses were validated with mocked
transports and actual authenticated local HTTP routes. No real remote project or
workflow was modified for these tests. The live Projects endpoint returned the
expected `503` stating that `GITHUB_TOKEN` is not configured. A suitable service
token and a designated test project are needed for live remote integration checks.

The command tool is a bounded separate process, not an OS isolation boundary.
The page tool does not render JavaScript. Filesystem overwrite uses a verified
file handle and is not an atomic replacement or a backup mechanism. The sibling
VS Code extension still needs the documented client implementation.

No package dependencies, public ports, database selection, version bump, merge
or release were introduced by this extension pass.

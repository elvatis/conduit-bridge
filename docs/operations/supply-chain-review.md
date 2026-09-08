# Supply chain review: PR #120

Reviewed on 2026-09-08 against the
[scanner report](https://github.com/elvatis/conduit-bridge/pull/120#issuecomment-5577905891)
and the pinned supply-chain-guard 6.0.15 implementation.

## Local UI import

`MINI_SHAI_HULUD_LOADER` matched the filename in the static dashboard import
of [the execution view](../../src/ui/execution.ts). The tracked TypeScript
module renders the task interface and uses the dashboard's existing request
helper. It does not download a runtime or payload, read credentials or run an
installation script. The package has no preinstall or postinstall hook.

The import has one documented `scg-ignore-next-line` exception for this rule.
It covers only the immediately following import. Other rules and other
occurrences of the loader indicator remain active; the module was neither
renamed nor excluded from scanning.

## Release credentials

`GHA_OIDC_WRITE_PERM` correctly identified an unnecessarily broad permission
boundary: dependency installation, tests and the build shared a job with OIDC
and attestation write permissions.

The [release workflow](../../.github/workflows/release.yml) now separates:

| Job | Permissions | Work |
| --- | --- | --- |
| build | contents read | Validate the tag, install, test, build and upload the subject and notes |
| attest | contents read, OIDC and attestations write | Download the subject from this workflow run and attest it |
| publish | contents write | Publish release notes after both previous jobs succeed |

The attestation job has no checkout, shell step, dependency installation,
cache restore or execution of the downloaded subject. Its two GitHub actions
are pinned to verified upstream commit SHAs; the provenance action's nested
action is also SHA-pinned. Downloads stay within this workflow run. Checkout
does not persist credentials, and publishing cannot proceed if attestation
fails. Dry runs still run the gates and attestation without publishing a
release.

The required OIDC permission has a single inline exception with that review
reason. Removing the permission would break provenance signing. This is a
reviewed permission requirement, not a claim that OIDC has no residual risk.
Reassess the exception before adding any step to the attestation job.

Daily Dependabot updates include the scanner again, replacing the obsolete
ignore for its former moving tag. Review and merge those update PRs to keep
the pinned detection feed current.

The separation and SHA pins follow GitHub's
[secure use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
The provenance action documents its required permissions in its
[versioned README](https://github.com/actions/attest-build-provenance/blob/v4.1.1/README.md).
Inline exceptions follow the scanner's
[policy documentation](https://github.com/homeofe/supply-chain-guard/blob/0dedc46c8f1e2828918823a813bf91d7909d6943/README.md#policy-configuration-v44).

## Verification

The local 6.0.15 scan with the action's minimum severity (`low`) reports zero
findings, score 0, full coverage and exactly two suppressed occurrences.
Removing just the two inline comments in an isolated copy restores exactly
the original high and medium findings. At `info` severity, three additional
informational notes remain about transitive dependencies, the pinned scanner
publisher and provenance maturity. actionlint 1.7.12 passes the workflow.

Run the pinned scanner against a clean checkout and inspect its JSON report,
including the suppression count. Two reviewed inline exceptions are
intentional. No rule is disabled globally and no file is excluded.
Lint the release workflow with actionlint. Actual GitHub OIDC signing requires
a separately authorized release workflow run; this repair does not publish a
release.

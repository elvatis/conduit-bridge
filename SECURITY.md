# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in this project, please report it responsibly:

1. **Do not open a public issue.** Instead, send an email to **security@elvatis.com** with:
   - A clear description of the vulnerability
   - Steps to reproduce
   - Expected and actual behavior
   - Any PoC code or attachments (zip) if safe to share

2. We will acknowledge receipt within **48 hours** and provide a timeline for fixes.

3. Do not publicly disclose the issue until we have had a reasonable time to address it.

We appreciate responsible disclosure.


## Supported Versions

Only the latest release is supported. This project is not published to npm;
releases are Git tags with a matching GitHub Release, so "latest" means the
highest version tag on `main`.

| Version | Supported |
| --- | --- |
| 0.9.x | yes |
| older | no |

Report against the latest release. A fix ships in the next release rather
than as a patch to an older tag.

## Handling API Keys

This is a **public** repository and the bridge talks to several paid AI APIs, so a
single committed key is a live credential leak.

- Keep provider keys in a local `.env`, in `~/.conduit/.env`, or in real environment
  variables. `.gitignore` blocks `.env` and `.env.*` (with `.env.example` as the one
  allowed exception), plus other credential artifacts such as `*.pem` and `*.key`.
- `.env.example` documents the supported variables and must contain **placeholders
  only**, never a working key.
- Never paste a key into a README, an issue, a test fixture or a config file.
- `npm run scan:secrets` scans the tracked tree for credential-shaped strings, and
  `npm run scan:secrets:history` also scans every blob in git history. The same
  scanner runs in CI (`.github/workflows/secret-scan.yml`) on every push and pull
  request, so a leak fails the build instead of shipping.

If a key does reach a public commit, treat it as compromised: **rotate it at the
provider first**, then clean up the repository. Rotation is the fix; deleting the
commit is not, because the value is already public.

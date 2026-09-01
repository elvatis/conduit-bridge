# Engineering conventions

- TypeScript strict mode and ESM
- Node.js 24 or newer
- Windows Desktop and Linux Desktop are the supported platforms
- One loopback listener: `127.0.0.1:31338`
- Runtime and configuration data below `.conduit`
- Provider IDs use transport-first model namespaces and canonical registry IDs
- API keys come only from Bridge config or documented environment variables
- CLI providers use their own installed tools and authentication
- Never log or commit credentials, tokens, prompts, or responses
- Reproduce defects before applying targeted changes
- Validate with tests, typecheck, build, diff check, secret scans, and audit

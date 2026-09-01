# Workflow

Based on the [AAHP Protocol](https://github.com/homeofe/AAHP).

## Phases

1. Read `NEXT_ACTIONS.md`, `STATUS.md`, and relevant source files.
2. Reproduce the issue and record evidence without secrets.
3. Make the smallest coherent source, test, dashboard, and documentation change.
4. Run tests, typecheck, build, diff check, secret scans, and audit.
5. Update handoff files and generated metadata.
6. Commit and push only after validation.

## Provider rules

- API, CLI, and local transports remain independent.
- Provider IDs and model namespaces must remain consistent.
- Do not infer API credentials from CLI login files.
- Do not log credentials, tokens, prompts, or responses.
- Test adapters without real provider requests unless a user explicitly asks.

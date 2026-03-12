# WORKFLOW.md — conduit-bridge

> Based on the [AAHP Protocol](https://github.com/homeofe/AAHP).

## Agent Roles

| Agent | Model | Role |
|---|---|---|
| 🔭 Researcher | perplexity/sonar-pro | Playwright API research, browser fingerprinting, network intercept patterns |
| 🏛️ Architect | claude-opus | Provider adapter design, API surface decisions |
| ⚙️ Implementer | claude-sonnet | Code, tests, refactoring, commits |
| 💬 Reviewer | gpt-5 / second model | Security review, edge cases, cross-platform checks |

## Pipeline

### Phase 1: Research
```
Reads:   NEXT_ACTIONS.md (top unblocked task)
         STATUS.md (current state)
Does:    Research Playwright APIs, provider UI selectors, network intercept patterns
Writes:  LOG.md — findings + recommendation
```

### Phase 2: Architecture
```
Reads:   LOG.md research, STATUS.md, relevant src/ files
Does:    Decide implementation approach, define interfaces
Writes:  LOG.md — ADR
```

### Phase 3: Implementation
```
Reads:   LOG.md ADR, CONVENTIONS.md
Does:    Code changes, npm run build, npm test
Writes:  src/ changes, LOG.md implementation notes
```

### Phase 4: Handoff
```
Updates: STATUS.md (version, build status, known issues)
         NEXT_ACTIONS.md (mark done, add new tasks)
         DASHBOARD.md (quick state)
         MANIFEST.json (checksums, quick_context)
         LOG.md (session summary)
Commits: git add -u && git commit && git tag && git push
```

## Key Rules
- Never skip the handoff phase
- `gh release create` is mandatory — git tags alone don't create GitHub Releases
- Sequential browser spawning only — never parallel Playwright contexts
- All provider adapters extend BaseProvider — never duplicate session logic
- Tests must pass before any npm publish

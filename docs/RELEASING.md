# Releasing conduit-bridge

This document is the release process for humans and agents. Follow it whenever
shipping a version from this repo.

conduit-bridge is **not published to npm**. Releases are Git tags + GitHub
Releases (and running from source). Issue T-006 / npm publish is permanently
won't-do unless Emre revives it with a real registry plan.

## Preconditions

1. Working tree is clean on an up-to-date `main` (or a release PR about to merge).
2. One writer only for this repo (estate rule).
3. CI is green on the commit you will tag (AAHP Verify, Secret Scan, Supply Chain
   Guard, CodeQL).
4. You have write access for tags and GitHub Releases.

## Versioning

- **Semver** in `package.json` `version`.
- **Patch** (`0.5.x`): bugfixes, docs-only, dependency patches that do not change
  the public surface.
- **Minor** (`0.x.0`): new providers, models, request fields, backward-compatible
  features.
- **Major** (`x.0.0`): breaking API or engines floor changes that drop support.

Bump these together:

| File | What to update |
|---|---|
| `package.json` | `"version"` |
| `README.md` | `**Current version:**` header |
| `CHANGELOG.md` | new `## [X.Y.Z] - YYYY-MM-DD` section |
| `README.md` Changelog | same notes under `### X.Y.Z` |
| `.ai/handoff/STATUS.md` | short release note (prepend) |
| `.ai/handoff/MANIFEST.json` | regenerate with `npx aahp manifest .` |

## Checklist (do in order)

### 1. Finish the work

- Implementation and tests are on a branch or already on `main`.
- `npm run typecheck` and `npm test` green locally (or on openclaw/Linux CI).
- Do **not** run the full suite on this Windows box for hours - targeted tests
  plus GitHub Actions is enough (estate rule).

### 2. Documentation pass

- [ ] README model tables match `src/providers/*` catalogs
- [ ] README documents new request fields (e.g. `effort`)
- [ ] SECURITY.md still accurate if auth/CORS/secrets changed
- [ ] `docs/RELEASING.md` still accurate if process changed
- [ ] No em dashes (U+2014) in docs/comments (`aahp.config.json` ban)

### 3. Changelog

Write a Keep a Changelog style section for the new version in:

1. `CHANGELOG.md` (canonical)
2. README `## Changelog` (user-facing mirror)

Include every user-visible change since the previous tag. Prefer:

- Added / Changed / Fixed / Security headings
- Provider and model names with code spans
- PR numbers where useful (`#89`)

### 4. Version bump commit

```bash
# on main or release branch
# edit package.json, README, CHANGELOG, STATUS
npx --no-install aahp manifest . --agent <name> --phase documentation \
  --context "Release vX.Y.Z"
npx --no-install aahp verify . --level ci
git add package.json README.md CHANGELOG.md docs/ .ai/handoff/
git commit -m "chore(release): vX.Y.Z"
git push
```

Wait for CI on that commit to go green before tagging.

### 5. Tag and GitHub Release

```bash
git fetch origin main
git checkout main
git pull origin main
# Confirm package.json version
node -p "require('./package.json').version"

git tag -a "vX.Y.Z" -m "vX.Y.Z"
git push origin "vX.Y.Z"

gh release create "vX.Y.Z" \
  --title "vX.Y.Z" \
  --notes-file - <<'EOF'
## Highlights
- (bullet list from CHANGELOG)

## Full notes
See CHANGELOG.md and README Changelog for vX.Y.Z.
EOF
```

On Windows PowerShell, prefer:

```powershell
gh release create "vX.Y.Z" --title "vX.Y.Z" --notes-file CHANGELOG.md
# or craft a short notes file first
```

### 6. Post-release

- [ ] Confirm https://github.com/elvatis/conduit-bridge/releases shows the tag
- [ ] Confirm no open release PR left hanging
- [ ] Prepend STATUS handoff note that the release cut completed
- [ ] Delete local topic branches that only existed for the release PR

## What not to do

- Do **not** publish to npm (`npm publish` is out of scope).
- Do **not** force-push tags that already exist on the remote.
- Do **not** merge release PRs back-to-back without letting CI settle
  (estate: cancelled CI confuses deploy gates).
- Do **not** claim "tests passed" without command output evidence.

## Quick agent template

```
Goal: cut conduit-bridge vX.Y.Z
1. Audit unreleased commits since last tag
2. Implement any missing docs/changelog
3. Bump version sites; aahp manifest + verify
4. PR or commit on main; wait CI green
5. Annotated tag vX.Y.Z + gh release create
6. STATUS note; stop
```

## Related

- Security: `SECURITY.md`
- Contributing: `CONTRIBUTING.md`
- Handoff: `.ai/handoff/STATUS.md`

#!/usr/bin/env bash
# lint-handoff.sh -Validate AAHP handoff files for safety violations
#
# Usage: ./scripts/lint-handoff.sh [path-to-project]
#        Defaults to current directory if no path given.
#
# Checks:
#   1. Prompt injection patterns
#   2. Secrets & API keys
#   3. PII patterns (emails)
#   4. MANIFEST.json schema (basic)
#   5. HANDOFF.lock stale check
#   6. Parallel agent detection (advisory)
#
# Exit codes:
#   0 = all checks passed
#   1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_aahp-lib.sh
source "$SCRIPT_DIR/_aahp-lib.sh"

PROJECT_ROOT="${1:-.}"
PYTHON_CMD="$(aahp_python_cmd)"

# Path-format-agnostic file access (cross-platform fix).
# Windows-native Python/Node cannot open an absolute MSYS path like
# /c/Users/...; open() raises FileNotFoundError, which the 2>/dev/null below
# silently turns into a bogus "Invalid JSON". Resolving by changing into the
# project root once and then using RELATIVE paths sidesteps the issue: every
# tool opens '.ai/handoff/...' relative to the cwd, which works identically on
# Windows git-bash and Linux CI. cd failure is fatal (clear error).
cd "$PROJECT_ROOT" || { echo "Error: cannot cd into project root: $PROJECT_ROOT" >&2; exit 1; }
PROJECT_ROOT="."
HANDOFF_DIR=".ai/handoff"
VIOLATIONS=0

# Resolve validate-pii-allowlist.py as a path RELATIVE to the (post-cd) cwd, so
# native-Windows python is handed a relative path rather than an absolute MSYS
# one. An absolute /c/Users/... path intermittently fails MSYS->Windows argv
# conversion and surfaces as a mangled "C:\c\Users\...: can't open file"
# artifact (a false Check-3 failure). realpath --relative-to is coreutils
# (present on git-bash and Linux CI); where it is unavailable (e.g. BSD realpath
# on macOS) we keep the absolute path, which opens fine there.
PII_VALIDATOR="$SCRIPT_DIR/validate-pii-allowlist.py"
if PII_VALIDATOR_REL="$(realpath --relative-to="$PWD" "$SCRIPT_DIR/validate-pii-allowlist.py" 2>/dev/null)"; then
    PII_VALIDATOR="$PII_VALIDATOR_REL"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "========================================="
echo "  AAHP Handoff Lint"
echo "========================================="
echo ""

if [ ! -d "$HANDOFF_DIR" ]; then
    echo -e "${RED}Error: $HANDOFF_DIR not found.${NC}"
    exit 1
fi

# ─── Check 1: Prompt Injection Patterns ──────────────────────

echo -e "${GREEN}[1/6]${NC} Checking for prompt injection patterns..."

INJECTION_PATTERNS=(
    "ignore all previous"
    "ignore prior"
    "disregard.*instructions"
    "you are now"
    "new system prompt"
    "override.*safety"
    "act as.*unrestricted"
    "jailbreak"
    "ADMIN_OVERRIDE"
    "sudo mode"
)

for pattern in "${INJECTION_PATTERNS[@]}"; do
    MATCHES=$(grep -rnil "$pattern" "$HANDOFF_DIR"/*.md 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
        echo -e "  ${RED}✗ Injection pattern '$pattern' found in:${NC}"
        echo "    $MATCHES"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done

if [ "$VIOLATIONS" -eq 0 ]; then
    echo -e "  ${GREEN}✓ No injection patterns found.${NC}"
fi

# ─── Check 2: Secrets & API Keys ─────────────────────────────

echo -e "${GREEN}[2/6]${NC} Checking for secrets and API keys..."

# Prefix patterns carry a length floor (\{16,\}) so they only match a
# realistic key-length run, not a "sk-"/"AKIA" prefix glued to one or two
# ordinary characters (e.g. the "sk-to" inside "task-to-model"). Real keys
# are far longer than 16 chars. Note: grep below runs in BRE mode, so the
# interval must be escaped as \{16,\}.
SECRET_PATTERNS=(
    "sk-[a-zA-Z0-9]\{16,\}"
    "ghp_[a-zA-Z0-9]\{16,\}"
    "gho_[a-zA-Z0-9]\{16,\}"
    "glpat-"
    "xoxb-"
    "xoxp-"
    "AKIA[A-Z0-9]\{16,\}"
    "Bearer [a-zA-Z0-9]"
    "-----BEGIN.*PRIVATE KEY"
    "_KEY=['\"]?[a-zA-Z0-9]"
    "_SECRET=['\"]?[a-zA-Z0-9]"
    "_TOKEN=['\"]?[a-zA-Z0-9]"
    "_PASSWORD=['\"]?[a-zA-Z0-9]"
)

SECRET_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
    MATCHES=$(grep -rnl "$pattern" "$HANDOFF_DIR" 2>/dev/null | grep -v '.aiignore' || true)
    if [ -n "$MATCHES" ]; then
        echo -e "  ${RED}✗ Possible secret pattern '$pattern' found in:${NC}"
        echo "    $MATCHES"
        SECRET_FOUND=$((SECRET_FOUND + 1))
    fi
done

if [ "$SECRET_FOUND" -eq 0 ]; then
    echo -e "  ${GREEN}✓ No secrets detected.${NC}"
else
    VIOLATIONS=$((VIOLATIONS + SECRET_FOUND))
fi

# --- Check 3: PII Patterns and Reviewed Allowlist ----------------

echo -e "${GREEN}[3/6]${NC} Checking for PII..."

ALLOWLIST_FILE="$HANDOFF_DIR/pii-allowlist.json"
ALLOWLIST_ENTRIES=""
if [ -f "$ALLOWLIST_FILE" ]; then
    if [ -z "$PYTHON_CMD" ]; then
        echo -e "  ${RED}x PII allowlist exists but Python is unavailable for validation.${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        ALLOWLIST_ERR="$(mktemp)"
        if ALLOWLIST_ENTRIES=$("$PYTHON_CMD" "$PII_VALIDATOR" "$ALLOWLIST_FILE" --format tsv 2>"$ALLOWLIST_ERR"); then
            echo -e "  ${GREEN}OK Valid PII allowlist.${NC}"
        else
            ALLOWLIST_MESSAGE="$ALLOWLIST_ENTRIES"
            if [ -s "$ALLOWLIST_ERR" ]; then
                ALLOWLIST_MESSAGE="${ALLOWLIST_MESSAGE}${ALLOWLIST_MESSAGE:+$'\n'}$(cat "$ALLOWLIST_ERR")"
            fi
            echo -e "  ${RED}x $ALLOWLIST_MESSAGE${NC}"
            ALLOWLIST_ENTRIES=""
            VIOLATIONS=$((VIOLATIONS + 1))
        fi
        rm -f "$ALLOWLIST_ERR"
    fi
else
    echo -e "  ${GREEN}OK No PII allowlist configured.${NC}"
fi

if [ -f "$ALLOWLIST_FILE" ] && [ -f "$HANDOFF_DIR/MANIFEST.json" ]; then
    if [ -z "$PYTHON_CMD" ] || ! EXPECTED_CHECKSUM=$("$PYTHON_CMD" - "$HANDOFF_DIR/MANIFEST.json" <<'PY'
import json, sys
entry = json.load(open(sys.argv[1], encoding="utf-8")).get("files", {}).get("pii-allowlist.json")
if not isinstance(entry, dict) or not isinstance(entry.get("checksum"), str):
    raise SystemExit(1)
print(entry["checksum"])
PY
); then
        echo -e "  ${RED}x pii-allowlist.json is not indexed by MANIFEST.json. Run /handoff.${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    elif [ "$EXPECTED_CHECKSUM" != "$(aahp_checksum "$ALLOWLIST_FILE")" ]; then
        echo -e "  ${RED}x pii-allowlist.json checksum does not match MANIFEST.json. Run /handoff.${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
fi

# Locale-robustness (T-027): use grep -E (POSIX ERE), never grep -P (PCRE). GNU
# grep -P aborts under a non-UTF-8 locale ("supports only unibyte and UTF-8
# locales") and the pipeline then finds nothing, a silent FALSE PASS that made
# the gate non-deterministic by locale. LC_ALL=C.UTF-8 pins byte-for-byte
# identical detection across Windows git-bash, the commit hook, and Linux CI.
# Per-MATCH filtering (T-029): grep -o extracts each address, awk excludes per
# ADDRESS (not per line), so an excluded token (noreply / example.com /
# placeholder) elsewhere on the same line can no longer mask a real address.
EMAIL_MATCHES=$(LC_ALL=C.UTF-8 grep -rHnoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' "$HANDOFF_DIR"/*.md 2>/dev/null | awk -F: '{ addr=$NF; if (addr ~ /\.noreply\./ || addr ~ /^no-?reply@/ || index(addr,"example.com") || index(addr,"placeholder")) next; print }' || true)
UNAPPROVED=""
if [ -n "$EMAIL_MATCHES" ]; then
    while IFS= read -r match; do
        address="${match##*:}"
        allowed=0
        while IFS=$'\t' read -r value owner expires _; do
            [ -z "$value" ] && continue
            if [ "$address" = "$value" ]; then
                echo -e "  ${GREEN}OK Allowed PII email '$address' via pii-allowlist.json (owner: $owner, expires: $expires).${NC}"
                allowed=1
                break
            fi
        done <<< "$ALLOWLIST_ENTRIES"
        [ "$allowed" -eq 1 ] || UNAPPROVED="${UNAPPROVED}${UNAPPROVED:+$'\n'}$match"
    done <<< "$EMAIL_MATCHES"
fi
if [ -n "$UNAPPROVED" ]; then
    echo -e "  ${YELLOW}Possible email addresses found:${NC}"
    echo "    $UNAPPROVED"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "  ${GREEN}OK No unapproved PII detected.${NC}"
fi

# ─── Check 4: MANIFEST.json Basic Validation ─────────────────

echo -e "${GREEN}[4/6]${NC} Validating MANIFEST.json..."

# Python command was detected before the PII allowlist check.

if [ -f "$HANDOFF_DIR/MANIFEST.json" ]; then
    if [ -z "$PYTHON_CMD" ]; then
        echo -e "  ${YELLOW}⚠ Python not found. Skipping MANIFEST.json validation.${NC}"
    elif "$PYTHON_CMD" -c "import json; json.load(open('$HANDOFF_DIR/MANIFEST.json'))" 2>/dev/null; then
        echo -e "  ${GREEN}✓ Valid JSON.${NC}"

        # Check required fields
        REQUIRED_FIELDS=("aahp_version" "project" "last_session" "files" "quick_context")
        for field in "${REQUIRED_FIELDS[@]}"; do
            if ! "$PYTHON_CMD" -c "import json; d=json.load(open('$HANDOFF_DIR/MANIFEST.json')); assert '$field' in d" 2>/dev/null; then
                echo -e "  ${RED}✗ Missing required field: $field${NC}"
                VIOLATIONS=$((VIOLATIONS + 1))
            fi
        done

        # Verify checksums
        echo "  Verifying checksums..."
        "$PYTHON_CMD" -c "
import json, hashlib, os, sys
sys.stdout.reconfigure(errors='replace')
manifest = json.load(open('$HANDOFF_DIR/MANIFEST.json'))
for fname, meta in manifest.get('files', {}).items():
    fpath = os.path.join('$HANDOFF_DIR', fname)
    if os.path.exists(fpath):
        actual = 'sha256:' + hashlib.sha256(open(fpath, 'rb').read().replace(b'\r', b'')).hexdigest()
        expected = meta.get('checksum', '')
        if actual != expected:
            print(f'  ! Checksum mismatch: {fname}')
            print(f'    Expected: {expected}')
            print(f'    Actual:   {actual}')
        else:
            print(f'  OK: {fname}')
    else:
        print(f'  ! {fname}: file not found')
" 2>/dev/null || echo -e "  ${YELLOW}⚠ Could not verify checksums (Python error)${NC}"

    else
        echo -e "  ${RED}✗ Invalid JSON.${NC}"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
else
    echo -e "  ${YELLOW}⚠ MANIFEST.json not found (v1 project?).${NC}"
fi

# ─── Check 5: Stale HANDOFF.lock ─────────────────────────────

echo -e "${GREEN}[5/6]${NC} Checking for stale HANDOFF.lock..."

if [ -f "$HANDOFF_DIR/HANDOFF.lock" ]; then
    echo -e "  ${RED}✗ HANDOFF.lock exists! Previous session may not have completed cleanly.${NC}"
    echo "    Review the lock file and delete it if the session is no longer active."
    cat "$HANDOFF_DIR/HANDOFF.lock" 2>/dev/null
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo -e "  ${GREEN}✓ No stale lock.${NC}"
fi

# ─── Check 6: Parallel Agent Detection ────────────────────────

echo -e "${GREEN}[6/6]${NC} Checking for parallel agent sessions..."

if command -v git &>/dev/null && git -C "$PROJECT_ROOT" rev-parse --git-dir &>/dev/null 2>&1; then
    LOCK_BRANCHES=()
    while IFS= read -r branch; do
        if git -C "$PROJECT_ROOT" show "$branch:.ai/handoff/HANDOFF.lock" &>/dev/null 2>&1; then
            LOCK_BRANCHES+=("$branch")
        fi
    done < <(git -C "$PROJECT_ROOT" for-each-ref --format='%(refname:short)' refs/heads/)

    if [ ${#LOCK_BRANCHES[@]} -gt 1 ]; then
        echo -e "  ${YELLOW}⚠ HANDOFF.lock found on multiple branches:${NC}"
        for b in "${LOCK_BRANCHES[@]}"; do
            echo "    - $b"
        done
        echo "  AAHP is designed for sequential handoff. Ensure agents are working in isolated branches."
    elif [ ${#LOCK_BRANCHES[@]} -eq 1 ]; then
        echo -e "  ${YELLOW}⚠ Active session on branch: ${LOCK_BRANCHES[0]}${NC}"
    else
        echo -e "  ${GREEN}✓ No active sessions detected across branches.${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Not a git repo. Skipping parallel agent check.${NC}"
fi

# ─── Summary ──────────────────────────────────────────────────

echo ""
echo "========================================="
if [ "$VIOLATIONS" -eq 0 ]; then
    echo -e "  ${GREEN}All checks passed. ✓${NC}"
    echo "========================================="
    exit 0
else
    echo -e "  ${RED}$VIOLATIONS violation(s) found.${NC}"
    echo "========================================="
    exit 1
fi

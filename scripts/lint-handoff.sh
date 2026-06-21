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

PROJECT_ROOT="${1:-.}"

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

# ─── Check 3: PII Patterns ───────────────────────────────────

echo -e "${GREEN}[3/6]${NC} Checking for PII..."

PII_FOUND=0
# Email check (excluding template/example patterns).
#
# Locale-robustness (T-027): the previous implementation used `grep -rnP` (PCRE).
# On Windows git-bash under an empty or non-UTF-8 locale, GNU grep -P aborts with
# "grep: -P supports only unibyte and UTF-8 locales" and the pipeline then finds
# nothing -a silent FALSE PASS. Under the UTF-8 locale that `git commit` sets it
# works and fires, so the gate was non-deterministic by locale (interactive
# baseline passed, the commit hook blocked). The pattern is already POSIX-ERE
# compatible, so we use `grep -E` (ERE has no PCRE locale fail-open) and pin
# LC_ALL=C.UTF-8 for byte-for-byte identical behaviour on Windows git-bash, the
# git commit hook, and Linux CI.
#
# Exclusions (intentionally narrow -PII stays a HARD-FAIL for genuine external
# emails):
#   - example.com / placeholder / *@* template forms
#   - users.noreply.github.com (GitHub co-author trailers, e.g. Copilot)
#   - any address whose domain contains ".noreply." (general no-reply form)
# No real human/customer addresses are whitelisted, and no allowlist file is read.
#
# Per-MATCH filtering (T-029): extract each address with grep -o, then exclude per
# ADDRESS in awk. A line-level grep -v previously dropped the whole matched line, so
# a genuine external email sharing a line with an excluded token (a noreply trailer,
# example.com, or the word placeholder) was silently suppressed, a real PII false
# negative. Filtering each extracted address means an excluded token elsewhere on
# the same line can no longer mask a separate real address. grep -E (not -P) and the
# pinned LC_ALL keep detection byte-for-byte identical across locales.
EMAIL_MATCHES=$(LC_ALL=C.UTF-8 grep -rHnoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' "$HANDOFF_DIR"/*.md 2>/dev/null \
    | awk -F: '
        {
            addr = $NF                            # grep -Hno => file:line:address; an address has no colon
            if (addr ~ /\.noreply\./)       next  # GitHub co-author + any no-reply trailers
            if (addr ~ /^no-?reply@/)       next  # noreply@ / no-reply@ local-part trailers
            if (index(addr, "example.com")) next  # template/example domain
            if (index(addr, "placeholder")) next  # template placeholder address
            print
        }' \
    || true)

if [ -n "$EMAIL_MATCHES" ]; then
    echo -e "  ${YELLOW}⚠ Possible email addresses found:${NC}"
    echo "    $EMAIL_MATCHES"
    PII_FOUND=$((PII_FOUND + 1))
fi

if [ "$PII_FOUND" -eq 0 ]; then
    echo -e "  ${GREEN}✓ No PII detected.${NC}"
else
    VIOLATIONS=$((VIOLATIONS + PII_FOUND))
fi

# ─── Check 4: MANIFEST.json Basic Validation ─────────────────

echo -e "${GREEN}[4/6]${NC} Validating MANIFEST.json..."

# Detect Python command (python3 on Linux/macOS, python on Windows)
# Note: Windows has a python3 Store alias that passes `command -v` but doesn't work,
# so we verify with an actual invocation.
PYTHON_CMD=""
if python3 -c "pass" &>/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif python -c "pass" &>/dev/null 2>&1; then
    PYTHON_CMD="python"
fi

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

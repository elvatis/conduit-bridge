#!/usr/bin/env bash
# verify-handoff.sh - The single canonical AAHP handoff gate ("aahp verify")
#
# Runs up to 4 layers that together stop staled handoff state from being
# committed or pushed:
#   1. MANIFEST checksum integrity (reuses lint-handoff.sh)
#   2. Content-drift gate (THE key check): if a commit/push changes any source
#      file OUTSIDE .ai/handoff/, it MUST also include STATUS.md AND a
#      regenerated MANIFEST.json. Otherwise FAIL.
#   3. Commit-pointer freshness (MANIFEST.last_session.commit vs HEAD)
#   4. TRUST-TTL expiry (expired "verified" rows in TRUST.md)
#
# This gate is VERIFY-ONLY. It never regenerates MANIFEST.json itself; that
# stays a separate /handoff step. The gate only reports drift and tells the
# agent to run /handoff.
#
# Usage: ./scripts/verify-handoff.sh [path-to-project] [options]
#        Defaults to current directory if no path given.
#
# Options:
#   --level LEVEL   Which layers to run (default: full):
#                     precommit - fast: checksum + drift gate (layers 1-2)
#                     prepush   - full verify + TTL (layers 1-4)
#                     full      - all layers (alias for prepush)
#                     ci        - all layers, no escape hatch honoured
#   --quiet         Suppress per-check OK output, keep failures
#   --help, -h      Show this help
#
# Escape hatch:
#   AAHP_SKIP_VERIFY=1   Skip local verification. This is caught by the
#                        required CI check (aahp verify --level ci); do NOT
#                        use it to bypass CI. Ignored when --level ci.
#
# Exit codes:
#   0 = all selected layers passed (or skipped via escape hatch)
#   1 = at least one layer failed
#
# Defaults (documented):
#   - The drift gate HARD-FAILS (exit 1), it does not warn.
#   - Commit-pointer freshness is advisory at precommit, hard at prepush/ci.
#   - TRUST-TTL expiry is advisory (warn) by default; it never blocks a commit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_aahp-lib.sh
source "$SCRIPT_DIR/_aahp-lib.sh"

# --- Defaults --------------------------------------------------

LEVEL="full"
QUIET=false

# First positional arg is project root (if it does not start with --)
PROJECT_ROOT="."
if [ $# -gt 0 ] && [[ ! "$1" == --* ]]; then
    PROJECT_ROOT="$1"
    shift
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --level)  LEVEL="$2"; shift 2 ;;
        --quiet)  QUIET=true; shift ;;
        --help|-h)
            sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: verify-handoff.sh [path-to-project] [--level precommit|prepush|full|ci] [--quiet]" >&2
            exit 1
            ;;
    esac
done

case "$LEVEL" in
    precommit|prepush|full|ci) ;;
    *)
        echo "Error: Invalid --level '$LEVEL'. Must be one of: precommit, prepush, full, ci" >&2
        exit 1
        ;;
esac

# Path-format-agnostic file access (cross-platform fix).
# Windows-native Python/Node cannot open an absolute MSYS path like
# /c/Users/...; helpers that read MANIFEST.json (aahp_manifest_field) would
# fail. Change into the project root once, then drive everything off RELATIVE
# paths (lint-handoff.sh ".", git -C ".", '.ai/handoff/...'); these resolve
# identically on Windows git-bash and Linux CI. SCRIPT_DIR was already resolved
# above against $0, so sourcing/exec of sibling scripts is unaffected by the cd.
cd "$PROJECT_ROOT" || { echo -e "${RED}Error: cannot cd into project root: $PROJECT_ROOT${NC}" >&2; exit 1; }
PROJECT_ROOT="."
HANDOFF_DIR=".ai/handoff"

if [ ! -d "$HANDOFF_DIR" ]; then
    echo -e "${RED}Error: $HANDOFF_DIR not found.${NC}" >&2
    exit 1
fi

# --- Escape hatch ----------------------------------------------
# Honoured everywhere EXCEPT --level ci (the required off-machine check).

if [ "${AAHP_SKIP_VERIFY:-0}" = "1" ] && [ "$LEVEL" != "ci" ]; then
    echo -e "${YELLOW}AAHP_SKIP_VERIFY=1 set: skipping local handoff verification.${NC}"
    echo "  This is caught by the required CI check (aahp verify --level ci)."
    echo "  Do NOT use it to bypass CI."
    exit 0
fi

log_ok()   { [ "$QUIET" = true ] || echo -e "  ${GREEN}OK:${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}WARN:${NC} $1"; }
log_fail() { echo -e "  ${RED}FAIL:${NC} $1"; }

FAILURES=0

echo ""
echo "========================================="
echo "  AAHP Verify (level: $LEVEL)"
echo "========================================="

# --- Layer 1: MANIFEST checksum integrity ----------------------
# Reuses lint-handoff.sh, which already validates JSON, required fields,
# and per-file SHA-256 checksums against MANIFEST.json.

echo ""
echo -e "${GREEN}[Layer 1]${NC} MANIFEST checksum integrity (via lint-handoff.sh)"

if [ ! -f "$HANDOFF_DIR/MANIFEST.json" ]; then
    log_fail "MANIFEST.json not found. Run /handoff (aahp manifest)."
    FAILURES=$((FAILURES + 1))
else
    LINT_OUT=""
    LINT_RC=0
    LINT_OUT=$(bash "$SCRIPT_DIR/lint-handoff.sh" "$PROJECT_ROOT" 2>&1) || LINT_RC=$?
    if echo "$LINT_OUT" | grep -q "Checksum mismatch"; then
        log_fail "MANIFEST.json checksums do not match file contents. Run /handoff."
        echo "$LINT_OUT" | grep -E "Checksum mismatch|Expected:|Actual:" | sed 's/^/    /'
        FAILURES=$((FAILURES + 1))
    elif [ "$LINT_RC" -ne 0 ]; then
        log_fail "lint-handoff.sh reported violations (exit $LINT_RC). Run: aahp lint"
        FAILURES=$((FAILURES + 1))
    else
        log_ok "Checksums and handoff lint pass."
    fi
fi

# --- Layer 2: Content-drift gate (THE key check) ---------------
# If the change set touches any source file OUTSIDE .ai/handoff/, then the
# same change set MUST also include STATUS.md AND a regenerated MANIFEST.json.
#
# Change set selection by level:
#   precommit -> staged changes (git diff --cached)
#   prepush/full/ci -> committed changes not yet on the upstream/base
#                      (fallback to staged + last commit if no upstream)

echo ""
echo -e "${GREEN}[Layer 2]${NC} Content-drift gate (code changed => handoff must change)"

git_in_repo() { git -C "$PROJECT_ROOT" rev-parse --git-dir &>/dev/null 2>&1; }

CHANGED_FILES=""
if git_in_repo; then
    if [ "$LEVEL" = "precommit" ]; then
        CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null || true)
    else
        # Prefer the upstream tracking branch; fall back to origin/main; then
        # fall back to the last commit so the gate still has something to read.
        BASE_REF=""
        if git -C "$PROJECT_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' &>/dev/null 2>&1; then
            BASE_REF=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}')
        elif git -C "$PROJECT_ROOT" rev-parse --verify origin/main &>/dev/null 2>&1; then
            BASE_REF="origin/main"
        fi
        if [ -n "$BASE_REF" ]; then
            CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only "$BASE_REF"...HEAD 2>/dev/null || true)
        else
            CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~1...HEAD 2>/dev/null \
                || git -C "$PROJECT_ROOT" show --name-only --pretty=format: HEAD 2>/dev/null || true)
        fi
        # Include staged-but-uncommitted changes too, so a "full" run in a dirty
        # tree still sees pending source edits.
        STAGED=$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null || true)
        CHANGED_FILES=$(printf '%s\n%s\n' "$CHANGED_FILES" "$STAGED" | sort -u | sed '/^$/d')
    fi
else
    log_warn "Not a git repo. Skipping drift gate."
fi

if git_in_repo; then
    # Source files = anything tracked that is NOT under .ai/handoff/.
    # Doc-only handoff churn under .ai/handoff/ never triggers the gate.
    CODE_CHANGED=$(echo "$CHANGED_FILES" | grep -v '^\.ai/handoff/' | sed '/^$/d' || true)
    HANDOFF_CHANGED=$(echo "$CHANGED_FILES" | grep '^\.ai/handoff/' | sed '/^$/d' || true)

    if [ -z "$CODE_CHANGED" ]; then
        log_ok "No source files changed outside .ai/handoff/. Drift gate not triggered."
    else
        STATUS_TOUCHED=$(echo "$HANDOFF_CHANGED" | grep -E '(^|/)\.ai/handoff/STATUS\.md$|^\.ai/handoff/STATUS\.md$' || true)
        MANIFEST_TOUCHED=$(echo "$HANDOFF_CHANGED" | grep -E '^\.ai/handoff/MANIFEST\.json$' || true)

        if [ -n "$STATUS_TOUCHED" ] && [ -n "$MANIFEST_TOUCHED" ]; then
            log_ok "Code changed and handoff state (STATUS.md + MANIFEST.json) changed with it."
        else
            log_fail "Code changed but handoff state did not. Run /handoff."
            echo "    Source files changed outside .ai/handoff/:"
            echo "$CODE_CHANGED" | sed 's/^/      - /' | head -20
            [ -z "$STATUS_TOUCHED" ]   && echo "    Missing: .ai/handoff/STATUS.md update"
            [ -z "$MANIFEST_TOUCHED" ] && echo "    Missing: regenerated .ai/handoff/MANIFEST.json"
            FAILURES=$((FAILURES + 1))
        fi
    fi
fi

# --- Layer 3: Commit-pointer freshness -------------------------
# MANIFEST.last_session.commit should point at (a recent) HEAD, proving the
# manifest was regenerated against the code it describes.
# Advisory at precommit (HEAD is about to move); hard at prepush/full/ci.

if [ "$LEVEL" != "precommit" ]; then
    echo ""
    echo -e "${GREEN}[Layer 3]${NC} Commit-pointer freshness (MANIFEST.last_session.commit vs HEAD)"

    if ! git_in_repo; then
        log_warn "Not a git repo. Skipping commit-pointer check."
    elif [ ! -f "$HANDOFF_DIR/MANIFEST.json" ]; then
        log_fail "MANIFEST.json missing; cannot check commit pointer."
        FAILURES=$((FAILURES + 1))
    else
        HEAD_SHORT=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "")
        MANIFEST_COMMIT=$(aahp_manifest_field "$HANDOFF_DIR/MANIFEST.json" "last_session.commit")
        if [ -z "$MANIFEST_COMMIT" ] || [ "$MANIFEST_COMMIT" = "unknown" ]; then
            log_warn "MANIFEST.last_session.commit is unset. Run /handoff."
        elif [ -z "$HEAD_SHORT" ]; then
            log_warn "Could not resolve HEAD. Skipping."
        elif [ "$MANIFEST_COMMIT" = "$HEAD_SHORT" ]; then
            log_ok "MANIFEST commit ($MANIFEST_COMMIT) matches HEAD ($HEAD_SHORT)."
        elif git -C "$PROJECT_ROOT" merge-base --is-ancestor "$MANIFEST_COMMIT" HEAD &>/dev/null 2>&1; then
            # Manifest points at an ancestor. Stale only if code drifted since;
            # Layer 2 already enforced that. Here we just inform.
            log_warn "MANIFEST commit ($MANIFEST_COMMIT) is behind HEAD ($HEAD_SHORT). Run /handoff if code changed."
        else
            log_warn "MANIFEST commit ($MANIFEST_COMMIT) is not an ancestor of HEAD ($HEAD_SHORT). A squash-merge or rebase-merge orphans the branch-local pointer; Layers 1-2 gate real staleness. Run /handoff if code changed."
        fi
    fi
fi

# --- Layer 4: TRUST-TTL expiry ---------------------------------
# Parse TRUST.md rows: any "verified" row whose Expires date is in the past
# is reported. Advisory by default (warn): expired trust does not block a
# commit, but the agent should re-verify.

if [ "$LEVEL" != "precommit" ]; then
    echo ""
    echo -e "${GREEN}[Layer 4]${NC} TRUST-TTL expiry (TRUST.md)"

    TRUST_FILE="$HANDOFF_DIR/TRUST.md"
    if [ ! -f "$TRUST_FILE" ]; then
        log_warn "TRUST.md not found. Skipping TTL check."
    else
        TODAY=$(date -u +"%Y-%m-%d")
        EXPIRED=$(aahp_trust_expired "$TRUST_FILE" "$TODAY")
        if [ -z "$EXPIRED" ]; then
            log_ok "No expired 'verified' trust entries."
        else
            EXPIRED_COUNT=$(echo "$EXPIRED" | sed '/^$/d' | wc -l | tr -d ' ')
            log_warn "$EXPIRED_COUNT expired 'verified' trust entr(ies). Re-verify and reset TTL:"
            echo "$EXPIRED" | sed '/^$/d' | sed 's/^/      - /' | head -20
        fi
    fi
fi

# --- Summary ---------------------------------------------------

echo ""
echo "========================================="
if [ "$FAILURES" -eq 0 ]; then
    echo -e "  ${GREEN}aahp verify passed (level: $LEVEL).${NC}"
    echo "========================================="
    exit 0
else
    echo -e "  ${RED}aahp verify FAILED: $FAILURES blocking issue(s) (level: $LEVEL).${NC}"
    echo "  Run /handoff to refresh STATUS.md + MANIFEST.json, then retry."
    echo "========================================="
    exit 1
fi

#!/usr/bin/env bash
# verify-hooks.sh - Read-only verification of local AAHP git-hook coverage.
#
# Given a target repository checkout, this classifies each REQUIRED local hook
# (from the coverage registry in docs/hook-coverage.md) as one of:
#   INSTALLED - hook present and byte-identical to the canonical scripts/hooks/ source
#   DRIFTED   - hook present but its content differs from canonical
#   EXEMPT    - hook declared exempt for this repo in the registry
#   UNKNOWN   - required hook not installed, or the repo has no registry contract
#
# It MODIFIES NOTHING: it never installs, copies, backs up, or edits a hook. To
# install or repair hooks, use scripts/install-hooks.sh instead.
#
# Usage:
#   verify-hooks.sh [target-repo-path] [--repo owner/name] [--registry FILE] [--quiet]
#
# Options:
#   --repo owner/name   Registry key to look up. Default: derived from the
#                       target's origin remote, falling back to the dir basename.
#   --registry FILE     Coverage registry to read. Default: docs/hook-coverage.md
#                       next to this script.
#   --quiet             Suppress the banner and info lines; keep the per-hook
#                       report and the RESULT line.
#   --help, -h          Show this help.
#
# Exit codes:
#   0 = every required hook is INSTALLED or EXEMPT
#   1 = at least one required hook is DRIFTED or UNKNOWN (coverage gap)
#   2 = usage error (bad option, not a git repo, registry missing)
#
# The drift comparison uses aahp_checksum (SHA-256, CR-stripped) so a hook
# checksums identically on a CRLF (Windows) or LF (Linux) working tree.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_aahp-lib.sh
source "$SCRIPT_DIR/_aahp-lib.sh"

CANON_HOOKS="$SCRIPT_DIR/hooks"
DEFAULT_REGISTRY="$SCRIPT_DIR/../docs/hook-coverage.md"
REGISTRY_BEGIN="<!-- BEGIN hook-coverage-registry -->"
REGISTRY_END="<!-- END hook-coverage-registry -->"

TARGET=""
REPO_SLUG=""
REGISTRY=""
QUIET=false

while [ $# -gt 0 ]; do
    case "$1" in
        --repo)     REPO_SLUG="$2"; shift 2 ;;
        --registry) REGISTRY="$2"; shift 2 ;;
        --quiet)    QUIET=true; shift ;;
        --help|-h)
            sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        --*)
            echo "Unknown option: $1" >&2
            echo "Usage: verify-hooks.sh [target-repo-path] [--repo owner/name] [--registry FILE] [--quiet]" >&2
            exit 2
            ;;
        *)
            if [ -z "$TARGET" ]; then
                TARGET="$1"; shift
            else
                echo "Unexpected argument: $1" >&2
                exit 2
            fi
            ;;
    esac
done

TARGET="${TARGET:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REGISTRY="${REGISTRY:-$DEFAULT_REGISTRY}"

info() { [ "$QUIET" = true ] || echo "$@"; }

# --- Validate inputs ---------------------------------------------------------
if [ ! -f "$REGISTRY" ]; then
    echo "Error: coverage registry not found: $REGISTRY" >&2
    exit 2
fi
if ! git -C "$TARGET" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Error: $TARGET is not a git repository." >&2
    exit 2
fi

# --- Resolve the repo slug ---------------------------------------------------
if [ -z "$REPO_SLUG" ]; then
    ORIGIN_URL="$(git -C "$TARGET" remote get-url origin 2>/dev/null || true)"
    if [ -n "$ORIGIN_URL" ]; then
        REPO_SLUG="$(printf '%s' "$ORIGIN_URL" \
            | sed -E 's#^[a-zA-Z]+://[^/]+/##; s#^git@[^:]+:##; s#^ssh://git@[^/]+/##; s#\.git$##')"
    fi
    if [ -z "$REPO_SLUG" ]; then
        REPO_SLUG="$(basename "$(cd "$TARGET" && pwd)")"
    fi
fi

# --- Look up the repo row in the registry ------------------------------------
# Emit a TSV of every registry row, then select the one matching REPO_SLUG.
ROW="$(awk -v b="$REGISTRY_BEGIN" -v e="$REGISTRY_END" '
    index($0, b) { inblock = 1; next }
    index($0, e) { inblock = 0 }
    inblock && $0 ~ /^[[:space:]]*\|/ {
        n = split($0, c, "|")
        for (i = 1; i <= n; i++) { gsub(/^[ \t]+|[ \t]+$/, "", c[i]) }
        repo = c[2]
        if (repo == "" || tolower(repo) == "repo") next   # header / stray
        if (repo ~ /^:?-+:?$/) next                        # separator row
        printf "%s\t%s\t%s\t%s\t%s\n", repo, c[3], c[4], c[5], c[6]
    }
' "$REGISTRY" | awk -F'\t' -v r="$REPO_SLUG" '$1 == r { print; exit }')"

info ""
info "========================================="
info "  AAHP hook coverage verify"
info "========================================="
info "  Target:   $TARGET"
info "  Repo:     $REPO_SLUG"
info "  Registry: $REGISTRY"

if [ -z "$ROW" ]; then
    echo "  UNKNOWN  repo '$REPO_SLUG' is not declared in the coverage registry."
    echo "-----------------------------------------"
    echo "  RESULT: FAIL - no coverage contract for '$REPO_SLUG' (1 unknown)."
    exit 1
fi

IFS=$'\t' read -r R_REPO R_TYPE R_REQUIRED R_EXEMPT R_REASON <<< "$ROW"
: "$R_REPO" "$R_REASON"   # referenced for clarity; not otherwise used
info "  Type:     $R_TYPE"

# --- Resolve the target's hooks directory (read-only) ------------------------
HOOKS_DIR="$(git -C "$TARGET" config --get core.hooksPath 2>/dev/null || true)"
if [ -n "$HOOKS_DIR" ]; then
    case "$HOOKS_DIR" in
        /*) : ;;
        *)  HOOKS_DIR="$TARGET/$HOOKS_DIR" ;;
    esac
else
    GIT_DIR="$(git -C "$TARGET" rev-parse --git-dir)"
    case "$GIT_DIR" in
        /*) : ;;
        *)  GIT_DIR="$TARGET/$GIT_DIR" ;;
    esac
    HOOKS_DIR="$GIT_DIR/hooks"
fi
info "  Hooks:    $HOOKS_DIR"
info ""

# --- Build the required-hook list --------------------------------------------
REQUIRED_LIST=()
if [ "$R_REQUIRED" != "none" ] && [ "$R_REQUIRED" != "-" ] && [ -n "$R_REQUIRED" ]; then
    IFS=',' read -r -a REQUIRED_LIST <<< "$R_REQUIRED"
fi

hook_is_exempt() {
    local h="$1" x
    case "$R_EXEMPT" in
        ""|"-") return 1 ;;
        "all")  return 0 ;;
    esac
    local ex=()
    IFS=',' read -r -a ex <<< "$R_EXEMPT"
    for x in "${ex[@]}"; do
        [ "$(printf '%s' "$x" | tr -d ' ')" = "$h" ] && return 0
    done
    return 1
}

n_installed=0
n_drifted=0
n_exempt=0
n_unknown=0

if [ "${#REQUIRED_LIST[@]}" -eq 0 ]; then
    echo "  EXEMPT     (no local hooks required for this repo)"
    n_exempt=$((n_exempt + 1))
else
    for raw in "${REQUIRED_LIST[@]}"; do
        hook="$(printf '%s' "$raw" | tr -d ' ')"
        [ -z "$hook" ] && continue

        if hook_is_exempt "$hook"; then
            echo "  EXEMPT     $hook (declared exempt: $R_REASON)"
            n_exempt=$((n_exempt + 1))
            continue
        fi

        canon="$CANON_HOOKS/$hook"
        if [ ! -f "$canon" ]; then
            echo "  UNKNOWN    $hook (no canonical reference in scripts/hooks/)"
            n_unknown=$((n_unknown + 1))
            continue
        fi

        dest="$HOOKS_DIR/$hook"
        if [ ! -f "$dest" ]; then
            echo "  UNKNOWN    $hook (required hook not installed)"
            n_unknown=$((n_unknown + 1))
            continue
        fi

        if [ "$(aahp_checksum "$dest")" = "$(aahp_checksum "$canon")" ]; then
            echo "  INSTALLED  $hook"
            n_installed=$((n_installed + 1))
        else
            echo "  DRIFTED    $hook (content differs from canonical scripts/hooks/$hook)"
            n_drifted=$((n_drifted + 1))
        fi
    done
fi

info "-----------------------------------------"
FAIL=$((n_drifted + n_unknown))
SUMMARY="installed=$n_installed drifted=$n_drifted exempt=$n_exempt unknown=$n_unknown"
if [ "$FAIL" -gt 0 ]; then
    echo "  RESULT: FAIL - $SUMMARY"
    exit 1
else
    echo "  RESULT: PASS - $SUMMARY"
    exit 0
fi

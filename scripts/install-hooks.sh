#!/usr/bin/env bash
# install-hooks.sh - Install the AAHP git hooks (pre-commit + pre-push) into a
# target repository so the canonical "aahp verify" gate runs locally.
#
# Usage: ./scripts/install-hooks.sh [path-to-target-repo]
#        Defaults to the repo this script lives in.
#
# What it does:
#   - Copies scripts/hooks/pre-commit and scripts/hooks/pre-push into the
#     target repo's .git/hooks/ (respecting core.hooksPath if set).
#   - Makes them executable.
#   - Does NOT overwrite a non-AAHP hook without backing it up first.
#
# The hooks call <target>/scripts/verify-handoff.sh, so the target repo must
# also have scripts/verify-handoff.sh + scripts/_aahp-lib.sh + lint-handoff.sh
# (copied as part of AAHP propagation).
#
# Exit codes:
#   0 = hooks installed
#   1 = error (not a git repo, source hooks missing, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_HOOKS="$SCRIPT_DIR/hooks"

TARGET="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [ ! -d "$SRC_HOOKS" ]; then
    echo "Error: source hooks dir not found: $SRC_HOOKS" >&2
    exit 1
fi

if ! git -C "$TARGET" rev-parse --git-dir &>/dev/null 2>&1; then
    echo "Error: $TARGET is not a git repository." >&2
    exit 1
fi

# Respect core.hooksPath if configured, else use .git/hooks.
HOOKS_DIR=$(git -C "$TARGET" config --get core.hooksPath 2>/dev/null || true)
if [ -n "$HOOKS_DIR" ]; then
    # core.hooksPath may be relative to the repo root.
    case "$HOOKS_DIR" in
        /* | [A-Za-z]:*) : ;;  # POSIX-absolute or Windows drive-letter (C:/...) path
        *) HOOKS_DIR="$TARGET/$HOOKS_DIR" ;;
    esac
else
    GIT_DIR=$(git -C "$TARGET" rev-parse --git-dir)
    case "$GIT_DIR" in
        /* | [A-Za-z]:*) : ;;  # POSIX-absolute or Windows drive-letter (C:/...) path
        *) GIT_DIR="$TARGET/$GIT_DIR" ;;
    esac
    HOOKS_DIR="$GIT_DIR/hooks"
fi

mkdir -p "$HOOKS_DIR"

install_one() {
    local name="$1"
    local src="$SRC_HOOKS/$name"
    local dest="$HOOKS_DIR/$name"

    if [ ! -f "$src" ]; then
        echo "  skip: $name (source missing)" >&2
        return 0
    fi

    # If an existing hook is present and is NOT an AAHP hook, back it up.
    if [ -f "$dest" ] && ! grep -q "AAHP pre-" "$dest" 2>/dev/null; then
        cp "$dest" "$dest.pre-aahp.bak"
        echo "  note: backed up existing $name to $name.pre-aahp.bak"
    fi

    cp "$src" "$dest"
    chmod +x "$dest"
    echo "  installed: $name"
}

echo "Installing AAHP hooks into: $HOOKS_DIR"
install_one "pre-commit"
install_one "pre-push"
echo "Done. The 'aahp verify' gate now runs on commit (fast) and push (full)."
echo "Escape hatch: AAHP_SKIP_VERIFY=1 (caught by the required CI check; do NOT use to bypass CI)."

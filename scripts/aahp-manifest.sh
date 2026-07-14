#!/usr/bin/env bash
# aahp-manifest.sh -(Re)generate MANIFEST.json from existing handoff files
#
# Usage: ./scripts/aahp-manifest.sh [path-to-project] [options]
#        Defaults to current directory if no path given.
#
# Options:
#   --agent NAME       Agent identifier (default: "cli-tool")
#   --session-id ID    Session identifier (default: auto-generated)
#   --phase PHASE      Pipeline phase: research|architecture|implementation|review|fix|idle|documentation (default: "idle")
#   --context "TEXT"    Quick context string (default: auto-generated from file summaries)
#   --duration MIN     Session duration in minutes (default: 0)
#   --quiet            Suppress output except errors
#
# Exit codes:
#   0 = manifest generated successfully
#   1 = error (no handoff directory, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_aahp-lib.sh
source "$SCRIPT_DIR/_aahp-lib.sh"

# ─── Defaults ─────────────────────────────────────────────────

AGENT="cli-tool"
SESSION_ID="cli-$(date +%s)"
PHASE="idle"
CONTEXT=""
DURATION=0
QUIET=false

# ─── Parse arguments ──────────────────────────────────────────

# First positional arg is project root (if it doesn't start with --)
PROJECT_ROOT="."
if [ $# -gt 0 ] && [[ ! "$1" == --* ]]; then
    PROJECT_ROOT="$1"
    shift
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --agent)      AGENT="$2"; shift 2 ;;
        --session-id) SESSION_ID="$2"; shift 2 ;;
        --phase)      PHASE="$2"; shift 2 ;;
        --context)    CONTEXT="$2"; shift 2 ;;
        --duration)   DURATION="$2"; shift 2 ;;
        --quiet)      QUIET=true; shift ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: aahp-manifest.sh [path-to-project] [--agent NAME] [--phase PHASE] [--context TEXT] [--duration MIN] [--session-id ID] [--quiet]" >&2
            exit 1
            ;;
    esac
done

HANDOFF_DIR="$PROJECT_ROOT/.ai/handoff"

# ─── Validate ─────────────────────────────────────────────────

if [ ! -d "$HANDOFF_DIR" ]; then
    echo "Error: $HANDOFF_DIR not found." >&2
    exit 1
fi

# Validate phase
case "$PHASE" in
    research|architecture|implementation|review|fix|idle|documentation) ;;
    *)
        echo "Error: Invalid phase '$PHASE'. Must be one of: research, architecture, implementation, review, fix, idle, documentation" >&2
        exit 1
        ;;
esac

# ─── Detect project metadata ─────────────────────────────────

# Project name: PRESERVE the existing MANIFEST.json "project" value on
# regeneration; only derive it from the directory basename on first-ever
# generation. Without this, regenerating inside a differently-named checkout
# (e.g. the gate-sync bot's mktemp working copy, or any tarball/CI dir) would
# overwrite a consumer's real project name with the temp-dir basename.
PROJECT_NAME=""
if [ -f "$HANDOFF_DIR/MANIFEST.json" ]; then
    PROJECT_NAME="$(aahp_manifest_field "$HANDOFF_DIR/MANIFEST.json" "project")"
fi
if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME=$(basename "$(cd "$PROJECT_ROOT" && pwd)")
fi
COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─── Build files object ──────────────────────────────────────

FILES_JSON=""
FILES_FOUND=0
TOTAL_TOKENS=0

for file in "${AAHP_HANDOFF_FILES[@]}"; do
    filepath="$HANDOFF_DIR/$file"
    if [ -f "$filepath" ]; then
        if [ "$FILES_FOUND" -gt 0 ]; then
            FILES_JSON="${FILES_JSON},"
        fi
        FILES_JSON="${FILES_JSON}
$(aahp_file_entry_json "$file" "$filepath")"
        FILES_FOUND=$((FILES_FOUND + 1))
        TOTAL_TOKENS=$((TOTAL_TOKENS + $(aahp_estimate_tokens "$filepath")))
    fi
done

# ─── Auto-generate context if not provided ────────────────────

if [ -z "$CONTEXT" ]; then
    # Build context from file summaries
    CONTEXT_PARTS=()
    for file in STATUS.md NEXT_ACTIONS.md; do
        filepath="$HANDOFF_DIR/$file"
        if [ -f "$filepath" ]; then
            CONTEXT_PARTS+=("$(aahp_auto_summary "$filepath")")
        fi
    done
    if [ ${#CONTEXT_PARTS[@]} -gt 0 ]; then
        CONTEXT=$(printf '%s ' "${CONTEXT_PARTS[@]}" | cut -c1-500)
    else
        CONTEXT="No handoff files found with content summaries."
    fi
fi

# Escape context for JSON
CONTEXT=$(echo "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g')

# ─── Compute token budgets ────────────────────────────────────

# Estimate manifest itself at ~80-100 tokens
MANIFEST_TOKENS=85

# Core = STATUS.md + NEXT_ACTIONS.md
CORE_TOKENS=$MANIFEST_TOKENS
for file in STATUS.md NEXT_ACTIONS.md; do
    filepath="$HANDOFF_DIR/$file"
    if [ -f "$filepath" ]; then
        CORE_TOKENS=$((CORE_TOKENS + $(aahp_estimate_tokens "$filepath")))
    fi
done

FULL_TOKENS=$((MANIFEST_TOKENS + TOTAL_TOKENS))

# ─── Preserve v3 task data from existing manifest ─────────────

TASKS_JSON=""
NEXT_TASK_ID=""
CROSS_REPO_REF=""

if [ -f "$HANDOFF_DIR/MANIFEST.json" ]; then
    # Extract tasks block and next_task_id if they exist
    if command -v node &>/dev/null; then
        EXISTING=$(node -e "
            const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
            if (m.tasks) process.stdout.write(JSON.stringify(m.tasks));
        " "$HANDOFF_DIR/MANIFEST.json" 2>/dev/null || true)
        if [ -n "$EXISTING" ]; then
            TASKS_JSON="$EXISTING"
        fi
        EXISTING_ID=$(node -e "
            const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
            if (m.next_task_id) process.stdout.write(String(m.next_task_id));
        " "$HANDOFF_DIR/MANIFEST.json" 2>/dev/null || true)
        if [ -n "$EXISTING_ID" ]; then
            NEXT_TASK_ID="$EXISTING_ID"
        fi
        # Preserve the optional cross_repo_ref field (v3.4+), like tasks it is
        # agent-managed and must survive regeneration.
        EXISTING_CRR=$(node -e "
            const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
            if (m.cross_repo_ref) process.stdout.write(JSON.stringify(m.cross_repo_ref));
        " "$HANDOFF_DIR/MANIFEST.json" 2>/dev/null || true)
        if [ -n "$EXISTING_CRR" ]; then
            CROSS_REPO_REF="$EXISTING_CRR"
        fi
    fi
fi

# ─── Write MANIFEST.json ─────────────────────────────────────

{
    cat <<MANIFEST
{
  "aahp_version": "3.0",
  "project": "$PROJECT_NAME",
  "last_session": {
    "agent": "$AGENT",
    "session_id": "$SESSION_ID",
    "timestamp": "$TIMESTAMP",
    "commit": "$COMMIT",
    "phase": "$PHASE",
    "duration_minutes": $DURATION
  },
  "files": {$FILES_JSON
  },
  "quick_context": "$CONTEXT",
  "token_budget": {
    "manifest_only": $MANIFEST_TOKENS,
    "manifest_plus_core": $CORE_TOKENS,
    "full_read": $FULL_TOKENS
  }
MANIFEST

    # Append v3 task fields if they exist
    if [ -n "$NEXT_TASK_ID" ]; then
        echo "  ,\"next_task_id\": \"$NEXT_TASK_ID\""
    fi
    if [ -n "$TASKS_JSON" ]; then
        echo "  ,\"tasks\": $TASKS_JSON"
    fi
    if [ -n "$CROSS_REPO_REF" ]; then
        echo "  ,\"cross_repo_ref\": $CROSS_REPO_REF"
    fi

    echo "}"
} > "$HANDOFF_DIR/MANIFEST.json"

# ─── Output ───────────────────────────────────────────────────

if [ "$QUIET" = false ]; then
    echo "MANIFEST.json generated: $FILES_FOUND files indexed, checksums current."
    echo "  Token budget: manifest=$MANIFEST_TOKENS, core=$CORE_TOKENS, full=$FULL_TOKENS"
fi



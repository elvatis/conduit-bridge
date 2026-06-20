#!/usr/bin/env bash
# _aahp-lib.sh -Shared functions for AAHP tooling
# Not intended to be run directly. Source this from other scripts.

# Standard AAHP handoff files, in canonical order
# shellcheck disable=SC2034
AAHP_HANDOFF_FILES=(STATUS.md NEXT_ACTIONS.md LOG.md DASHBOARD.md TRUST.md CONVENTIONS.md WORKFLOW.md)

# Colors (safe to re-source -same variable names used across scripts)
# shellcheck disable=SC2034
RED='\033[0;31m'
# shellcheck disable=SC2034
GREEN='\033[0;32m'
# shellcheck disable=SC2034
YELLOW='\033[1;33m'
# shellcheck disable=SC2034
NC='\033[0m'

# Compute SHA-256 checksum for a file, output as "sha256:<hash>"
aahp_checksum() {
    local filepath="$1"
    local hash
    # Strip CR before hashing so a file checksums identically regardless of
    # CRLF vs LF line endings (Windows working tree vs Linux CI checkout).
    # Must stay in lockstep with the verifier in lint-handoff.sh.
    if command -v sha256sum &>/dev/null; then
        hash=$(tr -d '\r' < "$filepath" | sha256sum | awk '{print $1}')
    elif command -v shasum &>/dev/null; then
        hash=$(tr -d '\r' < "$filepath" | shasum -a 256 | awk '{print $1}')
    else
        echo "ERROR: No SHA-256 tool found (need sha256sum or shasum)" >&2
        return 1
    fi
    echo "sha256:$hash"
}

# Get file modification time in ISO 8601 UTC
aahp_file_mtime() {
    local filepath="$1"
    date -r "$filepath" -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null ||
        stat -c '%y' "$filepath" 2>/dev/null | head -c 19
}

# Get line count
aahp_line_count() {
    wc -l < "$1" | tr -d ' '
}

# Extract a one-line summary from a handoff file (first non-header, non-empty line)
aahp_auto_summary() {
    local filepath="$1"
    local summary
    summary=$(head -5 "$filepath" \
        | grep -v '^#' | grep -v '^>' | grep -v '^---' | grep -v '^$' \
        | head -1 | cut -c1-150 || true)
    [ -z "$summary" ] && summary="(no summary available)"
    # Escape double quotes and backslashes for JSON safety
    summary=$(echo "$summary" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "$summary"
}

# Estimate token count from a file (rough: word_count * 1.3)
aahp_estimate_tokens() {
    local filepath="$1"
    local words
    words=$(wc -w < "$filepath" | tr -d ' ')
    echo $(( (words * 13 + 9) / 10 ))
}

# Detect a working Python interpreter (python3 preferred, then python).
# The Windows Store python3 alias passes `command -v` but does not run, so we
# verify with an actual invocation. Echoes the command name or empty string.
aahp_python_cmd() {
    if python3 -c "pass" &>/dev/null 2>&1; then
        echo "python3"
    elif python -c "pass" &>/dev/null 2>&1; then
        echo "python"
    else
        echo ""
    fi
}

# Read a dotted field from a MANIFEST.json file (e.g. "last_session.commit").
# Echoes the value or empty string. Uses node if present, else python.
aahp_manifest_field() {
    local manifest="$1"
    local dotted="$2"
    [ -f "$manifest" ] || { echo ""; return 0; }

    if command -v node &>/dev/null; then
        node -e "
            const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
            const v = process.argv[2].split('.').reduce((o, k) => (o == null ? o : o[k]), m);
            if (v !== undefined && v !== null) process.stdout.write(String(v));
        " "$manifest" "$dotted" 2>/dev/null || true
        return 0
    fi

    local py
    py=$(aahp_python_cmd)
    if [ -n "$py" ]; then
        "$py" -c "
import json, sys
m = json.load(open(sys.argv[1]))
cur = m
for k in sys.argv[2].split('.'):
    if isinstance(cur, dict) and k in cur:
        cur = cur[k]
    else:
        cur = None
        break
if cur is not None:
    sys.stdout.write(str(cur))
" "$manifest" "$dotted" 2>/dev/null || true
    fi
}

# Report expired "verified" trust rows from a TRUST.md file.
# Trust tables are Markdown with a header row that includes "Status" and
# "Expires" columns. We locate those columns from the header, then for each
# data row treat it as expired when its Status cell is "verified" and its
# Expires cell is a YYYY-MM-DD date strictly before the given today.
# The first cell of the row is reported as the property name.
# Echoes one "Property (expired Expires)" line per expired row.
aahp_trust_expired() {
    local trust_file="$1"
    local today="$2"
    [ -f "$trust_file" ] || return 0

    # Implemented in awk for portability (no python dependency).
    awk -v today="$today" '
        function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
        # A markdown table row starts with a pipe.
        /^[ \t]*\|/ {
            n = split($0, cell, "|")
            for (i = 1; i <= n; i++) cell[i] = trim(cell[i])

            # Separator row like | --- | --- | : skip it.
            sep = 1
            for (i = 2; i < n; i++) {
                if (cell[i] != "" && cell[i] !~ /^:?-+:?$/) { sep = 0; break }
            }
            if (sep) next

            # Header row: it names the Status and Expires columns. Record their
            # positions, then move on. Reset on every header so multiple tables
            # in one file are each handled with their own column layout.
            is_header = 0
            for (i = 2; i < n; i++) {
                lc = tolower(cell[i])
                if (lc == "status")  { status_col = i; is_header = 1 }
                if (lc == "expires") { expires_col = i; is_header = 1 }
            }
            if (is_header) next

            # Data row: need both columns known.
            if (status_col == 0 || expires_col == 0) next
            if (tolower(cell[status_col]) != "verified") next
            expiry = cell[expires_col]
            if (expiry !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) next
            if (expiry < today) {
                print cell[2] " (expired " expiry ")"
            }
        }
        # Reset column tracking at horizontal rules / blank-ish boundaries so a
        # stray table without a header does not reuse stale column indices.
        /^[ \t]*$/ { status_col = 0; expires_col = 0 }
    ' "$trust_file"
}

# Generate a JSON file entry block for MANIFEST.json
# Outputs raw JSON (no trailing comma -caller handles commas)
aahp_file_entry_json() {
    local file="$1"
    local filepath="$2"
    local checksum updated lines summary

    checksum=$(aahp_checksum "$filepath")
    updated=$(aahp_file_mtime "$filepath")
    lines=$(aahp_line_count "$filepath")
    summary=$(aahp_auto_summary "$filepath")

    cat <<ENTRY
    "$file": {
      "checksum": "$checksum",
      "updated": "$updated",
      "lines": $lines,
      "summary": "$summary"
    }
ENTRY
}

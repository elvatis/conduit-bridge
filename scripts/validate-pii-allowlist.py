#!/usr/bin/env python3
"""Validate AAHP's reviewed, exact, expiring PII email allowlist."""
from __future__ import annotations
import argparse, datetime as dt, json, re, sys
from pathlib import Path

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\Z")
ROOT_KEYS = {"version", "entries"}
ENTRY_KEYS = {"value", "kind", "reason", "owner", "expires"}

def fail(message: str) -> None:
    print(f"PII allowlist invalid: {message}", file=sys.stderr)
    raise SystemExit(1)

def text(entry, key, index):
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip() or any(c in value for c in "\r\n\t"):
        fail(f"entry {index}: '{key}' must be a non-empty single-line string")
    return value

def entries(path: Path, today: dt.date):
    try:
        document = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON ({exc.msg})")
    if not isinstance(document, dict) or set(document) != ROOT_KEYS or document.get('version') != 1:
        fail("root must contain exactly 'version': 1 and 'entries'")
    raw = document.get('entries')
    if not isinstance(raw, list):
        fail("'entries' must be an array")
    seen, result = set(), []
    for index, entry in enumerate(raw, 1):
        if not isinstance(entry, dict) or set(entry) != ENTRY_KEYS:
            fail(f"entry {index} must contain exactly value, kind, reason, owner, and expires")
        value, kind = text(entry, 'value', index), text(entry, 'kind', index)
        reason, owner, expires = text(entry, 'reason', index), text(entry, 'owner', index), text(entry, 'expires', index)
        if kind != 'email': fail(f"entry {index}: 'kind' must be 'email'")
        if not EMAIL.fullmatch(value): fail(f"entry {index}: 'value' must be one exact email address; wildcards and regex are forbidden")
        if value in seen: fail(f"entry {index}: duplicate value '{value}'")
        seen.add(value)
        try: expiry = dt.date.fromisoformat(expires)
        except ValueError: fail(f"entry {index}: 'expires' must be YYYY-MM-DD")
        if expiry < today: fail(f"entry {index}: allowlist entry for '{value}' expired on {expires}")
        result.append((value, owner, expires, reason))
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('path', type=Path)
    parser.add_argument('--format', choices=('human','tsv'), default='human')
    parser.add_argument('--today')
    args = parser.parse_args()
    try: today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()
    except ValueError: fail('--today must be YYYY-MM-DD')
    result = entries(args.path, today)
    if args.format == 'tsv':
        for row in result: print('\t'.join(row))
    else: print(f"PII allowlist valid: {len(result)} active exact email entries.")
if __name__ == '__main__': main()

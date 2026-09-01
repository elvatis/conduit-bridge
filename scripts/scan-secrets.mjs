#!/usr/bin/env node
/**
 * scan-secrets.mjs - dependency-free credential scanner for this public repo.
 *
 * conduit-bridge is a PUBLIC repository that talks to several paid AI APIs, so a
 * single committed key is a live credential leak. `.gitignore` keeps `.env` out,
 * but nothing else stops a key pasted into a README, a test fixture or a config
 * file from being pushed. This script is that backstop.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs             scan tracked files at the current tree
 *   node scripts/scan-secrets.mjs --history   also scan every blob in git history
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = scanner error.
 *
 * Findings are printed with every long token redacted down to its first 8
 * characters, so a real credential is never echoed into a public CI log. The
 * vendor prefix survives, which is enough to know which key to rotate.
 */

import { execFileSync } from 'node:child_process';

const HISTORY = process.argv.includes('--history');

/**
 * Credential shapes. Each pattern is deliberately anchored on a vendor prefix
 * plus a minimum length, so documentation placeholders such as `sk-ant-...` or
 * `sk-or-v1-...` do not match.
 */
const PATTERNS = [
  { id: 'anthropic-key', re: 'sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{20,}' },
  { id: 'openrouter-key', re: 'sk-or-v1-[A-Za-z0-9]{20,}' },
  { id: 'openai-project-key', re: 'sk-proj-[A-Za-z0-9_-]{20,}' },
  { id: 'openai-key', re: 'sk-[A-Za-z0-9]{32,}' },
  { id: 'perplexity-key', re: 'pplx-[A-Za-z0-9]{20,}' },
  { id: 'google-key', re: 'AIza[0-9A-Za-z_-]{35}' },
  { id: 'xai-key', re: 'xai-[A-Za-z0-9]{20,}' },
  { id: 'groq-key', re: 'gsk_[A-Za-z0-9]{30,}' },
  { id: 'github-token', re: '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}' },
  { id: 'github-pat', re: 'github_pat_[A-Za-z0-9_]{50,}' },
  { id: 'gitlab-token', re: 'glpat-[A-Za-z0-9_-]{20,}' },
  { id: 'aws-access-key-id', re: 'AKIA[0-9A-Z]{16}' },
  { id: 'slack-token', re: 'xox[abprs]-[A-Za-z0-9-]{10,}' },
  { id: 'private-key-block', re: '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
  {
    id: 'assigned-api-key',
    re: '(ANTHROPIC|OPENAI|OPENROUTER|GEMINI|GOOGLE|PERPLEXITY|GROQ|XAI|MISTRAL|DEEPSEEK|CLAUDE|CONDUIT)[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)[ \t]*[:=][ \t]*["\']?[A-Za-z0-9_./+-]{20,}',
  },
];

/** Lines carrying one of these markers are documentation, not a leak. */
const PLACEHOLDER_MARKERS = [
  'placeholder',
  'example',
  'your-key',
  'your_key',
  'replace-me',
  'replace_me',
  'redacted',
  'dummy',
  '<your',
  'xxxxxxxx',
];

/** Never scanned: this file defines the patterns, and the lockfile is hashes. */
const EXCLUDED_PATHS = [':!scripts/scan-secrets.mjs', ':!package-lock.json'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** git grep exits 1 when nothing matched, which is the clean case for us. */
function gitGrep(args) {
  try {
    return git(args);
  } catch (err) {
    if (err.status === 1) return '';
    throw err;
  }
}

/**
 * Keep the first 8 characters of any long token and drop the rest. This report
 * goes into a public CI log, so it must not reprint the credential it found.
 */
function redact(text) {
  const trimmed = text.trim();
  const masked = trimmed.replace(
    /[A-Za-z0-9_+./-]{20,}/g,
    (token) => `${token.slice(0, 8)}...[redacted, ${token.length} chars]`,
  );
  return masked.length > 120 ? `${masked.slice(0, 120)}...` : masked;
}

/**
 * Placeholder detection runs against the matched LINE only, never the file path,
 * so a real key pasted into `.env.example` is still reported.
 */
function isPlaceholder(content) {
  const lower = content.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * git grep prints `path:line:content`, or `rev:path:line:content` when
 * revisions are given. Split off exactly that many leading fields.
 */
function splitMatch(line, withRev) {
  const fields = withRev ? 3 : 2;
  let cut = -1;
  for (let i = 0; i < fields; i += 1) {
    cut = line.indexOf(':', cut + 1);
    if (cut === -1) return { location: line, content: line };
  }
  return { location: line.slice(0, cut), content: line.slice(cut + 1) };
}

function scan(revs) {
  const patternArgs = PATTERNS.flatMap((p) => ['-e', p.re]);
  // Without --untracked, a key pasted into a brand-new file passes every scan
  // until the file is committed, which is exactly when it is most likely to be
  // there. Revisions cannot be combined with --untracked, so it applies only to
  // the working-tree scan.
  const scope = revs.length > 0 ? revs : ['--untracked'];
  const out = gitGrep(['grep', '-I', '-n', '-E', ...patternArgs, ...scope, '--', ...EXCLUDED_PATHS]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => splitMatch(line, revs.length > 0))
    .filter((match) => !isPlaceholder(match.content));
}

function trackedEnvFiles() {
  return git(['ls-files'])
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example'));
}

function historyRevs() {
  return git(['rev-list', '--all']).split('\n').filter(Boolean);
}

function main() {
  const findings = [];

  for (const file of trackedEnvFiles()) {
    findings.push(`tracked dotenv file (must never be committed): ${file}`);
  }

  for (const match of scan([])) {
    findings.push(`${match.location}: ${redact(match.content)}`);
  }

  if (HISTORY) {
    const revs = historyRevs();
    // Chunked so the argument list stays inside the Windows command-line limit.
    for (let i = 0; i < revs.length; i += 150) {
      for (const match of scan(revs.slice(i, i + 150))) {
        findings.push(`history ${match.location}: ${redact(match.content)}`);
      }
    }
  }

  const scope = HISTORY ? 'tracked files + full git history' : 'tracked and untracked files';
  if (findings.length === 0) {
    console.log(`secret scan: clean (${scope}, ${PATTERNS.length} credential patterns).`);
    return 0;
  }

  console.error(`secret scan: ${findings.length} finding(s) in ${scope}.\n`);
  for (const finding of [...new Set(findings)]) console.error(`  ${finding}`);
  console.error(
    '\nIf any of these is a real credential, ROTATE it at the provider first,' +
      '\nthen remove it from the tree (and from history if it was pushed).',
  );
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`secret scan: scanner error: ${err.message}`);
  process.exit(2);
}

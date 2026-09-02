import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runtimeDir } from '../config.js';
import { resolveExecutable } from './cli-util.js';

export type CliAuthKind = 'claude' | 'codex' | 'gemini' | 'grok';

export interface CliSessionState {
  installed: boolean;
  authenticated: boolean;
  source: string;
}

const CRED_FILES: Record<CliAuthKind, string[]> = {
  claude: ['.claude/.credentials.json', '.claude.json'],
  codex: ['.codex/auth.json'],
  gemini: ['.gemini/oauth_creds.json'],
  grok: ['.grok/auth.json', '.grok/credentials.json'],
};

const ENV_KEYS: Record<CliAuthKind, string[]> = {
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  grok: ['XAI_API_KEY', 'GROK_API_KEY'],
};

function fileNonEmpty(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  } catch {
    return false;
  }
}

/** True when the CLI's own cred file exists. Never copies it into API providers. */
export function hasCliCredentialFile(kind: CliAuthKind, home = homedir()): boolean {
  for (const rel of CRED_FILES[kind]) {
    if (fileNonEmpty(join(home, rel))) return true;
  }
  if (kind === 'claude') {
    if (fileNonEmpty(join(runtimeDir(), 'accounts', 'cli-claude', 'second-account', '.credentials.json'))) {
      return true;
    }
  }
  return false;
}

function hasCliEnv(kind: CliAuthKind): boolean {
  return ENV_KEYS[kind].some(key => Boolean(process.env[key]));
}

/**
 * Binary-on-PATH is not authentication. Connected means the CLI can actually
 * run: installed, and either logged in (cred file) or given a CLI-usable env var.
 */
export function cliSession(kind: CliAuthKind, binNames: string[]): CliSessionState {
  const installed = binNames.some(name => resolveExecutable(name) !== null);
  if (!installed) {
    return { installed: false, authenticated: false, source: 'CLI not installed' };
  }
  if (hasCliCredentialFile(kind) || hasCliEnv(kind)) {
    return { installed: true, authenticated: true, source: 'CLI login' };
  }
  return { installed: true, authenticated: false, source: 'CLI not authenticated' };
}

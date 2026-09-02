import { join } from 'node:path';
import { runtimeDir } from '../config.js';

export const DEFAULT_ACCOUNT = 'first-account';
export const CLI_ACCOUNTS = ['first-account', 'second-account'] as const;
export type CliAccount = typeof CLI_ACCOUNTS[number];

/** Parse cli-claude/<account>/<model>, while retaining legacy IDs. */
export function parseClaudeModel(model: string, prefix: string): { account: CliAccount; model: string } {
  const raw = model.startsWith(prefix) ? model.slice(prefix.length) : model;
  const parts = raw.split('/');
  if (parts.length >= 2 && (CLI_ACCOUNTS as readonly string[]).includes(parts[0])) {
    return { account: parts[0] as CliAccount, model: parts.slice(1).join('/') };
  }
  return { account: DEFAULT_ACCOUNT, model: raw };
}

/** Only second-account needs an alternate Claude config directory. */
export function claudeAccountEnv(account: CliAccount): NodeJS.ProcessEnv {
  if (account === DEFAULT_ACCOUNT) return {};
  return { CLAUDE_CONFIG_DIR: join(runtimeDir(), 'accounts', 'cli-claude', account) };
}

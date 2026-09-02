import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export type CliRunMode = 'chat' | 'plan' | 'agent';
export type CliModeProvider = 'cli-claude' | 'cli-gemini' | 'cli-codex' | 'cli-grok';

export type ParseModeResult =
  | { ok: true; mode: CliRunMode }
  | { ok: false; error: string };

const MODES = new Set<CliRunMode>(['chat', 'plan', 'agent']);

/**
 * Resolve chat / plan / agent from the OpenAI-compatible request body.
 * `mode` wins when present. Otherwise `agentic: true` and `plan: true` are aliases.
 */
export function parseCliRunMode(body: {
  mode?: unknown;
  agentic?: unknown;
  plan?: unknown;
}): ParseModeResult {
  if (typeof body.mode === 'string' && body.mode.trim()) {
    const mode = body.mode.trim().toLowerCase() as CliRunMode;
    if (!MODES.has(mode)) {
      return { ok: false, error: 'mode must be chat, plan, or agent' };
    }
    return { ok: true, mode };
  }

  if (body.agentic === true && body.plan === true) {
    return { ok: false, error: 'agentic and plan cannot both be true' };
  }
  if (body.agentic === true) return { ok: true, mode: 'agent' };
  if (body.plan === true) return { ok: true, mode: 'plan' };
  return { ok: true, mode: 'chat' };
}

/**
 * Agent mode writes the workspace. Refuse it without an absolute existing cwd
 * so the CLI cannot fall back to the home directory.
 */
export function agentModeCwdError(mode: CliRunMode, cwd: string | undefined): string | undefined {
  if (mode !== 'agent') return undefined;
  const path = cwd?.trim();
  if (!path || !isAbsolute(path) || !existsSync(path)) {
    return 'agent mode requires cwd as an absolute existing directory';
  }
  return undefined;
}

/** Native CLI flags for plan vs agent vs chat-proxy safety. */
export function cliPermissionArgs(
  provider: CliModeProvider,
  mode: CliRunMode,
  opts: { isAgy?: boolean } = {},
): string[] {
  switch (provider) {
    case 'cli-claude':
      return ['--permission-mode', mode === 'agent' ? 'bypassPermissions' : 'plan'];
    case 'cli-gemini':
      if (opts.isAgy === false) {
        return mode === 'agent' ? [] : ['--approval-mode', 'plan'];
      }
      return mode === 'agent'
        ? ['--mode', 'accept-edits', '--dangerously-skip-permissions']
        : ['--mode', 'plan'];
    case 'cli-codex':
      return mode === 'agent'
        ? ['--sandbox', 'workspace-write', '--approve-for-me', '--ephemeral']
        : ['--sandbox', 'read-only', '--ephemeral'];
    case 'cli-grok':
      return mode === 'agent'
        ? ['--no-plan', '--always-approve']
        : ['--permission-mode', 'plan'];
  }
}

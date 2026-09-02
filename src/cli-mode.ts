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

/**
 * Tools a read-only chat turn must not reach for. Comma-separated because both
 * `claude` and `grok` accept "comma or space separated"; a space-separated list
 * would make the variadic flag swallow the arguments that follow it.
 */
const MUTATING_TOOLS = 'Write,Edit,MultiEdit,NotebookEdit,Bash';

/**
 * Native CLI flags per run mode.
 *
 * The three modes are genuinely different and must not collapse into each other:
 *   chat  — answer the question. May read the workspace, must not write it.
 *           Emitting plan flags here makes the CLI reply with a plan (and, for
 *           agy, announce a plan file it was never permitted to write).
 *   plan  — run the CLI's native planner.
 *   agent — write the workspace.
 */
export function cliPermissionArgs(
  provider: CliModeProvider,
  mode: CliRunMode,
  opts: { isAgy?: boolean } = {},
): string[] {
  switch (provider) {
    case 'cli-claude':
      if (mode === 'agent') return ['--permission-mode', 'bypassPermissions'];
      if (mode === 'plan') return ['--permission-mode', 'plan'];
      return ['--disallowedTools', MUTATING_TOOLS];
    case 'cli-gemini': {
      const legacy = opts.isAgy === false;
      if (mode === 'agent') {
        return legacy ? [] : ['--mode', 'accept-edits', '--dangerously-skip-permissions'];
      }
      if (mode === 'plan') {
        return legacy ? ['--approval-mode', 'plan'] : ['--mode', 'plan'];
      }
      // agy's default print mode answers directly and writes nothing.
      return [];
    }
    case 'cli-codex':
      return mode === 'agent'
        ? ['--sandbox', 'workspace-write', '--approve-for-me', '--ephemeral']
        : ['--sandbox', 'read-only', '--ephemeral'];
    case 'cli-grok':
      if (mode === 'agent') return ['--no-plan', '--always-approve'];
      if (mode === 'plan') return ['--permission-mode', 'plan'];
      return ['--disallowedTools', MUTATING_TOOLS];
  }
}

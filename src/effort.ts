/**
 * Normalize cross-provider reasoning/effort levels.
 *
 * Clients may send either `effort` or OpenAI's `reasoning_effort`.
 * Providers map the normalized level to their own wire format.
 */

export type OpenAiEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AgyEffort = 'low' | 'medium' | 'high';

const OPENAI_LEVELS = new Set<string>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const CLAUDE_LEVELS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

/** Coerce raw request values to a lowercase string level, or undefined. */
export function parseEffort(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const s = String(raw).trim().toLowerCase();
  return s || undefined;
}

/** Prefer explicit effort, then OpenAI-style reasoning_effort. */
export function pickEffort(body: { effort?: unknown; reasoning_effort?: unknown }): string | undefined {
  return parseEffort(body.effort) ?? parseEffort(body.reasoning_effort);
}

/** Map to OpenAI chat completions `reasoning_effort`. Unknown -> medium. */
export function toOpenAiEffort(level: string | undefined): OpenAiEffort | undefined {
  if (!level) return undefined;
  if (OPENAI_LEVELS.has(level)) return level as OpenAiEffort;
  // Common aliases
  if (level === 'maxx' || level === 'maximum') return 'max';
  if (level === 'min') return 'minimal';
  return 'medium';
}

/** Map to Anthropic `output_config.effort`. none/minimal collapse to low. */
export function toClaudeEffort(level: string | undefined): ClaudeEffort | undefined {
  if (!level) return undefined;
  // Conduit alias: Claude Code currently accepts max as its top CLI level.
  if (level === 'ultracode') return 'max';
  if (level === 'none' || level === 'minimal' || level === 'min') return 'low';
  if (CLAUDE_LEVELS.has(level)) return level as ClaudeEffort;
  return 'high';
}

/** Effort choices exposed by the bridge UI and capability endpoint. */
export function effortCapabilities(provider: string): { values: string[]; aliases?: Record<string, string>; note: string } {
  if (provider === 'cli-claude' || provider === 'claude-api') {
    return { values: ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'], aliases: { ultracode: 'max' }, note: 'ultracode is a Conduit alias for the provider maximum.' };
  }
  if (provider === 'cli-gemini') {
    return { values: ['low', 'medium', 'high'], note: 'agy supports low, medium, and high.' };
  }
  if (provider === 'cli-grok' || provider === 'codex-api' || provider === 'openrouter-api' || provider === 'perplexity-api') {
    return { values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], note: 'The upstream model may support only a subset.' };
  }
  return { values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], note: 'The selected provider may ignore unsupported levels.' };
}

/** Map to agy `--effort` (only low|medium|high). */
export function toAgyEffort(level: string | undefined): AgyEffort | undefined {
  if (!level) return undefined;
  if (level === 'none' || level === 'minimal' || level === 'low' || level === 'min') return 'low';
  if (level === 'medium' || level === 'med') return 'medium';
  // high, xhigh, max
  return 'high';
}

/** Map to Grok CLI `--reasoning-effort` / `--effort` (reuse OpenAI ladder). */
export function toGrokEffort(level: string | undefined): OpenAiEffort | undefined {
  return toOpenAiEffort(level);
}

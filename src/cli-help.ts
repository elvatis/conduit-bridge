import { resolveCliExecutable } from './providers/cli-util.js';
import type { BridgeConfig } from './types.js';

export function renderCliHelp(version: string, cfg: BridgeConfig): string {
  const BOLD = '\x1b[1m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';
  const CYAN = '\x1b[38;2;34;180;255m';
  const GREEN = '\x1b[38;2;46;204;113m';
  const YELLOW = '\x1b[38;2;241;196;15m';
  const RED = '\x1b[38;2;231;76;60m';
  const TEXT = '\x1b[38;2;236;240;241m';
  const MUTED = '\x1b[38;2;120;140;160m';
  const COPPER = '\x1b[38;2;255;138;61m';

  const termWidth = process.stdout.columns || 80;
  const separatorWidth = Math.min(termWidth, 78);

  const cliProviders: Array<{ id: 'cli-gemini' | 'cli-claude' | 'cli-codex' | 'cli-grok'; name: string; binaries: string[] }> = [
    { id: 'cli-gemini', name: 'Gemini CLI', binaries: ['agy', 'gemini', 'antigravity'] },
    { id: 'cli-claude', name: 'Claude Code CLI', binaries: ['claude-code', 'claude'] },
    { id: 'cli-codex', name: 'Codex CLI', binaries: ['codex'] },
    { id: 'cli-grok', name: 'Grok CLI', binaries: ['grok'] },
  ];

  const providerRows = cliProviders.map(p => {
    const res = resolveCliExecutable(cfg, p.id, p.binaries);
    const status = res.path
      ? `${GREEN}✓ Available${RESET} ${DIM}(${res.path})${RESET}`
      : `${MUTED}✗ Not found in PATH${RESET}`;
    return `  ${CYAN}${p.id.padEnd(14)}${RESET} ${p.name.padEnd(18)} ${status}`;
  });

  const lines: string[] = [
    `${BOLD}${CYAN}CONDUIT BRIDGE${RESET} ${BOLD}${GREEN}v${version}${RESET}  ${DIM}• Unified Local Runtime & Autonomous Agent Orchestrator${RESET}`,
    `${MUTED}${'─'.repeat(separatorWidth)}${RESET}`,
    '',
    `${BOLD}${TEXT}USAGE:${RESET}`,
    `  ${CYAN}conduit-bridge${RESET} ${COPPER}<command>${RESET} ${DIM}[arguments] [flags]${RESET}`,
    '',
    `${BOLD}${TEXT}CORE COMMANDS:${RESET}`,
    `  ${DIM}─── System & Service ──────────────────────────────────────────────────${RESET}`,
    `  ${BOLD}${CYAN}start${RESET}                  Start the background HTTP bridge runtime server`,
    `  ${BOLD}${CYAN}status${RESET}                 Inspect runtime daemon health, uptime & provider connectivity`,
    `  ${BOLD}${CYAN}config${RESET} [key] [val]     Display or update runtime configuration and credentials`,
    '',
    `  ${DIM}─── Agent Orchestration ───────────────────────────────────────────────${RESET}`,
    `  ${BOLD}${CYAN}chat | tui${RESET}             Launch full-screen reactive TUI (interactive pair programmer)`,
    `  ${BOLD}${CYAN}run${RESET} "<prompt>"         Execute an agent, plan, or chat run directly from CLI`,
    `  ${BOLD}${CYAN}runs${RESET} [action]          Inspect, approve, continue, retry or cancel execution runs`,
    `  ${BOLD}${CYAN}sessions${RESET} [action]      Manage conversational sessions, logs & transcripts`,
    '',
    `  ${DIM}─── Workspaces & Models ───────────────────────────────────────────────${RESET}`,
    `  ${BOLD}${CYAN}workspaces${RESET} [list]      List registered isolated agent execution workspaces`,
    `  ${BOLD}${CYAN}models${RESET} [list]          List advertised models and provider execution targets`,
    '',
    `${BOLD}${TEXT}FLAGS & OPTIONS:${RESET}`,
    `  ${YELLOW}--port=<number>${RESET}        HTTP server listen port ${DIM}(default: 31338)${RESET}`,
    `  ${YELLOW}--host=<address>${RESET}       HTTP server bind address ${DIM}(default: 127.0.0.1)${RESET}`,
    `  ${YELLOW}--model=<id>${RESET}           Target model ID for interactive chat or run`,
    `  ${YELLOW}--workspace=<id>${RESET}       Execution workspace ID or name`,
    `  ${YELLOW}--mode=<mode>${RESET}          Execution mode: ${CYAN}agent${RESET} | ${CYAN}plan${RESET} | ${CYAN}chat${RESET} ${DIM}(default: agent)${RESET}`,
    `  ${YELLOW}--log-level=<level>${RESET}   Logging verbosity: ${CYAN}silent${RESET} | ${CYAN}info${RESET} | ${CYAN}debug${RESET}`,
    `  ${YELLOW}--auth-token=<token>${RESET}   Bearer auth token for secured or external binds`,
    `  ${YELLOW}--json${RESET}                 Emit structured machine-readable JSON output`,
    '',
    `${BOLD}${TEXT}SUPPORTED PROVIDERS:${RESET}`,
    `  ${DIM}Local CLI Toolchains (verified against PATH):${RESET}`,
    ...providerRows,
    '',
    `  ${DIM}Remote API Backends:${RESET}`,
    `  ${CYAN}claude-api${RESET}     Anthropic API (Claude 3.5 Sonnet, Claude 3.7 Sonnet, Opus)`,
    `  ${CYAN}codex-api${RESET}      OpenAI API (GPT-4o, o1, o3-mini models)`,
    `  ${CYAN}gemini-api${RESET}     Google Gemini API (Gemini 2.0 / 2.5 Flash & Pro)`,
    `  ${CYAN}openrouter-api${RESET} Multi-provider aggregated API routing endpoint`,
    `  ${CYAN}perplexity-api${RESET} Online search-grounded inference API`,
    '',
    `  ${DIM}Local Fallback Engines:${RESET}`,
    `  ${CYAN}lmstudio${RESET}       Local HTTP inference server via LM Studio ${DIM}(http://127.0.0.1:1234)${RESET}`,
    `  ${CYAN}bitnet${RESET}         Quantized local 1-bit native neural inference engine`,
    '',
    `${BOLD}${TEXT}EXAMPLES:${RESET}`,
    `  ${DIM}# Launch interactive full-screen TUI with specific model:${RESET}`,
    `  ${CYAN}conduit-bridge chat --model=cli-claude/claude-sonnet-5${RESET}`,
    '',
    `  ${DIM}# Run an autonomous agent task in background workspace:${RESET}`,
    `  ${CYAN}conduit-bridge run "Audit codebase for race conditions and fix them" --mode=agent${RESET}`,
    '',
    `  ${DIM}# Approve a pending execution run awaiting confirmation:${RESET}`,
    `  ${CYAN}conduit-bridge runs approve run-42${RESET}`,
    '',
    `  ${DIM}# Configure Anthropic API credentials:${RESET}`,
    `  ${CYAN}conduit-bridge config apiKeys.claude sk-ant-...${RESET}`,
    '',
  ];

  return lines.join('\n');
}

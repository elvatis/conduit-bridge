import { resolveCliExecutable } from './providers/cli-util.js';
import type { BridgeConfig } from './types.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[38;2;34;180;255m';
const GREEN = '\x1b[38;2;46;204;113m';
const YELLOW = '\x1b[38;2;241;196;15m';
const MUTED = '\x1b[38;2;120;140;160m';
const TEXT = '\x1b[38;2;236;240;241m';
const COPPER = '\x1b[38;2;255;138;61m';
const BORDER = '\x1b[38;2;76;86;106m';

function visible(value: string): number {
  return value.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(value: string, width: number): string {
  const extra = width - visible(value);
  return extra > 0 ? value + ' '.repeat(extra) : value;
}

function wrapPlain(value: string, width: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (visible(next) > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function box(title: string, rows: string[], width: number): string[] {
  const inner = width - 2;
  const head = `${BORDER}╭─ ${CYAN}${title}${RESET}${BORDER} ${'─'.repeat(Math.max(0, inner - visible(title) - 3))}╮${RESET}`;
  const body = rows.flatMap(row => wrapPlain(row, inner - 1).map(line => `${BORDER}│${RESET}${pad(' ' + line, inner)}${BORDER}│${RESET}`));
  const foot = `${BORDER}╰${'─'.repeat(inner)}╯${RESET}`;
  return [head, ...body, foot];
}

export function renderCliHelp(version: string, cfg: BridgeConfig): string {
  const width = Math.min(Math.max(process.stdout.columns || 80, 72), 100);
  const cliProviders: Array<{ id: 'cli-gemini' | 'cli-claude' | 'cli-codex' | 'cli-grok'; name: string; binaries: string[] }> = [
    { id: 'cli-gemini', name: 'Gemini CLI', binaries: ['agy', 'gemini', 'antigravity'] },
    { id: 'cli-claude', name: 'Claude Code CLI', binaries: ['claude-code', 'claude'] },
    { id: 'cli-codex', name: 'Codex CLI', binaries: ['codex'] },
    { id: 'cli-grok', name: 'Grok CLI', binaries: ['grok'] },
  ];
  const providerRows = cliProviders.map(item => {
    const resolved = resolveCliExecutable(cfg, item.id, item.binaries);
    const badge = resolved.path ? `${GREEN}ready${RESET}` : `${MUTED}missing${RESET}`;
    return `  ${CYAN}${item.id.padEnd(14)}${RESET} ${item.name.padEnd(16)} ${badge}`;
  });

  const lines = [
    ...box(`CONDUIT BRIDGE  ${GREEN}v${version}${RESET}`, [
      `${TEXT}Local control plane for API, CLI and on-device models.${RESET}`,
      `${MUTED}Listener ${cfg.host}:${cfg.port}  •  Windows and Linux desktop${RESET}`,
    ], width),
    '',
    ...box('USAGE:', [
      `${CYAN}conduit-bridge${RESET} ${COPPER}<command>${RESET} ${DIM}[arguments] [flags]${RESET}`,
    ], width),
    '',
    ...box('CORE COMMANDS:', [
      `${BOLD}${TEXT}System & Service${RESET}`,
      `  ${CYAN}start${RESET}              Start the loopback HTTP listener`,
      `  ${CYAN}status${RESET}             Show uptime and provider connectivity`,
      `  ${CYAN}config${RESET} [key] [val] Display or update configuration`,
      `${BOLD}${TEXT}Agent Orchestration${RESET}`,
      `  ${CYAN}chat | tui${RESET}         Full-screen terminal workspace`,
      `  ${CYAN}run${RESET} "<prompt>"     Headless agent, plan or chat run`,
      `  ${CYAN}runs${RESET} [action]      Inspect, approve, continue, retry, cancel`,
      `  ${CYAN}sessions${RESET} [action]  List or inspect stored conversations`,
      `${BOLD}${TEXT}Workspaces & Models${RESET}`,
      `  ${CYAN}workspaces${RESET}         List registered execution roots`,
      `  ${CYAN}models${RESET}             List advertised models`,
      `  ${CYAN}help${RESET}               This screen`,
    ], width),
    '',
    ...box('FLAGS & OPTIONS:', [
      `${YELLOW}--port=<n>${RESET}           Listen port ${DIM}(31338)${RESET}`,
      `${YELLOW}--host=<addr>${RESET}        Bind address ${DIM}(127.0.0.1)${RESET}`,
      `${YELLOW}--model=<id>${RESET}         Model for chat or run`,
      `${YELLOW}--workspace=<id>${RESET}     Execution workspace`,
      `${YELLOW}--mode=<mode>${RESET}        agent | plan | chat`,
      `${YELLOW}--approval=<mode>${RESET}    ask | always | never`,
      `${YELLOW}--json${RESET}               Machine-readable output`,
      `${YELLOW}--auth-token=<tok>${RESET}   Bearer token for non-loopback binds`,
      `${YELLOW}--log-level=<lvl>${RESET}    silent | info | debug`,
    ], width),
    '',
    ...box('SUPPORTED PROVIDERS:', [
      `${DIM}CLI binaries (PATH)${RESET}`,
      ...providerRows,
      `${DIM}API backends${RESET}`,
      `  ${CYAN}claude-api${RESET}  ${CYAN}codex-api${RESET}  ${CYAN}gemini-api${RESET}  ${CYAN}openrouter-api${RESET}  ${CYAN}perplexity-api${RESET}`,
      `${DIM}Local inference${RESET}`,
      `  ${CYAN}lmstudio${RESET}  ${CYAN}bitnet${RESET}`,
    ], width),
    '',
    ...box('EXAMPLES:', [
      `${DIM}Interactive TUI session${RESET}`,
      `  ${CYAN}conduit-bridge chat --model=cli-codex/gpt-5.6-sol${RESET}`,
      `${DIM}Headless agent task with later review${RESET}`,
      `  ${CYAN}conduit-bridge run "Review the diff and open a run" --mode=agent${RESET}`,
      `${DIM}Inspect stored insights after a local scan${RESET}`,
      `  ${CYAN}conduit-bridge sessions list --json${RESET}`,
    ], width),
  ];
  return lines.join('\n');
}

import { createInterface } from 'node:readline';
import { resolveCliExecutable } from './providers/cli-util.js';
import type { BridgeConfig } from './types.js';
import { renderCliHelp } from './cli-help.js';
import { handleRunCommand, handleRunsCommand, handleWorkspacesCommand, handleModelsCommand } from './cli-commands.js';

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

function visible(val: string): number {
  return val.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(val: string, width: number): string {
  const diff = width - visible(val);
  return diff > 0 ? val + ' '.repeat(diff) : val;
}

export async function runCliMenu(version: string, cfg: BridgeConfig): Promise<void> {
  const width = Math.min(Math.max(process.stdout.columns || 80, 72), 90);
  const inner = width - 2;

  const cliProviders: Array<{ id: 'cli-gemini' | 'cli-claude' | 'cli-codex' | 'cli-grok'; name: string; binaries: string[] }> = [
    { id: 'cli-gemini', name: 'Gemini', binaries: ['agy', 'gemini', 'antigravity'] },
    { id: 'cli-claude', name: 'Claude', binaries: ['claude-code', 'claude'] },
    { id: 'cli-codex', name: 'Codex', binaries: ['codex'] },
    { id: 'cli-grok', name: 'Grok', binaries: ['grok'] },
  ];

  const providerBadges = cliProviders.map(item => {
    const res = resolveCliExecutable(cfg, item.id, item.binaries);
    return res.path ? `${GREEN}${item.name} ✓${RESET}` : `${MUTED}${item.name} ✗${RESET}`;
  }).join('  ');

  const menuLines = [
    `${BORDER}╭─ ${CYAN}CONDUIT BRIDGE  ${GREEN}v${version}${RESET}${BORDER} ${'─'.repeat(Math.max(0, inner - visible(`CONDUIT BRIDGE  v${version}`) - 3))}╮${RESET}`,
    `${BORDER}│${RESET}${pad(` ${TEXT}Welcome! Choose an action or navigate below:${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(` ${MUTED}Host: http://${cfg.host}:${cfg.port}  •  CLI Tools: ${providerBadges}${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}├${'─'.repeat(inner)}┤${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[1]${RESET} ${BOLD}Interactive Chat / Terminal TUI${RESET}    ${DIM}(conduit-bridge chat)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}Full-screen dual-pane workspace, diff reviews, runs & tools${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[2]${RESET} ${BOLD}Run an Agent Task${RESET}                  ${DIM}(conduit-bridge run "<task>")${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}Headless code editing, multi-step planning, or prompt execution${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[3]${RESET} ${BOLD}Inspect Execution Runs${RESET}             ${DIM}(conduit-bridge runs list)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}View status, step traces, approve checkpoints, or rollback${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[4]${RESET} ${BOLD}View Workspaces & Git Status${RESET}       ${DIM}(conduit-bridge workspaces)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}List registered folders, worktrees, and permissions${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[5]${RESET} ${BOLD}List Advertised Models${RESET}             ${DIM}(conduit-bridge models)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}Discovered models across CLI, API and local engines${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[6]${RESET} ${BOLD}Server Status & Diagnostics${RESET}        ${DIM}(conduit-bridge status)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}Check loopback listener health and provider connections${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[7]${RESET} ${BOLD}Start Background Bridge Server${RESET}     ${DIM}(conduit-bridge start)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`       ${MUTED}Start the persistent HTTP API on port ${cfg.port}${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[8]${RESET} ${BOLD}Help & Command Reference${RESET}           ${DIM}(conduit-bridge help)${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}│${RESET}${pad(`   ${CYAN}[q]${RESET} ${DIM}Quit${RESET}`, inner)}${BORDER}│${RESET}`,
    `${BORDER}╰${'─'.repeat(inner)}╯${RESET}`,
  ];

  console.log(menuLines.join('\n'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (query: string): Promise<string> =>
    new Promise(resolve => rl.question(query, resolve));

  const answer = (await promptUser(`${COPPER}Select an option [1-8, q]: ${RESET}`)).trim().toLowerCase();

  switch (answer) {
    case '1':
    case 'chat':
    case 'tui': {
      rl.close();
      const { runChatCommand } = await import('./interactive-cli.js');
      await runChatCommand(cfg, {
        cliPath: process.argv[1],
        allowUnconfined: cfg.allowUnconfined === true,
      });
      break;
    }

    case '2':
    case 'run': {
      const prompt = (await promptUser(`${COPPER}Enter task prompt: ${RESET}`)).trim();
      rl.close();
      if (!prompt) {
        console.log(`${YELLOW}No prompt provided. Exiting.${RESET}`);
        return;
      }
      console.log(`\n${CYAN}Running task:${RESET} "${prompt}"\n`);
      await handleRunCommand(cfg, prompt, {});
      break;
    }

    case '3':
    case 'runs': {
      rl.close();
      console.log(`\n${CYAN}Active and recent runs:${RESET}\n`);
      await handleRunsCommand(cfg, ['list'], {});
      break;
    }

    case '4':
    case 'workspaces': {
      rl.close();
      console.log(`\n${CYAN}Registered workspaces:${RESET}\n`);
      await handleWorkspacesCommand(cfg, ['list'], {});
      break;
    }

    case '5':
    case 'models': {
      rl.close();
      console.log(`\n${CYAN}Available models:${RESET}\n`);
      await handleModelsCommand(cfg, ['list'], {});
      break;
    }

    case '6':
    case 'status': {
      rl.close();
      console.log(`\n${CYAN}Checking server status on http://${cfg.host}:${cfg.port}...${RESET}\n`);
      const http = await import('node:http');
      const { bearerAuthorization } = await import('./config.js');
      http.get(`http://${cfg.host}:${cfg.port}/v1/status`, { headers: bearerAuthorization(cfg.authToken) }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const status = JSON.parse(data);
            console.log(`${GREEN}conduit-bridge v${status.version}${RESET} (uptime: ${status.uptime}s)`);
            for (const provider of status.providers) {
              console.log(`  ${provider.connected ? `${GREEN}✓${RESET}` : `${MUTED}✗${RESET}`} ${provider.name.padEnd(16)} ${provider.connected ? 'connected' : 'not connected'}`);
            }
          } catch { console.log(data); }
        });
      }).on('error', () => {
        console.log(`${YELLOW}conduit-bridge is NOT running on ${cfg.host}:${cfg.port}.${RESET}`);
        console.log(`Start it with: ${CYAN}conduit-bridge start${RESET}`);
      });
      break;
    }

    case '7':
    case 'start': {
      rl.close();
      console.log(`${CYAN}Starting bridge listener on ${cfg.host}:${cfg.port}...${RESET}`);
      const { BridgeServer } = await import('./server.js');
      const server = new BridgeServer(cfg);
      await server.start();
      break;
    }

    case '8':
    case 'help': {
      rl.close();
      console.log(renderCliHelp(version, cfg));
      break;
    }

    case 'q':
    case 'quit':
    case 'exit':
    default: {
      rl.close();
      break;
    }
  }
}

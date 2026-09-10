import './warning-filter.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig, saveConfig, loadDotEnv, parseConfigValue, bearerAuthorization, redactConfigForDisplay } from './config.js';
import { logger, configureLogger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';

const dotenvKeys = loadDotEnv();
const cliDirname = dirname(fileURLToPath(import.meta.url));
const CLI_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(cliDirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

const args = process.argv.slice(2);
const cmd = args[0] ?? 'start';
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i++) {
  const match = args[i].match(/^--([a-z-]+)=(.+)$/);
  if (match) flags[match[1]] = match[2];
  else if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) flags[args[i].slice(2)] = args[++i];
  else if (/^--[a-z-]+$/.test(args[i])) flags[args[i].slice(2)] = 'true';
}

const isInteractive = cmd === 'chat' || cmd === 'tui';
if (isInteractive) {
  const logDir = join(process.cwd(), '.conduit', 'logs');
  logger.setFileDestination(join(logDir, 'bridge.log'), true);
}

const cfg = loadConfig({
  ...(flags.port ? { port: parseInt(flags.port) } : {}),
  ...(flags.host ? { host: flags.host } : {}),
  ...(flags['log-level'] ? { logLevel: flags['log-level'] as any } : {}),
  ...(flags['auth-token'] ? { authToken: flags['auth-token'] } : {}),
  ...(flags['allow-unconfined'] === 'true' ? { allowUnconfined: true } : {}),
});

configureLogger(cfg);
if (isInteractive) {
  logger.muteConsole(true);
} else if (dotenvKeys.length && cmd !== 'help' && cmd !== '--help' && !flags.help) {
  logger.debug(`Loaded ${dotenvKeys.length} var(s) from .env`);
}

switch (cmd) {
  case 'start': {
    try { assertSupportedPlatform(); } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    logger.info(`conduit-bridge v${CLI_VERSION} starting on ${cfg.host}:${cfg.port}…`);
    const { BridgeServer } = await import('./server.js');
    const server = new BridgeServer(cfg);
    server.start().catch(err => {
      logger.error(`Failed to start: ${err.message}`);
      process.exit(1);
    });
    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.on(sig, async () => {
        logger.info(`Received ${sig}, shutting down…`);
        await server.stop();
        process.exit(0);
      });
    }
    break;
  }

  case 'status': {
    const url = `http://${cfg.host}:${cfg.port}/v1/status`;
    const http = await import('node:http');
    http.get(url, { headers: bearerAuthorization(cfg.authToken) }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          console.log(`conduit-bridge v${status.version} — uptime ${status.uptime}s`);
          for (const provider of status.providers) {
            console.log(`  ${provider.connected ? '✅' : '❌'} ${provider.name.padEnd(16)} ${provider.connected ? 'connected' : 'not connected'}`);
          }
        } catch { console.log(data); }
      });
    }).on('error', () => {
      console.log(`conduit-bridge is NOT running on ${cfg.host}:${cfg.port}`);
      process.exit(1);
    });
    break;
  }

  case 'tui':
  case 'chat': {
    try { assertSupportedPlatform(); } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    const { runChatCommand } = await import('./interactive-cli.js');
    await runChatCommand(cfg, {
      model: flags.model,
      cliPath: fileURLToPath(import.meta.url),
      allowUnconfined: flags['allow-unconfined'] === 'true',
    });
    break;
  }

  case 'config': {
    const key = args[1];
    const val = args[2];
    if (!key || !val) {
      const current = loadConfig();
      // Never print credential material, including a shortened prefix/suffix.
      // The status is enough for an operator to see which providers are set.
      const display = redactConfigForDisplay(current);
      console.log(JSON.stringify(display, null, 2));
    } else if (key.startsWith('apiKeys.')) {
      const provider = key.split('.')[1];
      const existing = loadConfig();
      saveConfig({ apiKeys: { ...existing.apiKeys, [provider]: val } } as any);
      console.log(`API key set for ${provider}`);
    } else if (key.includes('.')) {
      const [group, field] = key.split('.', 2);
      const existing = loadConfig() as any;
      const current = existing[group] && typeof existing[group] === 'object' ? existing[group] : {};
      saveConfig({ [group]: { ...current, [field]: parseConfigValue(key, val) } } as any);
      console.log(`Config updated: ${key} = ${val}`);
    } else {
      saveConfig({ [key]: parseConfigValue(key, val) } as any);
      console.log(`Config updated: ${key} = ${val}`);
    }
    break;
  }

  case 'run': {
    const { handleRunCommand } = await import('./cli-commands.js');
    const prompt = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    const code = await handleRunCommand(cfg, prompt, flags);
    process.exit(code);
    break;
  }

  case 'runs': {
    const { handleRunsCommand } = await import('./cli-commands.js');
    const subArgs = args.slice(1).filter(a => !a.startsWith('--'));
    const code = await handleRunsCommand(cfg, subArgs, flags);
    process.exit(code);
    break;
  }

  case 'sessions': {
    const { handleSessionsCommand } = await import('./cli-commands.js');
    const subArgs = args.slice(1).filter(a => !a.startsWith('--'));
    const code = await handleSessionsCommand(cfg, subArgs, flags);
    process.exit(code);
    break;
  }

  case 'workspaces': {
    const { handleWorkspacesCommand } = await import('./cli-commands.js');
    const subArgs = args.slice(1).filter(a => !a.startsWith('--'));
    const code = await handleWorkspacesCommand(cfg, subArgs, flags);
    process.exit(code);
    break;
  }

  case 'models': {
    const { handleModelsCommand } = await import('./cli-commands.js');
    const subArgs = args.slice(1).filter(a => !a.startsWith('--'));
    const code = await handleModelsCommand(cfg, subArgs, flags);
    process.exit(code);
    break;
  }

  case 'help':
  case '--help': {
    const { renderCliHelp } = await import('./cli-help.js');
    console.log(renderCliHelp(CLI_VERSION, cfg));
    process.exit(0);
    break;
  }

  default: {
    const { renderCliHelp } = await import('./cli-help.js');
    console.log(renderCliHelp(CLI_VERSION, cfg));
    break;
  }
}

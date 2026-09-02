import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BridgeServer } from './server.js';
import { loadConfig, saveConfig, loadDotEnv, parseConfigValue, bearerAuthorization } from './config.js';
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

const cfg = loadConfig({
  ...(flags.port ? { port: parseInt(flags.port) } : {}),
  ...(flags.host ? { host: flags.host } : {}),
  ...(flags['log-level'] ? { logLevel: flags['log-level'] as any } : {}),
  ...(flags['auth-token'] ? { authToken: flags['auth-token'] } : {}),
});

configureLogger(cfg);
if (dotenvKeys.length) logger.info(`Loaded ${dotenvKeys.length} var(s) from .env: ${dotenvKeys.join(', ')}`);

switch (cmd) {
  case 'start': {
    try { assertSupportedPlatform(); } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    logger.info(`conduit-bridge v${CLI_VERSION} starting on ${cfg.host}:${cfg.port}…`);
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

  case 'config': {
    const key = args[1];
    const val = args[2];
    if (!key || !val) {
      const current = loadConfig();
      const display = { ...current, apiKeys: Object.fromEntries(
        Object.entries(current.apiKeys ?? {}).map(([name, value]) =>
          [name, typeof value === 'string' && value.length > 8 ? value.slice(0, 4) + '…' + value.slice(-4) : value]
        ),
      )};
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

  default:
    console.log(`conduit-bridge v${CLI_VERSION}

Usage:
  conduit-bridge start [--port=31338] [--host=127.0.0.1] [--log-level=info]
                       [--auth-token=<token>]
  conduit-bridge status
  conduit-bridge config [key] [value]

API providers:
  claude-api, codex-api, gemini-api, openrouter-api, perplexity-api
  Add credentials through dashboard Settings or protected environment variables.

CLI providers (authenticated by their installed tools):
  cli-claude, cli-codex, cli-gemini, cli-grok

Local provider:
  lmstudio (set LM_STUDIO_URL to override http://127.0.0.1:1234)

Security:
  External binds require an auth token configured through a protected setup path.
`);
}

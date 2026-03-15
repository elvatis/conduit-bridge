#!/usr/bin/env node
// conduit-bridge CLI — standalone entry point
import { BridgeServer } from './server.js';
import { loadConfig, saveConfig } from './config.js';
import { logger, configureLogger } from './logger.js';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'start';

// Parse flags
const flags: Record<string, string> = {};
for (let i = 1; i < args.length; i++) {
  const match = args[i].match(/^--([a-z-]+)=(.+)$/);
  if (match) flags[match[1]] = match[2];
  else if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
    flags[args[i].slice(2)] = args[i + 1];
    i++;
  }
}

const cfg = loadConfig({
  ...(flags.port ? { port: parseInt(flags.port) } : {}),
  ...(flags.host ? { host: flags.host } : {}),
  ...(flags['log-level'] ? { logLevel: flags['log-level'] as any } : {}),
  ...(flags.headless !== undefined ? { headless: flags.headless !== 'false' } : {}),
});

configureLogger(cfg);

switch (cmd) {
  case 'start': {
    logger.info(`conduit-bridge v0.1.0 starting on ${cfg.host}:${cfg.port}…`);
    const server = new BridgeServer(cfg);
    server.start().catch(err => {
      logger.error(`Failed to start: ${err.message}`);
      process.exit(1);
    });

    // Graceful shutdown
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
    // Quick health check against running instance
    const url = `http://${cfg.host}:${cfg.port}/v1/status`;
    const http = await import('node:http');
    http.get(url, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          console.log(`conduit-bridge v${status.version} — uptime ${status.uptime}s`);
          for (const p of status.providers) {
            const icon = p.sessionValid ? '✅' : (p.hasProfile ? '⚠️ ' : '❌');
            console.log(`  ${icon} ${p.name.padEnd(8)} ${p.sessionValid ? 'connected' : (p.hasProfile ? 'profile exists, not connected' : 'no profile')}`);
          }
        } catch {
          console.log(data);
        }
      });
    }).on('error', () => {
      console.log(`conduit-bridge is NOT running on ${cfg.host}:${cfg.port}`);
      process.exit(1);
    });
    break;
  }

  case 'login': {
    const provider = args[1] as 'grok' | 'claude' | 'gemini' | 'chatgpt' | undefined;
    if (!provider) {
      console.error('Usage: conduit-bridge login <grok|claude|gemini|chatgpt>');
      console.error('  (API providers use keys, not login: conduit-bridge config apiKeys.claude-api <key>)');
      process.exit(1);
    }
    // Send login request to running instance
    const http = await import('node:http');
    const req = http.request({
      hostname: cfg.host, port: cfg.port,
      path: `/v1/login/${provider}`, method: 'POST',
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        const j = JSON.parse(data);
        console.log(j.message ?? JSON.stringify(j));
      });
    });
    req.on('error', () => {
      console.error(`conduit-bridge is not running. Start it first with: conduit-bridge start`);
      process.exit(1);
    });
    req.end();
    break;
  }

  case 'config': {
    const key = args[1];
    const val = args[2];
    if (!key || !val) {
      const current = loadConfig();
      // Mask API keys in display
      const display = { ...current, apiKeys: Object.fromEntries(
        Object.entries(current.apiKeys ?? {}).map(([k, v]) =>
          [k, typeof v === 'string' && v.length > 8 ? v.slice(0, 4) + '…' + v.slice(-4) : v]
        ),
      )};
      console.log(JSON.stringify(display, null, 2));
    } else if (key.startsWith('apiKeys.')) {
      // Support dotted keys for API keys: config apiKeys.claude-api sk-xxx
      const provider = key.split('.')[1];
      const existing = loadConfig();
      saveConfig({ apiKeys: { ...existing.apiKeys, [provider]: val } } as any);
      console.log(`API key set for ${provider}`);
    } else {
      saveConfig({ [key]: isNaN(Number(val)) ? val : Number(val) } as any);
      console.log(`Config updated: ${key} = ${val}`);
    }
    break;
  }

  default:
    console.log(`conduit-bridge v0.1.0

Usage:
  conduit-bridge start [--port=31338] [--host=127.0.0.1] [--log-level=info]
  conduit-bridge status
  conduit-bridge login <grok|claude|gemini|chatgpt>
  conduit-bridge config [key] [value]

API providers (no browser needed):
  conduit-bridge config apiKeys.claude-api <ANTHROPIC_API_KEY>
  conduit-bridge config apiKeys.gemini-api <GOOGLE_AI_API_KEY>
  conduit-bridge config apiKeys.codex-api  <OPENAI_API_KEY>
`);
}

#!/usr/bin/env node
// conduit-bridge CLI — standalone entry point
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BridgeServer } from './server.js';
import { ProviderRegistry } from './registry.js';
import { loadConfig, saveConfig, loadDotEnv } from './config.js';
import { logger, configureLogger } from './logger.js';
import { assertSupportedPlatform } from './platform.js';

// Load .env (<cwd>/.env, then ~/.conduit/.env) into process.env before anything
// resolves keys. Never overrides variables already set in the real environment.
const _dotenvKeys = loadDotEnv();

const __cli_dirname = dirname(fileURLToPath(import.meta.url));
const CLI_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__cli_dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

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
  } else if (/^--[a-z-]+$/.test(args[i])) {
    // A bare flag such as `--local` means "on".
    flags[args[i].slice(2)] = 'true';
  }
}

/** Provider names that authenticate through a visible browser. */
const WEB_PROVIDERS = ['grok', 'claude', 'gemini', 'chatgpt', 'perplexity'] as const;
type WebProvider = (typeof WEB_PROVIDERS)[number];

/** Coerce a CLI config value: JSON object/array, boolean, number, else string. */
function parseConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* keep the raw string */ }
  }
  return raw;
}

/** One JSON request against the running bridge, with auth when configured. */
async function bridgeRequest(path: string, method: 'GET' | 'POST'): Promise<{ statusCode: number; body: any; raw: string }> {
  const http = await import('node:http');
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: cfg.host,
      port: cfg.port,
      path,
      method,
      headers: cfg.authToken ? { Authorization: `Bearer ${cfg.authToken}` } : {},
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let body: any = null;
        try { body = JSON.parse(data); } catch { body = null; }
        resolve({ statusCode: res.statusCode ?? 0, body, raw: data });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

const cfg = loadConfig({
  ...(flags.port ? { port: parseInt(flags.port) } : {}),
  ...(flags.host ? { host: flags.host } : {}),
  ...(flags['log-level'] ? { logLevel: flags['log-level'] as any } : {}),
  ...(flags.headless !== undefined ? { headless: flags.headless !== 'false' } : {}),
  ...(flags['auth-token'] ? { authToken: flags['auth-token'] } : {}),
  ...(flags['no-sandbox'] !== undefined ? { chromiumNoSandbox: flags['no-sandbox'] !== 'false' } : {}),
});

configureLogger(cfg);

if (_dotenvKeys.length) {
  logger.info(`Loaded ${_dotenvKeys.length} var(s) from .env: ${_dotenvKeys.join(', ')}`);
}

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
    try { assertSupportedPlatform(); } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    const provider = args[1];
    if (!provider || !(WEB_PROVIDERS as readonly string[]).includes(provider)) {
      console.error(`Usage: conduit-bridge login <${WEB_PROVIDERS.join('|')}> [--local] [--status] [--cancel] [--recheck]`);
      console.error('  (API providers use keys, not login: conduit-bridge config apiKeys.claude-api <key>)');
      process.exit(1);
    }
    const name = provider as WebProvider;

    // ── Query or control an attempt on the running bridge ────────────────────
    const control = flags.status ? 'status' : flags.cancel ? 'cancel' : flags.recheck ? 'recheck' : null;
    if (control) {
      try {
        const method = control === 'status' ? 'GET' : 'POST';
        const { statusCode, body, raw } = await bridgeRequest(`/v1/login/${name}/${control}`, method);
        if (!body) { console.error(raw || `Unexpected empty response (HTTP ${statusCode}).`); process.exit(1); }
        const login = body.login ?? null;
        if (login) {
          console.log(`${name}: ${login.state} — ${login.message}`);
          if (login.nextAction) console.log(`  ${login.nextAction}`);
        } else if (body.message) {
          console.log(`${name}: ${body.message}`);
        } else {
          // No attempt has run in this bridge process yet. Say so, rather than
          // printing nothing at all.
          console.log(`${name}: no browser login has been started. Run: conduit-bridge login ${name}`);
        }
        const env = body.environment ?? {};
        if (env.ready === false) console.log(`  ${env.reason ?? 'The graphical session is not usable.'}`);
        if (body.viewer?.url) console.log(`  Login browser: ${body.viewer.url}`);
        else if (env.ready !== false) console.log('  Login browser viewer: not running');
        if (env.warnings?.length) for (const w of env.warnings) console.log(`  Note: ${w}`);
        const failed = login && ['blocked', 'timeout', 'failed'].includes(login.state);
        process.exit(statusCode >= 400 || failed ? 1 : 0);
      } catch {
        console.error(`conduit-bridge is not running. Start it first with: conduit-bridge start`);
        process.exit(1);
      }
    }

    // ── Run the login in this process (no bridge required) ───────────────────
    if (flags.local !== undefined) {
      const { probeDisplay } = await import('./login/display.js');
      const { profileDir } = await import('./config.js');
      const probe = await probeDisplay(profileDir(cfg, name));
      if (!probe.ok) {
        console.error(probe.reason ?? 'A graphical session is required for an interactive login.');
        console.error('On a remote server, start the bridge and use its built-in viewer through port 31338.');
        process.exit(1);
      }
      for (const warning of probe.warnings) console.log(`Note: ${warning}`);

      const registry = new ProviderRegistry(loadConfig({ headless: false }));
      try {
        await registry.get(name).login(url => {
          console.log(`Login browser opened: ${url}`);
          console.log('Complete the sign-in in the local browser window. Conduit will verify it afterwards.');
        });
        console.log(`Login completed for ${name}. The saved profile will be reused by the running bridge.`);
      } catch (err) {
        // BaseProvider.login already prefixes "Login failed for <provider>:",
        // so print its message as-is rather than prefixing it twice.
        console.error((err as Error).message);
        process.exit(1);
      }
      break;
    }

    // ── Ask the running bridge to start one ──────────────────────────────────
    try {
      const { statusCode, body, raw } = await bridgeRequest(`/v1/login/${name}`, 'POST');
      if (!body) { console.error(raw || `Unexpected empty response (HTTP ${statusCode}).`); process.exit(1); }
      console.log(body.message ?? JSON.stringify(body));
      if (body.viewer?.url) console.log(`Open the login browser at: ${body.viewer.url}`);
      console.log(`Track it with: conduit-bridge login ${name} --status`);
      if (statusCode >= 400) process.exit(1);
    } catch {
      console.error(`conduit-bridge is not running. Start it first with: conduit-bridge start`);
      process.exit(1);
    }
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
    } else if (key.includes('.')) {
      // One level of nesting, e.g. `config login.mode assisted`. saveConfig
      // merges shallowly, so the rest of the sub-object has to be carried over.
      const [group, field] = key.split('.', 2);
      const existing = loadConfig() as any;
      const current = (existing[group] && typeof existing[group] === 'object') ? existing[group] : {};
      saveConfig({ [group]: { ...current, [field]: parseConfigValue(val) } } as any);
      console.log(`Config updated: ${key} = ${val}`);
    } else {
      saveConfig({ [key]: parseConfigValue(val) } as any);
      console.log(`Config updated: ${key} = ${val}`);
    }
    break;
  }

  default:
    console.log(`conduit-bridge v${CLI_VERSION}

Usage:
  conduit-bridge start [--port=31338] [--host=127.0.0.1] [--log-level=info]
                       [--auth-token=<token>] [--no-sandbox=true]
  conduit-bridge status
  conduit-bridge login <grok|claude|gemini|chatgpt|perplexity> [--local]
  conduit-bridge login <provider> --status | --cancel | --recheck
  conduit-bridge config [key] [value]        (dotted keys work: login.mode handoff)

API providers (no browser needed):
  Add credentials through the dashboard's write-only Settings form or through
  protected environment variables. Do not put credentials in command arguments.

Local providers (no key needed):
  lmstudio   start LM Studio's local server (set LM_STUDIO_URL to override http://127.0.0.1:1234)
  grok-cli   install the Grok CLI and run \`grok login\`

Security (secure by default):
  External binds require an auth token configured through a protected setup path.
  Chromium is asked to run sandboxed. Hosts that restrict unprivileged user
  namespaces cannot honour that; the bridge then reports the downgrade once
  instead of hiding it. To opt out explicitly, set CONDUIT_NO_SANDBOX=1, pass
  --no-sandbox=true, or set chromiumNoSandbox true in the config file.

Browser login:
  A login starts ordinary Chromium, attaches after launch, and provides a
  built-in viewer through port 31338. Conduit never completes a provider
  security check for you. It detects one and lets you finish it yourself.
`);
}

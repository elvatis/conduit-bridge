import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { BridgeConfig } from './types.js';
import { bearerAuthorization } from './config.js';

export interface CliOutput {
  log(msg: string): void;
  error(msg: string): void;
}

export const defaultCliOutput: CliOutput = {
  log: msg => console.log(msg),
  error: msg => console.error(msg),
};

export async function requestBridgeJson<T>(
  cfg: BridgeConfig,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const root = `http://${cfg.host}:${cfg.port}`;
  const url = new URL(`${root}${path}`);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...bearerAuthorization(cfg.authToken),
  };
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body) headers['Content-Type'] = 'application/json';

  return new Promise<T>((resolve, reject) => {
    const req = transport(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method || 'GET',
        headers,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) >= 400) {
            let message = raw || `HTTP ${res.statusCode}`;
            try {
              const err = JSON.parse(raw) as { error?: { message?: string } };
              if (err.error?.message) message = err.error.message;
            } catch {}
            return reject(new Error(message));
          }
          try {
            resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${raw}`));
          }
        });
      }
    );
    req.on('error', err => {
      if ((err as any).code === 'ECONNREFUSED') {
        reject(new Error(`conduit-bridge is not running on ${cfg.host}:${cfg.port}. Start it with 'conduit-bridge start'`));
      } else {
        reject(err);
      }
    });
    if (body) req.write(body);
    req.end();
  });
}

export async function handleRunCommand(
  cfg: BridgeConfig,
  prompt: string,
  flags: Record<string, string> = {},
  out: CliOutput = defaultCliOutput
): Promise<number> {
  if (!prompt || !prompt.trim()) {
    out.error('Usage: conduit-bridge run "<prompt>" [--mode=chat|plan|agent] [--model=<id>] [--workspace=<id>] [--allow-unconfined] [--rollback-on-failure] [--json]');
    return 1;
  }
  try {
    const mode = flags.mode || 'agent';
    const model = flags.model;
    const workspaceId = flags.workspace;
    const allowUnconfined = flags['allow-unconfined'] === 'true' || flags.allowUnconfined === 'true' || cfg.allowUnconfined === true;
    const rollbackOnFailure = flags['rollback-on-failure'] === 'true' || flags.rollbackOnFailure === 'true';
    const body: Record<string, any> = { prompt, mode };
    if (model) body.model = model;
    if (workspaceId) body.workspaceId = workspaceId;
    if (allowUnconfined) body.allowUnconfined = true;
    if (rollbackOnFailure) body.rollbackOnFailure = true;

    const res = await requestBridgeJson<{ run: { id: string; status: string; prompt?: string; mode?: string } }>(
      cfg,
      '/v1/platform/runs',
      { method: 'POST', body }
    );

    const runId = res.run?.id;
    if (flags.json) {
      out.log(JSON.stringify(res.run, null, 2));
      return 0;
    }

    out.log(`Run started: ${runId} [${res.run?.status || 'queued'}] (mode: ${mode})`);

    // Poll until complete or waiting_approval if not async
    if (flags.async !== 'true') {
      let lastStepCount = 0;
      let finished = false;
      const timeoutAt = Date.now() + 60000;
      while (!finished && Date.now() < timeoutAt) {
        await new Promise(r => setTimeout(r, 400));
        try {
          const check = await requestBridgeJson<{ run: any }>(cfg, `/v1/platform/runs/${encodeURIComponent(runId)}`);
          const r = check.run;
          const steps = r?.steps || [];
          if (steps.length > lastStepCount) {
            for (let i = lastStepCount; i < steps.length; i++) {
              const step = steps[i];
              out.log(`  Step ${step.iteration}: [${step.status}]`);
              if (step.content) {
                out.log(`    ${step.content.split('\n')[0]}`);
              }
            }
            lastStepCount = steps.length;
          }

          if (r?.status === 'waiting_approval') {
            out.log(`\n[WAITING APPROVAL] Run ${runId} is awaiting approval.`);
            out.log(`To approve: conduit-bridge runs approve ${runId}`);
            out.log(`To cancel:  conduit-bridge runs cancel ${runId}`);
            finished = true;
          } else if (r && ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status)) {
            out.log(`\nRun ${runId} finished with status: ${r.status}`);
            if (r.error) out.log(`Error: ${r.error}`);
            if (r.tokensConsumed) out.log(`Tokens: ${r.tokensConsumed} ($${(r.costUsd || 0).toFixed(4)})`);
            finished = true;
          }
        } catch {
          finished = true;
        }
      }
    }
    return 0;
  } catch (err: any) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

export async function handleRunsCommand(
  cfg: BridgeConfig,
  args: string[],
  flags: Record<string, string> = {},
  out: CliOutput = defaultCliOutput
): Promise<number> {
  const sub = args[0] || 'list';
  const targetId = args[1];
  const extra = args.slice(2).join(' ');

  try {
    if (sub === 'list') {
      const res = await requestBridgeJson<{ data: any[] }>(cfg, '/v1/platform/runs');
      const runs = res.data || [];
      if (flags.json) {
        out.log(JSON.stringify(runs, null, 2));
        return 0;
      }
      if (!runs.length) {
        out.log('No execution runs found.');
        return 0;
      }
      out.log(`${'ID'.padEnd(20)} ${'STATUS'.padEnd(18)} ${'MODEL'.padEnd(24)} ${'PROMPT'}`);
      out.log('-'.repeat(80));
      for (const r of runs) {
        const id = (r.id || '').padEnd(20);
        const status = (r.status || '').padEnd(18);
        const model = (r.input?.model || r.model || '-').slice(0, 22).padEnd(24);
        const prompt = (r.input?.prompt || r.prompt || '').replace(/\s+/g, ' ').slice(0, 36);
        out.log(`${id} ${status} ${model} ${prompt}`);
      }
      return 0;
    }

    if (sub === 'get') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs get <runId> [--json]');
        return 1;
      }
      const res = await requestBridgeJson<{ run: any }>(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}`);
      const r = res.run;
      if (flags.json) {
        out.log(JSON.stringify(r, null, 2));
        return 0;
      }
      out.log(`Run:    ${r.id}`);
      out.log(`Status: ${r.status}`);
      out.log(`Model:  ${r.input?.model || r.model || '-'}`);
      out.log(`Prompt: ${r.input?.prompt || r.prompt || '-'}`);
      out.log(`Tokens: ${r.tokensConsumed || 0} (Cost: $${(r.costUsd || 0).toFixed(4)})`);
      if (r.error) out.log(`Error:  ${r.error}`);
      if (r.steps && r.steps.length) {
        out.log('\nSteps:');
        for (const s of r.steps) {
          out.log(`  [Step ${s.iteration}] [${s.status}]`);
          if (s.content) out.log(`    Output: ${s.content.slice(0, 120)}`);
          if (s.events && s.events.length) {
            for (const ev of s.events) {
              if (ev.command) out.log(`    $ ${ev.command} [${ev.status || 'done'}]`);
            }
          }
        }
      }
      return 0;
    }

    if (sub === 'approve') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs approve <runId>');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}/actions`, {
        method: 'POST',
        body: { action: 'approve', operator: 'cli' },
      });
      out.log(`Run ${targetId} approved.`);
      return 0;
    }

    if (sub === 'cancel') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs cancel <runId>');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}/actions`, {
        method: 'POST',
        body: { action: 'cancel', operator: 'cli' },
      });
      out.log(`Run ${targetId} cancelled.`);
      return 0;
    }

    if (sub === 'continue') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs continue <runId> [follow-up feedback]');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}/actions`, {
        method: 'POST',
        body: { action: 'continue', feedback: extra || 'Continue execution', operator: 'cli' },
      });
      out.log(`Run ${targetId} continued.`);
      return 0;
    }

    if (sub === 'retry') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs retry <runId>');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}/actions`, {
        method: 'POST',
        body: { action: 'retry', operator: 'cli' },
      });
      out.log(`Run ${targetId} retried.`);
      return 0;
    }

    if (sub === 'rollback') {
      if (!targetId) {
        out.error('Usage: conduit-bridge runs rollback <runId>');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/runs/${encodeURIComponent(targetId)}/actions`, {
        method: 'POST',
        body: { action: 'rollback', operator: 'cli' },
      });
      out.log(`Run ${targetId} changes rolled back.`);
      return 0;
    }

    out.error(`Unknown runs command '${sub}'. Available: list, get, approve, cancel, continue, retry, rollback`);
    return 1;
  } catch (err: any) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

export async function handleSessionsCommand(
  cfg: BridgeConfig,
  args: string[],
  flags: Record<string, string> = {},
  out: CliOutput = defaultCliOutput
): Promise<number> {
  const sub = args[0] || 'list';
  const targetId = args[1];

  try {
    if (sub === 'list') {
      const res = await requestBridgeJson<{ data: any[] }>(cfg, '/v1/platform/sessions');
      const sessions = res.data || [];
      if (flags.json) {
        out.log(JSON.stringify(sessions, null, 2));
        return 0;
      }
      if (!sessions.length) {
        out.log('No chat sessions found.');
        return 0;
      }
      out.log(`${'ID'.padEnd(24)} ${'MODEL'.padEnd(24)} ${'TITLE'}`);
      out.log('-'.repeat(70));
      for (const s of sessions) {
        const id = (s.id || '').padEnd(24);
        const model = (s.model || '-').slice(0, 22).padEnd(24);
        const title = (s.title || 'Untitled').slice(0, 30);
        out.log(`${id} ${model} ${title}`);
      }
      return 0;
    }

    if (sub === 'get') {
      if (!targetId) {
        out.error('Usage: conduit-bridge sessions get <sessionId> [--json]');
        return 1;
      }
      const res = await requestBridgeJson<{ session: any }>(cfg, `/v1/platform/sessions/${encodeURIComponent(targetId)}`);
      const s = res.session;
      if (flags.json) {
        out.log(JSON.stringify(s, null, 2));
        return 0;
      }
      out.log(`Session: ${s.id} (${s.title || 'Untitled'})`);
      out.log(`Model:   ${s.model || '-'}`);
      out.log('-'.repeat(70));
      for (const msg of s.messages || []) {
        out.log(`[${(msg.role || '').toUpperCase()}] ${msg.content}\n`);
      }
      return 0;
    }

    if (sub === 'delete') {
      if (!targetId) {
        out.error('Usage: conduit-bridge sessions delete <sessionId>');
        return 1;
      }
      await requestBridgeJson(cfg, `/v1/platform/sessions/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      out.log(`Session ${targetId} deleted.`);
      return 0;
    }

    out.error(`Unknown sessions command '${sub}'. Available: list, get, delete`);
    return 1;
  } catch (err: any) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

export async function handleWorkspacesCommand(
  cfg: BridgeConfig,
  args: string[],
  flags: Record<string, string> = {},
  out: CliOutput = defaultCliOutput
): Promise<number> {
  const sub = args[0] || 'list';

  try {
    if (sub === 'list') {
      const res = await requestBridgeJson<{ data: any[] }>(cfg, '/v1/platform/workspaces');
      const workspaces = res.data || [];
      if (flags.json) {
        out.log(JSON.stringify(workspaces, null, 2));
        return 0;
      }
      if (!workspaces.length) {
        out.log('No registered workspaces found.');
        return 0;
      }
      out.log(`${'ID'.padEnd(20)} ${'DEFAULT'.padEnd(10)} ${'NAME'.padEnd(20)} ${'PATH'}`);
      out.log('-'.repeat(80));
      for (const w of workspaces) {
        const id = (w.id || '').padEnd(20);
        const def = (w.isDefault ? 'yes' : 'no').padEnd(10);
        const name = (w.name || w.id).padEnd(20);
        const path = w.path || '-';
        out.log(`${id} ${def} ${name} ${path}`);
      }
      return 0;
    }

    out.error(`Unknown workspaces command '${sub}'. Available: list`);
    return 1;
  } catch (err: any) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

export async function handleModelsCommand(
  cfg: BridgeConfig,
  args: string[],
  flags: Record<string, string> = {},
  out: CliOutput = defaultCliOutput
): Promise<number> {
  const sub = args[0] || 'list';

  try {
    if (sub === 'list') {
      const res = await requestBridgeJson<{ data: any[] }>(cfg, '/v1/models');
      const models = res.data || [];
      if (flags.json) {
        out.log(JSON.stringify(models, null, 2));
        return 0;
      }
      if (!models.length) {
        out.log('No models available. Connect a provider, then try again.');
        return 0;
      }
      out.log(`${'ID'.padEnd(32)} ${'NAME'}`);
      out.log('-'.repeat(60));
      for (const m of models) {
        const id = (m.id || '').padEnd(32);
        const name = m.display_name || m.name || m.id;
        out.log(`${id} ${name}`);
      }
      return 0;
    }

    out.error(`Unknown models command '${sub}'. Available: list`);
    return 1;
  } catch (err: any) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

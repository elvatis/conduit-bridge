import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  handleRunCommand,
  handleRunsCommand,
  handleSessionsCommand,
  handleWorkspacesCommand,
  handleModelsCommand,
  type CliOutput,
} from '../src/cli-commands.js';
import type { BridgeConfig } from '../src/types.js';

describe('CLI scriptable subcommands', () => {
  let server: Server;
  let port: number;
  let calls: Array<{ method: string; path: string; body?: any }> = [];

  function makeOutput(): { logs: string[]; errors: string[]; out: CliOutput } {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      logs,
      errors,
      out: {
        log: (msg: string) => logs.push(msg),
        error: (msg: string) => errors.push(msg),
      },
    };
  }

  function cfg(): BridgeConfig {
    return {
      host: '127.0.0.1',
      port,
      authToken: 'secret-token',
    } as BridgeConfig;
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        const body = data ? JSON.parse(data) : undefined;
        calls.push({ method: req.method || 'GET', path: req.url || '/', body });

        if (req.url === '/v1/platform/runs' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            run: {
              id: 'run-test-1',
              status: 'completed',
              mode: body?.mode || 'agent',
              steps: [{ iteration: 1, status: 'completed', content: 'Step 1 complete' }],
            },
          }));
          return;
        }
        if (req.url === '/v1/platform/runs/run-test-1' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            run: {
              id: 'run-test-1',
              status: 'completed',
              tokensConsumed: 120,
              costUsd: 0.005,
              steps: [{ iteration: 1, status: 'completed', content: 'Finished work cleanly' }],
            },
          }));
          return;
        }
        if (req.url === '/v1/platform/runs' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: [
              { id: 'run-test-1', status: 'completed', input: { model: 'cli-codex/sol', prompt: 'Audit vulnerabilities' }, costUsd: 0.005 },
            ],
          }));
          return;
        }
        if (req.url?.startsWith('/v1/platform/runs/run-test-1/actions') && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ run: { id: 'run-test-1', status: 'running' } }));
          return;
        }
        if (req.url === '/v1/platform/sessions' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: [{ id: 'sess-abc', title: 'CLI Chat Session', model: 'cli-codex/sol' }] }));
          return;
        }
        if (req.url === '/v1/platform/sessions/sess-abc' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            session: {
              id: 'sess-abc',
              title: 'CLI Chat Session',
              model: 'cli-codex/sol',
              messages: [{ role: 'user', content: 'Fix the imports' }, { role: 'assistant', content: 'Imports fixed' }],
            },
          }));
          return;
        }
        if (req.url === '/v1/platform/sessions/sess-abc' && req.method === 'DELETE') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.url === '/v1/platform/workspaces' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: [{ id: 'ws-root', name: 'main-repo', path: 'C:/repo', isDefault: true }] }));
          return;
        }
        if (req.url === '/v1/models' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: [{ id: 'cli-codex/gpt-5.6-sol', display_name: 'Codex Sol' }] }));
          return;
        }

        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  beforeEach(() => {
    calls = [];
  });

  describe('conduit-bridge run', () => {
    it('executes a run and displays status', async () => {
      const { logs, errors, out } = makeOutput();
      const code = await handleRunCommand(cfg(), 'Refactor API router', { mode: 'plan', model: 'cli-codex/sol' }, out);
      expect(code).toBe(0);
      expect(errors).toEqual([]);
      expect(logs.some(l => l.includes('Run started: run-test-1'))).toBe(true);
      expect(logs.some(l => l.includes('Run run-test-1 finished with status: completed'))).toBe(true);
      expect(calls.some(c => c.method === 'POST' && c.path === '/v1/platform/runs' && c.body.mode === 'plan')).toBe(true);
    });

    it('supports --json flag', async () => {
      const { logs, errors, out } = makeOutput();
      const code = await handleRunCommand(cfg(), 'Analyze repo', { json: 'true' }, out);
      expect(code).toBe(0);
      expect(errors).toEqual([]);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.id).toBe('run-test-1');
    });

    it('rejects empty prompt with error usage', async () => {
      const { logs, errors, out } = makeOutput();
      const code = await handleRunCommand(cfg(), '   ', {}, out);
      expect(code).toBe(1);
      expect(errors[0]).toMatch(/Usage:/);
    });
  });

  describe('conduit-bridge runs', () => {
    it('lists runs in formatted table or json', async () => {
      const { logs, out } = makeOutput();
      const code = await handleRunsCommand(cfg(), ['list'], {}, out);
      expect(code).toBe(0);
      expect(logs.some(l => l.includes('run-test-1'))).toBe(true);
      expect(logs.some(l => l.includes('Audit vulnerabilities'))).toBe(true);

      const jsonOut = makeOutput();
      await handleRunsCommand(cfg(), ['list'], { json: 'true' }, jsonOut.out);
      const parsed = JSON.parse(jsonOut.logs[0]);
      expect(parsed[0].id).toBe('run-test-1');
    });

    it('gets run detail with steps and token metrics', async () => {
      const { logs, out } = makeOutput();
      const code = await handleRunsCommand(cfg(), ['get', 'run-test-1'], {}, out);
      expect(code).toBe(0);
      expect(logs.some(l => l.includes('Run:    run-test-1'))).toBe(true);
      expect(logs.some(l => l.includes('Tokens: 120 (Cost: $0.0050)'))).toBe(true);
      expect(logs.some(l => l.includes('Finished work cleanly'))).toBe(true);
    });

    it('executes run actions: approve, cancel, continue, retry', async () => {
      const app = makeOutput();
      expect(await handleRunsCommand(cfg(), ['approve', 'run-test-1'], {}, app.out)).toBe(0);
      expect(app.logs[0]).toBe('Run run-test-1 approved.');
      expect(calls.some(c => c.method === 'POST' && c.body.action === 'approve')).toBe(true);

      const can = makeOutput();
      expect(await handleRunsCommand(cfg(), ['cancel', 'run-test-1'], {}, can.out)).toBe(0);
      expect(can.logs[0]).toBe('Run run-test-1 cancelled.');
      expect(calls.some(c => c.method === 'POST' && c.body.action === 'cancel')).toBe(true);

      const cont = makeOutput();
      expect(await handleRunsCommand(cfg(), ['continue', 'run-test-1', 'extra feedback'], {}, cont.out)).toBe(0);
      expect(cont.logs[0]).toBe('Run run-test-1 continued.');
      expect(calls.some(c => c.method === 'POST' && c.body.action === 'continue' && c.body.feedback === 'extra feedback')).toBe(true);

      const ret = makeOutput();
      expect(await handleRunsCommand(cfg(), ['retry', 'run-test-1'], {}, ret.out)).toBe(0);
      expect(ret.logs[0]).toBe('Run run-test-1 retried.');
      expect(calls.some(c => c.method === 'POST' && c.body.action === 'retry')).toBe(true);

      const roll = makeOutput();
      expect(await handleRunsCommand(cfg(), ['rollback', 'run-test-1'], {}, roll.out)).toBe(0);
      expect(roll.logs[0]).toBe('Run run-test-1 changes rolled back.');
      expect(calls.some(c => c.method === 'POST' && c.body.action === 'rollback')).toBe(true);
    });

    it('passes rollbackOnFailure flag on conduit-bridge run', async () => {
      const { out } = makeOutput();
      const code = await handleRunCommand(cfg(), 'Analyze repo', { 'rollback-on-failure': 'true' }, out);
      expect(code).toBe(0);
      expect(calls.some(c => c.method === 'POST' && c.path === '/v1/platform/runs' && c.body.rollbackOnFailure === true)).toBe(true);
    });
  });

  describe('conduit-bridge sessions', () => {
    it('lists, gets, and deletes chat sessions', async () => {
      const list = makeOutput();
      expect(await handleSessionsCommand(cfg(), ['list'], {}, list.out)).toBe(0);
      expect(list.logs.some(l => l.includes('sess-abc') && l.includes('CLI Chat Session'))).toBe(true);

      const get = makeOutput();
      expect(await handleSessionsCommand(cfg(), ['get', 'sess-abc'], {}, get.out)).toBe(0);
      expect(get.logs.some(l => l.includes('[USER] Fix the imports'))).toBe(true);
      expect(get.logs.some(l => l.includes('[ASSISTANT] Imports fixed'))).toBe(true);

      const del = makeOutput();
      expect(await handleSessionsCommand(cfg(), ['delete', 'sess-abc'], {}, del.out)).toBe(0);
      expect(del.logs[0]).toBe('Session sess-abc deleted.');
      expect(calls.some(c => c.method === 'DELETE' && c.path === '/v1/platform/sessions/sess-abc')).toBe(true);
    });
  });

  describe('conduit-bridge workspaces and models', () => {
    it('lists registered workspaces', async () => {
      const { logs, out } = makeOutput();
      expect(await handleWorkspacesCommand(cfg(), ['list'], {}, out)).toBe(0);
      expect(logs.some(l => l.includes('ws-root') && l.includes('main-repo'))).toBe(true);
    });

    it('lists available models', async () => {
      const { logs, out } = makeOutput();
      expect(await handleModelsCommand(cfg(), ['list'], {}, out)).toBe(0);
      expect(logs.some(l => l.includes('cli-codex/gpt-5.6-sol') && l.includes('Codex Sol'))).toBe(true);
    });
  });

  describe('offline error handling', () => {
    it('returns clean error when daemon is not running', async () => {
      const offlineCfg: BridgeConfig = { host: '127.0.0.1', port: 61999 } as BridgeConfig;
      const { errors, out } = makeOutput();
      const code = await handleRunsCommand(offlineCfg, ['list'], {}, out);
      expect(code).toBe(1);
      expect(errors[0]).toMatch(/conduit-bridge is not running on 127\.0\.0\.1:61999/);
    });
  });
});

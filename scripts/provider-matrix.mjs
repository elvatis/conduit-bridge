#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { loadDefinitions, waitForRun, validateCompletedExample } from './demo-pipelines.mjs';
import { loopbackAuthorization } from './loopback-auth.mjs';

export function matrixOptions(args) {
  const options = { baseUrl: 'http://127.0.0.1:31338', allowAgentWrites: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') return { help: true };
    if (key === '--allow-agent-writes') { options.allowAgentWrites = true; continue; }
    if (!['--models', '--workspace-parent', '--base-url'].includes(key) || !args[i + 1]) throw new Error('Unknown or incomplete matrix option: ' + key);
    const value = args[++i];
    if (key === '--models') options.models = value.split(',');
    if (key === '--workspace-parent') options.workspaceParent = resolve(value);
    if (key === '--base-url') options.baseUrl = value;
  }
  const url = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('The matrix requires a loopback origin without credentials or a path');
  options.baseUrl = url.origin;
  if (!Array.isArray(options.models) || options.models.length !== 4 || new Set(options.models.map(id => id.split('/')[0])).size !== 4 || options.models.some(id => !/^cli-(claude|codex|gemini|grok)\/.+/.test(id))) throw new Error('Select exactly one model for each of cli-claude, cli-codex, cli-gemini and cli-grok using --models');
  if (!options.allowAgentWrites) throw new Error('Add --allow-agent-writes to authorize the four fresh-workspace file examples');
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = matrixOptions(args);
  if (options.help) {
    console.log('Usage: node scripts/provider-matrix.mjs --models cli-claude/<model>,cli-codex/<model>,cli-gemini/<model>,cli-grok/<model> --allow-agent-writes [--workspace-parent <directory>] [--base-url <loopback-origin>]\nRuns real conversation handoffs, two-iteration loops and write/read pipelines. Uses your providers and their normal allowances. Creates and retains fresh workspaces, profiles, runs and an encrypted retained conversation. Set CONDUIT_AUTH_TOKEN if required.');
    return;
  }
  const client = async (path, body) => {
    const response = await fetch(options.baseUrl + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...loopbackAuthorization() }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    const json = await response.json();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${json.error?.message || response.statusText}`);
    return json;
  };
  const available = (await client('/v1/platform/models')).data;
  for (const model of options.models) if (!available.some(m => m.id === model)) throw new Error('Model not advertised: ' + model);
  await mkdir(options.workspaceParent || tmpdir(), { recursive: true });
  const workspace = await mkdtemp(join(options.workspaceParent || tmpdir(), 'conduit-matrix-'));
  const suffix = randomUUID().slice(0, 8);
  const report = { version: 1, startedAt: new Date().toISOString(), models: options.models, cases: [], workspace };
  const save = () => writeFile(join(workspace, 'provider-matrix-results.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const attempt = async (provider, name, operation) => {
    const started = Date.now();
    console.log(`${provider} / ${name}: running`);
    try { const evidence = await operation(); report.cases.push({ provider, name, passed: true, durationMs: Date.now() - started, evidence }); console.log(`${provider} / ${name}: PASS`); }
    catch (error) { report.cases.push({ provider, name, passed: false, durationMs: Date.now() - started, error: error.message }); console.error(`${provider} / ${name}: FAIL: ${error.message}`); }
    await save();
  };
  const session = (await client('/v1/platform/sessions', { title: `Four-provider handoff ${suffix}`, retention: 'retained', model: options.models[0] })).session;
  report.sessionId = session.id;
  let initialized = false;
  for (const model of options.models) {
    const provider = model.split('/')[0];
    await attempt(provider, 'conversation-handoff', async () => {
      const result = await client(`/v1/platform/sessions/${session.id}/messages`, { model, content: initialized ? 'What was the codeword in the first user turn? Reply with only that codeword. Do not use tools.' : 'Remember this synthetic codeword for this conversation: PINE42. Reply with only PINE42. Do not use tools.', maxOutputTokens: 64, effort: 'low' });
      const answer = result.assistantMessage?.content || '';
      if (answer.trim() !== 'PINE42') throw new Error('The returned answer did not preserve the conversation codeword: ' + answer);
      initialized = true;
      return { answer, sessionId: session.id, messageCount: result.session.messages.length, actualProvider: result.assistantMessage.provider, actualModel: result.assistantMessage.model, selectedContextMessages: result.context.selectedMessageIds.length };
    });
    await attempt(provider, 'bounded-repair-loop', async () => {
      const profile = (await client('/v1/platform/profiles', { name: `${provider} matrix ${suffix}`, provider, model, maxConcurrent: 1, cooldownMs: 1000, defaultEffort: 'low' })).profile;
      const run = (await client('/v1/platform/runs', { prompt: 'This is a synthetic two-iteration test. If there is no previous assistant result, reply with exactly NEEDS_REVIEW. If a previous assistant result is present and you are asked to review it, reply with exactly MATRIX_DONE. Do not use tools.', model, profileId: profile.id, maxIterations: 2, successPattern: 'MATRIX_DONE', maxOutputTokens: 128, maxTokens: 5000, maxCostUsd: 0.2, maxDurationMs: 120000, idempotencyKey: `${suffix}:${provider}:loop` })).run;
      let current = run;
      const deadline = Date.now() + 150000;
      while (['queued', 'running'].includes(current.status) && Date.now() < deadline) { await delay(750); current = (await client(`/v1/platform/runs/${run.id}`)).run; }
      if (['queued', 'running'].includes(current.status)) await client(`/v1/platform/runs/${run.id}/actions`, { action: 'cancel' });
      if (current.status !== 'completed' || current.steps.length !== 2 || !current.steps[1].content?.includes('MATRIX_DONE')) throw new Error(`Expected two completed iterations: ${current.status}, steps=${current.steps.length}, ${current.error || current.stopReason || ''}`);
      return current;
    });
    await attempt(provider, 'agent-write-read-verification', async () => {
      const scratch = await mkdtemp(join(workspace, `${provider}-`));
      const id = `${suffix}-${provider}`;
      await client('/v1/workspaces', { path: scratch, name: `${provider} file matrix ${suffix}` });
      const [definition] = await loadDefinitions({ cases: ['community-write'], model, peerModel: model }, id);
      await client('/v1/pipelines', definition);
      await client('/v1/repositories', { id: `matrix-${id}`, name: `${provider} matrix`, path: scratch, defaultWorkspace: scratch, enabledPipelines: [definition.id] });
      const run = (await client('/v1/pipelines/run', { pipelineId: definition.id, prompt: 'Perform this short isolated community file test.', workingDirectory: scratch, repository: `matrix-${id}` })).run;
      const result = await waitForRun(client, run, { approveDemo: false });
      validateCompletedExample('community-write', result);
      const file = (await readFile(join(scratch, 'hello.txt'), 'utf8')).trim();
      if (file !== 'Hello, Conduit community!') throw new Error('The actual file did not contain the expected line');
      return { run: result.run, file };
    });
  }
  report.completedAt = new Date().toISOString(); report.passed = report.cases.every(test => test.passed); await save();
  console.log(`Report: ${join(workspace, 'provider-matrix-results.json')}`);
  if (!report.passed) throw new Error('Provider matrix has failures. Inspect the per-provider evidence; no fallback was substituted.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });

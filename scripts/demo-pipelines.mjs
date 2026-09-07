#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const EXAMPLES = ['community-write', 'community-approval', 'community-debate'];
const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../examples/pipelines');

export function parseOptions(args) {
  const options = { baseUrl: 'http://127.0.0.1:31338', approveDemo: false, allowWriteDemo: false, cases: EXAMPLES };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--approve-demo') { options.approveDemo = true; continue; }
    if (argument === '--allow-write-demo') { options.allowWriteDemo = true; continue; }
    if (!['--model', '--peer-model', '--base-url', '--workspace-parent', '--case'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    if (argument === '--model') options.model = value;
    if (argument === '--peer-model') options.peerModel = value;
    if (argument === '--base-url') options.baseUrl = value;
    if (argument === '--workspace-parent') options.workspaceParent = resolve(value);
    if (argument === '--case') {
      if (!EXAMPLES.includes(value)) throw new Error(`Unknown case: ${value}`);
      options.cases = [value];
    }
  }
  if (!options.model) throw new Error('Choose an explicit --model from GET /v1/models. Use --help for examples.');
  options.peerModel ||= options.model;
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
    throw new Error('--base-url must be a loopback HTTP(S) origin without credentials, path or query.');
  }
  options.baseUrl = base.origin;
  if (options.cases.includes('community-write') && ![options.model, options.peerModel].every(model => model.startsWith('cli-'))) {
    throw new Error('The write-and-verify demo needs CLI models with filesystem tools. Choose --case community-debate for inference-only models.');
  }
  if (options.cases.includes('community-write') && !options.allowWriteDemo) {
    throw new Error('Add --allow-write-demo to authorize the agent file example, or select --case community-debate. A working directory is not an OS sandbox.');
  }
  return options;
}

export async function loadDefinitions(options, suffix) {
  return Promise.all(options.cases.map(async name => {
    const definition = JSON.parse(await readFile(join(fixtureDirectory, `${name}.json`), 'utf8'));
    definition.id = `${definition.id}-${suffix}`;
    for (const step of definition.steps) {
      step.model = step.model === '{{peer_model}}' ? options.peerModel : options.model;
    }
    return definition;
  }));
}

function createClient(baseUrl, token) {
  return async (path, body) => {
    const response = await fetch(baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error?.message || 'request failed'}`);
    return data;
  };
}

export async function waitForRun(client, run, options, onTransition = console.log) {
  const deadline = Date.now() + 240000;
  let previousState = '';
  let sawApproval = false;
  while (Date.now() < deadline) {
    const state = [run.status, ...Object.values(run.stepResults || {}).map(step => `${step.stepId}:${step.status}`)].join(' | ');
    if (state !== previousState) { onTransition(`${run.pipelineName}: ${state}`); previousState = state; }
    if (run.status === 'waiting_approval') {
      sawApproval = true;
      const step = run.stepResults[run.pendingApprovalStepId];
      if (!step || step.status !== 'waiting_approval' || step.content) throw new Error('Approval step ran before authorization.');
      if (!options.approveDemo) {
        onTransition(`Paused as designed. Approve run ${run.id} in the dashboard, or use --approve-demo for this scripted example.`);
        return { run, sawApproval };
      }
      run = (await client('/v1/pipelines/runs/action', {
        runId: run.id, action: 'approve', stepId: run.pendingApprovalStepId,
        feedback: 'Explicitly approved this short synthetic community example via --approve-demo.',
        operator: 'community-demo-script',
      })).run;
      continue;
    }
    if (run.status !== 'running') return { run, sawApproval };
    await delay(1500);
    run = (await client(`/v1/pipelines/runs/${encodeURIComponent(run.id)}`)).run;
  }
  await client('/v1/pipelines/runs/action', { runId: run.id, action: 'cancel' }).catch(() => {});
  throw new Error(`Timed out waiting for ${run.id}; cancellation requested.`);
}

export function validateCompletedExample(name, result) {
  const { run, sawApproval } = result;
  if (run.status !== 'completed') {
    const errors = Object.values(run.stepResults || {}).filter(step => step.error).map(step => `${step.stepId}: ${step.error}`).join('; ');
    throw new Error(`${name} ended ${run.status}${errors ? ` (${errors})` : ''}`);
  }
  for (const step of Object.values(run.stepResults || {})) {
    if (step.status !== 'completed' || !step.content?.trim() || !step.startedAt || !step.completedAt) {
      throw new Error(`${name}: ${step.stepId} is missing a real completed execution/result.`);
    }
  }
  if (name === 'community-approval' && (!sawApproval || !run.stepResults.final.content.includes('APPROVED:'))) {
    throw new Error('Approval example did not demonstrate pause followed by the approved response.');
  }
  if (name === 'community-write' && !run.stepResults.verify.content.includes('VERIFIED')) {
    throw new Error('The read-only peer did not verify the greeting file.');
  }
  if (name === 'community-debate') {
    const { quickstart, architecture, synthesis } = run.stepResults;
    if (!quickstart || !architecture || !synthesis || synthesis.startedAt < Math.max(quickstart.completedAt, architecture.completedAt)) {
      throw new Error('Debate synthesis started before both independent perspectives completed.');
    }
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log(`Run three short, real Conduit pipeline examples against an already-running local bridge.

Usage:
  node scripts/demo-pipelines.mjs --model <model-id> --allow-write-demo [--peer-model <model-id>] [--approve-demo]

Options:
  --model              Explicit model ID from GET /v1/models (required).
  --peer-model         A second model for the peer/debate (defaults to --model).
  --approve-demo       Submit approval for the known synthetic final-text step.
  --allow-write-demo   Authorize the agent to create the demonstration file.
  --case               community-write | community-approval | community-debate
  --workspace-parent  Create a NEW demo directory beneath this existing/created directory.
  --base-url           Local bridge origin (default http://127.0.0.1:31338).

Set CONDUIT_AUTH_TOKEN if the bridge requires authentication. The first example
allows an agent to create hello.txt in a fresh workspace. A working directory
is not an OS sandbox; CLI agent permissions still apply. The runner registers
unique demo pipelines/repository/workspace entries and retains them and results
for inspection. It never changes provider permissions, budgets or credentials.`);
    return;
  }
  const client = createClient(options.baseUrl, process.env.CONDUIT_AUTH_TOKEN?.trim());
  const catalog = (await client('/v1/models')).data || [];
  for (const model of new Set([options.model, options.peerModel])) {
    if (!catalog.some(entry => entry.id === model)) throw new Error(`Model is not advertised by this bridge: ${model}`);
  }
  const parent = options.workspaceParent || tmpdir();
  await mkdir(parent, { recursive: true });
  const workspace = await mkdtemp(join(parent, 'conduit-community-'));
  const suffix = randomUUID().slice(0, 8);
  const repository = `community-demo-${suffix}`;
  const definitions = await loadDefinitions(options, suffix);
  const report = { startedAt: new Date().toISOString(), models: [options.model, options.peerModel], workspace, repository, results: [] };
  const reportPath = join(workspace, 'demo-results.json');
  const saveReport = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(`Demo workspace: ${workspace}`);
  console.log('Uses your selected providers and their normal subscription/API allowances.');
  let activeRun;
  try {
    await client('/v1/workspaces', { path: workspace, name: `Community demo ${suffix}` });
    await client('/v1/repositories', {
      id: repository, name: `Community examples ${suffix}`, path: workspace, defaultWorkspace: workspace,
      enabledPipelines: definitions.map(definition => definition.id),
    });
    for (const definition of definitions) await client('/v1/pipelines', definition);
    const before = await client('/v1/metrics');
    for (let index = 0; index < definitions.length; index++) {
      const definition = definitions[index];
      const name = options.cases[index];
      activeRun = (await client('/v1/pipelines/run', {
        pipelineId: definition.id, prompt: 'Run this short synthetic community demonstration.',
        repository, workingDirectory: workspace,
      })).run;
      const result = await waitForRun(client, activeRun, options);
      activeRun = result.run;
      report.results.push({ example: name, ...result });
      await saveReport();
      if (result.run.status === 'waiting_approval' && !options.approveDemo) continue;
      validateCompletedExample(name, result);
      if (name === 'community-write') {
        const actual = (await readFile(join(workspace, 'hello.txt'), 'utf8')).trim();
        if (actual !== 'Hello, Conduit community!') throw new Error('On-disk hello.txt did not match the expected greeting.');
      }
      console.log(`PASS ${name}: ${Object.keys(result.run.stepResults).length} executed steps`);
      activeRun = undefined;
    }
    report.metricsBefore = before;
    report.metricsAfter = await client('/v1/metrics');
    report.completedAt = new Date().toISOString();
    await saveReport();
    console.log(`Results saved to ${reportPath}`);
    console.log('Open Pipelines in the dashboard to inspect the runs, outputs and approval decision.');
  } catch (error) {
    if (activeRun?.status === 'running') {
      await client('/v1/pipelines/runs/action', { runId: activeRun.id, action: 'cancel' }).catch(() => {});
    }
    report.error = error.message;
    await saveReport();
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

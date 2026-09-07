import { describe, expect, it, vi } from 'vitest';
import { createContext, runInContext, Script } from 'node:vm';
import { DASHBOARD_HTML } from '../src/dashboard.js';

// Execute the shipped browser script without a browser dependency. Elements retain
// observable content and handlers; layout is verified separately in browser QA.
function dashboard() {
  const elements = new Map<string, any>();
  const element = (id: string): any => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', innerHTML: '', textContent: '', className: '', style: {}, dataset: {},
      listeners: new Map(), classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(event: string, handler: unknown) { this.listeners.set(event, handler); },
      querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {},
    });
    return elements.get(id);
  };
  const timers: Array<() => void> = [];
  const requests: string[] = [];
  const stored = new Map();
  const context = createContext({
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, hidden: false },
    sessionStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) },
    localStorage: { getItem: () => null },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    setInterval() {}, console, alert: vi.fn(),
    fetch: async (path: string) => { requests.push(path); return { ok: true, status: 200, json: async () => ({ data: [] }) }; },
  });
  const script = DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
  // These are startup effects only; test the unmodified function bodies/handlers.
  const source = script.replace(/^  (?:refresh\(\)|connectEvents\(\)|browseDirectory\(''\));$/gm, '');
  new Script(source).runInContext(context);
  return { element, timers, requests, stored, run: (code: string) => runInContext(code, context) };
}

describe('dashboard browser contracts', () => {
  it('uses budget usage and hardStop fields, preserving dirty controls on background updates', () => {
    const ui = dashboard();
    ui.run(`renderBudgets({config:{dailyBudgetUsd:10,monthlyBudgetUsd:100,hardStop:false},usage:{currentDailyCostUsd:8.5,currentMonthlyCostUsd:20}})`);
    expect(ui.element('daily-budget-text').textContent).toBe('$8.50 / $10.00 (85%)');
    expect(ui.element('daily-budget-fill').className).toBe('budget-fill warn');
    expect(ui.element('cfg-hard-stop').value).toBe('false');
    ui.element('cfg-daily-budget').value = '42';
    ui.run(`dirtySections.add('budgets-section'); renderBudgets({config:{dailyBudgetUsd:10},usage:{currentDailyCostUsd:9}})`);
    expect(ui.element('cfg-daily-budget').value).toBe('42');
    expect(ui.element('daily-budget-text').textContent).toContain('$9.00');
  });

  it('renders the server analytics contract with accessible model names and reported usage', () => {
    const ui = dashboard();
    ui.run(`renderAnalyticsCharts({models:[{model:'provider/long<name>',requests:3,avgLatencyMs:42,inputTokens:20,outputTokens:10}],totals:{costUsd:0.123},pipelines:{totalRuns:2,rejected:1,cancelled:1}})`);
    const chart = ui.element('chart-requests-container').innerHTML;
    expect(chart).toContain('provider/long&lt;name&gt;: 3 requests; average latency 42 ms');
    expect(chart).toContain('aria-hidden="true"');
    expect(ui.element('chart-cost-container').innerHTML).toContain('$0.123000');
    expect(ui.element('chart-cost-container').innerHTML).toContain('Input: <strong>20</strong>');
    expect(ui.element('chart-pipelines-container').innerHTML).toContain('>2</div>');
  });

  it('recovers pending approval from saved run selection and keeps feedback during updates', () => {
    const ui = dashboard();
    ui.run(`selectedRunId = 'run-1'; renderPipelineRuns([{id:'run-1',pipelineId:'p',pipelineName:'Review',initialPrompt:'<demo>',startedAt:1,status:'waiting_approval',pendingApprovalStepId:'check',stepResults:{check:{stepName:'Review',status:'waiting_approval'}}}])`);
    expect(ui.element('pipeline-approvals').innerHTML).toContain('data-view-run="run-1"');
    expect(ui.element('pipe-live-status').innerHTML).toContain('Approve & Resume');
    expect(ui.element('pipelines-history').innerHTML).toContain('&lt;demo&gt;');
    ui.element('checkpoint-feedback').value = 'Keep it short';
    ui.run(`renderLiveRun({...activePipelineRun,updatedAt:2})`);
    expect(ui.element('checkpoint-feedback').value).toBe('Keep it short');
    expect(ui.stored.get('conduit-selected-run')).toBe('run-1');
  });

  it('coalesces activity bursts and only fetches the active pipeline page', async () => {
    const ui = dashboard();
    ui.run(`activeSection = 'pipelines'; for(let i=0;i<100;i++) scheduleLiveRefresh()`);
    expect(ui.timers).toHaveLength(1);
    ui.timers[0]();
    await vi.waitFor(() => expect(ui.requests).toEqual(['/v1/pipelines/runs']));
  });

  it('explains interrupted summaries and keeps them out of the approval inbox', () => {
    const ui = dashboard();
    ui.run(`selectedRunId = 'old-run'; renderPipelineRuns([{id:'old-run',pipelineId:'p',pipelineName:'Review',initialPrompt:'',startedAt:1,status:'interrupted',error:'Bridge restarted; private execution context is not persisted.',stepResults:{}}])`);
    expect(ui.element('pipeline-approvals').innerHTML).toContain('No approvals pending');
    expect(ui.element('pipe-live-status').innerHTML).toContain('This run cannot resume after the service restarts');
    expect(ui.element('pipe-live-status').innerHTML).toContain('Prepare a new run');
    expect(ui.element('pipe-live-status').innerHTML).not.toContain('Approve & Resume');
  });

  it('does not replace edited provider policies or API-key forms', () => {
    const ui = dashboard();
    ui.element('agent-policy-list').innerHTML = 'draft policy';
    ui.element('settings-keys').innerHTML = 'draft credential';
    ui.run(`dirtySections.add('agent-controls-section'); dirtySections.add('settings-section'); renderAgentPolicies({policies:{}}); renderSettings({apiKeys:{}})`);
    expect(ui.element('agent-policy-list').innerHTML).toBe('draft policy');
    expect(ui.element('settings-keys').innerHTML).toBe('draft credential');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createContext, runInContext, Script } from 'node:vm';
import { DASHBOARD_HTML } from '../src/dashboard.js';

// Execute the shipped browser script without a browser dependency. Elements retain
// observable content and handlers; layout is verified separately in browser QA.
function dashboard(lang = 'en') {
  const elements = new Map<string, any>();
  const element = (id: string): any => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', innerHTML: '', textContent: '', className: '', style: {}, dataset: {},
      listeners: new Map(), classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(event: string, handler: unknown) { this.listeners.set(event, handler); },
      setAttribute() {},
      querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, focus() {},
    });
    return elements.get(id);
  };
  const timers: Array<() => void> = [];
  const requests: string[] = [];
  const stored = new Map();
  const context = createContext({
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {}, documentElement: { lang }, readyState: 'loading', hidden: false },
    sessionStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) },
    localStorage: { getItem: (key: string) => key === 'conduit_lang' ? lang : stored.get(key), setItem: (key: string, value: string) => stored.set(key,value) },
    window: { addEventListener() {} }, MutationObserver: class { observe() {} }, queueMicrotask() {},
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; },
    setInterval() {}, console, alert: vi.fn(),
    fetch: async (path: string) => { requests.push(path); return { ok: true, status: 200, json: async () => ({ data: [] }) }; },
  });
  const script = Array.from(DASHBOARD_HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi), match => match[1]).join('\n');
  // These are startup effects only; test the unmodified function bodies/handlers.
  const source = script.replace(/^  (?:refresh\(\)|connectEvents\(\)|browseDirectory\(''\));$/gm, '');
  new Script(source).runInContext(context);
  return { element, timers, requests, stored, run: (code: string) => runInContext(code, context) };
}

describe('dashboard browser contracts', () => {
  it('isolates sample execution, renders inspectable evidence and escapes command output', async () => {
    const ui = dashboard();
    ui.run(`activeSection = 'execution'; exPreview(true)`);
    expect(ui.element('ex-preview-banner').hidden).toBe(false);
    expect(ui.element('ex-send').disabled).toBe(true);
    expect(ui.element('ex-plan-content').innerHTML).toContain('1 / 5');
    expect(ui.element('ex-feed').innerHTML).toContain('rg --files src/ui');
    expect(ui.element('ex-feed').innerHTML).toContain('exit 0');
    await ui.run('executionRefresh(); exSubmit(); exRunAction("approve")');
    expect(ui.requests).toEqual([]);
    const command = ui.run(`exCommandCard({command:'echo <script>alert(1)</script>',stdout:'<img src=x onerror=alert(1)>',stderr:'<error>',startedAt:1,completedAt:1001,exitCode:1},0)`);
    expect(command).not.toContain('<script>');
    expect(command).not.toContain('<img');
    expect(command).toContain('&lt;error&gt;');
  });

  it('filters by project, pin and active state, and uses streamed checklist evidence', () => {
    const ui = dashboard();
    ui.run(`exState.runs = [{kind:'agent',run:{id:'a',prompt:'First',status:'completed',createdAt:1,input:{workingDirectory:'/one'},steps:[]}},{kind:'agent',run:{id:'b',prompt:'Second',status:'running',createdAt:2,input:{workingDirectory:'/two'},steps:[{iteration:1,status:'running',events:[{kind:'plan',id:'plan',items:[{text:'Read source',completed:true},{text:'Run tests',completed:false}]}]}]}}]; exState.pinned.add('agent:a')`);
    expect(ui.run('exFilterTasks(exState.runs, "").map(exKey)')).toEqual(['agent:a', 'agent:b']);
    ui.element('ex-group').value = 'active';
    expect(ui.run('exFilterTasks(exState.runs, "").map(exKey)')).toEqual(['agent:b']);
    ui.element('ex-project').value = '/one';
    expect(ui.run('exFilterTasks(exState.runs, "")')).toEqual([]);
    ui.run('exState.selected = exState.runs[1]; exRenderPlan()');
    expect(ui.element('ex-plan-content').innerHTML).toContain('1 / 2');
    expect(ui.element('ex-plan-content').innerHTML).toContain('Run tests');
  });

  it('sends selected effort, scope, workspace and explicit approval without losing a failed draft', async () => {
    const ui = dashboard();
    ui.run(`exState.operator = {role:'operator'}; exState.workspaces = [{id:'w',path:'/work'}]; let exSent; pfApi = async (path,body) => { exSent = {path,body}; throw new Error('Queue unavailable'); }`);
    for (const [id, value] of Object.entries({ 'ex-prompt':'Check the task', 'ex-model':'cli-codex/test', 'ex-mode':'plan', 'ex-workspace':'w', 'ex-iterations':'2', 'ex-duration':'120', 'ex-cost':'0.5' })) ui.element(id).value = value;
    ui.element('ex-effort').value = 'high';
    await ui.run('exSubmit()');
    expect(ui.run('exSent')).toMatchObject({path:'/runs',body:{prompt:'Check the task',effort:'high',mode:'plan',workspaceId:'w',workingDirectory:'/work',requiresApproval:true}});
    expect(ui.element('ex-prompt').value).toBe('Check the task');
    expect(ui.element('ex-error').textContent).toBe('Queue unavailable');
    expect(ui.run('exState.submitting')).toBe(false);
    ui.element('ex-model').value = 'cli-gemini/test'; ui.run('exUpdateEffort()');
    expect(ui.run('exEffortValue()')).toBe('high');
  });

  it('pauses polling and rejects an outdated detail response after switching to sample data', async () => {
    const ui = dashboard();
    ui.run(`activeSection = 'execution'; exState.paused = true`);
    await ui.run('executionRefresh()'); expect(ui.requests).toEqual([]);
    ui.run(`exState.paused = false; exState.runs = [{kind:'agent',run:{id:'a',prompt:'Old task',status:'running',steps:[]}}]; let exResolve; request = () => new Promise(resolve => { exResolve = resolve; }); let selecting = exSelect('agent:a')`);
    ui.run(`exPreview(true); exResolve({run:{id:'a',prompt:'Stale data',steps:[]}})`);
    await ui.run('selecting');
    expect(ui.run('exState.selected.run.id')).toBe('sample');
    expect(ui.element('ex-card').innerHTML).not.toContain('Stale data');
  });

  it('starts in chat and keeps daily navigation outside the closed administration disclosure', () => {
    const ui = dashboard();
    expect(ui.run('activeSection')).toBe('platform');
    const disclosure = DASHBOARD_HTML.match(/<details class="nav-advanced"[\s\S]*?<\/details>/)?.[0] || '';
    expect(disclosure).not.toMatch(/<details[^>]*\bopen\b/);
    expect(disclosure).toContain('data-section="pipelines"');
    for (const section of ['platform','models','workspaces','settings','help']) {
      expect(disclosure).not.toContain(`data-section="${section}"`);
      expect(DASHBOARD_HTML.match(new RegExp(`data-section="${section}"`, 'g'))).toHaveLength(1);
    }
    for (const id of ['pf-new-chat','pf-sessions','pf-chat-model','pf-chat-input']) {
      expect(DASHBOARD_HTML.match(new RegExp(`id="${id}"`, 'g'))).toHaveLength(1);
    }
  });

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
    expect(ui.element('pipe-live-status').innerHTML).toContain('Approve &amp; Resume');
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
    expect(ui.element('pipe-live-status').innerHTML).not.toContain('Approve &amp; Resume');
  });

  it('does not replace edited provider policies or API-key forms', () => {
    const ui = dashboard();
    ui.element('agent-policy-list').innerHTML = 'draft policy';
    ui.element('settings-keys').innerHTML = 'draft credential';
    ui.run(`dirtySections.add('agent-controls-section'); dirtySections.add('settings-section'); renderAgentPolicies({policies:{}}); renderSettings({apiKeys:{}})`);
    expect(ui.element('agent-policy-list').innerHTML).toBe('draft policy');
    expect(ui.element('settings-keys').innerHTML).toBe('draft credential');
  });

  it('uses developer defaults and the BitNet preset without translating navigation IDs', () => {
    const ui = dashboard('de');
    expect(ui.run('[...getVisibleNavs()]')).toEqual(ui.run('PRESETS.developer'));
    expect(ui.run('PRESETS.bitnet')).toEqual(['overview','playground','local-providers','models','usage','activity','settings']);
    expect(ui.run('NAV_SECTIONS.map(section => section.key)')).toContain('settings');
    ui.stored.set('conduit_nav_visibility', JSON.stringify(['overview','local-providers']));
    expect(ui.run('[...getVisibleNavs()]')).toEqual(['overview','local-providers']);
    ui.stored.set('conduit_nav_visibility', 'invalid JSON');
    expect(ui.run('[...getVisibleNavs()]')).toEqual(ui.run('PRESETS.developer'));
  });

  it('renders German approval actions with icons while preserving pipeline action values', async () => {
    const ui = dashboard('de');
    ui.run(`renderLiveRun({id:'r',pipelineName:'Prüfung',status:'waiting_approval',pendingApprovalStepId:'s',stepResults:{s:{stepName:'Check',status:'waiting_approval'}}})`);
    expect(ui.element('pipe-live-status').innerHTML).toContain('Genehmigen &amp; Fortfahren');
    expect(ui.element('pipe-live-status').innerHTML).toContain('Pipeline ablehnen');
    expect(ui.element('pipe-live-status').innerHTML).toContain('<svg width="18" height="18"');
    expect(ui.element('pipe-live-status').innerHTML).not.toContain('data-i18n=');
  });
});

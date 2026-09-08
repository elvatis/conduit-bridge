import { effortControl } from './effort-slider.js';
import { executionSnapshot } from './execution-model.js';
import { EXECUTION_WORKSPACE_SCRIPT, EXECUTION_WORKSPACE_STYLE } from './execution-workspace.js';

const icon = (paths: string, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const branch = icon('<rect x="3" y="3" width="6" height="6" rx="2"/><rect x="15" y="15" width="6" height="6" rx="2"/><path d="M6 9v7a2 2 0 0 0 2 2h7M9 6h7a2 2 0 0 1 2 2v7"/>');
const terminal = icon('<rect x="3" y="4" width="18" height="15" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>');
const plus = icon('<path d="M12 5v14M5 12h14"/>');

export const EXECUTION_NAV_HTML = `<button type="button" id="ex-create-task" class="sidebar-new-chat" hidden title="New task" data-i18n-title="ex_new_task">${plus}<span class="action-label" data-i18n="ex_new_task">New task</span></button><button data-section="execution" title="Execution" data-i18n-title="ex_nav">${branch}<span class="nav-label" data-i18n="ex_nav">Execution</span></button>`;
export const EXECUTION_TREE_HTML = `<section id="ex-sidebar" class="ex-sidebar" hidden>
  <div class="ex-tree-heading"><span data-i18n="ex_tasks">TASKS</span><button type="button" id="ex-new-task" aria-label="New task" data-i18n-aria="ex_new_task" title="New task" data-i18n-title="ex_new_task">${plus}</button></div>
  <label class="ex-search"><span class="visually-hidden" data-i18n="ex_search">Find a task</span><input id="ex-search" type="search" placeholder="Find a task…" data-i18n-ph="ex_search" autocomplete="off"></label>
  <div class="ex-shortcuts"><button type="button" id="ex-automations" data-i18n="ex_automations">Automations</button><button type="button" id="ex-marketplace" data-i18n="ex_marketplace">Skills &amp; plugins</button></div>
  <div class="ex-filters"><label><span class="visually-hidden" data-i18n="ex_group">Group</span><select id="ex-group"><option value="all" data-i18n="ex_all_tasks">All tasks</option><option value="active" data-i18n="ex_active_tasks">Active</option><option value="pinned" data-i18n="ex_pinned">Pinned</option></select></label><label><span class="visually-hidden" data-i18n="ex_sort">Sort</span><select id="ex-sort"><option value="newest" data-i18n="ex_newest">Newest</option><option value="oldest" data-i18n="ex_oldest">Oldest</option></select></label></div>
  <label class="ex-project-filter"><span class="visually-hidden" data-i18n="ex_project">Project</span><select id="ex-project"><option value="" data-i18n="ex_all_projects">All projects</option></select></label>
  <div id="ex-tree" class="ex-tree"></div>
  <div class="ex-sidebar-note">${terminal}<span data-i18n="ex_sidebar_note">Your agents. One workspace.</span></div>
</section>`;

export const EXECUTION_HTML = `<section id="execution-section" class="wide page-section ex-page" aria-labelledby="ex-heading">
  <header class="ex-heading"><div><div class="ex-eyebrow"><span class="ex-copper-dot"></span> ELVATIS CONDUIT <span>/</span> <span data-i18n="ex_workspace">AGENT WORKSPACE</span></div><h2 id="ex-heading" data-i18n="ex_heading">Give your ideas a team.</h2><p data-i18n="ex_subheading">Follow the work, from the first instruction to the final handoff.</p></div><button type="button" id="ex-demo" class="ex-quiet">${branch}<span data-i18n="ex_demo">Explore a sample</span></button></header>
  <div class="ex-workspace-bar"><span>${terminal}<span id="ex-workspace-context" data-i18n="ex_no_workspace">No workspace selected</span></span><span id="ex-connection" role="status" data-i18n="ex_connecting">Connecting…</span></div>
  <div id="ex-preview-banner" class="ex-preview-banner" hidden><span data-i18n="ex_preview_notice">Sample workflow · illustrative data, no agents are executing.</span><button type="button" id="ex-exit-demo" data-i18n="ex_back_live">Back to live</button></div>
  <p id="ex-error" class="ex-error" role="alert" hidden></p>
  <div class="ex-layout" id="ex-layout"><div class="ex-center"><div class="ex-stage"><div id="ex-card"></div><div id="ex-output"></div><div id="ex-feed"></div></div>
  <div id="ex-review" class="ex-review" hidden><strong data-i18n="ex_approval_needed">This run needs your approval.</strong><label><span data-i18n="lbl_operator_feedback">Operator feedback (optional)</span><input id="ex-feedback" maxlength="2000"></label><div><button type="button" id="ex-approve" data-i18n="btn_approve">Approve</button><button type="button" id="ex-reject" data-i18n="btn_reject">Reject</button></div></div>
  <form id="ex-composer" class="ex-composer">
    <div class="ex-composer-heading"><span>${branch}<span data-i18n="ex_new_instruction">NEW INSTRUCTION</span></span><span data-i18n="ex_bounded">Bounded execution</span></div>
    <label class="ex-prompt"><span class="visually-hidden" data-i18n="ex_prompt_label">Describe your task</span><textarea id="ex-prompt" rows="2" maxlength="50000" required placeholder="What should your agent work on?" data-i18n-ph="ex_prompt_placeholder"></textarea></label>
    <div id="ex-attachments" class="ex-attachments"></div>
    <div class="ex-composer-controls"><div class="ex-composer-left">
      <button type="button" id="ex-attach" class="ex-icon-button" title="Attach text context" data-i18n-title="ex_attach" aria-label="Attach text context" data-i18n-aria="ex_attach">${plus}</button><input id="ex-files" type="file" accept=".txt,.md,.json,.csv,.log" multiple hidden>
      <label class="ex-compact-select"><span class="visually-hidden" data-i18n="ex_scope">Permission scope</span><select id="ex-mode" title="Permission scope" data-i18n-title="ex_scope"><option value="plan" data-i18n="ex_scope_plan">Plan</option><option value="agent" data-i18n="ex_scope_agent">Workspace write</option><option value="chat" data-i18n="ex_scope_chat">Read only</option></select></label>
      <span class="ex-control-divider"></span><label class="ex-compact-select ex-model-select"><span class="visually-hidden" data-i18n="lbl_model">Model</span><select id="ex-model"><option value="" data-i18n="ex_select_model">Select a model</option></select></label>
      ${effortControl('ex-effort', '#ex-model')}
    </div><div class="ex-composer-right"><button type="button" id="ex-auto" role="switch" aria-checked="false" title="Manual requests approval before running; Auto follows repository policy" data-i18n-title="ex_auto_help"><span class="ex-toggle-track"><span></span></span><span id="ex-auto-label" data-i18n="ex_manual">Manual</span></button><button type="submit" id="ex-send" class="ex-send" title="Queue task" data-i18n-title="ex_queue" aria-label="Queue task" data-i18n-aria="ex_queue">${icon('<path d="M12 19V5m-6 6 6-6 6 6"/>')}</button></div></div>
    <details class="ex-run-settings"><summary data-i18n="ex_settings">Workspace &amp; run limits</summary><div class="ex-settings-grid"><label><span data-i18n="lbl_workspace">Workspace</span><select id="ex-workspace"><option value="" data-i18n="ui_default_workspace">Default workspace</option></select></label><label><span data-i18n="lbl_max_iterations">Maximum iterations</span><input id="ex-iterations" type="number" min="1" max="10" value="2" required></label><label><span data-i18n="lbl_max_duration">Maximum duration (seconds)</span><input id="ex-duration" type="number" min="1" max="1800" value="120" required></label><label><span data-i18n="lbl_max_cost">Maximum cost (USD)</span><input id="ex-cost" type="number" min="0" max="100" step="0.01" value="0.5" required></label></div></details>
  </form>
  <footer class="ex-footnote"><span data-i18n="ex_policy_note">Execution respects workspace permissions, approval gates and budgets.</span><button type="button" id="ex-pipelines-link" data-i18n="ex_manage_workflows">Configure multi-agent workflows</button></footer>
  </div><aside id="ex-plan" class="ex-plan" aria-label="Execution plan" data-i18n-aria="ex_plan"><div class="ex-plan-toolbar"><span data-i18n="ex_plan">Execution plan</span><button type="button" id="ex-plan-toggle" aria-expanded="true" aria-controls="ex-plan-body" title="Collapse plan" data-i18n-title="ex_toggle_plan"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></div><div id="ex-plan-body"><div id="ex-plan-content"></div><div class="ex-plan-actions"><button type="button" id="ex-plan-run" data-i18n="ex_new_task">New task</button><button type="button" id="ex-live-pause" aria-pressed="false" data-i18n="ex_pause_updates">Pause updates</button></div><p class="ex-plan-note" data-i18n="ex_plan_note">Progress comes from recorded workflow steps. Pausing updates keeps agents running.</p></div></aside></div>
</section>`;

export const EXECUTION_STYLE = String.raw`
  ${EXECUTION_WORKSPACE_STYLE}
  .ex-page { --ex-mono:'Cascadia Code','SFMono-Regular',Consolas,monospace; max-width:1090px; margin:0 auto; }
  .workspace:has(.ex-page.active) { background:radial-gradient(ellipse at 70% 0%,#22B4FF06,transparent 55%),var(--bg); }
  .ex-heading { display:flex; gap:24px; align-items:center; justify-content:space-between; margin:14px 0 26px; }
  .ex-eyebrow { display:flex; align-items:center; gap:9px; font:500 0.8rem/1.5 var(--font-sans); letter-spacing:1.5px; color:var(--muted); }
  .ex-eyebrow > span:not(:first-child) { color:var(--muted); }
  .ex-copper-dot { width:6px; height:6px; border-radius:2px; background:var(--copper); }
  .ex-heading h2 { font-family:var(--font-sans); font-size:1.9286rem; font-weight:500; line-height:1.3; letter-spacing:-.8px; margin:11px 0 6px; }
  .ex-heading p { color:var(--muted); font-size:0.8571rem; margin:0; }
  .ex-quiet { background:transparent; border:1px solid var(--line); color:var(--body); font-size:0.8rem; padding:7px 10px; }
  .ex-workspace-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid var(--line); padding:0 1px 13px; margin-bottom:26px; font-size:0.8rem; color:var(--muted); }
  .ex-workspace-bar > span { display:flex; align-items:center; gap:9px; }
  #ex-workspace-context { font-family:var(--ex-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #ex-connection { flex:none; font-size:0.8rem; }
  #ex-connection[data-state="live"]::before { content:''; width:5px; height:5px; background:var(--ok); border-radius:50%; }
  .ex-stage { min-height:335px; padding:0 0 25px; }
  .ex-card { border:1px solid var(--line-2); border-radius:13px; background:linear-gradient(120deg,#0D1C3380,#0A172990); overflow:hidden; }
  .ex-card-header { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:16px; padding:19px 22px 15px; }
  .ex-card-title { display:flex; align-items:center; gap:9px; margin:0; font:500 1rem/1.5 var(--font-sans); }
  .ex-card-title svg { color:var(--copper); flex:none; }
  .ex-card-title span { overflow-wrap:anywhere; }
  .ex-summary { display:flex; flex-wrap:wrap; gap:5px; color:var(--muted); font-size:0.8rem; margin:6px 0 0 27px; }
  .ex-summary .ex-running { color:var(--blue); } .ex-summary .ex-done { color:var(--ok); } .ex-summary .ex-failed { color:var(--bad); }
  .ex-runtime { display:flex; align-items:center; gap:8px; font:0.8rem var(--ex-mono); color:var(--muted); white-space:nowrap; padding:6px 9px; border:1px solid var(--line); border-radius:6px; background:#050B1660; }
  .ex-trace { padding:0 22px 18px; }
  .ex-root { display:flex; align-items:center; gap:8px; padding:7px 0 10px; color:var(--muted); font-size:0.8rem; }
  .ex-agent-tag { display:inline-flex; gap:5px; align-items:center; color:var(--blue-soft); border:1px solid #22B4FF28; background:#22B4FF0B; border-radius:5px; padding:2px 7px; font-size:0.8rem; }
  .ex-trace-list { margin:0 0 0 8px; padding:0 0 0 19px; border-left:1px solid var(--line-2); list-style:none; }
  .ex-trace-item { position:relative; padding:2px 0; }
  .ex-trace-item::before { content:''; position:absolute; left:-20px; top:20px; width:18px; border-top:1px solid var(--line-2); }
  .ex-trace-row { width:100%; display:flex; justify-content:flex-start; gap:11px; padding:10px 11px; border:1px solid transparent; background:transparent; text-align:left; border-radius:7px; font-size:0.8571rem; }
  .ex-trace-row:hover { background:#22B4FF08; border-color:var(--line); }
  .ex-trace-row[aria-expanded="true"] { background:#22B4FF0A; border-color:#22B4FF22; }
  .ex-row-name { min-width:80px; font-weight:500; color:var(--text); }
  .ex-row-action { font:0.8rem/1.5 var(--ex-mono); color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
  .ex-row-time { font:0.8rem var(--ex-mono); color:var(--muted); }
  .ex-chevron { font:1.1429rem var(--ex-mono); color:var(--muted); transform:rotate(0deg); }
  [aria-expanded="true"] > .ex-chevron { transform:rotate(90deg); }
  .ex-node-meta { margin:1px 0 3px 38px; padding:6px 0; display:flex; flex-wrap:wrap; gap:7px 18px; color:var(--muted); font:0.8rem/1.7 var(--ex-mono); overflow-wrap:anywhere; }
  .ex-state { width:16px; height:16px; display:inline-grid; place-items:center; flex:none; color:var(--muted); font-size:0.8571rem; }
  .ex-state.running { border:1.5px solid #22B4FF40; border-top-color:var(--blue); border-right-color:var(--blue); border-radius:50%; animation:ex-spin 1.5s linear infinite; }
  .ex-state.completed { color:var(--ok); border:1px solid #1FD18A38; border-radius:50%; font-size:0.8rem; }
  .ex-state.failed,.ex-state.cancelled,.ex-state.interrupted,.ex-state.rejected,.ex-state.exhausted { color:var(--bad); border:1px solid #FF6F9138; border-radius:50%; }
  .ex-state.waiting_approval { color:var(--warn); }
  @keyframes ex-spin { to { transform:rotate(360deg); } }
  .ex-card-footer { border-top:1px solid var(--line); padding:10px 22px; display:flex; justify-content:space-between; gap:12px; align-items:center; font-size:0.8rem; color:var(--muted); }
  .ex-card-footer button { background:transparent; border:0; font-size:0.8rem; padding:1px 3px; color:var(--bad); }
  .ex-output-panel { margin-top:22px; border:1px solid var(--line); border-radius:10px; background:#07111F; overflow:hidden; }
  .ex-output-header { display:flex; align-items:center; gap:9px; padding:12px 17px; border-bottom:1px solid var(--line); font-size:0.8rem; }
  .ex-output-header > svg { color:var(--copper); }
  .ex-output-header small { margin-left:auto; color:var(--muted); font:0.8rem var(--ex-mono); }
  .ex-output-meta { padding:11px 17px 2px; display:flex; flex-wrap:wrap; gap:12px; font:0.8rem/1.6 var(--ex-mono); color:var(--muted); overflow-wrap:anywhere; }
  .ex-output-meta .ex-action-label { color:var(--copper); margin-left:auto; }
  .ex-output-panel pre { background:transparent; border:0; padding:13px 17px 19px; margin:0; min-height:82px; max-height:290px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--body); font:0.8rem/1.9 var(--ex-mono); tab-size:2; }
  .ex-output-panel pre.ex-failed { color:var(--bad); }
  .ex-composer { position:sticky; bottom:16px; border:1px solid var(--line-2); background:#0A1729F5; border-radius:14px; box-shadow:0 8px 38px #0004,0 0 0 4px #050B1680; backdrop-filter:blur(14px); padding:14px 18px 7px; z-index:2; }
  .ex-composer:focus-within { border-color:#22B4FF60; }
  .ex-composer-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; color:var(--muted); font-size:0.8rem; letter-spacing:.6px; }
  .ex-composer-heading > span:first-child { display:flex; align-items:center; gap:7px; }
  .ex-composer-heading svg { color:var(--copper); width:13px; height:13px; }
  .ex-prompt { display:block; margin:10px 0 7px; }
  .ex-prompt textarea { border:0; border-radius:0; background:transparent; box-shadow:none; resize:vertical; padding:3px 0; min-height:52px; max-height:240px; font:1rem/1.7 var(--font-sans); }
  .ex-prompt textarea:focus { box-shadow:none; }
  .ex-prompt textarea::placeholder { color:#8FA0BD99; }
  .ex-composer-controls,.ex-composer-left,.ex-composer-right { display:flex; align-items:center; gap:9px; }
  .ex-composer-controls { justify-content:space-between; }
  .ex-composer-left { flex:1; gap:5px; }
  .ex-icon-button { width:28px; height:28px; padding:4px; background:transparent; border:0; color:var(--muted); }
  .ex-compact-select { margin:0; }
  .ex-compact-select select { border:0; background:transparent; color:var(--body); padding:5px; font-size:0.8rem; max-width:270px; }
  .ex-control-divider { width:1px; height:14px; background:var(--line-2); margin:0 7px; }
  #ex-auto { background:transparent; border:0; padding:5px 2px; display:flex; align-items:center; gap:7px; font-size:0.8rem; color:var(--body); }
  .ex-toggle-track { display:block; width:24px; height:14px; border-radius:10px; background:#8FA0BD25; padding:3px; }
  .ex-toggle-track > span { display:block; border-radius:50%; width:8px; height:8px; background:var(--muted); transition:transform .15s; }
  [aria-checked="true"] .ex-toggle-track { background:#1FD18A22; } [aria-checked="true"] .ex-toggle-track > span { transform:translateX(10px); background:var(--ok); }
  .ex-send { width:32px; height:32px; padding:6px; border:0; border-radius:9px; background:var(--copper); color:#1B0E03; }
  .ex-send:hover { background:#FF9D58; }
  .ex-send:disabled { opacity:.35; cursor:not-allowed; }
  .ex-run-settings { border-top:1px solid var(--line); margin-top:12px; padding:7px 0 0; font-size:0.8rem; color:var(--muted); }
  .ex-run-settings > summary { cursor:pointer; padding:3px 0; width:max-content; }
  .ex-settings-grid { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:12px; padding:9px 0; }
  .ex-settings-grid label { margin:0; font-size:0.8rem; } .ex-settings-grid input,.ex-settings-grid select { font-size:0.8rem; padding:7px; }
  .ex-footnote { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--muted); font-size:0.8rem; padding:14px 2px 0; }
  .ex-footnote button { background:none; border:0; color:var(--blue-soft); padding:0; font-size:0.8rem; }
  .ex-preview-banner { margin:-12px 0 17px; border-left:2px solid var(--copper); padding:4px 9px; display:flex; justify-content:space-between; align-items:center; gap:12px; color:var(--muted); font-size:0.8rem; }
  .ex-preview-banner button { border:0; background:none; color:var(--copper); padding:0; font-size:0.8rem; }
  .ex-error { color:var(--bad); border:1px solid #FF6F9140; background:var(--bad-bg); padding:12px; border-radius:8px; font-size:0.8571rem; }
  .ex-empty { border:1px dashed var(--line-2); border-radius:12px; padding:58px 22px; text-align:center; color:var(--muted); }
  .ex-empty > svg { color:var(--copper); width:30px; height:30px; margin-bottom:15px; }
  .ex-empty h3 { font:500 1.2143rem var(--font-sans); color:var(--text); margin:0 0 9px; }
  .ex-empty p { margin:0 auto; max-width:43ch; font-size:0.8571rem; }
  .ex-sidebar { flex:1; min-height:100px; display:flex; flex-direction:column; padding:0; border:0; background:transparent; box-shadow:none; margin:18px 0 0; }
  .ex-tree-heading { display:flex; justify-content:space-between; align-items:center; padding:0 9px 9px; color:var(--muted); font-size:0.8rem; letter-spacing:1px; }
  .ex-tree-heading button { padding:0; border:0; background:none; color:var(--muted); }
  .ex-search { margin:0 0 9px; } .ex-search input { font-size:0.8rem; border:1px solid var(--line); background:#050B1640; padding:7px 9px; }
  .ex-tree { flex:1; overflow:auto; scrollbar-width:thin; }
  .ex-tree-group { margin:0 0 4px; }
  .ex-tree-parent { display:flex; align-items:center; gap:7px; }
  .ex-tree-parent > button,.ex-tree-child { border:0; background:transparent; color:var(--body); font-size:0.8rem; padding:8px 5px; border-radius:6px; }
  .ex-tree-parent > .ex-tree-select { flex:1; display:flex; justify-content:flex-start; gap:8px; text-align:left; }
  .ex-tree-select span:last-child,.ex-tree-child .ex-tree-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ex-tree-select[aria-current="true"] { color:var(--text); background:#22B4FF10; }
  .ex-tree-parent button:hover,.ex-tree-child:hover { background:#ffffff08; }
  .ex-tree-children { border-left:1px solid var(--line); margin:0 0 8px 13px; padding:0 0 0 8px; }
  .ex-tree-child { display:flex; align-items:center; gap:6px; text-align:left; width:100%; }
  .ex-tree-child[aria-current="true"] { color:var(--blue-soft); background:#22B4FF0B; }
  .ex-tree-corner { color:var(--muted); opacity:.5; }
  .ex-tree .ex-state { width:12px; height:12px; font-size:0.8rem; }
  .ex-worker-glyph { width:16px; height:16px; position:relative; display:inline-flex; color:var(--muted); flex:none; }
  .ex-worker-glyph .ex-chat-overlay { position:absolute; width:7px; height:6px; bottom:0; right:-1px; background:var(--panel); border:1px solid var(--blue); border-radius:2px; }
  .ex-sidebar-note { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:0.8rem; padding:12px 7px; border-top:1px solid var(--line); margin-top:20px; }
  .sidebar.collapsed .ex-sidebar { display:none; }
  .sidebar:has(.ex-sidebar:not([hidden])) .sidebar-history { display:none; }
  .ex-review { border:1px solid #F5B83D45; background:#F5B83D08; padding:16px; border-radius:10px; margin-bottom:20px; font-size:0.8571rem; }
  .ex-review label { margin-top:10px; } .ex-review > div { display:flex; gap:8px; } .ex-review button { font-size:0.8rem; }
  .ex-attachments { display:flex; flex-wrap:wrap; gap:6px; } .ex-attachments button { background:var(--panel-2); border:1px solid var(--line); color:var(--body); font:0.8rem var(--ex-mono); padding:5px 8px; }
  .ex-page [hidden],.ex-sidebar[hidden] { display:none !important; }
  .ex-page button:focus-visible,.ex-tree button:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
  @media(max-width:1000px) { .ex-heading h2 { font-size:1.6429rem; } .ex-eyebrow { letter-spacing:.6px; } .ex-compact-select select { max-width:200px; } .ex-row-name { min-width:70px; } }
  @media(max-width:760px) { .ex-heading { margin-top:20px; flex-wrap:wrap; gap:13px; } .ex-heading h2 { font-size:1.6429rem; } .ex-workspace-bar { margin-bottom:20px; } .ex-card-header { padding:15px; } .ex-trace { padding:0 12px 14px; } .ex-trace-row { gap:7px; padding:9px 6px; flex-wrap:wrap; } .ex-row-action { flex-basis:calc(100% - 90px); } .ex-row-time { margin-left:auto; } .ex-composer { padding:12px 12px 5px; bottom:8px; } .ex-composer-controls { flex-wrap:wrap; gap:9px; } .ex-composer-left { flex:1 1 100%; } .ex-composer-right { margin-left:auto; } .ex-model-select { flex:1; } .ex-compact-select select { max-width:100%; width:100%; } .ex-settings-grid { grid-template-columns:1fr 1fr; } .ex-footnote { flex-direction:column; align-items:flex-start; } .sidebar.collapsed .ex-sidebar:not([hidden]) { display:flex; } }
  @media(prefers-reduced-motion:reduce) { .ex-state.running { animation:none; } }
`;

export const EXECUTION_SCRIPT = String.raw`
  const exSnapshot = ${executionSnapshot.toString()};
  const exIcons = { branch: ${JSON.stringify(branch)}, terminal: ${JSON.stringify(terminal)} };
  const exState = { runs: [], selected: null, step: '', collapsed: new Set(), preview: false, auto: false, submitting: false, polling: null, epoch: 0, selectionEpoch: 0, operator: null, catalogs: false, files: [], cardKey: '', treeKey: '', pinned: new Set(), paused: false, planCollapsed: false };
  // A successful poll must not erase an error from the user's last action.
  const exErrors = { action: null, refresh: null };
  function exError(error, source = 'action') {
    exErrors[source] = error;
    const visible = exErrors.action || exErrors.refresh;
    $('ex-error').hidden = !visible; $('ex-error').textContent = visible?.message || '';
  }
  function exStatusIcon(status) {
    const safe = ['running','completed','failed','cancelled','interrupted','rejected','waiting_approval','exhausted','pending','queued','skipped'].includes(status) ? status : 'pending';
    return '<span class="ex-state ' + safe + '" aria-label="' + esc(localizedValue(safe)) + '">' + ({ completed:'✓',failed:'×',cancelled:'×',interrupted:'×',rejected:'×',exhausted:'×',pending:'·',queued:'·',waiting_approval:'Ⅱ',skipped:'–' }[safe] || '') + '</span>';
  }
  function exElapsed(start, end) { if (!start) return '0s'; const seconds = Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000)); return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's'; }
  function exCurrent() { return exState.selected; }
  function exKey(item) { return item.kind + ':' + item.run.id; }
  function exCanOperate() { return ['admin','operator'].includes(exState.operator?.role); }
  function exSetConnection(key, live = false) { setLocalizedText($('ex-connection'), () => t(key)); $('ex-connection').dataset.state = live ? 'live' : 'idle'; }
  function exRestoreFocus(root, key) { if (key) [...root.querySelectorAll('[data-ex-focus]')].find(item => item.dataset.exFocus === key)?.focus({preventScroll:true}); }
  function exRenderTree() {
    const source = exState.preview ? [exSample()] : exState.runs;
    const query = $('ex-search').value.trim().toLocaleLowerCase(currentLang);
    const list = exFilterTasks(source,query);
    const key = JSON.stringify([list,query,[...exState.pinned],[...exState.collapsed],exState.selected && exKey(exState.selected),exState.step,currentLang]);
    if (key === exState.treeKey) return; exState.treeKey = key;
    const focus = document.activeElement?.dataset?.exFocus;
    setLocalizedHtml($('ex-tree'), () => list.map(item => {
      const view = exSnapshot(item.run,item.kind), id = exKey(item), selected = exState.selected && exKey(exState.selected) === id, closed = exState.collapsed.has(id);
      return '<div class="ex-tree-group"><div class="ex-tree-parent"><button type="button" data-ex-collapse="' + esc(id) + '" data-ex-focus="collapse:' + esc(id) + '" aria-expanded="' + !closed + '" aria-label="' + esc(t('ex_toggle_task') + ': ' + view.title) + '"><span class="ex-chevron">' + (closed ? '›' : '⌄') + '</span></button><button type="button" class="ex-tree-select" data-ex-select="' + esc(id) + '" data-ex-focus="run:' + esc(id) + '" aria-current="' + Boolean(selected) + '" title="' + esc(view.title) + '">' + exStatusIcon(view.status) + '<span>' + esc(view.title) + '</span></button>' + exTaskMeta(item) + '</div><div class="ex-tree-children"' + (closed ? ' hidden' : '') + '>' + view.nodes.map(node => '<button type="button" class="ex-tree-child" data-ex-select="' + esc(id) + '" data-ex-node="' + esc(node.id) + '" data-ex-focus="tree:' + esc(id + ':' + node.id) + '" aria-current="' + Boolean(selected && exState.step === node.id) + '" title="' + esc(node.name + ' · ' + localizedValue(node.status)) + '" style="padding-left:' + Math.min(node.depth * 7,28) + 'px"><span class="ex-tree-corner" aria-hidden="true">↳</span>' + exStatusIcon(node.status) + '<span class="ex-worker-glyph">' + exIcons.terminal + (node.status === 'running' ? '<span class="ex-chat-overlay"></span>' : '') + '</span><span class="ex-tree-name">' + esc(node.name) + '</span></button>').join('') + '</div></div>';
    }).join('') || '<p class="platform-empty">' + esc(t(query ? 'ex_no_matches' : 'ex_no_tasks')) + '</p>');
    exRestoreFocus($('ex-tree'),focus);
  }
  function exRender() {
    $('ex-preview-banner').hidden = !exState.preview;
    $('ex-send').disabled = exState.submitting || !exCanOperate() || exState.preview;
    $('ex-pipelines-link').hidden = !exState.operator || exState.operator.source === 'operator-token';
    const item = exCurrent();
    exRenderPlan();
    exRenderTree();
    if (!item) {
      setLocalizedHtml($('ex-card'), () => '<div class="ex-empty">' + exIcons.branch + '<h3>' + esc(t('ex_empty_title')) + '</h3><p>' + esc(t('ex_empty_body')) + '</p></div>');
      $('ex-output').innerHTML = ''; $('ex-feed').innerHTML = ''; $('ex-review').hidden = true; exState.cardKey = ''; setLocalizedText($('ex-workspace-context'), () => t('ex_no_workspace')); return;
    }
    const view = exSnapshot(item.run,item.kind,exState.preview ? 1700000014000 : Date.now());
    if (!view.nodes.some(node => node.id === exState.step)) exState.step = view.nodes.find(node => node.status === 'running')?.id || view.nodes.at(-1)?.id || '';
    const node = view.nodes.find(node => node.id === exState.step);
    $('ex-review').hidden = exState.preview || view.status !== 'waiting_approval';
    const reviewer = ['admin','reviewer'].includes(exState.operator?.role);
    $('ex-approve').disabled = !reviewer || exState.submitting; $('ex-reject').disabled = !reviewer || exState.submitting;
    const key = JSON.stringify([item,exState.step,exState.detailsClosed,exState.preview,currentLang,exState.submitting,exState.operator?.role]);
    if (key === exState.cardKey) return; exState.cardKey = key;
    const focus = document.activeElement?.dataset?.exFocus;
    setLocalizedText($('ex-workspace-context'), () => view.cwd || view.repository || t('ex_no_workspace'));
    setLocalizedHtml($('ex-card'), () => '<article class="ex-card"><header class="ex-card-header"><div><h3 class="ex-card-title">' + exIcons.branch + '<span>' + esc(view.title || t('ex_task')) + '</span></h3><div class="ex-summary"><span>' + esc(t(item.kind === 'pipeline' ? 'ex_agents' : 'ex_iterations')) + ': </span><span class="ex-running">' + view.counts.running + ' ' + esc(t('ex_running')) + '</span><span>·</span><span class="ex-done">' + view.counts.done + ' ' + esc(t('ex_done')) + '</span><span>·</span><span class="ex-failed">' + view.counts.failed + ' ' + esc(t('ex_failed')) + '</span>' + (view.counts.pending ? '<span>· ' + view.counts.pending + ' ' + esc(t('ex_pending')) + '</span>' : '') + '</div></div><span class="ex-runtime">' + view.actions + ' ' + esc(t('ex_actions')) + ' <span>·</span> <span id="ex-elapsed">' + exElapsed(view.startedAt,view.completedAt || (exState.preview ? 1700000014000 : view.active ? undefined : view.startedAt)) + '</span></span></header><div class="ex-trace"><div class="ex-root"><span class="ex-agent-tag">' + exIcons.branch + ' Agent</span><span>' + esc(t('ex_execution_trace')) + '</span></div><ol class="ex-trace-list">' + view.nodes.map(step => '<li class="ex-trace-item"><button type="button" class="ex-trace-row" data-ex-step="' + esc(step.id) + '" data-ex-focus="step:' + esc(step.id) + '" aria-expanded="' + (node?.id === step.id && !exState.detailsClosed) + '" aria-controls="ex-node-' + esc(encodeURIComponent(step.id)) + '">' + exStatusIcon(step.status) + '<span class="ex-row-name">' + esc(item.kind === 'agent' ? t('lbl_iteration') + ' ' + step.iteration : step.name) + '</span><span class="ex-row-action">' + esc(step.error || (step.status === 'completed' ? t('ex_response_received') : localizedValue(step.status))) + '</span><span class="ex-row-time">' + (step.startedAt ? exElapsed(step.startedAt,step.completedAt || (exState.preview ? 1700000014000 : view.active ? undefined : view.completedAt || step.startedAt)) : '') + '</span><span class="ex-chevron" aria-hidden="true">›</span></button><div id="ex-node-' + esc(encodeURIComponent(step.id)) + '" class="ex-node-meta"' + (node?.id === step.id && !exState.detailsClosed ? '' : ' hidden') + '><span>' + esc(step.model) + '</span>' + (step.dependencies.length ? '<span>' + esc(t('ex_depends_on') + ': ' + step.dependencies.map(id => view.nodes.find(n => n.id === id)?.name || id).join(', ')) + '</span>' : '') + '</div></li>').join('') + '</ol>' + (!view.nodes.length ? '<p class="muted">' + esc(t('ex_waiting_start')) + '</p>' : '') + '</div><footer class="ex-card-footer"><span>' + esc(localizedValue(view.status)) + (view.tokens == null ? '' : ' · ' + view.tokens + ' ' + esc(t('lbl_tokens'))) + (view.costUsd == null ? '' : ' · $' + Number(view.costUsd).toFixed(4)) + '</span>' + (view.active && !exState.preview && exCanOperate() ? '<button type="button" id="ex-cancel" data-ex-focus="cancel"' + (exState.submitting ? ' disabled' : '') + '>' + esc(t('ex_stop')) + '</button>' : '<span>' + esc(t(exState.preview ? 'ex_sample' : 'ex_recorded')) + '</span>') + '</footer></article>');
    const scroll = $('ex-output').querySelector?.('pre')?.scrollTop || 0;
    setLocalizedHtml($('ex-output'), () => '<section class="ex-output-panel"><header class="ex-output-header">' + exIcons.terminal + '<strong>' + esc(node?.name || t('ex_output')) + '</strong>' + exStatusIcon(node?.status || view.status) + '<small>' + esc(t('ex_provider_output')) + '</small></header><div class="ex-output-meta"><span>' + esc(view.cwd || t('ex_no_workspace')) + '</span><span>' + view.counts.done + ' ' + esc(t('ex_responses')) + '</span><span class="ex-action-label">' + esc(localizedValue(node?.status || view.status)) + '</span></div><pre' + (node?.error || view.error ? ' class="ex-failed"' : '') + '>' + esc(node?.error || node?.content || view.error || t(!view.contentRetained ? 'ex_summary_only' : node?.status === 'running' ? 'ex_awaiting_output' : 'ex_no_output')) + '</pre></section>');
    if ($('ex-output').querySelector?.('pre')) $('ex-output').querySelector('pre').scrollTop = scroll;
    exRestoreFocus($('ex-card'),focus);
    exRenderFeed(view);
  }
  async function exSelect(id, step) {
    const item = (exState.preview ? [exSample()] : exState.runs).find(item => exKey(item) === id); if (!item) return;
    const epoch = ++exState.selectionEpoch; exState.newTask = false; exState.selected = item; exState.step = step || ''; exState.detailsClosed = false; $('ex-feedback').value = ''; exRender();
    if (exState.preview) return;
    try { const result = await request((item.kind === 'pipeline' ? '/v1/pipelines/runs/' : '/v1/platform/runs/') + encodeURIComponent(item.run.id)); if (exState.selectionEpoch !== epoch || exState.preview) return; exState.selected = {kind:item.kind,run:result.run}; exRender(); } catch(error) { if (exState.selectionEpoch === epoch) exError(error); }
  }
  async function executionRefresh() {
    if (exState.polling || exState.preview || exState.paused || activeSection !== 'execution' || document.hidden) return;
    const epoch = exState.epoch, selectionEpoch = exState.selectionEpoch;
    exState.polling = (async () => {
      try {
        if (!exState.operator) { const identity = await request('/v1/platform/me'); if (epoch !== exState.epoch) return; exIdentity(identity.operator); }
        if (!exState.catalogs) {
          const [modelData,workspaceData] = await Promise.all([request('/v1/platform/models'),request('/v1/platform/workspaces')]);
          if (epoch !== exState.epoch) return;
          exState.models = modelData.data || []; exState.workspaces = workspaceData.data || [];
          pfOptions('ex-model',preferredModels(exState.models),exState.models.length ? undefined : () => t('ex_select_model'),item => item.id,pfModelLabel);
          pfOptions('ex-workspace',exState.workspaces,() => t('ui_default_workspace'));
          exPopulateProjects(); exUpdateEffort();
          exState.catalogs = true;
        }
        const pipelineAccess = exState.operator?.source !== 'operator-token';
        const [agents,pipelines] = await Promise.all([request('/v1/platform/runs'),pipelineAccess ? request('/v1/pipelines/runs') : Promise.resolve({data:[]})]);
        if (epoch !== exState.epoch) return;
        exState.runs = [...(pipelines.data || []).map(run => ({kind:'pipeline',run})),...(agents.data || []).map(run => ({kind:'agent',run}))].sort((a,b) => (b.run.createdAt || b.run.startedAt || 0)-(a.run.createdAt || a.run.startedAt || 0));
        exPopulateProjects();
        if (selectionEpoch === exState.selectionEpoch && !exState.newTask) {
          const previous = exState.selected && exState.runs.find(item => exKey(item) === exKey(exState.selected));
          exState.selected = previous || exState.runs[0] || null;
          if (exState.selected) {
            const item = exState.selected;
            const detail = await request((item.kind === 'pipeline' ? '/v1/pipelines/runs/' : '/v1/platform/runs/') + encodeURIComponent(item.run.id));
            if (epoch !== exState.epoch || selectionEpoch !== exState.selectionEpoch) return;
            exState.selected = {kind:item.kind,run:detail.run};
          }
        }
        exError(null,'refresh'); exSetConnection('ex_live',true); exRender();
      } catch(error) { if (epoch !== exState.epoch) return; exSetConnection('ex_disconnected'); exError(error,'refresh'); }
    })().finally(() => { exState.polling = null; });
    return exState.polling;
  }
  async function exRunAction(action) {
    const item = exCurrent(); if (!item || exState.preview || exState.submitting) return;
    const id = exKey(item); exState.submitting = true; exRender();
    try {
      const feedback = $('ex-feedback').value;
      const result = item.kind === 'pipeline' ? await request('/v1/pipelines/runs/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:item.run.id,action,feedback})}) : await pfApi('/runs/' + encodeURIComponent(item.run.id) + '/actions',{action,feedback});
      if (exCurrent() && exKey(exCurrent()) === id && !exState.preview) exState.selected = {kind:item.kind,run:result.run}; exError(null);
    } catch(error) { exError(error); } finally { exState.submitting = false; exRender(); }
  }
  async function exSubmit() {
    if (exState.submitting || exState.preview || !exCanOperate()) return;
    const draft = $('ex-prompt').value.trim(), model = $('ex-model').value;
    if (!draft || !model) { exError(new Error(t('ex_need_prompt_model'))); return; }
    const fileSnapshot = [...exState.files];
    const prompt = draft + fileSnapshot.map(file => '\n\n--- Attached context: ' + file.name + ' ---\n' + file.text).join('');
    if (prompt.length > 50000) { exError(new Error(t('ex_context_too_large'))); return; }
    const workspace = (exState.workspaces || []).find(item => item.id === $('ex-workspace').value);
    const body = { prompt, model, mode:$('ex-mode').value, effort:exEffortValue(), fastMode:effortFastMode('ex-effort') ?? false, workspaceId:workspace?.id, workingDirectory:workspace?.path, requiresApproval:!exState.auto, maxIterations:Number($('ex-iterations').value), maxDurationMs:Number($('ex-duration').value)*1000, maxCostUsd:Number($('ex-cost').value), maxTokens:8000, maxOutputTokens:1024 };
    exState.submitting = true; exRender();
    try {
      const result = await pfApi('/runs',body);
      if ($('ex-prompt').value.trim() === draft) $('ex-prompt').value = '';
      exState.files = exState.files.filter(file => !fileSnapshot.includes(file)); exRenderFiles();
      ++exState.selectionEpoch; exState.newTask = false; exState.selected = {kind:'agent',run:result.run}; exState.step = '';
      exState.runs = [exState.selected,...exState.runs]; exError(null);
    } catch(error) { exError(error); } finally { exState.submitting = false; exRender(); }
  }
  function exRenderFiles() { setLocalizedHtml($('ex-attachments'), () => exState.files.map((file,index) => '<button type="button" data-ex-remove="' + index + '" title="' + esc(t('ex_remove_file')) + '">' + esc(file.name) + ' ×</button>').join('')); }
  async function exAttachFiles() {
    const files = Array.from($('ex-files').files || []); $('ex-files').value = '';
    try {
      if (files.length + exState.files.length > 5 || files.some(file => file.size > 100000 || !/\.(txt|md|json|csv|log)$/i.test(file.name))) throw new Error(t('ex_file_limits'));
      const added = await Promise.all(files.map(async file => ({name:file.name,text:await file.text()})));
      if (added.some(file => file.text.includes('\u0000')) || [...exState.files,...added].reduce((sum,file) => sum+file.text.length,0) > 40000) throw new Error(t('ex_context_too_large'));
      exState.files.push(...added); exRenderFiles(); exError(null);
    } catch(error) { exError(error); }
  }
  function exSample() {
    return {kind:'pipeline',run:{id:'sample',pipelineId:'sample',pipelineName:'Polish the agent workspace',initialPrompt:'Build a focused execution view with a hierarchical task tree.',status:'running',startedAt:1700000000000,workingDirectory:'conduit-bridge / src',costUsd:0.0182,tokensConsumed:2840,definition:{steps:[{id:'plan',dependsOn:[]},{id:'forge',dependsOn:['plan']},{id:'interface',dependsOn:['plan']},{id:'verify',dependsOn:['plan']},{id:'review',dependsOn:['plan']}]},stepResults:{
      plan:{stepId:'plan',stepName:'Atlas',model:'cli-codex/gpt-6-astra',status:'completed',startedAt:1700000000000,completedAt:1700000003000,content:'Plan ready. Split implementation, interface polish and validation into independent work.'},
      forge:{stepId:'forge',stepName:'Forge',model:'cli-codex/gpt-5.6-sol',status:'running',startedAt:1700000003000,content:'The task tree and execution model are connected. Checking the shared state before the next handoff.',events:[{kind:'message',id:'m1',at:1700000003000,text:'I am checking the existing workspace styles and the execution state model.'},{kind:'command',id:'c1',command:'rg --files src/ui',cwd:'conduit-bridge',status:'completed',startedAt:1700000003000,completedAt:1700000004000,stdout:'src/ui/workspace-style.ts\nsrc/ui/execution.ts\nsrc/ui/execution-model.ts',stderr:'',exitCode:0},{kind:'message',id:'m2',at:1700000005000,text:'The view follows the existing Elvatis design system. Next I will validate the type contracts.'},{kind:'command',id:'c2',command:'npm run typecheck',cwd:'conduit-bridge',status:'running',startedAt:1700000010000,stdout:'> tsc --noEmit',stderr:''}]},
      interface:{stepId:'interface',stepName:'Pixel',model:'cli-claude/claude-opus-5',status:'running',startedAt:1700000004000,content:'Read  src/ui/brand.ts\n\nApplying Elvatis navy, cyan and copper to the workspace.'},
      verify:{stepId:'verify',stepName:'Verify',model:'cli-codex/gpt-5.6-terra',status:'failed',startedAt:1700000004000,completedAt:1700000012000,error:'Example failure: a keyboard navigation assertion needs attention.'},
      review:{stepId:'review',stepName:'Sentinel',model:'cli-codex/gpt-daybreak-blue-latest',status:'running',startedAt:1700000004000,content:'Reviewing output escaping and workspace policy boundaries.'}
    }}};
  }
  function exPreview(enabled) { if (exState.submitting) return; ++exState.epoch; ++exState.selectionEpoch; exState.preview = enabled; exState.selected = enabled ? exSample() : null; exState.step = enabled ? 'forge' : ''; exError(null); exError(null,'refresh'); exSetConnection(enabled ? 'ex_sample' : 'ex_connecting'); exRender(); if (!enabled) executionRefresh(); }
  $('ex-demo').addEventListener('click',() => exPreview(true));
  $('ex-exit-demo').addEventListener('click',() => exPreview(false));
  $('ex-new-task').addEventListener('click',exNewTask);
  $('ex-create-task').addEventListener('click',exNewTask);
  $('ex-search').addEventListener('input',exRenderTree);
  $('ex-tree').addEventListener('click',event => { const collapse = event.target.closest('[data-ex-collapse]'); if (collapse) { const id = collapse.dataset.exCollapse; exState.collapsed.has(id) ? exState.collapsed.delete(id) : exState.collapsed.add(id); exRenderTree(); return; } const select = event.target.closest('[data-ex-select]'); if (select) exSelect(select.dataset.exSelect,select.dataset.exNode); });
  $('ex-card').addEventListener('click',event => { const step = event.target.closest('[data-ex-step]'); if (step) { exState.detailsClosed = exState.step === step.dataset.exStep ? !exState.detailsClosed : false; exState.step = step.dataset.exStep; exRender(); } if (event.target.closest('#ex-cancel')) exRunAction('cancel'); });
  $('ex-approve').addEventListener('click',() => exRunAction('approve'));
  $('ex-reject').addEventListener('click',() => exRunAction('reject'));
  $('ex-composer').addEventListener('submit',event => { event.preventDefault(); exSubmit(); });
  $('ex-auto').addEventListener('click',() => { exState.auto = !exState.auto; $('ex-auto').setAttribute('aria-checked',String(exState.auto)); setLocalizedText($('ex-auto-label'),() => t(exState.auto ? 'ex_auto' : 'ex_manual')); });
  $('ex-attach').addEventListener('click',() => $('ex-files').click());
  $('ex-files').addEventListener('change',exAttachFiles);
  $('ex-attachments').addEventListener('click',event => { const button = event.target.closest('[data-ex-remove]'); if (button) { exState.files.splice(Number(button.dataset.exRemove),1); exRenderFiles(); } });
  $('ex-workspace').addEventListener('change',() => { const workspace = (exState.workspaces || []).find(item => item.id === $('ex-workspace').value); setLocalizedText($('ex-workspace-context'),() => workspace?.path || t('ex_no_workspace')); });
  $('ex-pipelines-link').addEventListener('click',() => showSection('pipelines'));
  setInterval(() => { if (activeSection !== 'execution' || document.hidden || exState.paused) return; executionRefresh(); const item = exCurrent(); if (item && !exState.preview && ['running','queued','waiting_approval'].includes(item.run.status)) { for (const id of ['ex-elapsed','ex-plan-elapsed']) if ($(id)) $(id).textContent = exElapsed(item.run.startedAt,item.run.completedAt); } },2500);
  ${EXECUTION_WORKSPACE_SCRIPT}
  exRender();
`;

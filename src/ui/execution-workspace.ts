export const EXECUTION_WORKSPACE_STYLE = String.raw`
  .ex-page.ex-page { max-width:1420px; padding:0; background:transparent; border:0; box-shadow:none; }
  .ex-layout { display:grid; grid-template-columns:minmax(0,1fr) 255px; gap:26px; align-items:start; }
  .ex-center { min-width:0; }
  .ex-plan { position:sticky; top:22px; border-left:1px solid var(--line); padding-left:22px; min-width:0; }
  .ex-plan-toolbar { display:flex; align-items:center; justify-content:space-between; font-size:0.8rem; color:var(--body); padding:0 0 24px; }
  .ex-plan-toolbar button { background:transparent; border:0; padding:1px 5px; color:var(--muted); }
  .ex-plan-title { font:500 1rem/1.6 var(--font-sans); margin:0 0 10px; overflow-wrap:anywhere; }
  .ex-plan-timer { font:0.8rem var(--ex-mono); color:var(--muted); }
  .ex-plan-progress { display:flex; justify-content:space-between; font-size:0.8rem; margin:26px 0 9px; color:var(--muted); }
  .ex-plan progress { width:100%; height:4px; border:0; border-radius:3px; background:var(--line); accent-color:var(--blue); }
  .ex-plan progress::-webkit-progress-bar { background:var(--line); border-radius:3px; }
  .ex-plan progress::-webkit-progress-value { background:var(--blue); border-radius:3px; }
  .ex-checklist { list-style:none; margin:21px 0; padding:0; }
  .ex-checklist li { margin:0 0 6px; }
  .ex-checklist button { width:100%; text-align:left; display:flex; align-items:flex-start; gap:10px; background:transparent; border:0; padding:9px 0; font:0.8rem/1.6 var(--font-sans); color:var(--muted); }
  .ex-checklist .ex-state { margin-top:1px; }
  .ex-checklist .ex-current { color:var(--blue-soft); }
  .ex-checklist small { display:block; color:var(--muted); font-size:0.8rem; }
  .ex-plan-actions { display:flex; gap:7px; flex-wrap:wrap; border-top:1px solid var(--line); padding-top:15px; }
  .ex-plan-actions button { font-size:0.8rem; padding:6px 8px; background:var(--panel); }
  .ex-plan-note { color:var(--muted); font-size:0.8rem; line-height:1.7; margin-top:14px; }
  .ex-layout.ex-plan-collapsed { grid-template-columns:minmax(0,1fr) 30px; gap:16px; }
  .ex-plan-collapsed .ex-plan { padding-left:10px; }
  .ex-plan-collapsed .ex-plan-toolbar > span { display:none; }
  .ex-shortcuts { display:flex; flex-wrap:wrap; gap:4px; padding:0 0 12px; }
  .ex-shortcuts button { background:transparent; border:0; color:var(--muted); font-size:0.8rem; padding:5px 6px; }
  .ex-filters { display:flex; gap:5px; margin:0 0 6px; }
  .ex-filters label { flex:1; margin:0; min-width:0; }
  .ex-filters select,.ex-project-filter select { background:transparent; border-color:var(--line); color:var(--muted); font-size:0.8rem; padding:5px; }
  .ex-project-filter { margin:0 0 12px; }
  .ex-tree-parent { min-width:0; }
  .ex-tree-parent > .ex-tree-select { min-width:0; }
  .ex-tree-parent > .ex-pin { font-size:0.8rem; color:var(--muted); padding:3px; flex:none; }
  .ex-tree-parent > .ex-pin[aria-pressed="true"] { color:var(--copper); }
  .ex-task-age { font:0.8rem var(--ex-mono); color:var(--muted); flex:none; }
  .ex-feed { margin:22px 0; }
  .ex-feed-label { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:0.8rem; margin:20px 0 12px; }
  .ex-narrative { color:var(--body); font-size:0.8571rem; line-height:1.85; white-space:pre-wrap; overflow-wrap:anywhere; padding:0 4px; }
  .ex-command { margin:10px 0; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:#07111F; }
  .ex-command summary { display:flex; gap:10px; align-items:center; cursor:pointer; padding:12px 14px; color:var(--body); font:0.8rem/1.6 var(--ex-mono); }
  .ex-command summary > code { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:none; padding:0; }
  .ex-command summary > span:last-child { color:var(--muted); font-size:0.8rem; white-space:nowrap; }
  .ex-command-body { padding:0 14px 14px; border-top:1px solid var(--line); }
  .ex-command-body header { display:flex; gap:10px; align-items:center; justify-content:space-between; color:var(--muted); font:0.8rem var(--ex-mono); padding:10px 0; }
  .ex-command-body button { font-size:0.8rem; background:transparent; padding:4px 7px; }
  .ex-command-body pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; background:transparent; margin:0; padding:5px 0; border:0; color:var(--body); font:0.8rem/1.8 var(--ex-mono); }
  .ex-command-body .ex-stderr { color:var(--bad); }
  .ex-phase { margin:14px 0; color:var(--muted); font-size:0.8rem; }
  .ex-phase summary { cursor:pointer; }
  .ex-composer-left.ex-composer-left { flex-wrap:wrap; }
  .ex-compact-select.ex-model-select select { max-width:210px; }
  @media(max-width:1200px) { .ex-layout { grid-template-columns:minmax(0,1fr) 210px; gap:18px; } .ex-plan { padding-left:16px; } }
  @media(max-width:1000px) { .ex-layout { grid-template-columns:minmax(0,1fr); } .ex-plan { position:static; grid-row:1; border:1px solid var(--line); border-radius:10px; padding:13px; } .ex-plan-toolbar { padding-bottom:0; } #ex-plan-body { margin-top:14px; } .ex-checklist { display:flex; flex-wrap:wrap; gap:6px 22px; margin:12px 0; } .ex-plan-progress { margin-top:12px; } .ex-layout.ex-plan-collapsed { grid-template-columns:minmax(0,1fr); } .ex-plan-collapsed .ex-plan-toolbar > span { display:block; } }
`;

export const EXECUTION_WORKSPACE_SCRIPT = String.raw`
  function exIdentity(operator) {
    if (exState.operator && JSON.stringify(exState.operator) !== JSON.stringify(operator)) {
      ++exState.epoch; ++exState.selectionEpoch;
      exState.catalogs = false; exState.runs = []; exState.selected = null; exState.files = [];
      exState.models = []; exState.workspaces = []; exState.effortValues = [''];
      $('ex-prompt').value = ''; exError(null); exError(null,'refresh'); exRenderFiles();
    }
    exState.operator = operator;
    exRender();
  }
  function exNewTask() {
    if (exState.submitting) return;
    if (exState.preview) exPreview(false);
    ++exState.selectionEpoch; exState.newTask = true; exState.selected = null; exState.step = '';
    exState.files = []; $('ex-prompt').value = ''; $('ex-feedback').value = ''; exError(null);
    exRenderFiles(); exRender(); $('ex-prompt').focus();
  }
  function exFilterTasks(source,query) {
    const group = $('ex-group').value, project = $('ex-project').value;
    return source.filter(item => {
      const view = exSnapshot(item.run,item.kind);
      return (!query || [view.title,...view.nodes.map(node => node.name)].join(' ').toLocaleLowerCase(currentLang).includes(query)) && (group !== 'active' || view.active) && (group !== 'pinned' || exState.pinned.has(exKey(item))) && (!project || view.cwd === project);
    }).sort((a,b) => Number(exState.pinned.has(exKey(b))) - Number(exState.pinned.has(exKey(a))) || ($('ex-sort').value === 'oldest' ? 1 : -1) * ((a.run.createdAt || a.run.startedAt || 0)-(b.run.createdAt || b.run.startedAt || 0)));
  }
  function exTaskMeta(item) {
    const id = exKey(item), pinned = exState.pinned.has(id);
    const age = Math.max(0,((exState.preview ? 1700000014000 : Date.now())-(item.run.createdAt || item.run.startedAt || Date.now()))/1000);
    return '<span class="ex-task-age">' + esc(age < 60 ? t('ex_now') : age < 86400 ? Math.floor(age/3600) + 'h' : Math.floor(age/86400) + 'd') + '</span><button type="button" class="ex-pin" data-ex-pin="' + esc(id) + '" data-ex-focus="pin:' + esc(id) + '" aria-pressed="' + pinned + '" title="' + esc(t(pinned ? 'ex_unpin' : 'ex_pin')) + '" aria-label="' + esc(t(pinned ? 'ex_unpin' : 'ex_pin') + ': ' + exSnapshot(item.run,item.kind).title) + '">' + (pinned ? '◆' : '◇') + '</button>';
  }
  function exPopulateProjects() {
    const paths = [...new Set([...(exState.workspaces || []).map(item => item.path),...exState.runs.map(item => exSnapshot(item.run,item.kind).cwd)].filter(Boolean))];
    pfOptions('ex-project',paths.map(path => ({id:path,name:path})),() => t('ex_all_projects'));
  }
  function exUpdateEffort() { syncEffortControls(); }
  function exEffortValue() { return $('ex-effort').value || undefined; }

  function exRenderPlan() {
    const key = JSON.stringify([exCurrent(),currentLang,exState.preview,exState.operator?.role,exState.submitting]);
    if (key === exState.planKey) return; exState.planKey = key;
    const item = exCurrent(), view = item && exSnapshot(item.run,item.kind);
    const latestPlan = view?.nodes.flatMap(node => node.events.filter(event => event.kind === 'plan').map(event => ({event,node}))).at(-1);
    let activePlanItem = false;
    const checklist = latestPlan ? latestPlan.event.items.map(entry => { const running = !entry.completed && !activePlanItem && latestPlan.node.status === 'running'; if (running) activePlanItem = true; return {id:latestPlan.node.id,name:entry.text,status:entry.completed ? 'completed' : running ? 'running' : 'pending'}; }) : (view?.nodes || []).map(node => ({...node,name:item.kind === 'agent' ? t('lbl_iteration') + ' ' + node.iteration : node.name}));
    const progress = checklist.filter(node => node.status === 'completed').length, total = checklist.length;
    setLocalizedHtml($('ex-plan-content'),() => '<h3 class="ex-plan-title">' + esc(view?.title || t('ex_plan_empty')) + '</h3><span class="ex-plan-timer" id="ex-plan-elapsed">' + (view ? exElapsed(view.startedAt,view.completedAt || (exState.preview ? 1700000014000 : view.active ? undefined : view.startedAt)) : '—') + '</span><div class="ex-plan-progress"><span>' + esc(t('ex_progress')) + '</span><span>' + progress + ' / ' + total + '</span></div><progress max="' + Math.max(1,total) + '" value="' + progress + '" aria-label="' + esc(t('ex_progress')) + '"></progress><ol class="ex-checklist">' + checklist.map(node => '<li><button type="button" data-ex-plan-step="' + esc(node.id) + '"' + (node.status === 'running' ? ' class="ex-current"' : '') + '>' + exStatusIcon(node.status) + '<span>' + esc(node.name) + '<small>' + esc(localizedValue(node.status)) + '</small></span></button></li>').join('') + '</ol>');
    const approval = view?.status === 'waiting_approval' && !exState.preview;
    setLocalizedText($('ex-plan-run'),() => t(approval ? 'btn_approve' : 'ex_new_task'));
    $('ex-plan-run').disabled = approval && (!['admin','reviewer'].includes(exState.operator?.role) || exState.submitting);
  }
  function exCollapsePlan(collapsed) {
    exState.planCollapsed = collapsed;
    $('ex-layout').classList.toggle('ex-plan-collapsed',collapsed);
    $('ex-plan-body').hidden = collapsed;
    $('ex-plan-toggle').setAttribute('aria-expanded',String(!collapsed));
  }
  function exCommandCard(command,index) {
    const duration = command.completedAt && command.startedAt ? exElapsed(command.startedAt,command.completedAt) : t('ex_running');
    return '<details class="ex-command" data-ex-command="' + index + '"><summary>' + exIcons.terminal + '<code title="' + esc(command.command) + '">' + esc(command.command) + '</code><span>' + esc(command.exitCode == null ? duration : 'exit ' + command.exitCode + ' · ' + duration) + '</span></summary><div class="ex-command-body"><header><span title="' + esc(command.cwd || '') + '">' + esc(command.cwd || '') + '</span><button type="button" data-ex-copy="' + index + '">' + esc(t('ex_copy_command')) + '</button></header><pre>' + esc(command.command) + '</pre><header>' + esc(command.combinedOutput != null ? t('ex_combined_output') : 'stdout') + '</header><pre>' + esc(command.combinedOutput ?? command.stdout ?? t('ex_no_output')) + '</pre><header>stderr</header><pre class="ex-stderr">' + esc(command.stderr ?? (command.combinedOutput != null ? t('ex_stderr_unavailable') : t('ex_no_output'))) + '</pre></div></details>';
  }
  function exRenderFeed(view) {
    const node = view.nodes.find(item => item.id === exState.step);
    const commands = node?.commands || [];
    const open = new Set([...$('ex-feed').querySelectorAll('details[open]')].map(item => item.dataset.exCommand));
    setLocalizedHtml($('ex-feed'),() => '<div class="ex-feed"><div class="ex-feed-label">' + exIcons.branch + ' ' + esc(t('ex_activity_feed')) + '</div>' + (node?.startedAt && node?.completedAt ? '<details class="ex-phase"><summary>' + esc(t('ex_execution_duration')) + ' · ' + exElapsed(node.startedAt,node.completedAt) + '</summary><p>' + esc(t('ex_duration_note')) + '</p></details>' : '') + (node?.events || []).map(event => event.kind === 'message' && event.text !== node.content ? '<p class="ex-narrative">' + esc(event.text) + '</p>' : event.kind === 'command' ? exCommandCard(event,commands.indexOf(event)) : '').join('') + (!commands.length ? '<p class="ex-plan-note">' + esc(t('ex_no_commands')) + '</p>' : '') + '</div>');
    $('ex-feed').querySelectorAll('details[data-ex-command]').forEach(item => { item.open = open.has(item.dataset.exCommand); });
  }
  try { const pins = JSON.parse(localStorage.getItem('conduit_execution_pins') || '[]'); if (Array.isArray(pins)) exState.pinned = new Set(pins.filter(value => typeof value === 'string').slice(0,200)); } catch {}
  ['ex-group','ex-sort','ex-project'].forEach(id => $(id).addEventListener('change',exRenderTree));
  $('ex-model').addEventListener('change',exUpdateEffort);
  $('ex-tree').addEventListener('click',event => { const pin = event.target.closest('[data-ex-pin]'); if (!pin) return; const key = pin.dataset.exPin; exState.pinned.has(key) ? exState.pinned.delete(key) : exState.pinned.add(key); try { localStorage.setItem('conduit_execution_pins',JSON.stringify([...exState.pinned].slice(0,200))); } catch {} exRenderTree(); });
  $('ex-plan-content').addEventListener('click',event => { const button = event.target.closest('[data-ex-plan-step]'); if (button) { exState.step = button.dataset.exPlanStep; exRender(); } });
  $('ex-plan-toggle').addEventListener('click',() => exCollapsePlan(!exState.planCollapsed));
  $('ex-plan-run').addEventListener('click',() => { if (!exState.preview && exCurrent()?.run.status === 'waiting_approval') exRunAction('approve'); else exNewTask(); });
  $('ex-live-pause').addEventListener('click',() => { exState.paused = !exState.paused; ++exState.epoch; $('ex-live-pause').setAttribute('aria-pressed',String(exState.paused)); setLocalizedText($('ex-live-pause'),() => t(exState.paused ? 'ex_resume_updates' : 'ex_pause_updates')); exSetConnection(exState.paused ? 'ex_updates_paused' : exState.preview ? 'ex_sample' : 'ex_connecting'); if (!exState.paused) executionRefresh(); });
  $('ex-feed').addEventListener('click',async event => { const button = event.target.closest('[data-ex-copy]'); if (!button) return; const item = exCurrent(), view = item && exSnapshot(item.run,item.kind), command = view?.nodes.find(node => node.id === exState.step)?.commands?.[Number(button.dataset.exCopy)]; if (!command) return; try { await navigator.clipboard.writeText(command.command); button.textContent = t('ex_copied'); } catch { exError(new Error(t('ex_copy_failed'))); } });
  $('ex-automations').addEventListener('click',() => { showSection('platform'); pfTab('vault'); });
  $('ex-marketplace').addEventListener('click',() => { showSection('platform'); pfTab('library'); });
  if (window.matchMedia?.('(max-width:1000px)').matches) exCollapsePlan(true);
`;

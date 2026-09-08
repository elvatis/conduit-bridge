export const GIT_WORKSPACE_HTML = String.raw`
<section id="git-workspace" class="gw-page" aria-label="Git workspace" data-gw-aria="title">
  <header class="gw-page-head"><div><div class="gw-eyebrow">ELVATIS / DEVELOPER TOOLS</div><h2 data-gw-copy="title">Repository workspace</h2><p data-gw-copy="subtitle">Follow the history. Inspect every change.</p></div><span class="gw-live"><i></i><span data-gw-copy="local">Local repository</span></span></header>
  <div id="gw-notice" class="gw-notice" role="status" aria-live="polite"></div>
  <div class="gw-shell">
    <aside class="gw-sidebar" aria-label="Repository navigation" data-gw-aria="navigation">
      <div class="gw-workspace-choice"><label class="gw-label" for="gw-workspace" data-gw-copy="workspace">WORKSPACE</label><select id="gw-workspace" aria-label="Workspace" data-gw-aria="workspace"></select></div>
      <div class="gw-repo-meta"><span class="gw-branch" id="gw-branch">—</span><span id="gw-head" class="gw-mono"></span></div>
      <nav class="gw-views" aria-label="Repository views" data-gw-aria="views"><button type="button" data-gw-view="changes"><span>±</span><span data-gw-copy="changes">Changes</span><b id="gw-change-count">0</b></button><button type="button" data-gw-view="history" aria-pressed="true"><span>⑂</span><span data-gw-copy="history">History</span></button></nav>
      <div class="gw-section"><div class="gw-section-head"><button type="button" id="gw-branches-toggle" aria-expanded="false" aria-controls="gw-branches"><span class="gw-chevron">⌄</span><span data-gw-copy="branches">Branches</span><b id="gw-branches-count">0</b></button><button type="button" class="gw-plus" data-gw-action="create-branch" data-gw-title="createBranch" aria-label="Create branch">+</button></div><div id="gw-branches" class="gw-tree" hidden></div></div>
      <div class="gw-section"><div class="gw-section-head"><button type="button" id="gw-worktrees-toggle" aria-expanded="false" aria-controls="gw-worktrees"><span class="gw-chevron">⌄</span><span data-gw-copy="worktrees">Worktrees</span><b id="gw-worktrees-count">0</b></button><button type="button" class="gw-plus" data-gw-action="add-worktree" data-gw-title="addWorktree" aria-label="Add worktree">+</button></div><div id="gw-worktrees" class="gw-tree" hidden></div></div>
      <div class="gw-sidebar-foot"><span class="gw-dot"></span><span id="gw-root"></span></div>
    </aside>
    <main class="gw-history">
      <div class="gw-toolbar"><div class="gw-toolbar-meta"><span id="gw-filter-branch" class="gw-branch">—</span><span id="gw-commit-count" class="gw-muted"></span></div><div class="gw-actions"><button type="button" data-gw-action="fetch" data-gw-copy="fetch">Fetch</button><button type="button" data-gw-action="pull" data-gw-copy="pull">Pull</button><button type="button" data-gw-action="push" data-gw-copy="push">Push</button><button type="button" id="gw-refresh" data-gw-title="refresh" aria-label="Refresh">↻</button></div></div>
      <div class="gw-list-toolbar"><span id="gw-list-title" data-gw-copy="commitHistory">COMMIT HISTORY</span><label><input type="checkbox" id="gw-all-branches"><span data-gw-copy="allBranches">All branches</span></label></div>
      <div id="gw-log" class="gw-log" aria-label="Commit history" data-gw-aria="commitHistory"></div><footer class="gw-history-foot"><span id="gw-history-note"></span><span class="gw-mono">GIT</span></footer>
    </main>
    <aside class="gw-inspector" aria-label="Change inspector" data-gw-aria="inspector"><div id="gw-inspector-meta" class="gw-inspector-meta"></div><div id="gw-files" class="gw-files" aria-label="Changed files" data-gw-aria="changedFiles"></div><div id="gw-diff-banner" class="gw-diff-banner"></div><div id="gw-diff" class="gw-diff" tabindex="0" aria-label="Unified diff" data-gw-aria="diff"></div></aside>
  </div>
  <dialog id="gw-action-dialog" class="gw-dialog" aria-labelledby="gw-action-title" aria-describedby="gw-action-description"><form id="gw-action-form"><h3 id="gw-action-title"></h3><p id="gw-action-description"></p><label for="gw-action-name" data-gw-copy="branchName">Branch name</label><input id="gw-action-name" name="name" maxlength="120" autocomplete="off" placeholder="codex/feature-name" required><div class="gw-dialog-actions"><button type="button" id="gw-action-cancel" data-gw-copy="cancel">Cancel</button><button type="submit" class="gw-primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="action-label" data-gw-copy="create">Create</span></button></div></form></dialog>
</section>`;

export const GIT_WORKSPACE_STYLE = String.raw`
  .gw-page { --gw-bg:#050B16; --gw-panel:#0C182A; --gw-blue:#22B4FF; --gw-copper:#FF8A3D; --gw-muted:#8FA0BD; --gw-line:rgba(143,160,189,.16); --gw-text:#DCE7F7; --gw-mono:ui-monospace,SFMono-Regular,Consolas,monospace; color:var(--gw-text); font:0.8571rem/1.5 Inter,var(--font-sans,system-ui),sans-serif; min-width:0; padding:4px 0 16px; }
  .page-section.gw-page { scroll-margin-top:82px; background:transparent; border:0; border-radius:0; box-shadow:none; }
  .gw-page * { box-sizing:border-box; }
  .gw-page button,.gw-page select,.gw-page input { font:inherit; color:var(--gw-text); }
  .gw-page button { cursor:pointer; border:1px solid var(--gw-line); border-radius:5px; background:transparent; box-shadow:none; padding:5px 9px; }
  .gw-page button:hover { background:rgba(34,180,255,.07); color:#fff; }
  .gw-page button:focus-visible,.gw-page select:focus-visible,.gw-page input:focus-visible { outline:2px solid var(--gw-blue); outline-offset:2px; }
  .gw-page button:disabled { opacity:.4; cursor:not-allowed; }
  .gw-page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin:0 0 22px; }
  .gw-eyebrow { font:0.8rem var(--gw-mono); letter-spacing:.14em; color:var(--gw-copper); margin-bottom:8px; }
  .gw-page-head h2 { margin:0; font-size:1.7857rem; font-weight:550; letter-spacing:-.7px; }
  .gw-page-head p { color:var(--gw-muted); margin:5px 0 0; font-size:0.8rem; }
  .gw-live { display:flex; align-items:center; gap:7px; color:var(--gw-muted); font-size:0.8rem; }
  .gw-live i,.gw-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--gw-blue); flex:none; }
  .gw-notice { margin:0 0 10px; padding:9px 12px; border:1px solid var(--gw-line); border-radius:6px; color:var(--gw-muted); background:var(--gw-panel); overflow-wrap:anywhere; }
  .gw-notice:empty { display:none; }.gw-notice[data-error="true"] { border-color:rgba(247,110,123,.4); color:#ffacb5; }
  .gw-shell { display:grid; grid-template-columns:215px minmax(370px,.98fr) minmax(390px,1.06fr); min-height:calc(100dvh - 210px); height:auto; border:0; border-radius:0; overflow:visible; background:transparent; align-items:start; }
  .gw-sidebar { display:flex; flex-direction:column; min-height:0; overflow:visible; padding:18px 11px 12px; background:#091322; border-right:1px solid var(--gw-line); }
  .gw-label { display:block; color:var(--gw-muted); font:0.8rem var(--gw-mono); letter-spacing:.09em; margin:0 7px 7px; }
  #gw-workspace { width:100%; background:var(--gw-panel); border:1px solid var(--gw-line); border-radius:5px; padding:8px 9px; font-size:0.8rem; }
  .gw-repo-meta { display:flex; align-items:center; gap:8px; min-width:0; padding:10px 5px 20px; font-size:0.8rem; }
  .gw-branch { display:inline-block; background:rgba(34,180,255,.09); color:var(--gw-blue); border:1px solid rgba(34,180,255,.22); border-radius:4px; padding:2px 6px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:0.8rem/1.5 var(--gw-mono); }
  .gw-mono { font-family:var(--gw-mono); }.gw-muted,#gw-head { color:var(--gw-muted); }
  .gw-views { display:grid; gap:3px; margin-bottom:19px; }
  .gw-views button { display:flex; align-items:center; gap:9px; border:0; padding:8px 9px; text-align:left; color:var(--gw-muted); }
  .gw-views button[aria-pressed="true"] { background:rgba(34,180,255,.09); color:#67cdff; }
  .gw-views button > span:first-child { font:1.2143rem var(--gw-mono); line-height:1; }
  .gw-views b { margin-left:auto; border-radius:4px; background:rgba(143,160,189,.1); font:0.8rem var(--gw-mono); padding:2px 5px; }
  .gw-section { margin-bottom:17px; }.gw-section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
  .gw-section-head > button:first-child { display:flex; align-items:center; gap:7px; flex:1; padding:5px; border:0; text-align:left; color:var(--gw-muted); font-size:0.8rem; }
  .gw-section-head b { color:var(--gw-muted); font:0.8rem var(--gw-mono); opacity:.7; }.gw-chevron { color:var(--gw-muted); }
  .gw-section-head button[aria-expanded="false"] .gw-chevron { transform:rotate(-90deg); }.gw-page .gw-plus { border:0; padding:0 6px; font-size:1.1429rem; color:var(--gw-muted); }
  .gw-tree { max-height:230px; overflow:auto; }.gw-tree[hidden] { display:none; }
  .gw-page .gw-tree button { width:100%; display:flex; gap:8px; border:0; align-items:flex-start; text-align:left; padding:6px 8px; color:var(--gw-muted); border-radius:4px; font-size:0.8rem; }
  .gw-tree button[aria-pressed="true"] { background:rgba(34,180,255,.06); color:#c5eaff; }.gw-tree .gw-mark { width:12px; flex:none; color:var(--gw-blue); font-size:0.8rem; }
  .gw-tree-text { min-width:0; flex:1; }.gw-tree-text > span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.gw-tree-text small { display:block; font:0.8rem var(--gw-mono); opacity:.65; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-top:2px; }
  .gw-tree-label { padding:10px 8px 3px; color:var(--gw-muted); opacity:.6; font:0.8rem var(--gw-mono); letter-spacing:.08em; }
  .gw-sidebar-foot { margin-top:auto; padding:14px 6px 0; border-top:1px solid var(--gw-line); display:flex; align-items:center; gap:6px; font:0.8rem var(--gw-mono); color:var(--gw-muted); }.gw-sidebar-foot span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gw-history { display:flex; flex-direction:column; overflow:visible; min-width:0; border-right:1px solid var(--gw-line); }
  .gw-toolbar { min-height:61px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid var(--gw-line); background:rgba(12,24,42,.45); }
  .gw-toolbar-meta { display:flex; flex-direction:column; gap:4px; min-width:0; }.gw-toolbar-meta .gw-muted { font:0.8rem var(--gw-mono); }.gw-toolbar .gw-branch { font-size:0.8rem; max-width:180px; }
  .gw-actions { display:flex; gap:3px; flex:none; }.gw-actions button { padding:5px 6px; font-size:0.8rem; }.gw-actions button:last-child { font-size:1.0714rem; padding:1px 6px; }
  .gw-list-toolbar { display:flex; align-items:center; justify-content:space-between; padding:11px 13px; gap:8px; color:var(--gw-muted); font:0.8rem var(--gw-mono); letter-spacing:.07em; border-bottom:1px solid var(--gw-line); }
  .gw-list-toolbar label { display:flex; align-items:center; gap:5px; font:0.8rem Inter,system-ui,sans-serif; letter-spacing:0; white-space:nowrap; margin:0; }.gw-list-toolbar input { margin:0; accent-color:var(--gw-blue); width:11px; height:11px; }
  .gw-log { overflow:visible; flex:1; min-height:0; }.gw-page .gw-commit { display:flex; width:100%; align-items:center; gap:8px; padding:0 12px 0 5px; border:0; border-bottom:1px solid rgba(143,160,189,.04); border-radius:0; text-align:left; min-height:38px; font-size:0.8rem; }
  .gw-commit[aria-pressed="true"] { background:rgba(34,180,255,.095); box-shadow:inset 2px 0 var(--gw-blue); }.gw-commit svg { display:block; flex:none; min-height:38px; }
  .gw-commit-copy { flex:1; min-width:0; display:flex; align-items:center; gap:5px; }.gw-commit-subject { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gw-refs { display:flex; flex:none; gap:3px; max-width:45%; overflow:hidden; }.gw-ref { display:inline-block; max-width:105px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:1px solid rgba(34,180,255,.22); border-radius:3px; padding:1px 4px; color:var(--gw-blue); font:0.8rem var(--gw-mono); background:rgba(34,180,255,.06); }.gw-ref.remote { color:var(--gw-copper); border-color:rgba(255,138,61,.22); background:rgba(255,138,61,.06); }
  .gw-author { max-width:75px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--gw-muted); font-size:0.8rem; }.gw-age { flex:none; width:29px; text-align:right; color:var(--gw-muted); font:0.8rem var(--gw-mono); }
  .gw-history-foot { display:flex; justify-content:space-between; align-items:center; min-height:32px; padding:8px 12px; font-size:0.8rem; color:var(--gw-muted); border-top:1px solid var(--gw-line); background:rgba(12,24,42,.4); }
  .gw-inspector { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:visible; position:sticky; top:1rem; }.gw-inspector-meta { padding:18px 16px 14px; min-height:96px; background:rgba(12,24,42,.4); border-bottom:1px solid var(--gw-line); }.gw-inspector-meta h3 { font-size:0.9286rem; font-weight:500; margin:0 0 9px; line-height:1.5; overflow-wrap:anywhere; }.gw-meta-row { display:flex; align-items:center; flex-wrap:wrap; gap:5px 11px; font:0.8rem var(--gw-mono); color:var(--gw-muted); }.gw-meta-row strong { color:var(--gw-copper); font-weight:400; }.gw-meta-row time { font-size:0.8rem; }
  .gw-files { max-height:160px; min-height:0; overflow:auto; padding:7px 0; border-bottom:1px solid var(--gw-line); }.gw-page .gw-file { border:0; border-radius:0; padding:5px 15px; width:100%; display:flex; align-items:center; gap:8px; font:0.8rem var(--gw-mono); text-align:left; }.gw-file[aria-pressed="true"] { background:rgba(34,180,255,.075); }.gw-file-path { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; color:#b7c7df; }.gw-file small { color:var(--gw-muted); font:0.8rem var(--gw-mono); }
  .gw-status { width:12px; flex:none; color:var(--gw-copper); font:0.8rem var(--gw-mono); }.gw-status-A { color:#6adba9; }.gw-status-D,.gw-status-U { color:#f69ba3; }
  .gw-diff-banner { position:sticky; top:0; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 15px; border-bottom:1px solid var(--gw-line); background:var(--gw-panel); font:0.8rem var(--gw-mono); min-height:35px; }.gw-diff-banner > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.gw-stats { white-space:nowrap; }.gw-add-count { color:#6adba9; }.gw-del-count { color:#f69ba3; }
  .gw-diff { flex:1; overflow:auto; min-height:180px; background:#060e1b; font:0.8rem/1.85 var(--gw-mono); }.gw-diff table { width:100%; border-collapse:collapse; font:inherit; }.gw-diff td { padding:0; border:0; vertical-align:top; }.gw-diff .gw-line-no { width:35px; min-width:35px; padding:0 6px; color:#97a8c0; text-align:right; user-select:none; font:0.8rem/20px var(--gw-mono); background:rgba(143,160,189,.015); }.gw-diff .gw-line-code { white-space:pre; padding:0 12px 0 9px; line-height:20px; color:#b4c4dc; }.gw-diff .gw-add { background:rgba(63,166,119,.1); }.gw-diff .gw-del { background:rgba(210,76,97,.105); }.gw-diff .gw-add .gw-line-code { color:#a3d4be; }.gw-diff .gw-del .gw-line-code { color:#dcacb4; }.gw-diff .gw-hunk { background:rgba(34,180,255,.065); }.gw-diff .gw-hunk .gw-line-code { color:#63afda; font-size:0.8rem; }.gw-diff .gw-diff-meta .gw-line-code { color:#97a8c0; font-size:0.8rem; }.gw-token-string { color:#b9c58b; }.gw-token-keyword { color:#b4a4ea; }.gw-token-number { color:#d9ad85; }.gw-token-comment { color:#97a8c0; }
  .gw-empty { padding:35px 20px; text-align:center; color:var(--gw-muted); font-size:0.8rem; line-height:1.8; }.gw-empty > span { display:block; font-size:1.7143rem; color:var(--gw-blue); opacity:.6; margin-bottom:7px; }.gw-patch-note { padding:9px 14px; color:var(--gw-copper); border-top:1px solid var(--gw-line); font:0.8rem var(--gw-mono); }
  .gw-dialog { color:var(--gw-text); background:var(--gw-panel); border:1px solid var(--gw-line); border-radius:10px; max-width:430px; width:calc(100% - 40px); padding:24px; }.gw-dialog::backdrop { background:rgba(0,0,0,.65); }.gw-dialog h3 { font-size:1.2143rem; margin:0 0 9px; }.gw-dialog p { color:var(--gw-muted); font-size:0.8571rem; line-height:1.7; }.gw-dialog label { display:block; font-size:0.8rem; margin:18px 0 7px; }.gw-dialog input { width:100%; background:var(--gw-bg); border:1px solid var(--gw-line); border-radius:5px; padding:9px; font:0.8571rem var(--gw-mono); }.gw-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:22px; }.gw-page .gw-primary { background:var(--gw-blue); color:#031021; border-color:var(--gw-blue); }
  @media(min-width:1550px) { .gw-shell { grid-template-columns:230px minmax(480px,1.04fr) minmax(460px,1fr); }.gw-author { max-width:95px; } }
  @media(max-width:1200px) { .gw-shell { grid-template-columns:185px minmax(320px,1fr) minmax(340px,1fr); }.gw-author { display:none; }.gw-actions button { font-size:0.8rem; padding:5px; } }
  @media(max-width:1000px) { .gw-shell { grid-template-columns:185px minmax(0,1fr); height:auto; min-height:700px; }.gw-history { height:auto; border-right:0; }.gw-sidebar { grid-row:1 / span 2; }.gw-inspector { grid-column:2; height:auto; position:static; border-top:1px solid var(--gw-line); }.gw-author { display:block; } }
  @media(max-width:650px) { .gw-shell { display:flex; flex-direction:column; }.gw-sidebar { max-height:none; border-right:0; border-bottom:1px solid var(--gw-line); }.gw-section { margin:0 0 8px; }.gw-tree { max-height:100px; }.gw-sidebar-foot { display:none; }.gw-repo-meta { padding-bottom:10px; }.gw-views { grid-template-columns:1fr 1fr; margin-bottom:10px; }.gw-history { height:auto; flex:none; }.gw-inspector { height:auto; flex:none; }.gw-page-head { align-items:flex-start; }.gw-live { display:none; }.gw-page-head h2 { font-size:1.5714rem; }.gw-author { display:none; }.gw-toolbar .gw-branch { max-width:145px; } }
`;

/** Isolated browser module. Host passes its authenticated request helper through configure(). */
export const GIT_WORKSPACE_SCRIPT = String.raw`
(() => {
  const $g = id => document.getElementById(id);
  const state = { workspaceId:'', workspaces:[], worktree:'', branch:'', allBranches:false, mode:'history', snapshot:null, selected:'', selectedPath:'', detail:null, epoch:0, detailEpoch:0, canWrite:false, busy:false, loaded:false, action:'' };
  const words = {
    en:{ navigation:'Repository navigation',views:'Repository views',inspector:'Change inspector',changedFiles:'Changed files',diff:'Unified diff',title:'Repository workspace',subtitle:'Follow the history. Inspect every change.',local:'Local repository',workspace:'WORKSPACE',changes:'Changes',history:'History',branches:'Branches',worktrees:'Worktrees',createBranch:'Create branch',addWorktree:'Add worktree',fetch:'Fetch',pull:'Pull',push:'Push',refresh:'Refresh',commitHistory:'COMMIT HISTORY',allBranches:'All branches',branchName:'Branch name',cancel:'Cancel',create:'Create',loading:'Reading repository…',noWorkspace:'Select a configured workspace to inspect its repository.',notGit:'No Git repository root detected in this workspace.',emptyHistory:'This repository has no commits yet.',selectCommit:'Select a commit to inspect its files and diff.',clean:'The working directory is clean.',selectFile:'Select a file to inspect its changes.',commits:'commits',files:'files',detached:'detached',localBranches:'LOCAL',remoteBranches:'REMOTES',outside:'Outside this configured workspace. Open its registered workspace to inspect it.',locked:'Locked',unknown:'No commit yet',historyHint:'Select a commit to inspect',bounded:'Showing the newest {n} commits',working:'Working directory changes',workingHint:'Combined staged and unstaged changes against HEAD',firstParent:'Merge changes are compared with the first parent.',untracked:'untracked',staged:'staged',unstaged:'unstaged',binary:'Binary file changed. Text preview is unavailable.',truncated:'Preview limited to 240 KiB. Counts refer to the visible patch.',noDiff:'No text changes for this file.',createBranchHint:'Create a local branch at the current HEAD. Enter the new branch name.',addWorktreeHint:'Create a new branch and working copy inside this workspace’s .conduit-worktrees directory.',operation:'Running Git operation…',failed:'Repository request failed.',readOnly:'Repository write access is required.',now:'now',updated:'Updated',choose:'Select workspace',conflict:'conflict',renamed:'renamed'},
    de:{ navigation:'Repository-Navigation',views:'Repository-Ansichten',inspector:'Änderungsprüfung',changedFiles:'Geänderte Dateien',diff:'Zeilenvergleich',title:'Repository-Arbeitsbereich',subtitle:'Verlauf verfolgen. Jede Änderung prüfen.',local:'Lokales Repository',workspace:'ARBEITSBEREICH',changes:'Änderungen',history:'Verlauf',branches:'Branches',worktrees:'Arbeitskopien',createBranch:'Branch erstellen',addWorktree:'Arbeitskopie hinzufügen',fetch:'Abrufen',pull:'Übernehmen',push:'Hochladen',refresh:'Aktualisieren',commitHistory:'COMMIT-VERLAUF',allBranches:'Alle Branches',branchName:'Branch-Name',cancel:'Abbrechen',create:'Erstellen',loading:'Repository wird gelesen…',noArbeitsbereich:'Wähle einen konfigurierten Arbeitsbereich für die Repository-Ansicht.',notGit:'In diesem Arbeitsbereich wurde kein Git-Repository-Root erkannt.',emptyHistory:'Dieses Repository hat noch keine Commits.',selectCommit:'Wähle einen Commit für Dateiliste und Diff.',clean:'Das Arbeitsverzeichnis ist sauber.',selectFile:'Wähle eine Datei, um ihre Änderungen zu prüfen.',commits:'Commits',files:'Dateien',detached:'ohne Branch',localBranches:'LOKAL',remoteBranches:'ENTFERNT',outside:'Außerhalb dieses Arbeitsbereich. Zur Ansicht den registrierten Arbeitsbereich öffnen.',locked:'Gesperrt',unknown:'Noch kein Commit',historyHint:'Commit zur Prüfung auswählen',bounded:'Die neuesten {n} Commits werden angezeigt',working:'Änderungen im Arbeitsverzeichnis',workingHint:'Vorgemerkte und nicht vorgemerkte Änderungen gegenüber HEAD',firstParent:'Merge-Änderungen werden mit dem ersten Vorgänger verglichen.',untracked:'nicht erfasst',staged:'vorgemerkt',unstaged:'nicht vorgemerkt',binary:'Binärdatei geändert. Keine Textvorschau verfügbar.',truncated:'Vorschau auf 240 KiB begrenzt. Zeilenzahlen beziehen sich auf den sichtbaren Diff.',noDiff:'Keine Textänderungen für diese Datei.',createBranchHint:'Erstelle einen lokalen Branch am aktuellen HEAD. Gib den neuen Branch-Namen ein.',addWorktreeHint:'Erstelle einen neuen Branch samt Arbeitskopie im Ordner .conduit-worktrees dieses Arbeitsbereich.',operation:'Git-Aktion wird ausgeführt…',failed:'Repository-Abfrage fehlgeschlagen.',readOnly:'Schreibzugriff auf das Repository erforderlich.',now:'jetzt',updated:'Aktualisiert',choose:'Arbeitsbereich wählen',conflict:'Konflikt',renamed:'umbenannt'}
  };
  let request = async (path, options) => { const response = await fetch(path, { credentials:'same-origin',...options }); const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || copy('failed')); return data; };
  let language = '';
  function copy(key) { const lang = language || (typeof currentLang === 'string' ? currentLang : document.documentElement.lang); return (words[String(lang).startsWith('de') ? 'de' : 'en'][key] || words.en[key] || key); }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function notice(text, error) { if (!$g('gw-notice')) return; $g('gw-notice').textContent = text || ''; $g('gw-notice').dataset.error = String(!!error); }
  function empty(message) { return '<div class="gw-empty"><span>⑂</span>' + escape(message) + '</div>'; }
  function pathFor(endpoint, extra) { const params = new URLSearchParams({workspaceId:state.workspaceId,...(state.worktree ? {worktree:state.worktree} : {}),...extra}); return '/api/git-workspace/' + endpoint + '?' + params; }
  function applyCopy() { const root = $g('git-workspace'); if (!root) return; root.querySelectorAll('[data-gw-aria]').forEach(node => node.setAttribute('aria-label',copy(node.dataset.gwAria))); root.querySelectorAll('[data-gw-copy]').forEach(node => node.textContent = copy(node.dataset.gwCopy)); root.querySelectorAll('[data-gw-title]').forEach(node => { node.title=copy(node.dataset.gwTitle); node.setAttribute('aria-label',node.title); }); }
  function controls() { const root=$g('git-workspace'); if(!root) return; root.querySelectorAll('[data-gw-action]').forEach(button => { button.disabled = state.busy || !state.canWrite || !state.snapshot?.detected; button.title=state.canWrite ? copy(button.dataset.gwTitle||button.dataset.gwCopy||button.dataset.gwAction) : copy('readOnly'); }); $g('gw-refresh').disabled=state.busy; $g('gw-workspace').disabled=state.busy; }
  function age(date) { const minutes=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000)); return minutes<1 ? copy('now') : minutes<60 ? minutes+'m' : minutes<1440 ? Math.floor(minutes/60)+'h' : Math.floor(minutes/1440)+(language==='de'?'T':'d'); }
  function graph(commit,index,width) {
    const palette=['#22B4FF','#FF8A3D','#929DE8','#64CDB2','#D18DC7','#D2BF79']; const x=lane=>10+lane*12; const row=commit.graph; let paths='';
    row.edges.forEach(edge => { const from=x(edge.from),to=x(edge.to),start=edge.kind==='through'?0:19; paths+='<path d="M'+from+' '+start+' C'+from+' '+(start+7)+' '+to+' 30 '+to+' 38" fill="none" stroke="'+palette[edge.color%palette.length]+'" stroke-width="1.35" opacity=".72"/>'; });
    if(index>0 && state.snapshot.commits[index-1].graph.edges.some(edge=>edge.to===row.lane)) paths+='<path d="M'+x(row.lane)+' 0 V19" stroke="'+palette[row.lane%palette.length]+'" stroke-width="1.35"/>';
    const head=commit.head?'<circle cx="'+x(row.lane)+'" cy="50%" r="6" fill="none" stroke="'+palette[row.lane%palette.length]+'" opacity=".6"/>':'';
    return '<svg class="gw-graph" width="'+width+'" height="38" aria-hidden="true"><svg width="100%" height="100%" viewBox="0 0 '+width+' 38" preserveAspectRatio="none">'+paths+'</svg>'+head+'<circle cx="'+x(row.lane)+'" cy="50%" r="3.2" fill="#071321" stroke="'+palette[row.lane%palette.length]+'" stroke-width="1.7"/></svg>';
  }
  function renderSidebar() {
    const s=state.snapshot; $g('gw-branch').textContent=s?.branch || (s?.head ? s.head.slice(0,7)+' ('+copy('detached')+')' : '—'); $g('gw-head').textContent=(s?.head||'').slice(0,7); $g('gw-root').textContent=s?.root||''; $g('gw-root').title=s?.root||'';
    $g('gw-change-count').textContent=String(s?.files.length||0); $g('gw-branches-count').textContent=String(s?.branches.length||0); $g('gw-worktrees-count').textContent=String(s?.worktrees.length||0);
    $g('gw-branches').innerHTML=[false,true].map(remote=>{ const branches=(s?.branches||[]).filter(branch=>branch.remote===remote); return branches.length ? '<div class="gw-tree-label">'+copy(remote?'remoteBranches':'localBranches')+'</div>'+branches.map(branch=>'<button type="button" data-gw-branch="'+escape(branch.ref)+'" aria-pressed="'+(state.branch===branch.ref)+'" title="'+escape(branch.name)+'"><span class="gw-mark">'+(branch.current?'✓':'⑂')+'</span><span class="gw-tree-text"><span>'+escape(branch.name)+'</span></span></button>').join('') : ''; }).join('');
    $g('gw-worktrees').innerHTML=(s?.worktrees||[]).map(tree=>'<button type="button" data-gw-worktree="'+escape(tree.id)+'" aria-pressed="'+tree.active+'"'+(!tree.available?' disabled':'')+' title="'+escape(tree.path+(!tree.available?' — '+copy('outside'):''))+'"><span class="gw-mark">'+(tree.active?'◆':'◇')+'</span><span class="gw-tree-text"><span>'+escape(tree.name)+'</span><small>'+escape(tree.branch||(tree.head.slice(0,7)+' ('+copy('detached')+')'))+(tree.locked?' · '+copy('locked'):'')+'</small></span></button>').join('');
    document.querySelectorAll('[data-gw-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.gwView===state.mode)));
  }
  function fileRows(files,center) { return files.map(file=>'<button type="button" class="gw-file" data-gw-file="'+escape(file.path)+'" aria-pressed="'+(state.selectedPath===file.path)+'" title="'+escape((file.previousPath?file.previousPath+' → ':'')+file.path)+'"><span class="gw-status gw-status-'+escape(file.status)+'">'+escape(file.status)+'</span><span class="gw-file-path">'+escape(file.path)+'</span>'+(center?'<small>'+escape(file.untracked?copy('untracked'):file.status==='U'?copy('conflict'):[file.staged?copy('staged'):'',file.unstaged?copy('unstaged'):''].filter(Boolean).join(' · '))+'</small>':'')+'</button>').join(''); }
  function renderLog() {
    const s=state.snapshot; if(!s?.detected) { $g('gw-log').innerHTML=empty(state.workspaceId?copy('notGit'):copy('noWorkspace')); $g('gw-commit-count').textContent=''; $g('gw-history-note').textContent=''; return; }
    $g('gw-filter-branch').textContent=state.branch.replace(/^refs\/(heads|remotes)\//,'')||s.branch||(s.head?s.head.slice(0,7):copy('unknown'));
    $g('gw-commit-count').textContent=state.mode==='history'?s.commits.length+(s.truncated?'+':'')+' '+copy('commits'):s.files.length+' '+copy('files');
    $g('gw-all-branches').parentElement.hidden=state.mode!=='history'; $g('gw-all-branches').checked=state.allBranches; $g('gw-list-title').textContent=copy(state.mode==='history'?'commitHistory':'working');
    if(state.mode==='changes') $g('gw-log').innerHTML=s.files.length?fileRows(s.files,true):empty(copy('clean'));
    else { const width=Math.max(30,...s.commits.map(commit=>commit.graph.width*12+9)); $g('gw-log').innerHTML=s.commits.length?s.commits.map((commit,index)=>'<button type="button" class="gw-commit" data-gw-commit="'+escape(commit.sha)+'" aria-pressed="'+(state.selected===commit.sha)+'" title="'+escape(commit.sha+' · '+commit.subject)+'">'+graph(commit,index,width)+'<span class="gw-commit-copy">'+(commit.refs.length?'<span class="gw-refs">'+commit.refs.map(ref=>'<span class="gw-ref'+(ref.includes('/')?' remote':'')+'">'+escape(ref)+'</span>').join('')+'</span>':'')+'<span class="gw-commit-subject">'+escape(commit.subject)+'</span></span><span class="gw-author">'+escape(commit.author)+'</span><time class="gw-age" datetime="'+escape(commit.date)+'">'+escape(age(commit.date))+'</time></button>').join(''):empty(copy('emptyHistory')); }
    $g('gw-history-note').textContent=state.mode==='changes'?copy('workingHint'):s.truncated?copy('bounded').replace('{n}',String(s.historyLimit)):copy('historyHint');
  }
  function syntax(text) {
    const token=/(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|throw|try|catch|true|false|null|undefined|def|in|self|public|private|interface|type)\b|\b\d+(?:\.\d+)?\b)/g;
    let out='',last=0; for(const match of text.matchAll(token)) { out+=escape(text.slice(last,match.index)); const value=match[0],kind=value.startsWith('//')||value.startsWith('#')?'comment':value.startsWith('"')||value.startsWith("'")?'string':/^\d/.test(value)?'number':'keyword'; out+='<span class="gw-token-'+kind+'">'+escape(value)+'</span>'; last=match.index+value.length; } return out+escape(text.slice(last));
  }
  function renderPatch(detail) {
    if(detail.binary) return empty(copy('binary'));
    if(!detail.patch) return empty(detail.message||copy('noDiff'));
    let oldLine=0,newLine=0,inHunk=false; const rows=detail.patch.split('\n').map((line,index,array)=>{
      if(index===array.length-1&&!line) return ''; let kind='gw-diff-meta',old='',next=''; const hunk=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if(hunk) { oldLine=Number(hunk[1]);newLine=Number(hunk[2]);inHunk=true;kind='gw-hunk'; }
      else if(inHunk && line.startsWith('+')) { kind='gw-add'; next=newLine++; }
      else if(inHunk && line.startsWith('-')) { kind='gw-del'; old=oldLine++; }
      else if(inHunk && line.startsWith(' ')) { kind='';old=oldLine++;next=newLine++; }
      else if(line.startsWith('diff --git')) inHunk=false;
      return '<tr class="'+kind+'"><td class="gw-line-no">'+old+'</td><td class="gw-line-no">'+next+'</td><td class="gw-line-code">'+(kind==='gw-hunk'||kind==='gw-diff-meta'?escape(line):escape(line.slice(0,1))+syntax(line.slice(1)))+'</td></tr>';
    }).join(''); return '<table aria-label="Unified diff"><tbody>'+rows+'</tbody></table>'+(detail.truncated?'<div class="gw-patch-note">'+copy('truncated')+'</div>':'');
  }
  function renderDetail() {
    const detail=state.detail; if(!detail) { $g('gw-inspector-meta').innerHTML='<h3>'+copy(state.mode==='changes'?'working':'history')+'</h3>'; $g('gw-files').innerHTML=''; $g('gw-diff-banner').innerHTML=''; $g('gw-diff').innerHTML=empty(copy(state.mode==='changes'?'selectFile':'selectCommit')); return; }
    const commit=detail.commit; $g('gw-inspector-meta').innerHTML=commit?'<h3>'+escape(commit.subject)+'</h3><div class="gw-meta-row"><span>'+escape(commit.author)+'</span><strong>'+escape(commit.sha.slice(0,9))+'</strong><time datetime="'+escape(commit.date)+'">'+escape(commit.date)+'</time></div>'+(commit.parents.length>1?'<div class="gw-meta-row" style="margin-top:7px">'+copy('firstParent')+'</div>':''):'<h3>'+copy('working')+'</h3><div class="gw-meta-row">'+copy('workingHint')+'</div>';
    $g('gw-files').innerHTML=fileRows(detail.files,false); $g('gw-diff-banner').innerHTML='<span title="'+escape(detail.path||'')+'">'+escape(detail.path||'—')+'</span><span class="gw-stats"><span class="gw-add-count">+'+detail.additions+'</span> <span class="gw-del-count">−'+detail.deletions+'</span></span>'; $g('gw-diff').innerHTML=renderPatch(detail);
  }
  async function loadDetail(path) {
    const epoch=++state.detailEpoch,workspace=state.workspaceId; state.selectedPath=path||'';
    if(state.mode==='history'&&!state.selected) { state.detail=null;renderDetail();return; }
    $g('gw-diff').innerHTML=empty(copy('loading'));
    try { const result=await request(pathFor('diff',{mode:state.mode,...(state.mode==='history'?{commit:state.selected}:{}),...(path?{path}: {})})); if(epoch!==state.detailEpoch||workspace!==state.workspaceId) return; state.detail=result; state.selectedPath=result.path||'';renderDetail(); if(state.mode==='changes')renderLog(); }
    catch(error) { if(epoch!==state.detailEpoch)return; state.detail=null;renderDetail();notice(error.message||copy('failed'),true); }
  }
  async function load() {
    if(!$g('git-workspace'))return; const epoch=++state.epoch; ++state.detailEpoch; applyCopy();
    if(!state.workspaceId) { state.snapshot=null;state.detail=null;renderSidebar();renderLog();renderDetail();controls();return; }
    notice(copy('loading')); $g('git-workspace').setAttribute('aria-busy','true');
    try { const result=await request(pathFor('snapshot',{allBranches:String(state.allBranches),...(state.branch?{branch:state.branch}:{})})); if(epoch!==state.epoch)return;
      state.snapshot=result;state.loaded=true;state.worktree=result.worktree||'';notice('');renderSidebar();renderLog();controls();
      document.dispatchEvent(new CustomEvent('git-workspace-detected',{detail:{detected:result.detected,workspaceId:state.workspaceId}}));
      if(!result.detected) { state.detail=null;renderDetail();return; }
      if(state.mode==='history'&&!result.commits.some(commit=>commit.sha===state.selected)) state.selected=result.commits[0]?.sha||'';
      renderLog(); await loadDetail(state.selectedPath&&state.mode==='changes'&&result.files.some(file=>file.path===state.selectedPath)?state.selectedPath:undefined);
    } catch(error) { if(epoch!==state.epoch)return;state.snapshot=null;state.detail=null;renderSidebar();renderLog();renderDetail();notice(error.message||copy('failed'),true); }
    finally { if(epoch===state.epoch) { $g('git-workspace').removeAttribute('aria-busy');controls(); } }
  }
  function resetSelection() { ++state.detailEpoch;state.selected='';state.selectedPath='';state.detail=null; }
  function setWorkspace(id) { state.workspaceId=id||'';state.worktree='';state.branch='';state.snapshot=null;resetSelection();$g('gw-workspace').value=state.workspaceId;return load(); }
  async function runAction(action,name) {
    if(state.busy||!state.canWrite)return;state.busy=true;controls();notice(copy('operation'));
    try { const result=await request('/api/git-workspace/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:state.workspaceId,...(state.worktree?{worktree:state.worktree}:{}),action,...(name?{name}:{})})});await load();notice(result.message||''); }
    catch(error) { notice(error.message||copy('failed'),true); } finally { state.busy=false;controls(); }
  }
  function bind() {
    const root=$g('git-workspace');if(!root||root.dataset.bound)return;root.dataset.bound='true';
    root.addEventListener('click',event=> { const target=event.target.closest('button');if(!target||target.disabled)return;
      if(target.dataset.gwCommit) { state.selected=target.dataset.gwCommit;state.selectedPath='';renderLog();void loadDetail(); }
      else if(target.hasAttribute('data-gw-file')) void loadDetail(target.dataset.gwFile);
      else if(target.dataset.gwBranch) { state.branch=target.dataset.gwBranch;state.allBranches=false;state.mode='history';resetSelection();void load(); }
      else if(target.dataset.gwWorktree) { state.worktree=target.dataset.gwWorktree;state.branch='';resetSelection();void load(); }
      else if(target.dataset.gwView) { state.mode=target.dataset.gwView;state.selectedPath='';renderSidebar();renderLog();void loadDetail(); }
      else if(target.dataset.gwAction) { const action=target.dataset.gwAction; if(action==='create-branch'||action==='add-worktree') { state.action=action;$g('gw-action-title').textContent=copy(action==='create-branch'?'createBranch':'addWorktree');$g('gw-action-description').textContent=copy(action==='create-branch'?'createBranchHint':'addWorktreeHint');$g('gw-action-name').value='';$g('gw-action-dialog').showModal();$g('gw-action-name').focus(); } else void runAction(action); }
    });
    ['branches','worktrees'].forEach(key=>$g('gw-'+key+'-toggle').addEventListener('click',()=>{const button=$g('gw-'+key+'-toggle'),expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));$g('gw-'+key).hidden=expanded;}));
    $g('gw-workspace').addEventListener('change',event=>void setWorkspace(event.target.value));$g('gw-all-branches').addEventListener('change',event=>{state.allBranches=event.target.checked;state.branch='';resetSelection();void load();});$g('gw-refresh').addEventListener('click',()=>void load());
    $g('gw-action-cancel').addEventListener('click',()=>$g('gw-action-dialog').close());$g('gw-action-form').addEventListener('submit',event=>{event.preventDefault();const name=$g('gw-action-name').value.trim();if(!name)return;$g('gw-action-dialog').close();void runAction(state.action,name);});
  }
  window.gitWorkspace={
    configure(options={}) { if(options.request)request=options.request;if(options.language)language=options.language;if(typeof options.canWrite==='boolean')state.canWrite=options.canWrite;if(options.workspaces)state.workspaces=options.workspaces;
      bind();applyCopy();const select=$g('gw-workspace');if(!select)return;
      select.innerHTML='<option value="">'+copy('choose')+'</option>'+state.workspaces.map(workspace=>'<option value="'+escape(workspace.id)+'">'+escape(workspace.name||workspace.id)+'</option>').join('');
      const id=options.workspaceId!==undefined?options.workspaceId:state.workspaceId||state.workspaces.find(workspace=>workspace.id==='ws-default')?.id||state.workspaces[0]?.id||'';select.value=id;controls();if(id!==state.workspaceId||!state.loaded)return setWorkspace(id);
    },load,refresh:load,setWorkspace,setLanguage(value){language=value;applyCopy();renderSidebar();renderLog();renderDetail();},getDetected(){return !!state.snapshot?.detected;}
  };
  bind();applyCopy();controls();
})();
`;

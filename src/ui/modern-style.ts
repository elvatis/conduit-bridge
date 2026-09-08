/** Shared visual hierarchy: quiet chrome, readable content and restrained depth. */
export const MODERN_STYLE = String.raw`
  :root { color-scheme:dark; --font-sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; --bg:#0e1520; --line:#e2ebff10; --line-2:#e2ebff20; --panel:#19212d; --panel-2:#212b39; --panel-3:#303b4b; --text:#f4f6fb; --body:#d1d7e2; --muted:#a0abba; --control-height:max(44px,2.75rem); --control-compact:max(36px,2.25rem); --control-radius:999px; --control-gap:.5rem; --glass:#283240d9; --glass-edge:#ffffff20; --glass-shadow:inset 0 1px 0 #ffffff12,0 8px 28px #0003; }
  body { letter-spacing:-.012em; }
  h1,h2,h3,h4 { font-family:var(--font-sans); letter-spacing:-.035em; font-weight:600; }
  h2 { font-size:2rem; line-height:1.25; }
  h3 { font-size:1.2143rem; }
  button,input,select,textarea { font-family:var(--font-sans); }
  button { transition:background .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease; }
  button:focus-visible,summary:focus-visible { outline:2px solid var(--blue); outline-offset:4px; }
  button.primary { background:var(--copper); border-radius:11px; font-weight:600; box-shadow:0 2px 9px #ff8a3d12; }
  input,select,textarea { border-radius:11px; border-color:var(--line-2); }
  code,pre,kbd { font-family:'Cascadia Code','SFMono-Regular',Consolas,monospace; }
  .sidebar { background:linear-gradient(175deg,#0D192B,#081321 70%); border-right:1px solid var(--line); padding:18px 14px 14px; }
  .sidebar-header { margin-bottom:12px; }
  .brand h1 { font-size:1.2143rem; letter-spacing:-.5px; }
  .brand-logo { width:32px; height:32px; }
  .side-menu { gap:4px; }
  .side-menu button { min-height:42px; border-radius:11px; font-size:0.9286rem; }
  .side-menu button.active,.sidebar.collapsed .side-menu button.active { background:#22b4ff17; box-shadow:inset 0 0 0 1px #22b4ff0e; color:var(--text); }
  .sidebar-new-chat { min-height:42px; border-radius:12px; background:linear-gradient(120deg,#22b4ff0c,#ffffff05) !important; border-color:#b6d9ff20 !important; }
  .sidebar-history h3,.ex-tree-heading { font-size:0.8rem; letter-spacing:.07em; text-transform:uppercase; font-weight:500; }
  .sidebar-history .platform-list button { padding:10px; border-radius:9px; }
  .sidebar-history .platform-list strong { font-size:0.8571rem; }
  .nav-advanced > summary { min-height:42px; border-radius:11px; }
  .workspace { display:flex; flex-direction:column; width:100%; max-width:none; min-width:0; min-height:100dvh; padding:0 clamp(16px,2vw,32px) 24px; }
  .workspace > .page-section.page-section { flex:1 0 auto; width:100%; max-width:none; min-width:0; margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
  .workspace > .appbar { flex:none; width:100%; }
  .appbar { min-height:68px; margin-bottom:16px; background:transparent; }
  .appbrand { color:var(--body); font-weight:500; font-size:0.9286rem; }
  .header-actions button { border-radius:9px; }
  .platform-view-menu { border:0; padding:0; margin:0 0 22px; }
  .platform-view-menu label { width:190px; }
  .platform-view-menu .select-trigger { background:transparent; border-color:transparent; padding-left:0; font-weight:600; font-size:1.1429rem; }
  .chat-surface.chat-surface { width:100%; max-width:none; margin:0; background:transparent; border:0; padding:0; box-shadow:none; }
  .chat-options { position:relative; z-index:2; margin-bottom:0; }
  .chat-options > summary { border:0; background:#ffffff04; border-radius:999px; font-size:0.8rem; color:var(--muted); padding:7px 12px; }
  .chat-options[open] { border-color:var(--line); padding:20px; border-radius:18px; }
  .platform-transcript .platform-empty { padding:clamp(42px,8vh,95px) 12px 30px; }
  .platform-transcript .platform-empty h3 { font-family:var(--font-sans); font-size:clamp(2.1429rem,3.2vw,3.2857rem); font-weight:600; letter-spacing:-.055em; line-height:1.15; margin-bottom:18px; }
  .platform-transcript .platform-empty p { font-size:1rem; line-height:1.75; max-width:48ch; }
  .chat-welcome-icon { width:52px; height:52px; margin-bottom:27px; filter:drop-shadow(0 5px 20px #22b4ff18); }
  .chat-suggestions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; max-width:640px; margin:0 auto; padding:0 0 23px; }
  .chat-suggestions button { display:flex; align-items:center; justify-content:space-between; gap:12px; text-align:left; min-height:72px; padding:17px; border:1px solid var(--line); border-radius:15px; background:linear-gradient(145deg,#ffffff04,#ffffff01); font-size:0.8571rem; }
  .chat-suggestions button::after { content:'↗'; color:var(--blue); font-size:1.2143rem; }
  .chat-suggestions button:hover { border-color:#22b4ff30; background:#22b4ff09; }
  .platform-composer { padding:18px 19px 13px; border-radius:23px; background:linear-gradient(135deg,#122139,#0C182A); border-color:#b6d9ff24; box-shadow:0 14px 46px #0003,inset 0 1px 0 #ffffff03; }
  .platform-composer:focus-within { border-color:#22b4ff50; box-shadow:0 14px 46px #0003,0 0 0 3px #22b4ff06; }
  .platform-composer textarea { min-height:90px; font-size:1.0714rem; line-height:1.7; }
  .composer-bottom { gap:9px; }
  .composer-model { flex:1 1 220px; }
  .composer-model .select-trigger { background:transparent; border-color:transparent; color:var(--body); font-size:0.8571rem; padding-left:0; }
  #pf-chat-send,#pf-chat-stop { width:37px; height:37px; border-radius:50%; }
  .chat-footnote { font-size:0.8rem; opacity:.75; margin-top:14px; }
  .platform-message { padding:22px 4px; font-size:1rem; line-height:1.8; }
  .platform-message.user { background:#14243B; border-radius:20px 20px 5px 20px; padding:17px 21px; }
  .platform-message header { margin-bottom:10px; }
  .platform-panel { border-color:var(--line); border-radius:18px; padding:22px; background:#0C182A80; box-shadow:none; }
  .platform-fields { gap:17px 20px; }
  .platform-toolbar h3 { font-size:1.2857rem; letter-spacing:-.03em; }
  .platform-context { border-radius:12px; }
  .platform-list button { border-radius:12px; }
  .platform-empty { color:var(--muted); }
  .provider-block,.card,.modal-content { border-radius:16px; border-color:var(--line); box-shadow:none; }
  .ex-page.ex-page { max-width:none; }
  .workspace > #execution-section.active { display:flex !important; flex-direction:column; }
  .ex-layout { flex:1; }
  .ex-center { display:flex; flex-direction:column; min-height:0; }
  .ex-stage { flex:1; }
  .workspace > #platform-section.active:has(#pf-pane-chat:not([hidden])) { display:flex !important; flex-direction:column; }
  #pf-pane-chat:not([hidden]),#pf-pane-chat > .platform-split,.chat-surface.chat-surface { flex:1; display:flex; flex-direction:column; min-width:0; }
  .chat-surface > .platform-transcript { flex:1; }
  .chat-surface > .platform-transcript:has(.platform-empty) { align-content:center; }
  .ex-heading { margin:12px 0 28px; }
  .ex-eyebrow { font-size:0.8rem; letter-spacing:.12em; }
  .ex-heading h2 { font-size:clamp(2rem,2.7vw,2.7857rem); letter-spacing:-.055em; font-weight:600; margin:12px 0 10px; }
  .ex-heading p { font-size:0.9286rem; line-height:1.7; }
  .ex-layout { gap:32px; }
  .ex-plan { padding-left:24px; }
  .ex-plan-title { font-size:1.0714rem; letter-spacing:-.025em; }
  .ex-plan-toolbar { font-size:0.8571rem; padding-bottom:20px; }
  .ex-checklist button { font-size:0.8571rem; line-height:1.65; padding:11px 0; }
  .ex-plan-actions button { min-height:34px; border-radius:10px; }
  .ex-card { border-radius:18px; border-color:var(--line); background:linear-gradient(120deg,#10203999,#0C182A66); }
  .ex-card-header { padding:22px 24px 17px; }
  .ex-card-title { font-size:1.1429rem; letter-spacing:-.03em; }
  .ex-trace { padding:0 19px 22px; }
  .ex-trace-row { border-radius:10px; padding:12px; font-size:0.9286rem; }
  .ex-row-name { min-width:78px; }
  .ex-row-action { font-family:var(--font-sans); font-size:0.8571rem; }
  .ex-node-meta { font-family:var(--font-sans); font-size:0.8rem; }
  .ex-card-footer { padding:13px 24px; }
  .ex-output-panel,.ex-command { border-radius:14px; background:#091522; }
  .ex-output-header { padding:14px 18px; font-size:0.8571rem; }
  .ex-output-panel pre { font-size:0.8571rem; line-height:1.85; }
  .ex-narrative { font-size:0.9286rem; line-height:1.85; }
  .ex-command summary { padding:14px 16px; font-size:0.8571rem; }
  .ex-command-body pre { font-size:0.8571rem; }
  .ex-composer { border-radius:22px; padding:17px 19px 9px; background:linear-gradient(135deg,#122139FA,#0C182AFA); border-color:#b6d9ff24; box-shadow:0 14px 42px #0004; }
  .ex-composer-heading { letter-spacing:.03em; }
  .ex-composer textarea { font-size:1.0714rem; line-height:1.7; }
  .ex-preview-banner { background:#ff8a3d09; border-color:#ff8a3d20; border-radius:12px; padding:10px 14px; }
  .ex-tree-parent,.ex-tree-child { border-radius:10px; }
  @media(max-width:1000px) { .ex-layout { gap:22px; } .ex-plan { padding-left:0; } }
  @media(max-width:760px) {
    .workspace { padding:0 16px 24px; }
    .appbar { min-height:58px; margin-bottom:8px; }
    .sidebar,.sidebar.collapsed { padding:16px 12px; }
    .platform-view-menu { margin-bottom:14px; }
    .platform-transcript .platform-empty { padding:40px 4px 23px; }
    .platform-transcript .platform-empty h3 { font-size:2.2857rem; }
    .platform-transcript .platform-empty p { font-size:0.9286rem; }
    .chat-suggestions { gap:7px; padding-bottom:15px; }
    .chat-suggestions button { font-size:0.8rem; line-height:1.5; padding:12px 10px; min-height:74px; }
    .chat-suggestions button::after { display:none; }
    .platform-composer { border-radius:20px; padding:14px; }
    .composer-model { flex:1 1 100%; max-width:100%; }
    .composer-bottom .effort-control { margin-right:auto; }
    .platform-panel { padding:17px; }
    .platform-fields { gap:14px; }
    .ex-heading { margin-top:16px; gap:14px; }
    .ex-heading h2 { font-size:2.0714rem; }
    .ex-card-header { padding:17px; }
    .ex-trace { padding:0 9px 16px; }
    .ex-trace-row { padding:10px 7px; }
    .ex-composer { padding:14px 13px 8px; border-radius:19px; }
  }
  /* Text and the columns around it grow with the available CSS viewport. */
  html { font-size:16px; }
  body { font-family:var(--font-sans); font-size:1rem; line-height:1.65; letter-spacing:0; background:var(--bg); }
  #main-layout { grid-template-columns:clamp(16rem,16vw,19rem) minmax(0,1fr); }
  .sidebar { overflow-y:auto; }
  .sidebar > * { flex-shrink:0; }
  .sidebar .ex-sidebar { flex:none; min-height:0; }
  .sidebar .ex-tree { flex:none; overflow:visible; }
  .sidebar .nav-advanced[open] { flex:none; min-height:auto; max-height:none; overflow:visible; }
  .side-menu button { min-height:2.8rem; padding:.65rem .75rem; }
  .side-menu { min-height:0; }
  .sidebar-history { flex:none; min-height:0; margin:.15rem 0 .75rem; }
  .sidebar-history > details > summary,.pf-project-group > summary { display:flex; align-items:center; gap:.5rem; list-style:none; cursor:pointer; padding:.65rem .7rem; border-radius:.55rem; color:var(--body); font-size:.9rem; }
  .sidebar-history summary::-webkit-details-marker { display:none; }
  .sidebar-history summary::before { content:'›'; width:.7rem; flex:none; color:var(--muted); transform:rotate(0); transition:transform .15s; }
  .sidebar-history details[open] > summary::before { transform:rotate(90deg); }
  .sidebar-history summary:hover { background:#ffffff06; }
  .sidebar-history summary > span:not(.pf-count) { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pf-count { margin-left:auto; font-size:.8rem; color:var(--muted); }
  .sidebar-history .platform-list { display:block; overflow:visible; }
  .sidebar-history .platform-list button { min-height:2.5rem; padding:.6rem .7rem .6rem 1.6rem; }
  .sidebar-history .platform-list strong { font-size:.9rem; font-weight:400; }
  .sidebar-history input { font-size:.85rem; padding:.65rem .7rem; }
  .sidebar-history .pf-project-new { justify-content:flex-start; color:var(--muted); font-size:.85rem; min-height:2.5rem; background:transparent; }
  .pf-project-group { margin:.2rem 0; }
  .pf-project-actions { display:flex; gap:.25rem; padding-left:1rem; }
  .sidebar-history .pf-project-actions button { display:flex; align-items:center; gap:.4rem; padding:.4rem; font-size:.8rem; min-height:2rem; width:auto; }
  .pf-project-actions button:first-child { flex:1; }
  .pf-project-form { padding:.6rem; border:1px solid var(--line); border-radius:.65rem; margin:.4rem 0; }
  .pf-project-form > div { display:flex; flex-wrap:wrap; gap:.3rem; }
  .sidebar-history .pf-project-form button { width:auto; min-height:2rem; padding:.4rem; font-size:.8rem; }
  .pf-project-form input { width:100%; background:var(--panel-2); }
  .pf-project-status { color:var(--copper); font-size:.8rem; overflow-wrap:anywhere; }
  .pf-group-label { display:block; padding:.9rem .7rem .3rem; font-size:.8rem; color:var(--muted); }
  .pf-chat-organize { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; padding:.4rem 0 1.3rem; }
  .pf-chat-organize > strong { font-size:1.1rem; font-weight:500; overflow-wrap:anywhere; min-width:0; }
  .pf-chat-organize > label { display:flex; align-items:center; gap:.65rem; width:auto; max-width:100%; margin:0; font-size:.85rem; }
  .pf-chat-organize select,.pf-chat-organize .custom-select { width:clamp(9rem,16vw,18rem); min-width:0; max-width:100%; }
  .pf-chat-organize .setting-help-wrap { display:none; }
  .ex-layout { grid-template-columns:minmax(0,1fr) clamp(17rem,20vw,25rem); }
  .ex-plan { padding-left:1.5rem; }
  .platform-fields { grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr)); gap:1.2rem; }
  .platform-message-content { font-size:1rem; line-height:1.8; }
  .platform-transcript .platform-empty p { font-size:1rem; max-width:55ch; }
  .chat-suggestions { max-width:48rem; gap:1rem; }
  .chat-suggestions button { font-size:.9rem; padding:1.15rem; min-height:5.5rem; }
  .platform-composer textarea,.ex-composer textarea { font-size:1.1rem; min-height:6rem; }
  .effort-popover { width:min(23rem,calc(100vw - 24px)); }
  .effort-speed-note { max-width:15rem; }
  .gw-shell { grid-template-columns:minmax(14rem,.45fr) minmax(23rem,1fr) minmax(26rem,1.15fr); gap:0; }
  .gw-page .gw-commit { min-height:3rem; }
  .gw-toolbar,.gw-list-toolbar { flex-wrap:wrap; gap:.65rem; padding:.85rem; }
  .gw-actions { flex-wrap:wrap; }
  .gw-commit-copy { flex-wrap:wrap; padding:.55rem 0; }
  .gw-commit-subject { flex-basis:100%; }
  .gw-page .gw-tree button { padding:.55rem; }
  .gw-diff .gw-line-code,.gw-diff .gw-line-no { line-height:1.85; }
  .gw-diff { max-height:none; overflow:auto; }
  .gw-tree,.gw-files { max-height:none; overflow:visible; }
  .gw-page .gw-file { padding:.55rem .85rem; }
  .gw-page-head { margin-bottom:1.5rem; }
  @media(min-width:1600px) { html { font-size:16px; } .workspace { padding-inline:2rem; } }
  @media(min-width:2400px) { html { font-size:17px; } .workspace { padding-inline:2.5rem; } .ex-layout { gap:2.5rem; } }
  @media(min-width:3200px) { html { font-size:17px; } }
  @media(max-width:1600px) { .gw-shell { grid-template-columns:13rem minmax(0,1fr); } .gw-sidebar { grid-row:1 / span 2; } .gw-inspector { grid-column:2; position:static; border-top:1px solid var(--line); } .gw-history { border-right:0; } }
  @media(max-width:1000px) { .ex-layout { grid-template-columns:minmax(0,1fr); } }
  @media(max-width:760px) { #main-layout,#main-layout.sidebar-collapsed { grid-template-columns:minmax(0,1fr); } .pf-chat-organize { gap:.6rem; } .chat-suggestions { grid-template-columns:1fr; } .chat-suggestions button { min-height:3.5rem; } }
  @media(max-width:650px) { .gw-shell { display:flex; flex-direction:column; } .gw-sidebar,.gw-history,.gw-inspector { width:100%; height:auto; } }

  /* Repository navigation is a full-width page toolbar. */
  .gw-shell.gw-shell { grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr); align-items:start; gap:0 1.5rem; }
  .gw-sidebar.gw-sidebar { grid-column:1 / -1; grid-row:auto; display:grid; grid-template-columns:minmax(13rem,1.2fr) minmax(10rem,1fr) minmax(17rem,1fr); gap:.8rem 1.2rem; width:100%; padding:0 0 1.25rem; margin-bottom:1.25rem; background:transparent; border:0; border-bottom:1px solid var(--line); overflow:visible; }
  .gw-workspace-choice { min-width:0; }
  .gw-label { margin-bottom:.4rem; }
  .gw-repo-meta { padding:1.3rem 0 0; font-size:.8rem; flex-wrap:wrap; }
  .gw-views { align-self:end; display:flex; margin:0; gap:.4rem; }
  .gw-views button { min-height:2.6rem; flex:1; padding:.55rem .8rem; border-radius:.65rem; }
  .gw-section { grid-column:1 / -1; margin:0; }
  .gw-section-head { justify-content:flex-start; width:max-content; max-width:100%; gap:.5rem; margin:0; }
  .gw-section-head > button:first-child { min-height:2.3rem; background:#ffffff05; border:1px solid var(--line); border-radius:.6rem; padding:.5rem .8rem; font-size:.9rem; }
  .gw-page .gw-plus { width:2.3rem; height:2.3rem; border:1px solid var(--line); border-radius:.6rem; font-size:1.3rem; color:var(--blue); background:#22b4ff0a; }
  .gw-sidebar .gw-tree:not([hidden]) { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr)); gap:.5rem; padding-top:.75rem; }
  .gw-page .gw-tree button { min-height:2.8rem; border:1px solid var(--line); border-radius:.6rem; padding:.7rem; font-size:.85rem; }
  .gw-sidebar-foot { grid-column:1/-1; padding:0; margin:0; border:0; }
  .gw-history.gw-history { grid-column:1; height:auto; border-right:0; overflow:visible; }
  .gw-inspector.gw-inspector { grid-column:2; height:auto; position:sticky; top:1rem; border:0; }
  .gw-eyebrow,.gw-page-head p { display:none; }
  .gw-page-head h2 { font-family:var(--font-sans); font-size:2rem; }
  .gw-toolbar { background:transparent; padding:.5rem 0 1rem; }
  .gw-actions button { font-size:.85rem; min-height:2.5rem; padding:.5rem .8rem; border-radius:.6rem; }
  .gw-actions button:last-child { font-size:1.25rem; padding:.4rem .7rem; }
  .gw-page .gw-commit { font-size:.9rem; padding-right:.5rem; height:4rem; border-bottom:0; }
  .gw-commit .gw-graph { height:4rem; }
  .gw-graph path { vector-effect:non-scaling-stroke; }
  .gw-refs { max-width:100%; }
  .gw-author { display:none; }
  .gw-age { width:3rem; font-size:.8rem; }
  .gw-inspector-meta h3 { font-size:1.05rem; }
  .gw-diff { font-size:.85rem; }
  @media(max-width:1000px) { .gw-sidebar.gw-sidebar { grid-template-columns:1fr 1fr; } .gw-views { grid-column:1/-1; } }
  @media(max-width:760px) { .gw-shell.gw-shell { display:flex; flex-direction:column; gap:1.5rem; } .gw-sidebar.gw-sidebar { display:grid; } .gw-history.gw-history,.gw-inspector.gw-inspector { width:100%; position:static; } }

  .ra-eyebrow,.ra-heading > div > p,.ra-topline,.ra-date-range,.ra-card-heading p[data-i18n="ra_movement_note"],.ra-kpi small { display:none; }
  .ra-heading { align-items:center; margin-bottom:1.5rem; }
  .ra-heading h2 { font-size:2rem; margin:0; }
  .ra-source { max-width:65%; gap:1rem; }
  .ra-source label { width:15rem; }
  .ra-source .select-trigger,.ra-tools .select-trigger { min-height:2.6rem; font-size:.9rem; }
  .ra-presets button,.ra-tools button { min-height:2.6rem; padding:.5rem .9rem; font-size:.9rem; }
  .ra-kpi { padding:1.3rem; min-height:9rem; }
  .ra-kpi-label { font-size:.9rem; margin-bottom:.9rem; }
  .ra-kpi strong { font-family:var(--font-sans); font-size:2.2rem; letter-spacing:-.03em; }
  .ra-kpi-delta { font-size:.85rem; }
  .ra-card { padding:1.5rem; }
  .ra-card-heading h3 { font-size:1.2rem; font-weight:600; }
  .ra-legend button { display:flex; align-items:center; gap:.5rem; min-height:2.5rem; border:1px solid var(--line); border-radius:.6rem; padding:.5rem .8rem; font-size:.9rem; color:var(--body); background:transparent; }
  .ra-legend button[aria-pressed="true"] { border-color:#22b4ff44; background:#22b4ff0a; }
  .ra-legend button[aria-pressed="false"] { opacity:.5; }
  .ra-axis { font-family:var(--font-sans); font-size:.85rem; letter-spacing:0; }
  .ra-snapshot-controls { display:flex; gap:.4rem; align-items:center; }
  .ra-snapshot-controls button { min-height:2.5rem; padding:.5rem .75rem; border-radius:.6rem; font-size:.85rem; }
  .ra-snapshot-controls button[aria-pressed="true"] { border-color:var(--copper); color:var(--copper); }
  .ra-chart-footer { flex-wrap:wrap; gap:.8rem; margin-top:.75rem; }
  .ra-tooltip { width:min(18rem,calc(100% - 1rem)); padding:1rem; font-size:.85rem; }
  .ra-method summary,.ra-data summary { display:flex; align-items:center; gap:.5rem; padding:.65rem .9rem; border:1px solid var(--line); border-radius:.6rem; color:var(--body); background:#ffffff04; font-size:.9rem; list-style:none; }
  .ra-method summary::before { content:'ⓘ'; color:var(--blue); } .ra-data summary::before { content:'▤'; color:var(--blue); }
  .ra-method summary::-webkit-details-marker,.ra-data summary::-webkit-details-marker { display:none; }
  .platform-transcript .platform-empty p { display:none; }
  @media(max-width:1100px) { .ra-source { max-width:100%; } }
  @media(max-width:650px) { .ra-source { flex-wrap:wrap; } .ra-source label { flex:1; } .ra-tools { flex-wrap:wrap; } .ra-presets { flex-wrap:wrap; } .ra-card { padding:1rem; } }

  /* Shared toolbar rhythm. Tree rows and content cards keep their own layout. */
  .select-trigger,button.effort-trigger,.composer-model .select-trigger,.ra-source .select-trigger,.ra-tools .select-trigger { min-height:var(--control-height); border-radius:var(--control-radius); padding:.6rem .75rem; font-size:.875rem; line-height:1.25; }
  .select-trigger > span { min-width:0; }
  button.effort-trigger { gap:var(--control-gap); align-self:center; }
  .effort-trigger > svg,.ex-page button > svg { width:1.125rem; height:1.125rem; flex:none; }
  button.effort-close { width:var(--control-compact); height:var(--control-compact); min-height:var(--control-compact); padding:0; border-radius:var(--control-radius); }
  button.effort-close > svg { width:1.125rem; height:1.125rem; }
  .effort-popover header { gap:.65rem; margin-bottom:1.25rem; }
  .effort-popover { max-height:calc(100dvh - 24px); overflow-y:auto; }
  .effort-title { align-items:flex-start; flex-direction:column; gap:.25rem; }
  .effort-model-label { max-width:100%; }
  .gw-actions,.ra-tools,.ra-snapshot-controls,.platform-actions,.platform-toolbar { gap:var(--control-gap); }
  .gw-actions button,.gw-views button,.gw-section-head > button:first-child,.ra-tools button,.ra-presets button,.ra-legend button,.ra-snapshot-controls button,.platform-actions > button,.platform-toolbar > button,.gw-dialog-actions button { min-height:var(--control-height); padding:.6rem .85rem; border-radius:var(--control-radius); font-size:.875rem; line-height:1.25; }
  .gw-page .gw-plus,.gw-actions button:last-child { min-width:var(--control-height); height:var(--control-height); padding:.5rem; }
  .ra-source { align-items:flex-end; }
  .ra-source label { margin:0; }
  .ra-presets,.ra-legend { gap:var(--control-gap); }
  .ra-method summary,.ra-data summary { min-height:var(--control-height); align-items:center; line-height:1.25; }
  .composer-bottom { align-items:center; gap:var(--control-gap); }
  #pf-chat-send,#pf-chat-stop { width:var(--control-height); height:var(--control-height); flex:none; border-radius:var(--control-radius); }

  .ex-heading { align-items:center; gap:1.5rem; margin:1rem 0 1.75rem; }
  .ex-heading > div { min-width:0; }
  .ex-heading .ex-quiet { margin:0; flex:none; }
  .ex-page button { min-height:var(--control-height); border-radius:var(--control-radius); line-height:1.25; }
  .ex-page .ex-quiet,.ex-page .ex-plan-actions button,.ex-review > div > button,.ex-preview-banner button,.ex-footnote button { gap:var(--control-gap); padding:.65rem .85rem; font-size:.875rem; border:1px solid var(--line-2); background:var(--panel); }
  .ex-page button:hover:not(:disabled) { background:var(--panel-3); border-color:#22b4ff40; }
  .ex-page button:disabled { cursor:not-allowed; }
  .ex-workspace-bar { margin-bottom:1.5rem; padding-bottom:1rem; gap:1rem; }
  .ex-workspace-bar > span:first-child { min-width:0; }
  .ex-workspace-bar > span > svg { flex:none; }
  .ex-layout { gap:1.75rem; }
  .ex-plan { padding-left:1.5rem; }
  .ex-plan-toolbar { min-height:var(--control-height); padding-bottom:1rem; gap:var(--control-gap); }
  .ex-plan-toolbar button { width:var(--control-compact); height:var(--control-compact); min-height:var(--control-compact); padding:0; flex:none; }
  .ex-plan-toolbar button svg { transition:transform .15s; }
  .ex-plan-toolbar button[aria-expanded="false"] svg { transform:rotate(180deg); }
  .ex-layout.ex-plan-collapsed { grid-template-columns:minmax(0,1fr) 3.25rem; gap:1rem; }
  .ex-plan-collapsed .ex-plan { padding-left:1rem; }
  .ex-plan-actions { display:grid; grid-template-columns:minmax(0,1fr); gap:var(--control-gap); padding-top:1rem; }
  .ex-page .ex-plan-actions button { justify-content:center; padding-inline:.85rem; white-space:normal; }
  .ex-plan-note { margin-top:1rem; }
  .ex-review { display:grid; gap:1rem; padding:1.25rem; }
  .ex-review label { margin:0; }
  .ex-review > div { display:flex; flex-wrap:wrap; gap:var(--control-gap); }
  .ex-page #ex-approve { background:var(--copper); color:#1B0E03; border-color:transparent; }
  .ex-page #ex-reject,.ex-page #ex-cancel { color:var(--bad); border:1px solid #ff6f9140; background:#ff6f9108; }
  .ex-page #ex-cancel { padding:.6rem .85rem; font-size:.875rem; }
  .ex-card-header,.ex-output-header,.ex-card-footer { padding-inline:1.25rem; }
  .ex-card-header { gap:1rem; }
  .ex-card-header > div { flex:1 1 25rem; min-width:0; }
  .ex-runtime { min-height:var(--control-compact); padding:.5rem .65rem; }
  .ex-trace { padding-inline:1.25rem; }
  .ex-trace-row { align-items:center; gap:.65rem; padding:.75rem; }
  .ex-row-name { min-width:0; flex:0 1 11rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ex-card-footer,.ex-output-header { flex-wrap:wrap; gap:.75rem; }
  .ex-output-panel { margin-top:1.25rem; }
  .ex-output-meta,.ex-output-panel pre { padding-inline:1.25rem; }
  .ex-feed { margin:1.25rem 0 0; }
  .ex-stage { padding-bottom:1.5rem; }
  .ex-composer { container:execution-composer / inline-size; position:relative; padding:1rem 1.25rem .75rem; bottom:auto; }
  .ex-composer-heading { gap:.75rem; font-size:.8rem; letter-spacing:.02em; }
  .ex-composer-heading > span:first-child { min-width:0; }
  .ex-prompt { margin:.75rem 0; }
  .ex-composer-controls { flex-wrap:wrap; align-items:center; gap:.75rem; }
  .ex-composer-left.ex-composer-left { flex:1 1 35rem; min-width:0; gap:var(--control-gap); align-items:center; }
  .ex-composer-right { flex:none; margin-left:auto; gap:var(--control-gap); }
  .ex-control-divider { display:none; }
  .ex-compact-select { min-width:0; flex:0 1 10rem; }
  .ex-compact-select.ex-model-select { flex:1 1 13rem; max-width:27rem; }
  .ex-compact-select .custom-select,.ex-compact-select .select-trigger { width:100%; max-width:100%; }
  .ex-page .ex-icon-button,.ex-page .ex-send { width:var(--control-height); height:var(--control-height); padding:0; flex:none; }
  .ex-page .ex-icon-button { border:1px solid var(--line-2); background:transparent; }
  .ex-page #ex-auto { min-height:var(--control-height); padding:.6rem .75rem; gap:.6rem; font-size:.875rem; border:1px solid var(--line-2); border-radius:var(--control-radius); }
  .ex-toggle-track { width:2rem; height:1.125rem; padding:.1875rem; flex:none; }
  .ex-toggle-track > span { width:.75rem; height:.75rem; }
  [aria-checked="true"] .ex-toggle-track > span { transform:translateX(.875rem); }
  .ex-page .ex-send:hover:not(:disabled),.ex-page #ex-approve:hover:not(:disabled) { background:#FF9D58; }
  .ex-run-settings { margin-top:.75rem; padding-top:.5rem; }
  .ex-run-settings > summary { display:flex; align-items:center; gap:.5rem; width:100%; min-height:var(--control-compact); padding:.5rem 0; list-style:none; }
  .ex-run-settings > summary::-webkit-details-marker { display:none; }
  .ex-run-settings > summary::before { content:'›'; display:inline-block; width:.75rem; text-align:center; transition:transform .15s; }
  .ex-run-settings[open] > summary::before { transform:rotate(90deg); }
  .ex-settings-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; padding:.75rem 0; }
  .ex-settings-grid label:first-child { grid-column:1 / -1; }
  .ex-settings-grid label { display:flex; flex-direction:column; justify-content:flex-end; gap:.4rem; }
  .ex-settings-grid input,.ex-settings-grid .select-trigger { min-height:var(--control-height); margin:0; padding:.6rem .75rem; }
  .ex-footnote { flex-wrap:wrap; align-items:center; gap:.75rem 1rem; padding-top:1rem; }
  .ex-footnote > span { flex:1 1 18rem; }
  .ex-footnote button { margin-left:auto; }
  .ex-preview-banner { flex-wrap:wrap; gap:.75rem; margin:0 0 1.5rem; padding:.75rem 1rem; }
  .ex-preview-banner button { color:var(--copper); flex:none; }
  .ex-shortcuts { display:grid; grid-template-columns:1fr 1fr; gap:var(--control-gap); padding-bottom:.75rem; }
  .ex-shortcuts button { min-height:var(--control-compact); padding:.4rem; font-size:.8rem; border:1px solid var(--line); border-radius:var(--control-radius); }
  .ex-filters { flex-wrap:wrap; gap:var(--control-gap); }
  .ex-filters label { flex:1 1 9rem; }
  .ex-search input { min-height:var(--control-height); padding:.6rem .75rem; }
  .ex-tree-heading { padding:0 0 .5rem .4rem; min-height:var(--control-compact); }
  .ex-tree-heading button { width:var(--control-compact); height:var(--control-compact); padding:0; }
  .ex-tree-parent { gap:.25rem; }
  .ex-tree-parent > button { min-height:var(--control-compact); }
  .ex-tree-parent > button:not(.ex-tree-select) { width:1.75rem; flex:none; padding:0; }
  .ex-task-age { font-size:.75rem; }
  @container execution-composer (max-width:34rem) {
    .ex-composer-left.ex-composer-left { display:grid; grid-template-columns:var(--control-height) minmax(0,1fr) max-content; flex-basis:100%; }
    .ex-compact-select.ex-model-select { grid-column:1 / -1; order:-1; max-width:none; }
    .ex-composer .effort-trigger > span[data-i18n="lbl_effort"] { display:none; }
    .ex-composer .effort-trigger { padding-inline:.6rem; gap:.4rem; }
    .ex-composer-heading > span:last-child { display:none; }
    .ex-settings-grid { grid-template-columns:minmax(0,1fr); }
    .ex-settings-grid label:first-child { grid-column:auto; }
  }
  @media(max-width:1000px) { .ex-layout.ex-plan-collapsed { grid-template-columns:minmax(0,1fr); } .ex-plan,.ex-plan-collapsed .ex-plan { padding:1rem; } .ex-plan-toolbar { padding-bottom:0; } .ex-plan-actions { grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); } }
  @media(max-width:650px) { .ex-heading { flex-wrap:wrap; gap:1rem; } .ex-heading .ex-quiet { margin:0; } .ex-eyebrow { flex-wrap:wrap; gap:.4rem; } .ex-composer { position:relative; bottom:auto; padding:1rem; } .ex-trace,.ex-card-header,.ex-output-header,.ex-card-footer { padding-inline:1rem; } .ex-trace-list { margin-left:0; padding-left:.75rem; } .ex-trace-item::before { left:-.8rem; width:.65rem; } .ex-trace-row { gap:.5rem; padding:.65rem; flex-wrap:wrap; } .ex-row-name { flex:1; } .ex-row-action { order:2; flex-basis:100%; padding-left:1.5rem; } .ex-footnote button { margin-left:0; max-width:100%; white-space:normal; text-align:left; } .ex-plan-note { margin-bottom:0; } .ex-workspace-bar { gap:.5rem; } }
  .side-menu button,.sidebar-new-chat,.nav-advanced > summary,.header-actions button,#menu-toggle { min-height:var(--control-height); }
  .page-section button:not(.ex-tree-select):not(.ex-checklist button),.modal-footer button,.modal-body > button { min-height:var(--control-height); }
  .page-section .filter-chip,.preset-btn { min-height:var(--control-compact); padding:.5rem .75rem; border-radius:var(--control-radius); }
  #browser-up-btn { min-height:var(--control-height); padding:.6rem .85rem; font-size:.875rem; }
  .ra-tools > label { min-width:14rem; }
  .ex-page button.effort-close,.ex-page .ex-plan-toolbar button,.modal-close { min-height:var(--control-compact); min-width:var(--control-compact); }
  .effort-trigger > svg:last-child { width:.875rem; height:.875rem; color:var(--muted); }
  .effort-trigger[aria-expanded="true"] > svg:last-child { transform:rotate(180deg); }
  .setting-row { grid-template-columns:minmax(8rem,.7fr) minmax(12rem,.8fr) minmax(18rem,1.4fr); gap:1rem 1.5rem; padding-block:1rem; }
  .setting-row form { display:flex; align-items:center; gap:1rem; margin:0; }
  .setting-row form > .setting-caption { width:auto; flex:none; margin:0; }
  .setting-row form input { flex:1; width:0; }
  .setting-row form button { flex:none; width:var(--control-height); padding:0; }
  .setting-row > .setting-badge { justify-self:start; }
  .setting-row input,.setting-row button { min-height:var(--control-height); margin:0; }
  button > svg { display:block; flex-shrink:0; }
  button:has(> svg:only-child),.ex-icon-button,.ex-send,.ex-tree-heading button,.ex-plan-toolbar button,.effort-close,.modal-close,#sidebar-toggle,#refresh,#ra-refresh,#ra-previous,#ra-next,#pf-chat-send,#pf-chat-stop,.gw-page .gw-plus,#gw-refresh { display:inline-flex; align-items:center; justify-content:center; gap:0; flex-shrink:0; }
  #refresh,#ra-refresh,#ra-previous,#ra-next,#gw-refresh { min-width:var(--control-height); }
  #models-section { container:model-catalog / inline-size; }
  .workspace { container:workspace / inline-size; }
  .summary { grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr)); }
  .grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); }
  .policy-controls-row,.pipeline-run-fields { grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr)); }
  @container workspace (max-width:50rem) {
    .setting-row { grid-template-columns:minmax(0,1fr) auto; }
    .setting-row form { grid-column:1 / -1; display:flex; }
    .setting-row form input { min-width:0; flex:1; }
  }
  #models-section > section { padding:0; border:0; background:transparent; }
  .model-tools > *,.model-row > * { min-width:0; }
  .model-transport-group h3 { flex-wrap:wrap; gap:.5rem 1rem; align-items:center; }
  .model-row { padding:1rem 0; }
  .model-row code,.model-meta { overflow-wrap:anywhere; }
  @container model-catalog (max-width:55rem) {
    .model-tools { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
    .model-row { grid-template-columns:minmax(0,1fr) auto; gap:.5rem 1rem; }
    .model-row > div { grid-column:1 / -1; }
  }
  @container model-catalog (max-width:30rem) {
    .model-tools,.model-row { grid-template-columns:minmax(0,1fr); gap:.75rem; }
    .model-row button { width:max-content; max-width:100%; }
  }
  @media(pointer:coarse) { .page-section .filter-chip,.preset-btn,.modal-close,.ex-page button.effort-close,.ex-page .ex-plan-toolbar button { min-height:44px; min-width:44px; } }
  @media(max-width:480px) { .modal-footer { flex-direction:column; align-items:stretch; } .modal-footer > button { width:100%; justify-content:center; } }
  /* Center the visible label; reserve equal room around select text for its arrow. */
  button { justify-content:center; text-align:center; line-height:1.25; }
  .sidebar:not(.collapsed) .side-menu button,.sidebar:not(.collapsed) .sidebar-new-chat,.sidebar:not(.collapsed) .nav-custom-trigger { justify-content:flex-start; text-align:left; }
  button > .action-label { margin:0; line-height:inherit; }
  .select-trigger.select-trigger { position:relative; justify-content:center; padding-inline:2.25rem; text-align:center; }
  .select-trigger > span { flex:1; text-align:center; }
  .select-trigger > svg { position:absolute; right:.75rem; top:calc(50% - .5rem); }
  .select-trigger.select-trigger > svg { width:1rem; height:1rem; }
  .effort-trigger > span { flex-shrink:0; }
  .pipeline-step-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:end; gap:.75rem; margin-bottom:.5rem; }
  .pipeline-step-fields > label,.pipeline-step-fields > .effort-control { margin:0; }
  .pipeline-step-fields .effort-trigger { width:100%; }
  @media(max-width:480px) { .pipeline-step-fields { grid-template-columns:minmax(0,1fr); } .modal-dialog .effort-trigger > span[data-i18n="lbl_effort"] { display:none; } }
  /* Apple-inspired controls: material belongs to navigation and transient surfaces. */
  .sidebar { background:linear-gradient(155deg,#2b3645c9,#19222de8); backdrop-filter:blur(28px) saturate(1.4); border-right-color:#ffffff0c; box-shadow:inset -1px 0 0 #ffffff03; }
  .sidebar-header { border-color:transparent; }
  .side-menu button,.nav-advanced > summary { border-radius:14px; }
  .side-menu button.active,.sidebar.collapsed .side-menu button.active { background:#ffffff12; box-shadow:inset 0 1px 0 #ffffff0b; color:var(--text); }
  .sidebar-new-chat { border-radius:999px; background:linear-gradient(#ffffff10,#ffffff08) !important; border-color:#ffffff16 !important; box-shadow:inset 0 1px 0 #ffffff0a; }
  .sidebar-history h3,.ex-tree-heading { text-transform:none; letter-spacing:0; font-weight:600; }
  .appbar { border-bottom:0; }
  .header-actions { gap:.5rem; padding:.3rem; border:1px solid var(--glass-edge); border-radius:999px; background:var(--glass); backdrop-filter:blur(24px) saturate(1.4); box-shadow:var(--glass-shadow); }
  .header-actions button { border:0; border-radius:999px; background:transparent; }
  .header-actions button:hover { background:#ffffff12; }
  button.primary,.ex-page .ex-send,.gw-page .gw-primary { border-color:transparent; background:var(--copper); color:#251309; border-radius:999px; box-shadow:inset 0 1px 0 #ffffff24,0 2px 6px #0002; }
  button.primary:hover:not(:disabled),.gw-page .gw-primary:hover:not(:disabled) { background:#ffa66b; color:#251309; }
  .page-section button:not(.select-option):not(.gw-commit):not(.gw-file):not(.ex-tree-select):not(.ex-tree-parent button):not(.ex-checklist button):not(.platform-list button):not(.chat-suggestions button),.modal-footer button,.modal-body > button { border-radius:999px; }
  input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,select[multiple] { border-radius:12px; border-color:var(--line); background:#ffffff07; box-shadow:inset 0 1px 2px #0001; }
  input:not([type="range"]):focus,textarea:focus { border-color:#22b4ff66; }
  .select-trigger.select-trigger,button.effort-trigger,.ex-page .ex-quiet,.ex-page .ex-plan-actions button,.ex-review > div > button,.ex-page .ex-icon-button,.ex-page #ex-auto,.gw-actions button,.ra-tools > button,.platform-actions > button,.platform-toolbar > button,.modal-footer > button:not(.primary) { background:linear-gradient(#ffffff0d,#ffffff07); border-color:#ffffff14; box-shadow:inset 0 1px 0 #ffffff08; }
  .select-trigger.select-trigger:hover:not(:disabled),button.effort-trigger:hover:not(:disabled) { background:#ffffff13; border-color:#ffffff22; }
  .select-trigger.select-trigger[aria-expanded="true"],button.effort-trigger[aria-expanded="true"] { background:#ffffff16; border-color:#ffffff2a; }
  .platform-panel,.provider-block,.card,.ex-card,.pipeline-card,.ra-card,.ra-kpi { background:var(--panel); border-color:var(--line); border-radius:20px; box-shadow:none; }
  .platform-composer,.ex-composer { background:var(--panel); border-color:#ffffff18; border-radius:26px; box-shadow:0 6px 24px #0002; }
  .platform-composer textarea,.ex-composer textarea { background:transparent; border:0; box-shadow:none; border-radius:0; }
  .ex-output-panel,.ex-command,.platform-context { background:#121b27; border-radius:16px; }
  .gw-page { --gw-panel:var(--panel); --gw-line:var(--line); --gw-text:var(--text); --gw-muted:var(--muted); font-family:var(--font-sans); }
  .gw-inspector-meta,.gw-history-foot,.gw-diff-banner { background:var(--panel); }
  .gw-diff { background:#101824; }
  .gw-views,.platform-tabs,.platform-library-tabs,.ra-presets,.ra-snapshot-controls { gap:.25rem; padding:.25rem; background:#ffffff08; border:1px solid #ffffff06; border-radius:999px; }
  .gw-views button,.platform-tabs button,.platform-library-tabs button,.ra-presets button,.ra-snapshot-controls button { flex:1; background:transparent; border-color:transparent; box-shadow:none; color:var(--muted); }
  .gw-views button[aria-pressed="true"],.platform-tabs button[aria-selected="true"],.platform-library-tabs button.primary,.ra-presets button[aria-pressed="true"],.ra-snapshot-controls button[aria-pressed="true"] { background:linear-gradient(#ffffff20,#ffffff13); color:var(--text); border-color:#ffffff12; box-shadow:inset 0 1px 0 #ffffff12,0 2px 5px #0002; }
  .gw-views b { margin-left:0; background:#ffffff09; border-radius:999px; }
  .select-popover,.effort-popover { background:var(--glass); backdrop-filter:blur(28px) saturate(1.4); border-color:var(--glass-edge); border-radius:24px; box-shadow:var(--glass-shadow),0 20px 60px #0005; }
  .select-popover { padding:.5rem; }
  .select-popover .select-search { background:#00000018; border-color:transparent; border-radius:999px; }
  .select-option { min-height:40px; border-radius:12px; }
  .select-option[aria-selected="true"] { background:#ffffff0d; }
  .select-option.is-active,.select-option:hover:not(:disabled) { background:#ffffff16; outline:0; }
  .modal-dialog,.gw-dialog { background:var(--panel); border:1px solid #ffffff1a; border-radius:28px; box-shadow:0 28px 90px #0007,inset 0 1px 0 #ffffff08; }
  .modal-header,.modal-footer { border-color:var(--line); }
  .modal-close,button.effort-close { color:var(--muted); background:#ffffff08; border-radius:50%; }
  .modal-body button:not(.modal-close):not(.select-option) { min-height:var(--control-height); border-radius:999px; }
  .nav-checkbox-label { width:100%; }
  .nav-checkbox-label input[type="checkbox"] { appearance:auto; width:18px; height:18px; min-width:18px; flex:none; margin:0; padding:0; accent-color:var(--blue); }
  .effort-track { height:8px; margin:8px 0; background:#ffffff18; }
  .effort-track::after { display:none; }
  .effort-control input[type="range"] { height:24px; top:-8px; }
  .effort-control input[type="range"]::-webkit-slider-thumb { width:24px; height:24px; box-shadow:0 2px 5px #0005,inset 0 0 0 1px #ffffff50; }
  .effort-control input[type="range"]::-moz-range-thumb { width:24px; height:24px; box-shadow:0 2px 5px #0005; }
  .effort-speed-row input[type="checkbox"] { width:42px; min-width:42px; height:26px; padding:3px; border:0; background:#ffffff24; }
  .effort-speed-row input[type="checkbox"]::before { width:20px; height:20px; box-shadow:0 2px 4px #0004; }
  .effort-speed-row input[type="checkbox"]:checked::before { transform:translateX(16px); }
  .ex-toggle-track { width:2.5rem; height:1.5rem; padding:.1875rem; background:#ffffff24; }
  .ex-toggle-track > span { width:1.125rem; height:1.125rem; box-shadow:0 2px 4px #0004; }
  [aria-checked="true"] .ex-toggle-track > span { transform:translateX(1rem); }
  @media(max-width:650px) { .platform-tabs,.platform-library-tabs,.ra-presets { border-radius:22px; } }
  @media(prefers-reduced-transparency:reduce),(prefers-contrast:more) { .sidebar,.header-actions,.select-popover,.effort-popover { backdrop-filter:none; background:var(--panel-2); } }
  @media(prefers-contrast:more) { :root { --line:#ffffff60; --line-2:#ffffff90; --muted:#d7dfeb; } .select-trigger.select-trigger,button.effort-trigger,.header-actions,.select-popover,.effort-popover { border-color:var(--line-2); } }
  @media(forced-colors:active) { .sidebar,.header-actions,.select-popover,.effort-popover { background:Canvas; backdrop-filter:none; border:1px solid CanvasText; } button.primary,.gw-page .gw-primary { background:ButtonFace; color:ButtonText; border:1px solid ButtonText; } .effort-speed-row input[type="checkbox"] { appearance:auto; } .effort-speed-row input[type="checkbox"]::before { display:none; } }
  @media(prefers-reduced-motion:reduce) { button,.effort-trigger > svg,.ex-plan-toolbar button svg { transition:none; } }
`;

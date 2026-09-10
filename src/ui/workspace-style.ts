/** Chat layout using the local Elvatis design system (BDR-001 and BDR-003). */
export const WORKSPACE_STYLE = String.raw`
  @font-face { font-family:Inter; font-style:normal; font-weight:400; font-display:swap; src:url('/assets/fonts/inter-400.woff2') format('woff2'); }
  @font-face { font-family:Inter; font-style:normal; font-weight:500; font-display:swap; src:url('/assets/fonts/inter-500.woff2') format('woff2'); }
  @font-face { font-family:Inter; font-style:normal; font-weight:600; font-display:swap; src:url('/assets/fonts/inter-600.woff2') format('woff2'); }
  @font-face { font-family:Fraunces; font-style:normal; font-weight:600; font-display:swap; src:url('/assets/fonts/fraunces-600.woff2') format('woff2'); }
  :root { --bg:#050B16; --panel:#0A1729; --panel-2:#0D1C33; --panel-3:#112340; --line:rgba(143,213,236,.14); --line-2:rgba(143,213,236,.28); --text:#F5FAFF; --body:#C7D4E8; --muted:#8FA0BD; --blue:#22B4FF; --blue-soft:#BEEAFF; --copper:#FF8A3D; --font-sans:Inter,system-ui,-apple-system,'Segoe UI',sans-serif; --font-serif:Fraunces,Georgia,serif; }
  body { background:var(--bg); font:1rem/1.6 var(--font-sans); -webkit-font-smoothing:antialiased; }
  code,pre,kbd { font-family:var(--font-sans); font-variant-numeric:tabular-nums; }
  #main-layout { grid-template-columns:256px minmax(0,1fr); }
  #main-layout.sidebar-collapsed { grid-template-columns:64px minmax(0,1fr); }
  .sidebar { background:#07111F; padding:14px 12px 12px; gap:8px; backdrop-filter:none; }
  .sidebar-header { padding:2px 4px 12px; margin:0; border:0; gap:8px; min-height:48px; }
  .brand { flex-direction:row; align-items:center; gap:10px; }
  .brand-logo { width:29px; height:29px; flex:none; }
  .brand h1 { font:inherit; font-weight:600; font-size:1.0714rem; letter-spacing:-.3px; margin:0; }
  .collapse-btn { width:32px; height:32px; flex:none; }
  .sidebar.collapsed { width:64px; padding:14px 10px 12px; }
  .sidebar.collapsed .sidebar-header { justify-content:center; padding:2px 0 12px; }
  .sidebar.collapsed .brand { display:none; }
  .sidebar.collapsed .collapse-btn { transform:none; }
  .sidebar.collapsed .collapse-btn svg path:last-child { transform:rotate(180deg); transform-origin:13px 12px; }
  .side-menu { display:flex; flex-direction:column; gap:3px; flex:0 0 auto; }
  .side-menu button { border:0; border-radius:8px; font-size:0.9286rem; font-weight:400; padding:9px 11px; gap:11px; min-height:38px; }
  .side-menu button.active, .sidebar.collapsed .side-menu button.active { border:0; background:#22B4FF14; }
  .side-menu button.active svg { color:var(--blue); }
  .side-menu button:hover svg { transform:none; }
  .sidebar.collapsed .side-menu button { padding:10px; height:40px; }
  .side-menu [hidden], .sidebar [hidden] { display:none !important; }
  .sidebar-new-chat { width:100%; justify-content:flex-start; padding:10px 12px; background:#ffffff08 !important; color:var(--text) !important; border:1px solid var(--line-2) !important; border-radius:9px; margin-bottom:7px; gap:10px; }
  .sidebar.collapsed .sidebar-new-chat { width:40px; height:40px; padding:10px; justify-content:center; }
  .sidebar.collapsed .sidebar-new-chat .action-label { display:none; }
  .sidebar-history { flex:1 1 auto; min-height:100px; display:flex; flex-direction:column; margin-top:15px; border:0; background:transparent; box-shadow:none; padding:0; }
  .sidebar-history h3 { font-size:0.8rem; font-weight:500; margin:0 10px 9px; color:var(--muted); }
  .sidebar-history label { margin:0 0 8px; }
  .sidebar-history .setting-caption { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  .sidebar-history .setting-help-wrap, .platform-composer .setting-help-wrap { display:none; }
  .sidebar-history input { border:0; background:transparent; padding:7px 10px; font-size:0.8571rem; }
  .sidebar-history .platform-list { max-height:none; gap:2px; }
  .sidebar-history .platform-list button { border:0; background:transparent; padding:8px 10px; border-radius:7px; display:block; }
  .sidebar-history .platform-list button:hover, .sidebar-history .platform-list button.active { background:#ffffff0a; }
  .sidebar-history .platform-list strong { display:block; font-size:0.8571rem; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sidebar-history .platform-list small { display:none; }
  .sidebar-history .platform-empty { font-size:0.8571rem; text-align:left; padding:8px 10px; }
  .sidebar.collapsed .sidebar-history, .sidebar.collapsed .side-footer { display:none; }
  .sidebar-bottom { margin-top:auto; }
  .nav-advanced { border-top:1px solid var(--line); padding-top:6px; }
  .nav-advanced > summary { display:flex; align-items:center; gap:11px; padding:9px 11px; cursor:pointer; color:var(--muted); border-radius:8px; list-style:none; font-size:0.9286rem; }
  .nav-advanced > summary::-webkit-details-marker { display:none; }
  .nav-advanced > summary:hover { color:var(--text); background:#ffffff08; }
  .nav-advanced[open] { flex:1 1 auto; min-height:0; overflow:auto; }
  .sidebar:has(.nav-advanced[open]) .sidebar-history { display:none; }
  .sidebar.collapsed .nav-advanced > summary { justify-content:center; padding:10px; }
  .sidebar.collapsed .nav-advanced > summary span { display:none; }
  .sidebar.collapsed .nav-advanced[open] { max-height:55vh; }
  .nav-group-label { font:inherit; font-size:0.8rem; letter-spacing:0; text-transform:none; opacity:1; padding-top:14px; }
  .nav-custom-trigger { border:0; font-size:0.8rem; margin:4px 0; }
  .side-footer { border:0; font-size:0.8rem; padding:8px 10px 0; margin:0; }
  .workspace { padding:0 clamp(16px,3vw,40px) 36px; }
  .appbar { background:var(--bg); border:0; margin-bottom:18px; min-height:60px; box-shadow:none; }
  .appbrand { font:inherit; font-size:0.9286rem; letter-spacing:0; color:var(--muted); }
  .header-actions { gap:6px; }
  .header-actions button { background:transparent; border:0; padding:7px; color:var(--muted); }
  #refresh .action-label { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  #notice { display:none; }
  #notice.notice-visible { display:block; border:1px solid var(--line-2); background:var(--panel); padding:10px 14px; border-radius:10px; }
  #notice.error { display:block; border:1px solid var(--bad); background:var(--bad-bg); padding:10px 14px; border-radius:10px; }
  h1,h2,h3 { font-family:var(--font-serif); font-weight:600; letter-spacing:-.01em; }
  .sidebar h3,.platform-toolbar h3 { font-family:var(--font-sans); }
  h2 { font-size:1.6429rem; }
  button { border-radius:8px; background:var(--panel-2); box-shadow:none; }
  button.primary { background:var(--copper); border-color:transparent; color:#1B0E03; }
  button.primary:hover { background:#FF9D58; }
  input,select,textarea { background:var(--panel); border-color:var(--line-2); border-radius:8px; }
  input:hover,select:hover,textarea:hover { background:var(--panel-2); }
  input:focus,select:focus,textarea:focus { border-color:var(--blue); box-shadow:0 0 0 3px #22B4FF14; }
  .platform-shell { --platform-surface:var(--panel); }
  .platform-pane { border:0; background:transparent; padding:0; box-shadow:none; }
  .platform-heading { display:none; }
  .platform-tabs { border:0; background:transparent; padding:0; gap:20px; border-bottom:1px solid var(--line); border-radius:0; margin-bottom:22px; }
  .platform-tabs button { flex:0 0 auto; padding:8px 0; border:0; border-radius:0; font-size:0.8571rem; color:var(--muted); }
  .platform-tabs button[aria-selected="true"] { background:transparent; border-bottom:2px solid var(--blue); color:var(--text); }
  .platform-tabs button svg { display:none; }
  #pf-operator { display:none; }
  #pf-status:empty { display:none; }
  #pf-pane-system #pf-operator { display:block; }
  #pf-pane-chat > .platform-split { display:block; }
  .chat-surface { background:transparent; border:0; padding:0; max-width:790px; margin:0 auto; }
  .chat-options { margin:0 0 12px; border:0; padding:0; }
  .chat-options > summary { display:flex; align-items:center; gap:8px; width:max-content; margin-left:auto; padding:7px 11px; border:1px solid var(--line); border-radius:8px; background:var(--panel); font-size:0.8571rem; color:var(--body); list-style:none; }
  .chat-options > summary::after { content:''; width:6px; height:6px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(45deg); margin:-3px 2px 0 8px; }
  .chat-options[open] > summary::after { transform:rotate(225deg); margin-top:3px; }
  .chat-options > summary::-webkit-details-marker { display:none; }
  .chat-options[open] { border:1px solid var(--line); padding:14px; background:var(--panel); border-radius:12px; }
  .platform-context { background:transparent; border-color:var(--line); }
  .platform-transcript { min-height:0; max-height:none; padding:8px 0 22px; }
  .platform-transcript .platform-empty { padding:clamp(38px,12vh,120px) 12px 22px; }
  .platform-transcript .platform-empty h3 { color:var(--text); font-size:clamp(1.8571rem,3vw,2.7143rem); font-weight:600; letter-spacing:-.01em; line-height:1.25; margin:0 0 14px; }
  .platform-transcript .platform-empty p { font-size:1rem; margin:0 auto; max-width:46ch; color:var(--muted); }
  .chat-welcome-icon { width:44px; height:44px; margin:0 auto 23px; }
  .chat-suggestions { display:flex; justify-content:center; flex-wrap:wrap; gap:8px; padding:0 0 27px; }
  .chat-suggestions button { background:transparent; border:1px solid var(--line-2); border-radius:999px; font-size:0.8571rem; padding:7px 13px; color:var(--body); }
  .chat-suggestions button:hover { background:var(--panel-2); }
  .platform-message { background:transparent; border:0; padding:16px 4px; }
  .platform-message.user { background:var(--panel-2); padding:14px 18px; border-radius:18px; margin-left:15%; }
  .platform-message.assistant { border:0; margin-right:0; }
  .platform-message header small { font-size:0.8rem; opacity:.6; }
  .platform-message-actions { opacity:.55; }
  .platform-message:hover .platform-message-actions, .platform-message:focus-within .platform-message-actions { opacity:1; }
  .platform-message-actions button { background:transparent; border:0; }
  .platform-composer { border:1px solid var(--line-2); background:var(--panel); border-radius:18px; padding:14px 16px 10px; margin:0; box-shadow:0 8px 30px #00000020; }
  .platform-view-menu { display:flex; align-items:center; gap:10px; margin:0 0 20px; padding-bottom:12px; border-bottom:1px solid var(--line); }
  .platform-view-menu label { width:220px; margin:0; }
  .platform-tabs { display:none; }
  .platform-composer > label { margin:0; }
  .platform-composer > label > .setting-caption { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  .platform-composer textarea { background:transparent; border:0; box-shadow:none; padding:4px 2px; min-height:94px; resize:vertical; font-size:1.0714rem; }
  .platform-composer textarea:focus { box-shadow:none; }
  .composer-bottom { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:5px 0 0; }
  .composer-model { flex:1 1 180px; margin:0; max-width:calc(100% - 48px); }
  .composer-model > .setting-caption { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  .composer-model select { width:100%; border:0; background:transparent; padding:6px 4px; color:var(--muted); font-size:0.8571rem; }
  #pf-chat-send, #pf-chat-stop { width:34px; height:34px; padding:8px; border-radius:10px; justify-content:center; flex:none; }
  #pf-chat-send .action-label, #pf-chat-stop .action-label { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  #pf-chat-stop:disabled { display:none; }
  #pf-chat-progress { flex:1 0 100%; font-size:0.8rem; }
  #pf-chat-progress:empty { display:none; }
  .chat-footnote { text-align:center; font-size:0.8rem; color:var(--muted); margin:11px 0 0; }
  .chat-surface:has(.platform-message) .platform-composer { position:sticky; bottom:14px; }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  @media(min-width:761px) { .workspace:has(#platform-section.active) { padding-bottom:22px; } }
  @media(max-width:760px) {
    main,main.sidebar-collapsed { display:block; }
    .sidebar,.sidebar.collapsed { width:min(280px,86vw); padding:14px 12px; }
    .sidebar.collapsed .brand { display:flex; }
    .sidebar.collapsed .brand-info,.sidebar.collapsed .nav-label,.sidebar.collapsed .sidebar-new-chat .action-label,.sidebar.collapsed .nav-advanced > summary span { display:initial; }
    .sidebar.collapsed .sidebar-history { display:flex; }
    .sidebar.collapsed .sidebar-header { justify-content:space-between; }
    .sidebar.collapsed .collapse-btn svg path:last-child { transform:none; }
    .sidebar.collapsed .side-menu button,.sidebar.collapsed .nav-advanced > summary,.sidebar.collapsed .sidebar-new-chat { width:100%; justify-content:flex-start; }
    .sidebar.collapsed .nav-group-label { display:block; }
    .sidebar.open::after { content:none; }
    .workspace { padding:0 16px 20px; }
    .appbar { padding-left:0; padding-right:0; margin-bottom:8px; }
    .platform-tabs { gap:16px; flex-wrap:nowrap; overflow:auto; }
    .platform-tabs button { white-space:nowrap; }
    .platform-transcript .platform-empty { padding-top:48px; }
    .platform-composer { padding:12px; }
    .platform-toolbar > button { flex:0 1 auto; }
  }
  @media(prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none !important; scroll-behavior:auto !important; } }
`;

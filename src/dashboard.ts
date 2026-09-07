const SHARED_STYLE = `
  :root {
    color-scheme: dark;
    --bg: #050b16;
    --panel: #0a1729;
    --panel-2: #0d1c33;
    --panel-3: #112340;
    --line: rgba(143,213,236,.18);
    --line-2: rgba(143,213,236,.32);
    --text: #f5faff;
    --body: #c7d4e8;
    --muted: #8fa0bd;
    --blue: #22b4ff;
    --blue-soft: #b9eaff;
    --copper: #ff8a3d;
    --ok: #1fd18a;
    --ok-bg: rgba(31,209,138,.14);
    --warn: #f5b83d;
    --warn-bg: rgba(245,184,61,.14);
    --bad: #ff6f91;
    --bad-bg: rgba(255,111,145,.14);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--body);
    font: 14.5px/1.5 Inter, system-ui, -apple-system, sans-serif;
    background-image: radial-gradient(circle at 18% 0%, rgba(34,180,255,.08), transparent 32%), linear-gradient(180deg,#07111f 0%,#050b16 100%);
  }
  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 252px minmax(0,1fr);
    padding: 0;
    transition: grid-template-columns .18s cubic-bezier(.4,0,.2,1);
  }
  main.sidebar-collapsed {
    grid-template-columns: 68px minmax(0,1fr);
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    padding: 20px 12px 16px;
    background: rgba(5,11,22,.96);
    backdrop-filter: blur(12px);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    transition: width .18s cubic-bezier(.4,0,.2,1);
  }
  .sidebar.collapsed {
    width: 68px;
    padding-left: 8px;
    padding-right: 8px;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 18px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 10px;
  }
  .brand {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sidebar.collapsed .brand-info {
    display: none;
  }
  .brand-mark {
    color: var(--blue);
    font: 700 10px ui-monospace,monospace;
    letter-spacing: .16em;
  }
  .brand h1 {
    font-family: Georgia,serif;
    font-size: 20px;
    margin: 4px 0 2px;
    color: var(--text);
  }
  .brand small {
    color: var(--muted);
    font-size: 11.5px;
  }
  .collapse-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all .15s ease;
  }
  .collapse-btn:hover {
    color: var(--text);
    background: var(--panel);
    border-color: var(--line);
  }
  .side-menu {
    display: grid;
    gap: 3px;
    flex: 1;
  }
  .side-menu button {
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
    white-space: nowrap;
    width: 100%;
    transition: all .12s ease;
  }
  .side-menu button svg {
    flex-shrink: 0;
    opacity: .75;
    transition: opacity .12s ease, transform .12s ease;
  }
  .side-menu button:hover {
    color: var(--text);
    background: var(--panel);
  }
  .side-menu button:hover svg {
    opacity: 1;
    transform: scale(1.05);
  }
  .side-menu button.active {
    color: var(--text);
    background: var(--panel-2);
    border-left-color: var(--blue);
    font-weight: 500;
  }
  .side-menu button.active svg {
    color: var(--blue);
    opacity: 1;
  }
  .sidebar.collapsed .side-menu button {
    justify-content: center;
    padding: 10px 0;
    border-left: 0;
    border-radius: 7px;
  }
  .sidebar.collapsed .side-menu button.active {
    background: var(--panel-2);
    border-bottom: 2px solid var(--blue);
  }
  .sidebar.collapsed .nav-label {
    display: none;
  }
  .nav-custom-trigger {
    margin-top: 10px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    transition: all .15s ease;
  }
  .nav-custom-trigger:hover {
    color: var(--text);
    border-color: var(--line-2);
    background: var(--panel);
  }
  .sidebar.collapsed .nav-custom-trigger {
    justify-content: center;
    padding: 8px;
  }
  .sidebar.collapsed .nav-custom-trigger span {
    display: none;
  }
  .side-footer {
    margin-top: auto;
    padding: 14px 6px 0;
    color: var(--muted);
    font: 11px/1.5 ui-monospace,monospace;
    border-top: 1px solid var(--line);
  }
  .sidebar.collapsed .side-footer {
    display: none;
  }
  .workspace {
    min-width: 0;
    padding: 0 clamp(18px,4vw,54px) 56px;
  }
  .page-section {
    display: none !important;
  }
  .page-section.active {
    display: block !important;
  }
  .appbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 12px;
    margin-bottom: 22px;
    background: rgba(5,11,22,.94);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .appbrand {
    color: var(--blue);
    font: 700 13px ui-monospace, monospace;
    letter-spacing: .08em;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1, h2, h3, p { margin-top: 0; }
  h1 { font-size: 26px; margin-bottom: 4px; color: var(--text); }
  h2 { font-size: 18px; margin-bottom: 12px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  h3 { font-size: 15px; margin-bottom: 5px; color: var(--text); }
  .muted, small { color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .summary { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 10px; margin: 0 0 16px; }
  .summary-item {
    background: #182230;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 12px 14px;
    transition: transform .12s ease, border-color .12s ease;
  }
  .summary-item:hover { border-color: var(--line-2); transform: translateY(-1px); }
  .summary-item strong { display: block; font-size: 22px; color: var(--blue); }
  .summary-item span { color: var(--muted); font-size: 12px; }
  .status-legend { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin: 0 0 16px; }
  .status-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .anchor { scroll-margin-top: 76px; }
  section, .transport {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 16px rgba(0,0,0,.22);
  }
  .transport { min-height: 154px; }
  .transport strong { color: var(--blue); font-family: ui-monospace, monospace; }
  .transport p { color: var(--muted); margin-bottom: 0; }
  .provider-block {
    margin: 16px 0;
    padding: 16px 18px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    transition: border-color .12s ease;
  }
  .provider-block:hover { border-color: var(--line-2); }
  .provider-block h3 { display: flex; justify-content: space-between; align-items: center; color: var(--blue); }
  .provider { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; border-top: 1px solid var(--line); padding: 12px 0; }
  .provider:first-child { border-top: 0; padding-top: 0; }
  .provider small { grid-column: 1; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 2; grid-row: 1 / span 2; justify-content: end; }
  button, .link {
    border: 1px solid #4b5563;
    border-radius: 6px;
    background: #374151;
    color: var(--text);
    padding: 7px 12px;
    cursor: pointer;
    text-decoration: none;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all .12s ease;
  }
  button:hover, .link:hover { background: #4b5563; border-color: var(--line-2); }
  button:disabled { cursor: wait; opacity: .6; }
  button.primary { background: #0070f3; border-color: #0070f3; color: #fff; font-weight: 500; }
  button.primary:hover { background: #0060df; }
  button.success { background: #0e7a4d; border-color: #1fd18a; color: #fff; }
  button.success:hover { background: #139960; }
  button.danger { background: #991b34; border-color: #ff6f91; color: #fff; }
  button.danger:hover { background: #b91c3c; }
  .status { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); box-shadow: 0 0 8px rgba(255,111,145,.4); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 8px rgba(31,209,138,.4); }
  .dot.warn { background: var(--warn); box-shadow: 0 0 8px rgba(245,184,61,.4); }
  .model-list { display: grid; gap: 5px; }
  .model-tools { display: grid; grid-template-columns: minmax(220px,1fr) 160px 210px auto; gap: 8px; margin-bottom: 12px; }
  .model-tools input { flex: 1; min-width: 0; }
  .model-summary { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0 14px; }
  .model-summary span { border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; color: var(--muted); font-size: 12px; }
  .model-transport-group { margin: 14px 0 20px; }
  .model-transport-group > h3 { display: flex; justify-content: space-between; color: var(--blue); margin-bottom: 8px; }
  .model-provider-group { background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; margin: 8px 0; overflow: hidden; }
  .model-provider-group > summary { display: grid; grid-template-columns: minmax(190px,1fr) auto auto; align-items: center; gap: 12px; padding: 11px 13px; cursor: pointer; }
  .model-provider-group > summary strong { color: var(--text); }
  .model-provider-group > summary small { display: block; font-weight: 400; }
  .model-provider-group > summary .ready { color: var(--ok); }
  .model-provider-group > summary .unavailable { color: var(--warn); }
  .model-provider-models { border-top: 1px solid var(--line); padding: 4px 13px 8px; }
  .model-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(170px,.5fr) auto; gap: 12px; align-items: center; border-top: 1px solid var(--line); padding: 9px 0; }
  .model-row:first-child { border-top: 0; }
  .model-row strong, .model-row code { display: block; }
  .model-row strong { color: var(--text); overflow-wrap: anywhere; }
  .model-row code { font-size: 12px; }
  .model-row .model-meta { color: var(--muted); font-size: 12px; }
  #model-list { max-height: 70vh; overflow: auto; padding-right: 4px; }
  .setting-list { display: grid; gap: 10px; margin: 12px 0 24px; }
  .setting-row { display: grid; grid-template-columns: minmax(150px, .7fr) minmax(180px, 1fr) auto; gap: 10px; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; }
  .setting-row:first-child { border-top: 0; padding-top: 0; }
  .setting-row input { min-width: 0; }
  .setting-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 11.5px/1 ui-monospace,monospace;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid transparent;
  }
  .setting-badge.ok { color: var(--ok); background: var(--ok-bg); border-color: rgba(31,209,138,.3); }
  .setting-badge.warn { color: var(--warn); background: var(--warn-bg); border-color: rgba(245,184,61,.3); }
  .setting-badge.bad { color: var(--bad); background: var(--bad-bg); border-color: rgba(255,111,145,.3); }
  .setting-badge.info { color: var(--blue); background: rgba(34,180,255,.12); border-color: rgba(34,180,255,.3); }
  .setting-badge.muted { color: var(--muted); background: #1a2536; border-color: var(--line); }
  .policy-form { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 12px; }
  .policy-controls-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(160px, 1fr) auto; gap: 12px; align-items: end; }
  
  /* Tool Multi-Select Component */
  .tool-picker-container {
    background: #081526;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .tool-picker-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .tool-picker-search {
    flex: 1;
    min-width: 200px;
  }
  .tool-picker-actions {
    display: flex;
    gap: 6px;
  }
  .tool-picker-actions button {
    font-size: 11.5px;
    padding: 4px 8px;
    background: #112338;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .tool-picker-actions button:hover {
    color: var(--text);
    border-color: var(--line-2);
  }
  .tool-chips-area {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 34px;
    padding: 6px 8px;
    background: #0b1a2e;
    border: 1px solid rgba(143,213,236,.14);
    border-radius: 6px;
    margin-bottom: 10px;
    align-items: center;
  }
  .tool-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,111,145,.15);
    border: 1px solid rgba(255,111,145,.35);
    color: #ff9cb2;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 500;
  }
  .tool-chip .chip-del {
    border: 0;
    background: transparent;
    color: #ff9cb2;
    cursor: pointer;
    padding: 0 1px;
    font-size: 14px;
    line-height: 1;
    opacity: .7;
  }
  .tool-chip .chip-del:hover {
    opacity: 1;
    color: #fff;
  }
  .tool-categories-accordion {
    display: grid;
    gap: 8px;
    max-height: 290px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .tool-cat-block {
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: #0d1e33;
  }
  .tool-cat-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: #122844;
    font-size: 12px;
    font-weight: 600;
    color: var(--blue-soft);
    cursor: pointer;
    user-select: none;
  }
  .tool-cat-title .cat-badge {
    font-size: 11px;
    color: var(--muted);
    font-weight: 400;
  }
  .tool-pills-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
  }
  .tool-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 12px;
    border: 1px solid var(--line);
    background: #081628;
    color: var(--text);
    cursor: pointer;
    transition: all .12s ease;
  }
  .tool-pill:hover {
    border-color: var(--line-2);
    background: #0e223c;
  }
  .tool-pill.selected {
    border-color: rgba(255,111,145,.5);
    background: rgba(255,111,145,.14);
    color: #ffaec0;
  }
  .pill-tag {
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .pill-tag.mutating { background: rgba(245,184,61,.22); color: var(--warn); }
  .pill-tag.readonly { background: rgba(31,209,138,.22); color: var(--ok); }

  /* Pipelines Component */
  .pipeline-card {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 16px;
    transition: border-color .15s ease;
  }
  .pipeline-card:hover { border-color: var(--line-2); }
  .pipeline-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .pipeline-steps-flow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 14px 0;
  }
  .pipeline-step-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #0a192f;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 12px;
  }
  .pipeline-step-pill .step-meta {
    font-size: 10.5px;
    color: var(--muted);
    font-family: ui-monospace, monospace;
  }
  .pipeline-arrow {
    color: var(--muted);
    font-size: 14px;
  }
  .checkpoint-badge {
    background: rgba(245,184,61,.18);
    color: var(--warn);
    border: 1px solid rgba(245,184,61,.3);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pipeline-run-box {
    margin-top: 18px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: #071324;
    padding: 18px;
  }
  .checkpoint-banner {
    background: rgba(245,184,61,.12);
    border: 1px solid rgba(245,184,61,.35);
    border-radius: 7px;
    padding: 14px 16px;
    margin: 14px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .step-result-card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px 14px;
    margin-top: 10px;
  }
  .step-result-card.waiting_approval {
    border-color: rgba(245,184,61,.45);
    background: #152233;
  }
  .step-result-card.completed {
    border-color: rgba(31,209,138,.35);
  }
  .step-result-card.failed {
    border-color: rgba(255,111,145,.4);
  }
  .step-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .step-result-content {
    background: #040913;
    border: 1px solid rgba(143,213,236,.1);
    border-radius: 5px;
    padding: 10px;
    font-size: 12px;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-family: ui-monospace, monospace;
    color: var(--text);
  }

  /* Modal Dialog */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(2,6,12,.78);
    backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal-backdrop.open {
    display: flex;
  }
  .modal-dialog {
    background: var(--panel);
    border: 1px solid var(--line-2);
    border-radius: 10px;
    width: 100%;
    max-width: 660px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0,0,0,.55);
  }
  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    background: var(--panel-2);
  }
  .modal-close {
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 16px;
  }
  .modal-close:hover { color: var(--text); }
  .preset-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .preset-btn {
    font-size: 12px;
    padding: 5px 10px;
    background: #15253b;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .preset-btn:hover {
    color: var(--text);
    border-color: var(--blue);
  }
  .nav-checkboxes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }
  .nav-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
  }
  .nav-checkbox-label input {
    width: auto;
  }

  code { color: var(--blue); overflow-wrap: anywhere; }
  #notice { min-height: 24px; color: var(--muted); margin: 0 0 18px; }
  .wide { margin-top: 16px; }
  .playground { margin-top: 16px; }
  label { display: grid; gap: 6px; color: var(--muted); margin-bottom: 12px; }
  input, select, textarea {
    width: 100%;
    border: 1px solid rgba(143,213,236,.24);
    border-radius: 7px;
    background: #0b1a2e;
    color: var(--text);
    padding: 10px 12px;
    font: inherit;
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
  }
  input:hover, select:hover, textarea:hover { border-color: var(--line-2); background: #0e2038; }
  input:focus, select:focus, textarea:focus { outline: 0; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(34,180,255,.14); }
  textarea { min-height: 92px; resize: vertical; }
  .play-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  #play-output { white-space: pre-wrap; min-height: 54px; margin: 14px 0 0; }
  .activity-list { display: grid; gap: 7px; max-height: 460px; overflow: auto; }
  .activity-event { display: grid; grid-template-columns: 76px 86px minmax(0,1fr); gap: 10px; align-items: start; border-top: 1px solid var(--line); padding: 9px 0; font-size: 13px; }
  .activity-event:first-child { border-top: 0; }
  .activity-event time, .activity-event .scope { color: var(--muted); font: 12px ui-monospace,monospace; }
  .activity-event.success .level { color: var(--ok); }
  .activity-event.warning .level { color: var(--warn); }
  .activity-event.error .level { color: var(--bad); }
  .recommendation { border-left: 3px solid var(--copper); padding: 10px 14px; margin: 10px 0; background: var(--panel-2); }
  .help section { margin-bottom: 16px; }
  main.help { display: block; max-width: 1040px; margin: 0 auto; padding: 32px 20px 56px; }
  li { margin: 7px 0; }
  pre { overflow-x: auto; background: #111827; border: 1px solid var(--line); padding: 14px; border-radius: 6px; }
  @media (max-width: 760px) {
    main { display: block; }
    .sidebar { position: fixed; z-index: 30; width: min(290px,86vw); transform: translateX(-102%); transition: transform .18s ease; box-shadow: 18px 0 45px rgba(0,0,0,.35); }
    .sidebar.open { transform: translateX(0); }
    .workspace { padding: 0 16px 42px; }
    .summary { grid-template-columns: repeat(2, 1fr); }
    #menu-toggle { display: inline-flex !important; }
    .actions { grid-column: 1 / -1; grid-row: auto; justify-content: start; }
    .setting-row, .model-tools, .model-row, .policy-controls-row { grid-template-columns: 1fr; gap: 6px; }
    .model-provider-group > summary { grid-template-columns: 1fr auto; }
  }

  /* Visual Analytics Charts */
  .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin: 16px 0 24px; }
  .chart-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .chart-header h3 { margin: 0; font-size: 14px; color: var(--blue-soft); }
  .chart-badge { font: 600 11px ui-monospace, monospace; padding: 2px 6px; border-radius: 4px; background: rgba(34,180,255,.12); color: var(--blue); }
  .svg-chart { width: 100%; height: auto; display: block; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 12px; color: var(--muted); }
  .legend-item { display: inline-flex; align-items: center; gap: 5px; }
  .legend-color { width: 10px; height: 10px; border-radius: 2px; }

  /* Risk & Classification Badges */
  .risk-badge { font: 700 10.5px ui-monospace, monospace; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: .04em; }
  .risk-low { background: rgba(31,209,138,.14); color: var(--ok); border: 1px solid rgba(31,209,138,.3); }
  .risk-medium { background: rgba(245,184,61,.14); color: var(--warn); border: 1px solid rgba(245,184,61,.3); }
  .risk-high { background: rgba(255,138,61,.14); color: var(--copper); border: 1px solid rgba(255,138,61,.3); }
  .risk-critical { background: rgba(255,111,145,.14); color: var(--bad); border: 1px solid rgba(255,111,145,.3); }
  .class-badge { font: 500 11px Inter, sans-serif; padding: 2px 7px; border-radius: 4px; background: rgba(143,213,236,.12); color: var(--blue-soft); border: 1px solid rgba(143,213,236,.25); }

  /* Filter Chips */
  .filter-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 14px; }
  .filter-chip { padding: 4px 10px; border-radius: 999px; font-size: 12px; border: 1px solid var(--line); background: #0c1c30; color: var(--muted); cursor: pointer; transition: all .12s ease; }
  .filter-chip:hover { border-color: var(--line-2); color: var(--text); }
  .filter-chip.active { background: var(--blue); color: #050b16; border-color: var(--blue); font-weight: 600; }

  /* Data Table */
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; margin: 10px 0; }
  .data-table th { background: #112338; color: var(--blue-soft); padding: 9px 12px; border-bottom: 1px solid var(--line-2); font-weight: 600; }
  .data-table td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .data-table tr:hover td { background: rgba(17,35,64,.5); }

  /* Budget Meters */
  .budget-gauge { background: #0b1a2e; border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
  .budget-meter { height: 10px; border-radius: 5px; background: #132438; overflow: hidden; margin: 8px 0; }
  .budget-fill { height: 100%; border-radius: 5px; transition: width .3s ease; }
  .budget-fill.safe { background: #1fd18a; }
  .budget-fill.warn { background: #f5b83d; }
  .budget-fill.danger { background: #ff6f91; }

  /* Directory Browser */
  .dir-browser { background: #081526; border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 13px; }
  .dir-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 5px; cursor: pointer; border: 1px solid transparent; }
  .dir-item:hover { background: #11243c; border-color: var(--line); }
  .dir-breadcrumb { display: flex; align-items: center; gap: 8px; padding: 6px 0 10px; border-bottom: 1px solid var(--line); margin-bottom: 8px; font-family: ui-monospace, monospace; color: var(--blue-soft); }

  /* Tool Catalog Grid */
  .tool-catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-top: 12px; }
  .tool-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .tool-card:hover { border-color: var(--line-2); }
  .tool-card-head { display: flex; justify-content: space-between; align-items: center; }

  #menu-toggle { display: none; }
`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conduit Bridge - Provider Control Plane</title>
  <style>${SHARED_STYLE}</style>
</head>
<body>
<main id="main-layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <div class="brand-info">
          <div class="brand-mark">OPEN SOURCE / COMMUNITY</div>
          <h1>Conduit Bridge</h1>
          <small>Provider control plane</small>
        </div>
      </div>
      <button class="collapse-btn" id="sidebar-collapse-btn" type="button" title="Toggle sidebar layout" aria-label="Toggle sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9-3 3 3 3"/></svg>
      </button>
    </div>
    <nav class="side-menu" aria-label="Dashboard sections" id="side-nav">
      <button class="active" data-section="overview" title="Overview">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        <span class="nav-label">Overview</span>
      </button>
      <button data-section="playground" title="Playground">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <span class="nav-label">Playground</span>
      </button>
      <button data-section="api-providers" title="API Providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span class="nav-label">API providers</span>
      </button>
      <button data-section="cli-providers" title="CLI Providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
        <span class="nav-label">CLI providers</span>
      </button>
      <button data-section="agent-controls" title="Agent Controls">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        <span class="nav-label">Agent controls</span>
      </button>
      <button data-section="pipelines" title="Pipelines & Chaining">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6"/><circle cx="18" cy="9" r="3"/><path d="M6 15a6 6 0 0 0 6-6V9a6 6 0 0 1 6-6"/></svg>
        <span class="nav-label">Pipelines</span>
      </button>
      <button data-section="governance" title="Repository Governance">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span class="nav-label">Governance</span>
      </button>
      <button data-section="budgets" title="Budget Controls">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 6v2"/><path d="M12 16v2"/></svg>
        <span class="nav-label">Budgets</span>
      </button>
      <button data-section="workspaces" title="Workspaces & Working Directories">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="nav-label">Workspaces</span>
      </button>
      <button data-section="local-providers" title="Local Providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
        <span class="nav-label">Local providers</span>
      </button>
      <button data-section="models" title="Models">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
        <span class="nav-label">Models</span>
      </button>
      <button data-section="usage" title="Usage Statistics">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        <span class="nav-label">Usage</span>
      </button>
      <button data-section="orchestrator" title="Orchestrator">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 10.4 6.5 6.5"/><path d="M13.6 10.4l3.9-3.9"/><path d="M10.4 13.6 6.5 17.5"/><path d="M13.6 13.6l3.9 3.9"/></svg>
        <span class="nav-label">Orchestrator</span>
      </button>
      <button data-section="integration" title="Integration Tests">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="nav-label">Integration tests</span>
      </button>
      <button data-section="recommendations" title="Recommendations">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        <span class="nav-label">Recommendations</span>
      </button>
      <button data-section="activity" title="Activity & Telemetry">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span class="nav-label">Activity</span>
      </button>
      <button data-section="settings" title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span class="nav-label">Settings</span>
      </button>
      <button data-section="help" title="Help & Documentation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        <span class="nav-label">Help</span>
      </button>
    </nav>
    <button class="nav-custom-trigger" id="open-nav-custom-btn" type="button" title="Customize navigation visibility">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      <span>Customize Nav</span>
    </button>
    <div class="side-footer">
      <span id="side-runtime">Loading...</span>
    </div>
  </aside>

  <div class="workspace">
    <nav class="appbar" aria-label="Dashboard controls">
      <div style="display: flex; align-items: center; gap: 10px;">
        <button id="menu-toggle" type="button" aria-label="Toggle navigation">Menu</button>
        <span class="appbrand">CONDUIT BRIDGE</span>
      </div>
      <div class="header-actions">
        <button id="refresh" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          Refresh
        </button>
      </div>
    </nav>

    <p id="notice" role="status"></p>

    <!-- Overview Section -->
    <div id="overview-section" class="page-section active">
      <header id="overview" class="anchor">
        <div>
          <h1>Operational Dashboard</h1>
          <div class="muted" id="version">Loading...</div>
        </div>
      </header>
      <div class="summary" aria-label="Runtime summary">
        <div class="summary-item"><strong id="summary-connected">-</strong><span>Connected providers</span></div>
        <div class="summary-item"><strong id="summary-models">-</strong><span>Registered models</span></div>
        <div class="summary-item"><strong id="summary-requests">-</strong><span>Requests handled</span></div>
        <div class="summary-item"><strong id="summary-active">-</strong><span>Active requests</span></div>
      </div>
      <div class="grid">
        <article class="transport"><strong>api-*</strong><h3>Direct APIs</h3><p>Requests use provider SDK or REST endpoints. Independent API keys managed via protected Bridge settings.</p></article>
        <article class="transport"><strong>cli-*</strong><h3>Local coding CLIs</h3><p>Requests route to Claude Code, OpenAI Codex, Antigravity Gemini, or Grok CLI with account isolation.</p></article>
        <article class="transport"><strong>lmstudio/*</strong><h3>Local models</h3><p>Requests route to an OpenAI-compatible LM Studio server on localhost without cloud dependencies.</p></article>
      </div>
    </div>

    <!-- Playground Section -->
    <section id="playground-section" class="playground page-section">
      <h2>Local Playground</h2>
      <p class="muted">Send interactive test requests through the OpenAI-compatible proxy interface.</p>
      <label>Model<select id="play-model"></select></label>
      <label>Mode
        <select id="play-mode">
          <option value="chat">Chat (read-only inference)</option>
          <option value="plan">Plan (architectural proposal)</option>
          <option value="agent">Agent (autonomous workspace writes)</option>
        </select>
      </label>
      <div style="display: grid; grid-template-columns: 1fr minmax(180px, 260px); gap: 10px; align-items: end;">
        <label>Working directory<input id="play-cwd" type="text" placeholder="Absolute path (required when agent mode is selected)"></label>
        <label>Workspace quick select<select id="play-ws-select"><option value="">-- Choose Workspace --</option></select></label>
      </div>
      <label>Effort tier<select id="play-effort"></select></label>
      <label>Prompt<textarea id="play-prompt">Reply with exactly: pong</textarea></label>
      <div class="play-actions">
        <button id="play-run" class="primary" type="button">Run test</button>
        <span id="play-note" class="muted"></span>
      </div>
      <pre id="play-output" aria-live="polite">No test run yet.</pre>
    </section>

    <!-- API Providers Section -->
    <div id="api-providers-section" class="wide page-section">
      <section>
        <h2>API providers</h2>
        <p class="muted">Direct cloud APIs configured via environment variables or write-only settings.</p>
        <div id="api-provider-list">Loading...</div>
      </section>
    </div>

    <!-- CLI Providers Section -->
    <div id="cli-providers-section" class="wide page-section">
      <section>
        <h2>CLI providers</h2>
        <p class="muted">Installed command-line tools leveraging native terminal authentication and workspaces.</p>
        <div id="cli-provider-list">Loading...</div>
      </section>
    </div>

    <!-- Agent Controls Section -->
    <div id="agent-controls-section" class="wide page-section">
      <section>
        <h2>Provider agent controls</h2>
        <p class="muted">Govern autonomous agent execution, default run modes, and restricted tools per provider with structured tool selection inspired by OpenClaw.</p>
        <div id="agent-policy-list">Loading...</div>
      </section>

      <section style="margin-top: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h3>Host Discovered System Tools (Windows Environment)</h3>
            <p class="muted">Automatically detected developer binaries and environments on system PATH.</p>
          </div>
          <button type="button" id="btn-rediscover-tools" class="primary">Rediscover Tools</button>
        </div>
        <div id="system-tools-list">Scanning system PATH...</div>
      </section>

      <section style="margin-top: 20px;">
        <h3>Human-Readable Tool Catalog</h3>
        <p class="muted">Capability badges, classification tags, and security risk levels for all bridge operations.</p>
        <div class="filter-chips" id="catalog-class-chips">
          <button type="button" class="filter-chip active" data-class="all">All Tools</button>
          <button type="button" class="filter-chip" data-class="Read Only">Read Only</button>
          <button type="button" class="filter-chip" data-class="Workspace Modify">Workspace Modify</button>
          <button type="button" class="filter-chip" data-class="System Modify">System Modify</button>
          <button type="button" class="filter-chip" data-class="Network Access">Network Access</button>
          <button type="button" class="filter-chip" data-class="External Service">External Service</button>
        </div>
        <div id="tool-catalog-container" class="tool-catalog-grid">Loading catalog...</div>
      </section>
    </div>

    <!-- Pipelines Section -->
    <div id="pipelines-section" class="wide page-section">
      <section>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h2>Agent Pipelines & Chaining</h2>
            <p class="muted">Multi-step agent pipelines across heterogeneous providers with dependency resolution, parallel review stages, and human approval checkpoints.</p>
          </div>
          <button id="btn-open-create-pipeline" class="primary" type="button">+ New Custom Pipeline</button>
        </div>

        <div class="pipeline-run-box">
          <h3>Trigger Pipeline Execution</h3>
          <p class="muted">Launch an end-to-end multi-agent workflow with repository binding and budget controls.</p>
          <div style="display: grid; grid-template-columns: minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(160px, 1fr) auto; gap: 12px; align-items: end; margin-bottom: 12px;">
            <label><span>Select Pipeline</span><select id="pipe-run-select"></select></label>
            <label><span>Repository Target</span><select id="pipe-run-repo"><option value="">Default / Global</option></select></label>
            <label><span>Working Directory</span><select id="pipe-run-cwd"><option value="">Default Workspace</option></select></label>
            <button id="pipe-run-btn" class="primary" type="button" style="height: 42px;">Execute Pipeline</button>
          </div>
          <label><span>Initial Prompt / Task Description</span><textarea id="pipe-run-prompt" placeholder="Describe the goal or codebase problem to solve across the pipeline steps...">Refactor the authentication middleware to support token rotation and write comprehensive unit tests.</textarea></label>
          <div id="pipe-live-status"></div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 24px; flex-wrap: wrap; gap: 10px;">
          <h3 style="margin: 0;">Available Pipelines & Governance Templates</h3>
          <div class="filter-chips" id="pipe-category-chips" style="margin: 0;">
            <button type="button" class="filter-chip active" data-cat="all">All</button>
            <button type="button" class="filter-chip" data-cat="governance">Governance</button>
            <button type="button" class="filter-chip" data-cat="review">Review</button>
            <button type="button" class="filter-chip" data-cat="engineering">Engineering</button>
            <button type="button" class="filter-chip" data-cat="security">Security</button>
            <button type="button" class="filter-chip" data-cat="custom">Custom</button>
          </div>
        </div>
        <div id="pipelines-list">Loading pipelines...</div>

        <h3 style="margin-top: 24px;">Execution History</h3>
        <div id="pipelines-history" class="activity-list">No runs recorded yet.</div>
      </section>
    </div>

    <!-- Governance Section -->
    <div id="governance-section" class="wide page-section">
      <section>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h2>Repository Governance & Pipeline Templates</h2>
            <p class="muted">Bind multi-agent governance templates to repositories, configure mandatory approval gates, and track audit records.</p>
          </div>
          <button id="btn-open-add-repo" class="primary" type="button">+ Register Repository</button>
        </div>

        <h3>Active Repositories</h3>
        <div id="repos-table-container">Loading repositories...</div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 28px; margin-bottom: 8px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0;">Governance Approval Audit Trail</h3>
            <p class="muted" style="margin: 0; font-size: 13px;">Full audit log of human authorizations, gate sign-offs, and rejections.</p>
          </div>
          <div class="play-actions">
            <button type="button" id="btn-export-audit-json">Export JSON</button>
            <button type="button" class="primary" id="btn-export-audit-md">Export Markdown</button>
          </div>
        </div>
        <div id="audit-trail-container">Loading audit trail...</div>
      </section>
    </div>

    <!-- Budgets Section -->
    <div id="budgets-section" class="wide page-section">
      <section>
        <h2>Pipeline Budget Controls & Spending Limits</h2>
        <p class="muted">Enforce cost limits, token consumption thresholds, and daily/monthly spending caps with hard stops and soft warnings.</p>

        <div class="grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 20px;">
          <div class="budget-gauge" id="daily-budget-gauge">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Daily Spending Budget</strong>
              <span id="daily-budget-text" class="setting-badge ok">$0.00 / $10.00 (0%)</span>
            </div>
            <div class="budget-meter"><div id="daily-budget-fill" class="budget-fill safe" style="width: 0%;"></div></div>
            <small class="muted" id="daily-budget-sub">Resets at midnight UTC</small>
          </div>

          <div class="budget-gauge" id="monthly-budget-gauge">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Monthly Spending Budget</strong>
              <span id="monthly-budget-text" class="setting-badge ok">$0.00 / $100.00 (0%)</span>
            </div>
            <div class="budget-meter"><div id="monthly-budget-fill" class="budget-fill safe" style="width: 0%;"></div></div>
            <small class="muted" id="monthly-budget-sub">Resets on 1st of month</small>
          </div>
        </div>

        <h3>Budget Configuration</h3>
        <form id="budget-config-form" class="provider-block" style="padding: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px;">
            <label><span>Daily Budget (USD)</span><input type="number" step="0.5" min="0" id="cfg-daily-budget"></label>
            <label><span>Monthly Budget (USD)</span><input type="number" step="1" min="0" id="cfg-monthly-budget"></label>
            <label><span>Max Cost Per Run (USD)</span><input type="number" step="0.05" min="0" id="cfg-max-cost-run"></label>
            <label><span>Max Tokens Per Run</span><input type="number" step="5000" min="0" id="cfg-max-tokens-run"></label>
            <label><span>Warning Threshold (%)</span><input type="number" min="10" max="95" id="cfg-warn-threshold"></label>
            <label><span>Limit Enforcement</span>
              <select id="cfg-hard-stop">
                <option value="true">Hard Stop (Block execution when exceeded)</option>
                <option value="false">Soft Warning (Notify operator only)</option>
              </select>
            </label>
          </div>
          <div class="play-actions">
            <button type="submit" class="primary">Save Budget Limits</button>
            <span id="budget-save-note" class="muted"></span>
          </div>
        </form>
      </section>
    </div>

    <!-- Workspaces Section -->
    <div id="workspaces-section" class="wide page-section">
      <section>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h2>Working Directories & Workspaces</h2>
            <p class="muted">Manage validated project working directories, permissions, and browse local filesystem paths safely.</p>
          </div>
        </div>

        <div class="provider-block" style="padding: 14px; margin-bottom: 18px;">
          <h3 style="margin-bottom: 10px;">Register New Workspace</h3>
          <form id="add-workspace-form" style="display: grid; grid-template-columns: 1fr minmax(180px, 240px) auto; gap: 10px; align-items: end;">
            <label><span>Workspace Absolute Path</span><input type="text" id="new-ws-path" placeholder="C:\\path\\to\\project"></label>
            <label><span>Friendly Name</span><input type="text" id="new-ws-name" placeholder="Optional label"></label>
            <button type="submit" class="primary" style="height: 40px;">Add Workspace</button>
          </form>
        </div>

        <h3>Registered Workspaces</h3>
        <div id="workspaces-table-container">Loading workspaces...</div>

        <h3 style="margin-top: 24px;">Filesystem Directory Browser</h3>
        <p class="muted">Browse directories to verify paths and inspect folder accessibility.</p>
        <div class="dir-browser">
          <div class="dir-breadcrumb">
            <span>Path:</span> <strong id="browser-current-path">-</strong>
            <button type="button" id="browser-up-btn" style="padding: 2px 8px; font-size: 11px;">Up one level</button>
          </div>
          <div id="browser-dirs-list" style="display: grid; gap: 4px; max-height: 240px; overflow-y: auto;"></div>
        </div>
      </section>
    </div>

    <!-- Local Providers Section -->
    <div id="local-providers-section" class="wide page-section">
      <section>
        <h2>Local providers</h2>
        <p class="muted">On-device services such as LM Studio that require no cloud credentials.</p>
        <div id="local-provider-list">Loading...</div>
      </section>
    </div>

    <!-- Models Section -->
    <div id="models-section" class="wide page-section">
      <section>
        <h2>Models by transport and provider</h2>
        <p class="muted">Explore models across transports, context windows, output caps, and availability.</p>
        <div class="model-tools">
          <input id="model-search" type="search" placeholder="Search model, owner, or provider">
          <select id="model-transport-filter" aria-label="Filter by transport">
            <option value="">All transports</option>
            <option value="api-*">Direct APIs</option>
            <option value="cli-*">Coding CLIs</option>
            <option value="lmstudio/*">Local models</option>
          </select>
          <select id="model-provider-filter" aria-label="Filter by provider">
            <option value="">All providers</option>
          </select>
          <button id="model-refresh" type="button">Refresh catalogs</button>
        </div>
        <div id="model-count" class="muted"></div>
        <div id="model-summary" class="model-summary"></div>
        <div id="model-list">Loading...</div>
      </section>
    </div>

    <!-- Orchestrator Section -->
    <section id="orchestrator-section" class="wide page-section">
      <h2>Orchestrator</h2>
      <p class="muted">Multi-model consensus and synthesis. Sequential, parallel, and debate strategies.</p>
      <label><span>Enabled</span>
        <select id="orch-enabled">
          <option value="false">Disabled</option>
          <option value="true">Enabled</option>
        </select>
      </label>
      <label><span>Strategy</span>
        <select id="orch-strategy">
          <option value="sequential">Sequential review</option>
          <option value="parallel">Parallel panel</option>
          <option value="debate">Debate chain</option>
        </select>
      </label>
      <div id="orch-roles"></div>
      <label><span>Fallback models</span><select id="orch-fallbacks" multiple size="4"></select></label>
      <div class="play-actions">
        <button id="orch-save" type="button">Save orchestration</button>
        <button id="orch-run" type="button">Run orchestration</button>
        <span id="orch-note" class="muted"></span>
      </div>
      <pre id="orch-output">No orchestration run yet.</pre>
    </section>

    <!-- Integration Tests Section -->
    <section id="integration-section" class="wide page-section">
      <h2>Integration tests</h2>
      <p class="muted">Automated verification testing OpenAI routes and provider execution matrices.</p>
      <pre>Base URL: http://127.0.0.1:31338/v1
Endpoint: POST /chat/completions</pre>
      <div class="play-actions">
        <button id="test-all-cli" type="button">Test all CLI providers</button>
        <button id="test-openai" type="button">Test OpenAI-compatible route</button>
      </div>
      <div id="test-output" class="activity-list" style="margin-top: 14px;">No integration test run yet.</div>
    </section>

    <!-- Recommendations Section -->
    <section id="recommendations-section" class="wide page-section">
      <h2>Recommendations</h2>
      <p class="muted">Operational guidance for high-reliability agent routing.</p>
      <div class="recommendation"><strong>Use CLI providers for coding work.</strong><br><span class="muted">They leverage local workspace context, genuine account licenses, and effort level controls.</span></div>
      <div class="recommendation"><strong>Use API providers for automation.</strong><br><span class="muted">They use explicit credentials and are suited for background services and scheduled jobs.</span></div>
      <div class="recommendation"><strong>Validate changes with ping-pong first.</strong><br><span class="muted">Run the CLI provider matrix, then an OpenAI-compatible request, then pipeline workflows.</span></div>
    </section>

    <!-- Activity Section -->
    <section id="activity-section" class="wide page-section">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
        <div>
          <h2>Activity Streams & Operational Telemetry</h2>
          <p class="muted">Human-readable operational journal with filtering, correlation tracking, and log export.</p>
        </div>
        <div class="play-actions">
          <button type="button" id="btn-export-activity-json">Export JSON</button>
          <button type="button" class="primary" id="btn-export-activity-md">Export Markdown</button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 12px 0;">
        <div class="filter-chips" id="activity-level-chips" style="margin: 0;">
          <button type="button" class="filter-chip active" data-level="all">All Events</button>
          <button type="button" class="filter-chip" data-level="info">Info</button>
          <button type="button" class="filter-chip" data-level="success">Success</button>
          <button type="button" class="filter-chip" data-level="warning">Warning</button>
          <button type="button" class="filter-chip" data-level="error">Error</button>
        </div>
        <input type="text" id="activity-search" placeholder="Filter log entries..." style="max-width: 240px; padding: 6px 10px;">
      </div>

      <div id="activity-log" class="activity-list">No events yet.</div>
      <h3 style="margin-top: 24px;">Request telemetry</h3>
      <div id="metrics">No requests yet.</div>
    </section>

    <!-- Usage Statistics Section -->
    <section id="usage-section" class="wide page-section">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2>Usage Statistics & Visual Analytics</h2>
          <p class="muted">Real-time telemetry, model breakdowns, token consumption, and cost tracking.</p>
        </div>
        <button type="button" id="btn-refresh-analytics" class="primary">Refresh Analytics</button>
      </div>

      <div class="summary">
        <div class="summary-item"><strong id="usage-total">0</strong><span>Total requests</span></div>
        <div class="summary-item"><strong id="usage-success">0</strong><span>Successful</span></div>
        <div class="summary-item"><strong id="usage-failure">0</strong><span>Failed</span></div>
        <div class="summary-item"><strong id="usage-latency">-</strong><span>Average latency</span></div>
      </div>

      <!-- Real-time SVG Charts Grid -->
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Request Volumes & Latencies</h3>
            <span class="chart-badge">MODELS</span>
          </div>
          <div id="chart-requests-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Token & Cost Share</h3>
            <span class="chart-badge">SPEND</span>
          </div>
          <div id="chart-cost-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Pipeline Run Outcomes</h3>
            <span class="chart-badge">PIPELINES</span>
          </div>
          <div id="chart-pipelines-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Operational Events by Severity</h3>
            <span class="chart-badge">TELEMETRY</span>
          </div>
          <div id="chart-activity-container" style="min-height: 180px;"></div>
        </div>
      </div>

      <h3 style="margin-top: 20px;">Detailed Model Metrics</h3>
      <div id="usage-table" class="model-list">No usage yet.</div>
    </section>

    <!-- Settings Section -->
    <section id="settings-section" class="wide page-section">
      <h2>Settings</h2>
      <p class="muted">Configure API credentials and platform settings. Secret keys are write-only.</p>
      <section>
        <h3>API credentials</h3>
        <div id="settings-keys">Loading...</div>
      </section>
    </section>

    <!-- Help Section -->
    <section id="help-section-v2" class="wide page-section">
      <h2>Help and operating guide</h2>
      <p class="muted">Getting started, connecting clients, and managing autonomous agent policies.</p>
      <section><h3>Supported desktop platforms</h3><p>Conduit Bridge currently supports Windows Desktop and Linux Desktop. It needs Node.js 24 or newer. Start the bridge on the desktop and open <code>http://127.0.0.1:31338/</code>.</p></section>
      <section><h3>Desktop autostart</h3><p>After building, use <code>./scripts/install-autostart.sh</code> on Linux Desktop or <code>powershell -ExecutionPolicy Bypass -File .\\scripts\\install-autostart.ps1</code> on Windows Desktop. The bridge starts as the logged-in desktop user on <code>127.0.0.1:31338</code>. See <code>docs/AUTOSTART.md</code> for removal and troubleshooting.</p></section>
      <section>
        <h3>Client endpoints</h3>
        <pre>Base URL: http://127.0.0.1:31338/v1
Models:   GET /v1/models
Status:   GET /v1/status
Chat:     POST /v1/chat/completions
Tools:    GET /v1/tools
Pipelines: GET /v1/pipelines
Events:   ws://127.0.0.1:31338/v1/events</pre>
      </section>
    </section>
  </div>
</main>

<!-- Customize Navigation Modal -->
<div class="modal-backdrop" id="nav-modal">
  <div class="modal-dialog">
    <div class="modal-header">
      <h3 style="margin: 0;">Customize Navigation Visibility</h3>
      <button class="modal-close" id="close-nav-modal">&times;</button>
    </div>
    <div class="modal-body">
      <p class="muted" style="margin: 0;">Choose which sections appear in the sidebar navigation. Preferences persist in local browser storage.</p>
      <div>
        <label style="font-weight: 600; color: var(--text);">Presets</label>
        <div class="preset-buttons">
          <button type="button" class="preset-btn" data-preset="all">All Features</button>
          <button type="button" class="preset-btn" data-preset="developer">Developer</button>
          <button type="button" class="preset-btn" data-preset="simple">Simple / Chat</button>
          <button type="button" class="preset-btn" data-preset="governance">Ops / Governance</button>
        </div>
      </div>
      <div>
        <label style="font-weight: 600; color: var(--text); margin-bottom: 8px;">Visible Sections</label>
        <div class="nav-checkboxes" id="nav-checkboxes-container"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="reset-nav-btn">Reset Defaults</button>
      <button type="button" class="primary" id="save-nav-btn">Apply Preferences</button>
    </div>
  </div>
</div>

<!-- Custom Pipeline Builder Modal -->
<div class="modal-backdrop" id="pipeline-modal">
  <div class="modal-dialog" style="max-width: 740px;">
    <div class="modal-header">
      <h3 style="margin: 0;" id="pipeline-modal-title">Create Custom Agent Pipeline</h3>
      <button class="modal-close" id="close-pipeline-modal">&times;</button>
    </div>
    <div class="modal-body">
      <label><span>Pipeline Name</span><input type="text" id="pipe-name-input" placeholder="e.g. Architect -> Implement -> Audit"></label>
      <label><span>Description</span><input type="text" id="pipe-desc-input" placeholder="Brief workflow summary"></label>
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <label style="font-weight: 600; color: var(--text); margin: 0;">Pipeline Steps</label>
          <button type="button" id="pipe-add-step-btn" style="font-size: 12px;">+ Add Step</button>
        </div>
        <div id="pipe-steps-container" style="display: grid; gap: 10px;"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancel-pipeline-btn">Cancel</button>
      <button type="button" class="primary" id="save-pipeline-btn">Save Pipeline</button>
    </div>
  </div>
</div>

<!-- Register Repository Modal -->
<div class="modal-backdrop" id="repo-modal">
  <div class="modal-dialog" style="max-width: 580px;">
    <div class="modal-header">
      <h3 style="margin: 0;">Register Repository & Pipeline Template</h3>
      <button class="modal-close" id="close-repo-modal">&times;</button>
    </div>
    <div class="modal-body">
      <label><span>Repository Identifier (e.g. org/repo)</span><input type="text" id="repo-id-input" placeholder="acme/service-mesh"></label>
      <label><span>Repository Friendly Name</span><input type="text" id="repo-name-input" placeholder="Acme Service Mesh"></label>
      <label><span>Local Absolute Path</span><input type="text" id="repo-path-input" placeholder="C:\\path\\to\\project"></label>
      <label><span>Description</span><input type="text" id="repo-desc-input" placeholder="Purpose and architecture role"></label>
      <label><span>Assigned Governance Pipeline</span>
        <select id="repo-pipeline-select">
          <option value="standard-governance">Standard Governance (Impl -> Review -> Security -> Compliance -> Sign-off)</option>
          <option value="pr-review">Automated PR Review</option>
          <option value="refactoring-review">Refactoring Review</option>
          <option value="release-readiness">Release Readiness Checklist</option>
          <option value="architecture-review">Architecture & Design Review</option>
          <option value="dependency-risk">Dependency Risk Assessment</option>
          <option value="supply-chain-security">Supply Chain & Security Posture</option>
          <option value="doc-generation">Documentation Generation</option>
        </select>
      </label>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancel-repo-btn">Cancel</button>
      <button type="button" class="primary" id="save-repo-btn">Register Repository</button>
    </div>
  </div>
</div>

<script>
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  // Sidebar collapse toggle
  const sidebar = $('sidebar');
  const mainLayout = $('main-layout');
  const collapseBtn = $('sidebar-collapse-btn');

  function initSidebarCollapse() {
    const isCollapsed = localStorage.getItem('conduit_sidebar_collapsed') === 'true';
    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      mainLayout.classList.add('sidebar-collapsed');
    }
    collapseBtn.addEventListener('click', () => {
      const collapsed = sidebar.classList.toggle('collapsed');
      mainLayout.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem('conduit_sidebar_collapsed', String(collapsed));
    });
  }
  initSidebarCollapse();

  // Navigation visibility customization
  const NAV_SECTIONS = [
    { key: 'overview', label: 'Overview' },
    { key: 'playground', label: 'Playground' },
    { key: 'api-providers', label: 'API providers' },
    { key: 'cli-providers', label: 'CLI providers' },
    { key: 'agent-controls', label: 'Agent controls' },
    { key: 'pipelines', label: 'Pipelines' },
    { key: 'governance', label: 'Governance' },
    { key: 'budgets', label: 'Budgets' },
    { key: 'workspaces', label: 'Workspaces' },
    { key: 'local-providers', label: 'Local providers' },
    { key: 'models', label: 'Models' },
    { key: 'usage', label: 'Usage' },
    { key: 'orchestrator', label: 'Orchestrator' },
    { key: 'integration', label: 'Integration tests' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'activity', label: 'Activity' },
    { key: 'settings', label: 'Settings' },
    { key: 'help', label: 'Help' },
  ];

  const PRESETS = {
    all: NAV_SECTIONS.map(s => s.key),
    developer: ['overview', 'playground', 'cli-providers', 'agent-controls', 'pipelines', 'workspaces', 'models', 'integration', 'activity', 'help'],
    simple: ['overview', 'playground', 'pipelines', 'models', 'help'],
    governance: ['overview', 'api-providers', 'agent-controls', 'pipelines', 'governance', 'budgets', 'workspaces', 'usage', 'activity', 'settings'],
  };

  function getVisibleNavs() {
    try {
      const saved = localStorage.getItem('conduit_nav_visibility');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
      }
    } catch {}
    return new Set(PRESETS.all);
  }

  function applyNavVisibility() {
    const visible = getVisibleNavs();
    document.querySelectorAll('#side-nav button[data-section]').forEach(btn => {
      const key = btn.dataset.section;
      btn.style.display = visible.has(key) ? 'flex' : 'none';
    });
  }

  function openNavModal() {
    const visible = getVisibleNavs();
    const container = $('nav-checkboxes-container');
    container.innerHTML = NAV_SECTIONS.map(s =>
      '<label class="nav-checkbox-label">' +
        '<input type="checkbox" data-nav-key="' + esc(s.key) + '"' + (visible.has(s.key) ? ' checked' : '') + '> ' +
        esc(s.label) +
      '</label>'
    ).join('');
    $('nav-modal').classList.add('open');
  }

  $('open-nav-custom-btn').addEventListener('click', openNavModal);
  $('close-nav-modal').addEventListener('click', () => $('nav-modal').classList.remove('open'));
  $('reset-nav-btn').addEventListener('click', () => {
    localStorage.removeItem('conduit_nav_visibility');
    applyNavVisibility();
    $('nav-modal').classList.remove('open');
  });

  $('save-nav-btn').addEventListener('click', () => {
    const checked = [...document.querySelectorAll('#nav-checkboxes-container input[data-nav-key]:checked')].map(cb => cb.dataset.navKey);
    localStorage.setItem('conduit_nav_visibility', JSON.stringify(checked.length ? checked : ['overview']));
    applyNavVisibility();
    $('nav-modal').classList.remove('open');
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const keys = new Set(PRESETS[presetKey] || PRESETS.all);
      document.querySelectorAll('#nav-checkboxes-container input[data-nav-key]').forEach(cb => {
        cb.checked = keys.has(cb.dataset.navKey);
      });
    });
  });
  applyNavVisibility();

  // Navigation section toggles
  const sectionIds = {
    overview: 'overview-section',
    playground: 'playground-section',
    'api-providers': 'api-providers-section',
    'cli-providers': 'cli-providers-section',
    'agent-controls': 'agent-controls-section',
    pipelines: 'pipelines-section',
    governance: 'governance-section',
    budgets: 'budgets-section',
    workspaces: 'workspaces-section',
    'local-providers': 'local-providers-section',
    models: 'models-section',
    usage: 'usage-section',
    orchestrator: 'orchestrator-section',
    integration: 'integration-section',
    recommendations: 'recommendations-section',
    activity: 'activity-section',
    settings: 'settings-section',
    help: 'help-section-v2'
  };

  function showSection(name) {
    Object.entries(sectionIds).forEach(([key, id]) => {
      const el = $(id);
      if (el) el.classList.toggle('active', key === name);
    });
    document.querySelectorAll('[data-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.section === name);
    });
    sidebar.classList.remove('open');
  }

  document.querySelectorAll('[data-section]').forEach(button => {
    button.addEventListener('click', () => showSection(button.dataset.section));
  });

  $('menu-toggle').addEventListener('click', () => sidebar.classList.toggle('open'));

  // Auth & API fetch wrapper
  function authToken() {
    try { return sessionStorage.getItem('conduit-auth-token') || ''; } catch { return ''; }
  }
  function withAuth(headers) {
    const token = authToken();
    const out = Object.assign({}, headers || {});
    if (token) out.Authorization = 'Bearer ' + token;
    return out;
  }
  async function request(path, options) {
    options = options || {};
    options.headers = withAuth(options.headers);
    let response = await fetch(path, options);
    if (response.status === 401) {
      const entered = prompt('This bridge requires an auth token');
      if (!entered) throw new Error('Unauthorized: valid bearer token required');
      try { sessionStorage.setItem('conduit-auth-token', entered); } catch {}
      options.headers = withAuth(options.headers);
      response = await fetch(path, options);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || data?.message || 'Request failed');
    return data;
  }

  let models = [], capabilities = {}, knownTools = [], cachedPipelines = [];
  let cachedRepositories = [], cachedBudgets = {}, cachedWorkspaces = [], cachedAuditTrail = [];
  let cachedSystemTools = [], cachedAnalytics = {}, currentDirBrowsePath = '';
  let currentPipeCategory = 'all', currentToolFilter = 'all', currentActivityLevel = 'all';
  let activityFilterQuery = '', allActivityEvents = [];

  const family = id => id.startsWith('api-') ? 'api-*' : id.startsWith('cli-') ? 'cli-*' : id.startsWith('lmstudio/') ? 'lmstudio/*' : 'other';
  const familyHelp = {'api-*':'Direct APIs','cli-*':'Local coding CLIs','lmstudio/*':'Local models','other':'Other'};
  const familyOrder = ['api-*','cli-*','lmstudio/*','other'];
  const providerForModel = id => id.startsWith('api-claude/') ? 'claude-api' : id.startsWith('api-gemini/') ? 'gemini-api' : id.startsWith('api-codex/') ? 'codex-api' : id.startsWith('api-openrouter/') ? 'openrouter-api' : id.startsWith('api-perplexity/') ? 'perplexity-api' : id.startsWith('cli-grok/') ? 'cli-grok' : id.startsWith('cli-codex/') ? 'cli-codex' : id.startsWith('cli-claude/') ? 'cli-claude' : id.startsWith('cli-gemini/') ? 'cli-gemini' : 'lmstudio';

  function modelOptionGroups(selected) {
    const selectedIds = new Set(Array.isArray(selected) ? selected : [selected]);
    const groups = {};
    models.forEach(model => ((groups[providerForModel(model.id)] ||= []).push(model)));
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([provider, grouped]) =>
      '<optgroup label="' + esc(provider) + '">' + grouped.sort((a,b) => a.id.localeCompare(b.id)).map(model => {
        const shortName = model.id.slice(model.id.indexOf('/') + 1);
        const ctx = model.contextWindow ? (Math.round(model.contextWindow / 1000) + 'k ctx') : '';
        const outCap = model.maxOutputTokens ? (Math.round(model.maxOutputTokens / 1000) + 'k out') : '';
        const meta = [ctx, outCap].filter(Boolean).join(' | ');
        const labelText = meta ? (shortName + ' (' + meta + ')') : shortName;
        return '<option value="' + esc(model.id) + '"' + (selectedIds.has(model.id) ? ' selected' : '') + '>' + esc(labelText) + '</option>';
      }).join('') + '</optgroup>'
    ).join('');
  }

  let lastProviders = [];
  function stateClass(p) { return p.connected ? 'ok' : ''; }
  function stateText(p) {
    return p.connected
      ? (p.loginType === 'api-key' ? 'API credential available' : p.loginType === 'cli' ? 'CLI authenticated' : 'Local service available')
      : (p.loginType === 'api-key' ? 'No API credential - configure in Settings' : p.loginType === 'cli' ? (p.credentialSource === 'CLI not installed' ? 'CLI unavailable - install binary' : 'CLI unavailable - authenticate binary') : 'Local service unavailable');
  }

  function renderProviderGroup(items, type, target) {
    const group = items.filter(provider => provider.loginType === type);
    $(target).innerHTML = group.length ? '<div class="provider-block">' + group.map(provider =>
      '<div class="provider"><div class="status"><span class="dot ' + stateClass(provider) + '"></span>' + esc(provider.name) + '</div>' +
      '<small>' + esc(stateText(provider)) + (provider.credentialSource ? ' · ' + esc(provider.credentialSource) : '') + ' · ' + esc(provider.models.length) + ' models registered</small></div>'
    ).join('') + '</div>' : '<span class="muted">No providers registered in this category.</span>';
  }

  function renderProviders(items) {
    lastProviders = items;
    renderProviderGroup(items, 'api-key', 'api-provider-list');
    renderProviderGroup(items, 'cli', 'cli-provider-list');
    renderProviderGroup(items, 'local', 'local-provider-list');
  }

  function renderModels(items) {
    const selectedPlayModel = $('play-model').value;
    models = items;
    $('play-model').innerHTML = modelOptionGroups(selectedPlayModel || items[0]?.id || '');
    updateEffortOptions();

    const query = ($('model-search')?.value || '').trim().toLowerCase();
    const transport = $('model-transport-filter').value;
    const providerFilter = $('model-provider-filter');
    const selectedProvider = providerFilter.value;
    const providerCounts = {};
    items.forEach(model => { const p = providerForModel(model.id); providerCounts[p] = (providerCounts[p] || 0) + 1; });
    providerFilter.innerHTML = '<option value="">All providers</option>' + Object.entries(providerCounts).sort(([a],[b]) => a.localeCompare(b)).map(([p,c]) => '<option value="' + esc(p) + '">' + esc(p) + ' (' + c + ')</option>').join('');
    if (providerCounts[selectedProvider]) providerFilter.value = selectedProvider;
    const provider = providerFilter.value;

    const visible = items.filter(model => {
      const routeProvider = providerForModel(model.id);
      return (!query || model.id.toLowerCase().includes(query) || String(model.owned_by || '').toLowerCase().includes(query) || routeProvider.toLowerCase().includes(query)) &&
        (!transport || family(model.id) === transport) && (!provider || routeProvider === provider);
    });
    $('model-count').textContent = visible.length + ' of ' + items.length + ' models';
    const familyCounts = {}; visible.forEach(model => { const name = family(model.id); familyCounts[name] = (familyCounts[name] || 0) + 1; });
    $('model-summary').innerHTML = familyOrder.filter(name => familyCounts[name]).map(name => '<span><strong>' + esc(name) + '</strong> ' + familyCounts[name] + ' · ' + esc(familyHelp[name]) + '</span>').join('');

    const groups = {};
    visible.forEach(model => (((groups[family(model.id)] ||= {})[providerForModel(model.id)] ||= []).push(model)));
    const expand = Boolean(query || transport || provider);
    $('model-list').innerHTML = familyOrder.filter(name => groups[name]).map(name => {
      const providerGroups = Object.entries(groups[name]).sort(([a],[b]) => a.localeCompare(b));
      return '<div class="model-transport-group"><h3><span>' + esc(familyHelp[name]) + ' <code>' + esc(name) + '</code></span><small>' + familyCounts[name] + ' models across ' + providerGroups.length + ' providers</small></h3>' + providerGroups.map(([routeProvider, grouped]) => {
        const providerStatus = (lastProviders || []).find(item => item.name === routeProvider);
        const ready = Boolean(providerStatus?.connected);
        const providerState = ready ? 'Ready' : 'Unavailable';
        const ordered = grouped.sort((a,b) => a.id.localeCompare(b.id));
        return '<details class="model-provider-group"' + (expand || ordered.length <= 8 ? ' open' : '') + '><summary><span><strong>' + esc(routeProvider) + '</strong><small>Route through ' + esc(familyHelp[name].toLowerCase()) + '</small></span><span class="provider-state ' + (ready ? 'ready' : 'unavailable') + '">' + esc(providerState) + '</span><span>' + ordered.length + ' models</span></summary><div class="model-provider-models">' + ordered.map(model => {
          const target = model.id.slice(model.id.indexOf('/') + 1);
          const source = model.conduit?.source || model.source || model.owned_by || 'provider catalog';
          const availability = model.conduit?.availability || model.availability || 'dynamic';
          const ctxInfo = model.contextWindow ? (' · ' + Math.round(model.contextWindow/1000) + 'k ctx') : '';
          return '<div class="model-row"><div><strong>' + esc(target) + '</strong><code>' + esc(model.id) + '</code></div><span class="model-meta">' + esc(availability) + ' · ' + esc(source) + esc(ctxInfo) + '</span><button type="button" data-use-model="' + esc(model.id) + '">Use in Playground</button></div>';
        }).join('') + '</div></details>';
      }).join('') + '</div>';
    }).join('') || '<span class="muted">No matching models.</span>';
  }

  // Multi-Select Structured Tool Picker for Agent Policies
  function renderToolPicker(providerName, disallowedCsv, isCli) {
    const selectedTools = new Set((disallowedCsv || '').split(',').map(s => s.trim()).filter(Boolean));
    const categories = [
      'File Operations',
      'Shell / Terminal',
      'Web Access',
      'MCP Tools',
      'Workspace Editing',
      'Notebook Operations',
      'Custom Provider Tools',
    ];

    const chipsHtml = Array.from(selectedTools).sort().map(tool =>
      '<span class="tool-chip"><span>' + esc(tool) + '</span><button type="button" class="chip-del" data-remove-tool="' + esc(tool) + '" data-for-provider="' + esc(providerName) + '">&times;</button></span>'
    ).join('') || '<span class="muted" style="font-size:12px;">No tools restricted. Agent has full tool permissions.</span>';

    const accordionHtml = categories.map(cat => {
      const toolsInCat = knownTools.filter(t => t.category === cat);
      if (!toolsInCat.length) return '';
      const restrictedCount = toolsInCat.filter(t => selectedTools.has(t.name)).length;
      return '<div class="tool-cat-block" data-cat-block="' + esc(cat) + '">' +
        '<div class="tool-cat-title" onclick="this.parentElement.classList.toggle(\\'open\\')">' +
          '<span>' + esc(cat) + '</span>' +
          '<span class="cat-badge">' + restrictedCount + ' of ' + toolsInCat.length + ' restricted</span>' +
        '</div>' +
        '<div class="tool-pills-list">' +
          toolsInCat.map(t => {
            const isSelected = selectedTools.has(t.name);
            const tagClass = t.mutating ? 'mutating' : 'readonly';
            const tagLabel = t.mutating ? 'MUT' : 'RO';
            return '<button type="button" class="tool-pill' + (isSelected ? ' selected' : '') + '" ' +
              'data-tool-name="' + esc(t.name) + '" ' +
              'data-tool-provider="' + esc(providerName) + '" ' +
              'title="' + esc(t.description) + ' (' + (t.mutating ? 'Mutating file/system state' : 'Read-only') + ')">' +
              '<span class="pill-tag ' + tagClass + '">' + tagLabel + '</span>' +
              '<span>' + esc(t.name) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="tool-picker-container" data-picker-for="' + esc(providerName) + '">' +
      '<div class="tool-picker-top">' +
        '<span style="font-size: 12px; font-weight: 600; color: var(--text);">Disallowed Tools Policy</span>' +
        '<div class="tool-picker-actions">' +
          '<button type="button" data-tool-action="mutating" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + '>Restrict Mutating</button>' +
          '<button type="button" data-tool-action="all" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + '>Select All</button>' +
          '<button type="button" data-tool-action="clear" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + '>Clear All</button>' +
        '</div>' +
      '</div>' +
      '<input type="hidden" name="disallowedTools" value="' + esc(disallowedCsv || '') + '">' +
      '<div class="tool-chips-area" data-chips-for="' + esc(providerName) + '">' + chipsHtml + '</div>' +
      '<div class="tool-categories-accordion" data-accordion-for="' + esc(providerName) + '">' + accordionHtml + '</div>' +
    '</div>';
  }

  function updateToolPickerUi(providerName, newSet) {
    const picker = document.querySelector('[data-picker-for="' + providerName + '"]');
    if (!picker) return;
    const csv = Array.from(newSet).sort().join(',');
    picker.querySelector('input[name="disallowedTools"]').value = csv;

    const chipsArea = picker.querySelector('[data-chips-for="' + providerName + '"]');
    if (chipsArea) {
      chipsArea.innerHTML = Array.from(newSet).sort().map(tool =>
        '<span class="tool-chip"><span>' + esc(tool) + '</span><button type="button" class="chip-del" data-remove-tool="' + esc(tool) + '" data-for-provider="' + esc(providerName) + '">&times;</button></span>'
      ).join('') || '<span class="muted" style="font-size:12px;">No tools restricted. Agent has full tool permissions.</span>';
    }

    picker.querySelectorAll('.tool-pill').forEach(pill => {
      const name = pill.dataset.toolName;
      pill.classList.toggle('selected', newSet.has(name));
    });

    picker.querySelectorAll('.tool-cat-block').forEach(block => {
      const cat = block.dataset.catBlock;
      const toolsInCat = knownTools.filter(t => t.category === cat);
      const restricted = toolsInCat.filter(t => newSet.has(t.name)).length;
      const badge = block.querySelector('.cat-badge');
      if (badge) badge.textContent = restricted + ' of ' + toolsInCat.length + ' restricted';
    });
  }

  function renderAgentPolicies(data) {
    const list = $('agent-policy-list');
    if (!list) return;
    const policies = data?.policies || {};
    const entries = Object.entries(policies);
    if (!entries.length) { list.innerHTML = '<span class="muted">No provider policies available.</span>'; return; }

    list.innerHTML = entries.map(([name, p]) => {
      const isCli = Boolean(p.hasAgentCapability);
      const badgeClass = isCli ? (p.agentEnabled ? 'ok' : 'warn') : 'muted';
      const badgeText = isCli ? (p.agentEnabled ? 'Agent mode enabled' : 'Agent mode disabled') : 'Inference only';
      return '<div class="provider-block" data-policy-card="' + esc(name) + '">' +
        '<h3><span>' + esc(name) + '</span><span class="setting-badge ' + badgeClass + '">' + esc(badgeText) + '</span></h3>' +
        '<form class="policy-form" data-policy-provider="' + esc(name) + '">' +
          '<div class="policy-controls-row">' +
            '<label><span>Agent mode</span><select name="agentEnabled"' + (isCli ? '' : ' disabled') + '>' +
              '<option value="true"' + (p.agentEnabled ? ' selected' : '') + '>Allowed (writes workspace)</option>' +
              '<option value="false"' + (!p.agentEnabled ? ' selected' : '') + '>Disabled (read-only)</option>' +
            '</select></label>' +
            '<label><span>Default run mode</span><select name="defaultMode">' +
              (p.supportedModes || ['chat']).map(m => '<option value="' + esc(m) + '"' + (p.defaultMode === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
            '</select></label>' +
            '<div class="play-actions"><button type="submit" class="primary"' + (isCli ? '' : ' disabled') + '>Save policy</button><span class="muted" data-feedback-for="' + esc(name) + '"></span></div>' +
          '</div>' +
          (isCli ? renderToolPicker(name, p.disallowedTools, isCli) : '') +
        '</form>' +
      '</div>';
    }).join('');

    list.querySelectorAll('form[data-policy-provider]').forEach(form => form.addEventListener('submit', saveAgentPolicy));

    // Handle tool clicks and quick action buttons
    list.addEventListener('click', event => {
      const delBtn = event.target.closest('[data-remove-tool]');
      if (delBtn) {
        const provider = delBtn.dataset.forProvider;
        const tool = delBtn.dataset.removeTool;
        const form = list.querySelector('form[data-policy-provider="' + provider + '"]');
        const input = form?.querySelector('input[name="disallowedTools"]');
        if (input) {
          const set = new Set(input.value.split(',').map(s => s.trim()).filter(Boolean));
          set.delete(tool);
          updateToolPickerUi(provider, set);
        }
        return;
      }

      const pill = event.target.closest('.tool-pill');
      if (pill) {
        const provider = pill.dataset.toolProvider;
        const tool = pill.dataset.toolName;
        const form = list.querySelector('form[data-policy-provider="' + provider + '"]');
        const input = form?.querySelector('input[name="disallowedTools"]');
        if (input) {
          const set = new Set(input.value.split(',').map(s => s.trim()).filter(Boolean));
          if (set.has(tool)) set.delete(tool); else set.add(tool);
          updateToolPickerUi(provider, set);
        }
        return;
      }

      const actBtn = event.target.closest('[data-tool-action]');
      if (actBtn) {
        const action = actBtn.dataset.toolAction;
        const provider = actBtn.dataset.target;
        const form = list.querySelector('form[data-policy-provider="' + provider + '"]');
        const input = form?.querySelector('input[name="disallowedTools"]');
        if (!input) return;
        let set = new Set();
        if (action === 'all') {
          set = new Set(knownTools.map(t => t.name));
        } else if (action === 'mutating') {
          set = new Set(knownTools.filter(t => t.mutating).map(t => t.name));
        } else if (action === 'clear') {
          set = new Set();
        }
        updateToolPickerUi(provider, set);
      }
    });
  }

  async function saveAgentPolicy(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const provider = form.dataset.policyProvider;
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector('[data-feedback-for="' + provider + '"]');
    button.disabled = true;
    if (feedback) feedback.textContent = 'Saving...';
    try {
      const agentEnabled = form.querySelector('[name="agentEnabled"]').value === 'true';
      const defaultMode = form.querySelector('[name="defaultMode"]').value;
      const disallowedTools = (form.querySelector('[name="disallowedTools"]')?.value || '').trim();
      await request('/v1/settings/agent-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, agentEnabled, defaultMode, disallowedTools }),
      });
      if (feedback) feedback.textContent = 'Saved';
      $('notice').textContent = 'Agent policy saved for ' + provider;
      await refresh();
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
      $('notice').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  // Pipelines Subsystem UI
  function renderPipelines(pipelines) {
    cachedPipelines = pipelines || [];
    const select = $('pipe-run-select');
    if (select) {
      const prev = select.value;
      select.innerHTML = cachedPipelines.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
      if (prev && cachedPipelines.some(p => p.id === prev)) select.value = prev;
    }

    const container = $('pipelines-list');
    if (!container) return;

    let filtered = cachedPipelines;
    if (currentPipeCategory === 'governance') {
      filtered = cachedPipelines.filter(p => p.id.includes('governance') || p.id.includes('compliance') || p.id.includes('doc'));
    } else if (currentPipeCategory === 'review') {
      filtered = cachedPipelines.filter(p => p.id.includes('review') || p.id.includes('architecture'));
    } else if (currentPipeCategory === 'engineering') {
      filtered = cachedPipelines.filter(p => p.id.includes('feature') || p.id.includes('build') || p.id.includes('refactor') || p.id.includes('fix'));
    } else if (currentPipeCategory === 'security') {
      filtered = cachedPipelines.filter(p => p.id.includes('security') || p.id.includes('risk') || p.id.includes('supply'));
    } else if (currentPipeCategory === 'custom') {
      filtered = cachedPipelines.filter(p => !p.isBuiltIn);
    }

    if (!filtered.length) {
      container.innerHTML = '<span class="muted">No pipelines found in this category.</span>';
      return;
    }

    container.innerHTML = filtered.map(pipe => {
      const stepsHtml = (pipe.steps || []).map((step, idx) => {
        const isCheckpoint = Boolean(step.requiresApproval);
        return '<div class="pipeline-step-pill">' +
          '<span class="step-badge">' + (idx + 1) + '</span>' +
          '<strong>' + esc(step.name) + '</strong>' +
          '<span class="step-meta">[' + esc(step.model) + ' · ' + esc(step.mode || 'chat') + ']</span>' +
          (isCheckpoint ? '<span class="checkpoint-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Approval Gate</span>' : '') +
        '</div>' + (idx < pipe.steps.length - 1 ? '<span class="pipeline-arrow">&rarr;</span>' : '');
      }).join('');

      return '<div class="pipeline-card" data-pipe-id="' + esc(pipe.id) + '">' +
        '<div class="pipeline-header">' +
          '<div>' +
            '<h3 style="margin: 0 0 4px; color: var(--text);">' + esc(pipe.name) + (pipe.isBuiltIn ? ' <span class="setting-badge info">Built-in Preset</span>' : '') + '</h3>' +
            '<span class="muted" style="font-size: 13px;">' + esc(pipe.description) + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="primary" data-run-pipe="' + esc(pipe.id) + '">Select to Run</button>' +
            (!pipe.isBuiltIn ? '<button type="button" class="danger" data-del-pipe="' + esc(pipe.id) + '">Delete</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="pipeline-steps-flow">' + stepsHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function renderPipelineRuns(runs) {
    const container = $('pipelines-history');
    if (!container) return;
    if (!runs || !runs.length) {
      container.innerHTML = '<span class="muted">No runs recorded yet.</span>';
      return;
    }

    container.innerHTML = runs.map(run => {
      const statusClass = run.status === 'completed' ? 'success' : (run.status === 'waiting_approval' ? 'warning' : (run.status === 'running' ? 'info' : 'error'));
      return '<div class="activity-event ' + statusClass + '">' +
        '<time>' + new Date(run.startedAt).toLocaleTimeString() + '</time>' +
        '<span class="scope">' + esc(run.pipelineId) + '</span>' +
        '<span>' +
          '<strong class="level">' + esc(run.status.toUpperCase()) + '</strong> · ' +
          esc(run.pipelineName) + ': "' + esc(run.initialPrompt.slice(0, 80)) + (run.initialPrompt.length > 80 ? '...' : '') + '"' +
        '</span>' +
      '</div>';
    }).join('');
  }

  let activePipelineRun = null;
  function renderLiveRun(run) {
    activePipelineRun = run;
    const box = $('pipe-live-status');
    if (!box) return;
    if (!run) { box.innerHTML = ''; return; }

    const statusBadge = run.status === 'completed'
      ? '<span class="setting-badge ok">COMPLETED</span>'
      : (run.status === 'waiting_approval'
        ? '<span class="setting-badge warn">AWAITING OPERATOR APPROVAL</span>'
        : (run.status === 'running'
          ? '<span class="setting-badge info">RUNNING</span>'
          : '<span class="setting-badge bad">' + esc(run.status.toUpperCase()) + '</span>'));

    let checkpointAlert = '';
    if (run.status === 'waiting_approval' && run.pendingApprovalStepId) {
      const stepName = run.stepResults[run.pendingApprovalStepId]?.stepName || run.pendingApprovalStepId;
      checkpointAlert = '<div class="checkpoint-banner">' +
        '<div><strong>Checkpoint Reached:</strong> Step <code>' + esc(stepName) + '</code> requires human authorization before execution.</div>' +
        '<input type="text" id="checkpoint-feedback" placeholder="Optional approval feedback or steering guidance">' +
        '<div style="display: flex; gap: 8px;">' +
          '<button type="button" class="success" id="btn-approve-step">Approve & Resume</button>' +
          '<button type="button" class="danger" id="btn-reject-step">Reject Pipeline</button>' +
        '</div>' +
      '</div>';
    }

    const stepsDetail = Object.values(run.stepResults || {}).map(step => {
      const badge = step.status === 'completed'
        ? '<span class="setting-badge ok">DONE (' + (step.latencyMs || 0) + ' ms)</span>'
        : (step.status === 'waiting_approval'
          ? '<span class="setting-badge warn">PAUSED (Checkpoint)</span>'
          : (step.status === 'running'
            ? '<span class="setting-badge info">IN FLIGHT</span>'
            : '<span class="setting-badge bad">' + esc(step.status.toUpperCase()) + '</span>'));

      return '<div class="step-result-card ' + esc(step.status) + '">' +
        '<div class="step-result-header">' +
          '<strong>' + esc(step.stepName) + ' <small class="muted">(' + esc(step.model) + ')</small></strong>' +
          badge +
        '</div>' +
        (step.content ? '<div class="step-result-content">' + esc(step.content) + '</div>' : '') +
        (step.error ? '<div class="step-result-content" style="color: var(--bad);">' + esc(step.error) + '</div>' : '') +
      '</div>';
    }).join('');

    box.innerHTML = '<div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px;">' +
      '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">' +
        '<strong>Run Status: ' + esc(run.pipelineName) + '</strong>' +
        statusBadge +
      '</div>' +
      checkpointAlert +
      '<div style="display: grid; gap: 8px;">' + stepsDetail + '</div>' +
    '</div>';

    const approveBtn = $('btn-approve-step');
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true;
        const feedback = $('checkpoint-feedback')?.value || '';
        try {
          const res = await request('/v1/pipelines/runs/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: run.id, action: 'approve', feedback }),
          });
          renderLiveRun(res.run);
          await refresh();
        } catch (err) {
          alert('Approval error: ' + err.message);
        }
      });
    }

    const rejectBtn = $('btn-reject-step');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async () => {
        rejectBtn.disabled = true;
        const feedback = $('checkpoint-feedback')?.value || 'Rejected by operator';
        try {
          const res = await request('/v1/pipelines/runs/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: run.id, action: 'reject', feedback }),
          });
          renderLiveRun(res.run);
          await refresh();
        } catch (err) {
          alert('Rejection error: ' + err.message);
        }
      });
    }
  }

  $('pipe-run-btn').addEventListener('click', async () => {
    const pipelineId = $('pipe-run-select').value;
    const prompt = $('pipe-run-prompt').value.trim();
    const repository = $('pipe-run-repo')?.value || undefined;
    const workingDirectory = $('pipe-run-cwd')?.value || undefined;
    if (!pipelineId || !prompt) {
      alert('Please select a pipeline and enter an initial prompt');
      return;
    }
    const btn = $('pipe-run-btn');
    btn.disabled = true;
    btn.textContent = 'Executing...';
    try {
      const res = await request('/v1/pipelines/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineId, prompt, repository, workingDirectory }),
      });
      renderLiveRun(res.run);
      await refresh();
    } catch (err) {
      alert('Pipeline execution failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Execute Pipeline';
    }
  });

  $('pipelines-list').addEventListener('click', async event => {
    const runBtn = event.target.closest('[data-run-pipe]');
    if (runBtn) {
      $('pipe-run-select').value = runBtn.dataset.runPipe;
      $('pipe-run-prompt').focus();
      return;
    }

    const delBtn = event.target.closest('[data-del-pipe]');
    if (delBtn) {
      const pipeId = delBtn.dataset.delPipe;
      if (!confirm('Are you sure you want to delete this custom pipeline?')) return;
      try {
        await request('/v1/pipelines/' + pipeId, { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
  });

  // Pipeline Builder Modal
  function addStepToBuilder(step) {
    const container = $('pipe-steps-container');
    const idx = container.children.length + 1;
    const s = step || {
      id: 'step-' + idx,
      name: 'Step ' + idx,
      model: models[0]?.id || 'cli-claude/claude-sonnet-5',
      mode: 'chat',
      requiresApproval: false,
      promptTemplate: '{{prompt}}',
    };

    const row = document.createElement('div');
    row.className = 'provider-block';
    row.style.margin = '0';
    row.style.padding = '12px';
    row.innerHTML = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
      '<strong>Step ' + idx + '</strong>' +
      '<button type="button" class="modal-close" style="color: var(--bad);">&times;</button>' +
    '</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1.2fr 100px; gap: 8px; margin-bottom: 8px;">' +
      '<label><span>Step Name</span><input type="text" class="step-name-inp" value="' + esc(s.name) + '"></label>' +
      '<label><span>Model</span><select class="step-model-inp">' + modelOptionGroups(s.model) + '</select></label>' +
      '<label><span>Mode</span><select class="step-mode-inp">' +
        '<option value="chat"' + (s.mode === 'chat' ? ' selected' : '') + '>Chat</option>' +
        '<option value="plan"' + (s.mode === 'plan' ? ' selected' : '') + '>Plan</option>' +
        '<option value="agent"' + (s.mode === 'agent' ? ' selected' : '') + '>Agent</option>' +
      '</select></label>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">' +
      '<label class="nav-checkbox-label" style="font-size: 12px;">' +
        '<input type="checkbox" class="step-approval-inp"' + (s.requiresApproval ? ' checked' : '') + '> Require Human Approval Checkpoint before this step' +
      '</label>' +
    '</div>' +
    '<label><span>Prompt Template (use {{prompt}}, {{previous_output}}, or {{prior_steps}})</span>' +
      '<textarea class="step-prompt-inp" style="min-height: 56px;">' + esc(s.promptTemplate || '{{prompt}}') + '</textarea>' +
    '</label>';

    row.querySelector('.modal-close').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  $('btn-open-create-pipeline').addEventListener('click', () => {
    $('pipe-name-input').value = '';
    $('pipe-desc-input').value = '';
    $('pipe-steps-container').innerHTML = '';
    addStepToBuilder();
    $('pipeline-modal').classList.add('open');
  });
  $('close-pipeline-modal').addEventListener('click', () => $('pipeline-modal').classList.remove('open'));
  $('cancel-pipeline-btn').addEventListener('click', () => $('pipeline-modal').classList.remove('open'));
  $('pipe-add-step-btn').addEventListener('click', () => addStepToBuilder());

  $('save-pipeline-btn').addEventListener('click', async () => {
    const name = $('pipe-name-input').value.trim();
    const description = $('pipe-desc-input').value.trim();
    if (!name) { alert('Pipeline name is required'); return; }

    const stepRows = document.querySelectorAll('#pipe-steps-container > .provider-block');
    if (!stepRows.length) { alert('At least one step is required'); return; }

    const steps = [...stepRows].map((row, idx) => ({
      id: 'step-' + (idx + 1),
      name: row.querySelector('.step-name-inp').value.trim() || ('Step ' + (idx + 1)),
      model: row.querySelector('.step-model-inp').value,
      mode: row.querySelector('.step-mode-inp').value,
      requiresApproval: row.querySelector('.step-approval-inp').checked,
      promptTemplate: row.querySelector('.step-prompt-inp').value.trim() || '{{prompt}}',
      dependsOn: idx > 0 ? ['step-' + idx] : undefined,
    }));

    try {
      await request('/v1/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, steps }),
      });
      $('pipeline-modal').classList.remove('open');
      await refresh();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  // Telemetry, Metrics, Usage, Settings
  function renderMetrics(data) {
    const rows = Object.entries(data.models || {}).sort((a,b) => (b[1].requests || 0) - (a[1].requests || 0));
    $('metrics').innerHTML = rows.length
      ? '<div class="model-list">' + rows.map(([model, m]) =>
          '<div><code>' + esc(model) + '</code> · ' + m.successes + '/' + m.requests + ' successful · ' + (m.averageLatencyMs ?? '-') + ' ms avg · ' + m.inFlight + ' active' + (m.lastError ? ' · <span class="muted">last error: ' + esc(m.lastError) + '</span>' : '') + '</div>'
        ).join('') + '</div>'
      : 'No requests yet.';
  }

  function renderActivity(data) {
    if (data?.events) allActivityEvents = data.events;
    const container = $('activity-log');
    if (!container) return;

    let filtered = allActivityEvents;
    if (currentActivityLevel && currentActivityLevel !== 'all') {
      filtered = filtered.filter(e => e.level === currentActivityLevel);
    }
    if (activityFilterQuery) {
      const q = activityFilterQuery.toLowerCase();
      filtered = filtered.filter(e =>
        (e.message && e.message.toLowerCase().includes(q)) ||
        (e.scope && e.scope.toLowerCase().includes(q)) ||
        (e.traceId && e.traceId.toLowerCase().includes(q))
      );
    }

    if (!filtered.length) {
      container.innerHTML = 'No matching operational events found.';
      return;
    }

    container.innerHTML = filtered.slice(0, 100).map(event =>
      '<div class="activity-event ' + esc(event.level) + '">' +
        '<time>' + new Date(event.time).toLocaleTimeString() + '</time>' +
        '<span class="scope">' + esc(event.scope) + '</span>' +
        '<span>' +
          '<strong class="level">' + esc(event.level) + '</strong> · ' +
          esc(event.message) +
          (event.traceId ? ' <code class="trace-pill" title="Correlation ID">trace:' + esc(event.traceId.slice(0, 8)) + '</code>' : '') +
        '</span>' +
      '</div>'
    ).join('');
  }

  function renderSystemTools(tools) {
    cachedSystemTools = tools || [];
    const container = $('system-tools-list');
    if (!container) return;
    const sys = cachedSystemTools;
    if (!sys.length) {
      container.innerHTML = '<span class="muted">No system CLI tools discovered yet. Click Rediscover Tools above to scan PATH.</span>';
      return;
    }
    container.innerHTML = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">' +
      sys.map(t => {
        const isAvail = Boolean(t.available !== false && (t.available || t.detected));
        const displayName = t.name || t.displayName || t.executable;
        const binPath = t.path || t.binaryPath || 'PATH';
        const risk = t.riskLevel || 'Low';
        const riskClass = risk === 'Critical' || risk === 'High' ? 'bad' : (risk === 'Medium' ? 'warn' : 'ok');
        return '<div class="provider-block" style="padding: 10px; margin: 0;">' +
          '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">' +
            '<strong>' + esc(displayName) + '</strong>' +
            '<span class="setting-badge ' + (isAvail ? 'ok' : 'bad') + '">' + (isAvail ? 'Available' : 'Missing') + '</span>' +
          '</div>' +
          '<div class="muted" style="font-size: 12px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + esc(binPath) + '">' + esc(binPath) + '</div>' +
          '<div style="display: flex; gap: 6px; margin-top: 6px; font-size: 11px;">' +
            '<span class="setting-badge info">' + esc(t.category || t.classification || 'System') + '</span>' +
            '<span class="setting-badge ' + riskClass + '">Risk: ' + esc(risk) + '</span>' +
            (t.version ? '<span class="setting-badge muted">' + esc(t.version) + '</span>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderToolCatalog(filterClass) {
    if (filterClass) currentToolFilter = filterClass;
    const container = $('tool-catalog-container');
    if (!container) return;
    let list = knownTools || [];
    if (currentToolFilter && currentToolFilter !== 'all') {
      list = list.filter(t => t.classification === currentToolFilter);
    }
    if (!list.length) {
      container.innerHTML = '<span class="muted">No tools match this classification filter.</span>';
      return;
    }

    container.innerHTML = list.map(t => {
      const riskClass = t.riskLevel === 'Critical' || t.riskLevel === 'High' ? 'bad' : (t.riskLevel === 'Medium' ? 'warn' : 'ok');
      return '<div class="tool-card">' +
        '<div class="tool-card-title">' +
          '<div>' +
            '<strong>' + esc(t.displayName || t.name) + '</strong> ' +
            '<code>' + esc(t.name) + '</code>' +
          '</div>' +
          '<span class="setting-badge ' + riskClass + '">Risk: ' + esc(t.riskLevel || 'Low') + '</span>' +
        '</div>' +
        '<div class="tool-card-badges">' +
          '<span class="setting-badge info">' + esc(t.classification || 'Operation') + '</span>' +
          '<span class="setting-badge muted">' + esc(t.category || 'general') + '</span>' +
          (t.mutating ? '<span class="setting-badge warn">Workspace Mutating</span>' : '<span class="setting-badge ok">Read-Only</span>') +
        '</div>' +
        '<p class="tool-card-desc">' + esc(t.description || 'No description available.') + '</p>' +
      '</div>';
    }).join('');
  }

  function renderGovernance(repos, audits) {
    cachedRepositories = repos || [];
    cachedAuditTrail = audits || [];

    const repoSelect = $('pipe-run-repo');
    if (repoSelect) {
      const prev = repoSelect.value;
      repoSelect.innerHTML = '<option value="">Default / Global</option>' +
        cachedRepositories.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + ' (' + esc(r.id) + ')</option>').join('');
      if (prev && cachedRepositories.some(r => r.id === prev)) repoSelect.value = prev;
    }

    const repoTableContainer = $('repos-table-container');
    if (repoTableContainer) {
      if (!cachedRepositories.length) {
        repoTableContainer.innerHTML = '<span class="muted">No repositories registered yet. Click Register Repository above.</span>';
      } else {
        repoTableContainer.innerHTML = '<table class="data-table">' +
          '<thead><tr>' +
            '<th>Repository</th>' +
            '<th>Local Path</th>' +
            '<th>Assigned Pipeline</th>' +
            '<th>Policy Overrides</th>' +
            '<th>Actions</th>' +
          '</tr></thead>' +
          '<tbody>' +
          cachedRepositories.map(r =>
            '<tr>' +
              '<td><strong>' + esc(r.name || r.id) + '</strong><br><small class="muted"><code>' + esc(r.id) + '</code></small></td>' +
              '<td style="font-family: monospace; font-size: 12px;">' + esc(r.path) + '</td>' +
              '<td><span class="setting-badge info">' + esc(r.assignedGovernancePipeline || r.assignedPipeline || 'standard-governance') + '</span></td>' +
              '<td><small class="muted">' + (r.policyOverrides ? 'Custom (' + Object.keys(r.policyOverrides).length + ' rules)' : 'Standard') + '</small></td>' +
              '<td>' +
                '<div style="display: flex; gap: 6px;">' +
                  '<button type="button" data-run-repo-pipe="' + esc(r.assignedGovernancePipeline || r.assignedPipeline || 'standard-governance') + '" data-repo-id="' + esc(r.id) + '" data-repo-path="' + esc(r.path) + '">Run</button>' +
                  '<button type="button" class="danger" data-del-repo="' + esc(r.id) + '">Delete</button>' +
                '</div>' +
              '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>';
      }
    }

    const auditContainer = $('audit-trail-container');
    if (auditContainer) {
      if (!cachedAuditTrail.length) {
        auditContainer.innerHTML = '<span class="muted">No approval audit records yet. Run a pipeline with approval gates to record decisions.</span>';
      } else {
        auditContainer.innerHTML = '<table class="data-table">' +
          '<thead><tr>' +
            '<th>Timestamp</th>' +
            '<th>Decision</th>' +
            '<th>Pipeline / Run</th>' +
            '<th>Step</th>' +
            '<th>Operator</th>' +
            '<th>Feedback / Rationale</th>' +
          '</tr></thead>' +
          '<tbody>' +
          cachedAuditTrail.slice(0, 30).map(a => {
            const isApproved = a.action === 'approved' || a.decision === 'approved';
            const actionText = (a.action || a.decision || 'unknown').toUpperCase();
            return '<tr>' +
              '<td><time class="muted">' + new Date(a.timestamp).toLocaleString() + '</time></td>' +
              '<td><span class="setting-badge ' + (isApproved ? 'ok' : 'bad') + '">' + esc(actionText) + '</span></td>' +
              '<td><strong>' + esc(a.pipelineId) + '</strong><br><small class="muted"><code>' + esc((a.runId || '').slice(0, 8)) + '</code></small></td>' +
              '<td><code>' + esc(a.stepId) + '</code></td>' +
              '<td><span class="muted">' + esc(a.operator || 'system') + '</span></td>' +
              '<td>' + esc(a.feedback || 'None provided') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }
    }
  }

  function renderBudgets(budgets) {
    cachedBudgets = budgets || {};
    const cfg = cachedBudgets.config || cachedBudgets;
    const spend = cachedBudgets.spend || {};
    const dailySpent = spend.dailySpendUsd || cachedBudgets.dailySpendUsd || 0;
    const dailyLimit = cfg.dailyBudgetUsd || cachedBudgets.dailyLimitUsd || 10;
    const dailyPct = Math.min(100, Math.round((dailySpent / (dailyLimit || 1)) * 100));
    const dailyWarn = cfg.warningThresholdPercent || cachedBudgets.warningThresholdPercent || 80;
    const dailyClass = dailyPct >= 100 ? 'bad' : (dailyPct >= dailyWarn ? 'warn' : 'ok');
    const dailyFillClass = dailyPct >= 100 ? 'danger' : (dailyPct >= dailyWarn ? 'warning' : 'safe');

    if ($('daily-budget-text')) {
      $('daily-budget-text').textContent = '$' + dailySpent.toFixed(2) + ' / $' + dailyLimit.toFixed(2) + ' (' + dailyPct + '%)';
      $('daily-budget-text').className = 'setting-badge ' + dailyClass;
    }
    if ($('daily-budget-fill')) {
      $('daily-budget-fill').className = 'budget-fill ' + dailyFillClass;
      $('daily-budget-fill').style.width = dailyPct + '%';
    }

    const monthlySpent = spend.monthlySpendUsd || cachedBudgets.monthlySpendUsd || 0;
    const monthlyLimit = cfg.monthlyBudgetUsd || cachedBudgets.monthlyLimitUsd || 100;
    const monthlyPct = Math.min(100, Math.round((monthlySpent / (monthlyLimit || 1)) * 100));
    const monthlyClass = monthlyPct >= 100 ? 'bad' : (monthlyPct >= dailyWarn ? 'warn' : 'ok');
    const monthlyFillClass = monthlyPct >= 100 ? 'danger' : (monthlyPct >= dailyWarn ? 'warning' : 'safe');

    if ($('monthly-budget-text')) {
      $('monthly-budget-text').textContent = '$' + monthlySpent.toFixed(2) + ' / $' + monthlyLimit.toFixed(2) + ' (' + monthlyPct + '%)';
      $('monthly-budget-text').className = 'setting-badge ' + monthlyClass;
    }
    if ($('monthly-budget-fill')) {
      $('monthly-budget-fill').className = 'budget-fill ' + monthlyFillClass;
      $('monthly-budget-fill').style.width = monthlyPct + '%';
    }

    if (document.activeElement?.form?.id !== 'budget-config-form') {
      if ($('cfg-daily-budget')) $('cfg-daily-budget').value = cfg.dailyBudgetUsd ?? 10;
      if ($('cfg-monthly-budget')) $('cfg-monthly-budget').value = cfg.monthlyBudgetUsd ?? 100;
      if ($('cfg-max-cost-run')) $('cfg-max-cost-run').value = cfg.maxCostPerRunUsd ?? 0.50;
      if ($('cfg-max-tokens-run')) $('cfg-max-tokens-run').value = cfg.maxTokensPerRun ?? 100000;
      if ($('cfg-warn-threshold')) $('cfg-warn-threshold').value = cfg.warningThresholdPercent ?? 80;
      if ($('cfg-hard-stop')) $('cfg-hard-stop').value = String(cfg.hardStopEnabled !== false);
    }
  }

  function renderWorkspaces(workspaces) {
    cachedWorkspaces = workspaces || [];

    const playWsSelect = $('play-ws-select');
    if (playWsSelect) {
      const prev = playWsSelect.value;
      playWsSelect.innerHTML = '<option value="">-- Choose Workspace --</option>' +
        cachedWorkspaces.map(w => '<option value="' + esc(w.path) + '">' + esc(w.name || w.path) + '</option>').join('');
      if (prev && cachedWorkspaces.some(w => w.path === prev)) playWsSelect.value = prev;
    }

    const pipeCwdSelect = $('pipe-run-cwd');
    if (pipeCwdSelect) {
      const prev = pipeCwdSelect.value;
      pipeCwdSelect.innerHTML = '<option value="">Default Workspace</option>' +
        cachedWorkspaces.map(w => '<option value="' + esc(w.path) + '">' + esc(w.name || w.path) + '</option>').join('');
      if (prev && cachedWorkspaces.some(w => w.path === prev)) pipeCwdSelect.value = prev;
    }

    const tableContainer = $('workspaces-table-container');
    if (tableContainer) {
      if (!cachedWorkspaces.length) {
        tableContainer.innerHTML = '<span class="muted">No workspaces registered. Enter a workspace path above to register.</span>';
      } else {
        tableContainer.innerHTML = '<table class="data-table">' +
          '<thead><tr>' +
            '<th>Workspace / Label</th>' +
            '<th>Absolute Path</th>' +
            '<th>Status</th>' +
            '<th>Permissions</th>' +
            '<th>Actions</th>' +
          '</tr></thead>' +
          '<tbody>' +
          cachedWorkspaces.map(w =>
            '<tr>' +
              '<td><strong>' + esc(w.name || 'Workspace') + '</strong></td>' +
              '<td style="font-family: monospace; font-size: 12px;">' + esc(w.path) + '</td>' +
              '<td><span class="setting-badge ' + (w.exists ? 'ok' : 'bad') + '">' + (w.exists ? 'Found on Disk' : 'Not Found') + '</span></td>' +
              '<td><span class="setting-badge ' + (w.isWritable || w.writable ? 'ok' : 'warn') + '">' + (w.isWritable || w.writable ? 'Read-Write' : 'Read-Only') + '</span></td>' +
              '<td>' +
                '<div style="display: flex; gap: 6px;">' +
                  '<button type="button" data-browse-ws="' + esc(w.path) + '">Browse</button>' +
                  '<button type="button" data-use-ws="' + esc(w.path) + '">Playground</button>' +
                  '<button type="button" class="danger" data-del-ws="' + esc(w.id || w.path) + '">Delete</button>' +
                '</div>' +
              '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>';
      }
    }
  }

  async function browseDirectory(targetPath) {
    try {
      const data = await request('/v1/workspaces/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath || '' })
      });
      currentDirBrowsePath = data.current || data.currentPath || '';
      if ($('browser-current-path')) $('browser-current-path').textContent = currentDirBrowsePath || '-';
      const listEl = $('browser-dirs-list');
      if (listEl) {
        const dirs = data.directories || [];
        if (!dirs.length) {
          listEl.innerHTML = '<div class="muted" style="padding: 8px;">No child directories found.</div>';
        } else {
          listEl.innerHTML = dirs.map(d =>
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: var(--panel);">' +
              '<div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" data-nav-dir="' + esc(d.path) + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                '<strong>' + esc(d.name) + '</strong>' +
              '</div>' +
              '<button type="button" style="padding: 2px 8px; font-size: 11px;" data-add-dir-ws="' + esc(d.path) + '" data-name="' + esc(d.name) + '">+ Add Workspace</button>' +
            '</div>'
          ).join('');
        }
      }
      if ($('browser-up-btn')) {
        const hasParent = Boolean(data.parent);
        $('browser-up-btn').disabled = !hasParent;
        $('browser-up-btn').dataset.parentPath = data.parent || '';
      }
    } catch (err) {
      if ($('browser-dirs-list')) $('browser-dirs-list').innerHTML = '<div class="activity-event error">' + esc(err.message) + '</div>';
    }
  }

  function renderAnalyticsCharts(data) {
    cachedAnalytics = data || {};
    const modelsData = cachedAnalytics.modelBreakdown || [];
    const pipelineData = cachedAnalytics.pipelines || {};
    const activityData = cachedAnalytics.activity || {};
    const tokenData = cachedAnalytics.tokenAndCost || {};

    const reqContainer = $('chart-requests-container');
    if (reqContainer) {
      if (!modelsData.length) {
        reqContainer.innerHTML = '<div class="muted" style="padding: 30px; text-align: center;">No model request data yet.</div>';
      } else {
        const topModels = modelsData.slice(0, 5);
        const maxReq = Math.max(...topModels.map(m => m.requests || 1), 1);
        const barHeight = 24;
        const totalHeight = topModels.length * (barHeight + 10) + 20;

        const barsSvg = topModels.map((m, i) => {
          const y = i * (barHeight + 10) + 10;
          const barWidth = Math.max(8, Math.round(((m.requests || 0) / maxReq) * 260));
          const shortModel = m.model.split('/').pop() || m.model;
          return '<g>' +
            '<text x="10" y="' + (y + 16) + '" fill="var(--text)" font-size="11" font-family="monospace">' + esc(shortModel.slice(0, 18)) + '</text>' +
            '<rect x="140" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="4" fill="var(--accent)" opacity="0.85"/>' +
            '<text x="' + (146 + barWidth) + '" y="' + (y + 16) + '" fill="var(--muted)" font-size="11">' + m.requests + ' req (' + (m.averageLatencyMs ?? 0) + 'ms)</text>' +
          '</g>';
        }).join('');

        reqContainer.innerHTML = '<svg viewBox="0 0 460 ' + totalHeight + '" width="100%" height="' + totalHeight + '" style="display: block;">' + barsSvg + '</svg>';
      }
    }

    const costContainer = $('chart-cost-container');
    if (costContainer) {
      const inTok = tokenData.totalInputTokens || 0;
      const outTok = tokenData.totalOutputTokens || 0;
      const totalTok = inTok + outTok;
      const estCost = tokenData.estimatedCostUsd || 0;

      if (totalTok === 0 && estCost === 0) {
        costContainer.innerHTML = '<div class="muted" style="padding: 30px; text-align: center;">No token consumption recorded yet.</div>';
      } else {
        const inPct = totalTok ? Math.round((inTok / totalTok) * 100) : 50;
        const outPct = 100 - inPct;

        costContainer.innerHTML = '<div style="padding: 10px 0;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">' +
            '<span>Input: <strong>' + inTok.toLocaleString() + '</strong> (' + inPct + '%)</span>' +
            '<span>Output: <strong>' + outTok.toLocaleString() + '</strong> (' + outPct + '%)</span>' +
          '</div>' +
          '<div style="height: 16px; border-radius: 8px; overflow: hidden; display: flex; background: var(--panel); border: 1px solid var(--line);">' +
            '<div style="width: ' + inPct + '%; background: var(--accent);" title="Input tokens"></div>' +
            '<div style="width: ' + outPct + '%; background: var(--ok);" title="Output tokens"></div>' +
          '</div>' +
          '<div style="margin-top: 16px; text-align: center;">' +
            '<span class="muted" style="font-size: 12px;">Estimated Total Cost</span>' +
            '<div style="font-size: 24px; font-weight: 700; color: var(--ok); margin-top: 2px;">$' + estCost.toFixed(6) + '</div>' +
            '<span class="muted" style="font-size: 11px;">Tracked across direct API completions</span>' +
          '</div>' +
        '</div>';
      }
    }

    const pipeContainer = $('chart-pipelines-container');
    if (pipeContainer) {
      const totalRuns = pipelineData.totalRuns || 0;
      if (totalRuns === 0) {
        pipeContainer.innerHTML = '<div class="muted" style="padding: 30px; text-align: center;">No pipeline runs recorded yet.</div>';
      } else {
        const completed = pipelineData.completed || 0;
        const waiting = pipelineData.waitingApproval || 0;
        const running = pipelineData.running || 0;
        const failed = pipelineData.failed || 0;

        pipeContainer.innerHTML = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 0;">' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--ok);">' +
            '<div style="font-size: 20px; font-weight: 700; color: var(--ok);">' + completed + '</div>' +
            '<div class="muted" style="font-size: 12px;">Completed</div>' +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--warn);">' +
            '<div style="font-size: 20px; font-weight: 700; color: var(--warn);">' + waiting + '</div>' +
            '<div class="muted" style="font-size: 12px;">Awaiting Gate</div>' +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--accent);">' +
            '<div style="font-size: 20px; font-weight: 700; color: var(--accent);">' + running + '</div>' +
            '<div class="muted" style="font-size: 12px;">In Flight</div>' +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--bad);">' +
            '<div style="font-size: 20px; font-weight: 700; color: var(--bad);">' + failed + '</div>' +
            '<div class="muted" style="font-size: 12px;">Failed / Rejected</div>' +
          '</div>' +
        '</div>';
      }
    }

    const actContainer = $('chart-activity-container');
    if (actContainer) {
      const info = activityData.info || 0;
      const success = activityData.success || 0;
      const warning = activityData.warning || 0;
      const error = activityData.error || 0;
      const totalEvents = info + success + warning + error;

      if (totalEvents === 0) {
        actContainer.innerHTML = '<div class="muted" style="padding: 30px; text-align: center;">No activity events recorded yet.</div>';
      } else {
        const maxVal = Math.max(info, success, warning, error, 1);
        const categories = [
          { label: 'Info', count: info, color: 'var(--accent)' },
          { label: 'Success', count: success, color: 'var(--ok)' },
          { label: 'Warning', count: warning, color: 'var(--warn)' },
          { label: 'Error', count: error, color: 'var(--bad)' }
        ];

        actContainer.innerHTML = '<div style="display: grid; gap: 8px; padding: 4px 0;">' +
          categories.map(c => {
            const pct = Math.max(6, Math.round((c.count / maxVal) * 100));
            return '<div>' +
              '<div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px;">' +
                '<span>' + c.label + '</span>' +
                '<strong>' + c.count + '</strong>' +
              '</div>' +
              '<div style="height: 8px; border-radius: 4px; background: var(--panel); overflow: hidden;">' +
                '<div style="width: ' + pct + '%; height: 100%; background: ' + c.color + ';"></div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }
    }
  }

  function renderOrchestrator(data) {
    $('orch-enabled').value = String(Boolean(data.enabled));
    $('orch-strategy').value = data.strategy || 'sequential';
    $('orch-roles').innerHTML = (data.roles || []).map((role, i) =>
      '<label><span>Role ' + (i + 1) + ': ' + esc(role.name) + '</span><select data-orch-role="' + i + '"><option value="">Select a model</option>' + modelOptionGroups(role.model) + '</select></label>'
    ).join('');
    $('orch-fallbacks').innerHTML = modelOptionGroups(data.fallbackModels || []);
  }

  async function saveOrchestrator() {
    const roles = [...document.querySelectorAll('[data-orch-role]')].map((select, i) => ({
      name: ['Analyst', 'Reviewer', 'Synthesizer'][i] || 'Role ' + (i + 1),
      model: select.value
    }));
    const fallbackModels = [...$('orch-fallbacks').selectedOptions].map(option => option.value);
    const data = await request('/v1/orchestrator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: $('orch-enabled').value === 'true', strategy: $('orch-strategy').value, roles, fallbackModels })
    });
    renderOrchestrator(data);
    $('orch-note').textContent = 'Configuration saved';
  }

  async function runOrchestrator() {
    $('orch-run').disabled = true;
    $('orch-note').textContent = 'Running...';
    try {
      await saveOrchestrator();
      const data = await request('/v1/orchestrator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Compare the current project state and identify the most important next engineering action.' })
      });
      $('orch-output').textContent = data.results.map(r => r.role + ' (' + r.model + ')\\n' + (r.preview || r.content || '')).join('\\n\\n');
      $('orch-note').textContent = 'Completed';
      showSection('activity');
    } catch (error) {
      $('orch-output').textContent = error.message;
      $('orch-note').textContent = 'Failed';
    } finally {
      $('orch-run').disabled = false;
    }
  }

  async function runCliTests() {
    $('test-all-cli').disabled = true;
    $('test-output').textContent = 'Running CLI provider matrix...';
    try {
      const data = await request('/v1/tests/cli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      $('test-output').innerHTML = data.results.map(r =>
        '<div class="activity-event ' + (r.ok ? 'success' : 'error') + '"><span class="scope">' + esc(r.provider) + '</span><span>' + (r.ok ? 'PASS' : 'FAIL') + '</span><span>' + esc(r.model || '') + ' · ' + esc(r.output || r.error || '') + ' · ' + r.latencyMs + ' ms</span></div>'
      ).join('');
      showSection('activity');
    } catch (error) {
      $('test-output').textContent = error.message;
    } finally {
      $('test-all-cli').disabled = false;
    }
  }

  async function runOpenAiTest() {
    $('test-openai').disabled = true;
    $('test-output').textContent = 'Testing OpenAI-compatible route...';
    try {
      const model = models.find(m => m.id.startsWith('cli-'))?.id || models[0]?.id;
      const data = await request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: pong' }], max_tokens: 16 })
      });
      $('test-output').innerHTML = '<div class="activity-event success"><span class="scope">OpenClaw route</span><span>PASS</span><span>' + esc(model) + ' · ' + esc(data.choices?.[0]?.message?.content || '') + '</span></div>';
    } catch (error) {
      $('test-output').textContent = error.message;
    } finally {
      $('test-openai').disabled = false;
    }
  }

  function renderUsage(data) {
    const rows = Object.entries(data.models || {}).sort((a,b) => b[1].requests - a[1].requests);
    const total = rows.reduce((n,[,m]) => n + m.requests, 0);
    const success = rows.reduce((n,[,m]) => n + m.successes, 0);
    const failure = rows.reduce((n,[,m]) => n + m.failures, 0);
    const latency = rows.reduce((n,[,m]) => n + m.totalLatencyMs, 0);
    const inputTokens = rows.reduce((n,[,m]) => n + (m.inputTokens || 0), 0);
    const outputTokens = rows.reduce((n,[,m]) => n + (m.outputTokens || 0), 0);
    const cost = rows.reduce((n,[,m]) => n + (m.estimatedCostUsd || 0), 0);
    $('usage-total').textContent = total;
    $('usage-success').textContent = success;
    $('usage-failure').textContent = failure;
    $('usage-latency').textContent = total ? Math.round(latency / total) + ' ms' : '-';
    $('usage-table').innerHTML = rows.length
      ? '<p class="muted">Estimated tokens: ' + inputTokens + ' in / ' + outputTokens + ' out · estimated cost: $' + cost.toFixed(6) + '</p>' +
        rows.map(([model,m]) => '<div><code>' + esc(model) + '</code> · ' + m.requests + ' requests · ' + m.successes + ' successful · ' + m.failures + ' failed · ' + (m.inputTokens || 0) + ' input tokens · ' + (m.outputTokens || 0) + ' output tokens · $' + (m.estimatedCostUsd || 0).toFixed(6) + ' estimated · ' + (m.averageLatencyMs ?? '-') + ' ms average</div>').join('')
      : 'No usage yet.';
  }

  function updateEffortOptions() {
    const model = $('play-model').value;
    const provider = providerForModel(model);
    const info = capabilities[provider] || { values: ['none','minimal','low','medium','high','xhigh','max'] };
    $('play-effort').innerHTML = info.values.map(value =>
      '<option value="' + value + '">' + value + (info.aliases && info.aliases[value] ? ' (maps to ' + info.aliases[value] + ')' : '') + '</option>'
    ).join('');
  }

  function renderSettings(data) {
    $('settings-keys').innerHTML = '<div class="setting-list">' + Object.entries(data.apiKeys || {}).map(([provider, info]) =>
      '<div class="setting-row"><strong>' + esc(provider) + '</strong><span class="setting-badge ' + (info.configured ? 'ok' : 'muted') + '">' + esc(info.source || (info.configured ? 'Configured' : 'Not detected')) + '</span><form data-key-provider="' + esc(provider) + '"><input type="password" autocomplete="new-password" placeholder="' + (info.configured ? 'Replace stored API key' : 'Paste API key') + '"><button type="submit">Save API key</button></form></div>'
    ).join('') + '</div><p class="muted">Keys are write-only and independent from CLI authentication.</p>';
    document.querySelectorAll('[data-key-provider]').forEach(form => form.addEventListener('submit', saveKey));
  }

  async function saveKey(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector('input');
    if (!input.value) return;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await request('/v1/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: form.dataset.keyProvider, key: input.value })
      });
      input.value = '';
      $('notice').textContent = 'Credential saved for ' + form.dataset.keyProvider;
      await refresh();
    } catch (error) {
      $('notice').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  // Master Refresh
  async function refresh() {
    $('notice').textContent = 'Refreshing...';
    try {
      const [
        status, modelData, capabilityData, metricData, settings, activity,
        orchestrator, agentPolicyData, toolsData, pipelinesData, runsData,
        reposData, budgetData, wsData, auditData, analyticsData
      ] = await Promise.all([
        request('/v1/status'),
        request('/v1/models'),
        request('/v1/capabilities'),
        request('/v1/metrics'),
        request('/v1/settings'),
        request('/v1/activity'),
        request('/v1/orchestrator'),
        request('/v1/settings/agent-policy'),
        request('/v1/tools').catch(() => ({ data: [], system_tools: [] })),
        request('/v1/pipelines').catch(() => ({ data: [] })),
        request('/v1/pipelines/runs').catch(() => ({ data: [] })),
        request('/v1/repositories').catch(() => ({ data: [] })),
        request('/v1/budgets').catch(() => ({})),
        request('/v1/workspaces').catch(() => ({ data: [] })),
        request('/v1/governance/audit').catch(() => ({ data: [] })),
        request('/v1/analytics/overview').catch(() => ({})),
      ]);

      capabilities = capabilityData.effort || {};
      knownTools = toolsData.data || [];
      const systemTools = toolsData.system_tools || [];
      $('version').textContent = 'v' + status.version + ' · port ' + status.port + ' · uptime ' + Math.floor(status.uptime) + 's';
      $('side-runtime').textContent = '127.0.0.1:' + status.port + ' · v' + status.version;
      $('summary-connected').textContent = status.providers.filter(p => p.connected).length + '/' + status.providers.length;
      $('summary-models').textContent = (modelData.data || []).length;
      const metricRows = Object.values(metricData.models || {});
      $('summary-requests').textContent = metricRows.reduce((n, m) => n + m.requests, 0);
      $('summary-active').textContent = metricRows.reduce((n, m) => n + m.inFlight, 0);

      renderProviders(status.providers);
      renderModels(modelData.data || []);
      renderMetrics(metricData);
      renderUsage(metricData);
      renderSettings(settings);
      renderAgentPolicies(agentPolicyData);
      renderPipelines(pipelinesData.data || []);
      renderPipelineRuns(runsData.data || []);
      renderActivity(activity);
      renderOrchestrator(orchestrator);
      renderSystemTools(systemTools);
      renderToolCatalog();
      renderGovernance(reposData.data || [], auditData.data || []);
      renderBudgets(budgetData);
      renderWorkspaces(wsData.data || []);
      renderAnalyticsCharts(analyticsData);

      $('notice').textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (error) {
      $('notice').textContent = error.message;
    }
  }

  $('model-list').addEventListener('click', event => {
    const use = event.target.closest('[data-use-model]');
    if (!use) return;
    $('play-model').value = use.dataset.useModel;
    updateEffortOptions();
    showSection('playground');
    $('notice').textContent = use.dataset.useModel + ' selected in Playground.';
  });

  async function runPlayground() {
    const button = $('play-run');
    button.disabled = true;
    $('play-note').textContent = 'Running...';
    $('play-output').textContent = '';
    try {
      const cwd = $('play-cwd').value.trim();
      const body = {
        model: $('play-model').value,
        mode: $('play-mode').value,
        effort: $('play-effort').value,
        messages: [{ role: 'user', content: $('play-prompt').value }],
        max_tokens: 64
      };
      if (cwd) body.cwd = cwd;
      const result = await request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      $('play-output').textContent = result.choices?.[0]?.message?.content || JSON.stringify(result, null, 2);
      $('play-note').textContent = 'Completed';
    } catch (error) {
      $('play-output').textContent = error.message;
      $('play-note').textContent = 'Failed';
    } finally {
      button.disabled = false;
    }
  }

  $('play-model').addEventListener('change', updateEffortOptions);
  $('play-run').addEventListener('click', runPlayground);
  $('refresh').addEventListener('click', refresh);
  $('model-search').addEventListener('input', () => renderModels(models));
  $('model-transport-filter').addEventListener('change', () => renderModels(models));
  $('model-provider-filter').addEventListener('change', () => renderModels(models));
  $('model-refresh').addEventListener('click', async () => {
    $('model-refresh').disabled = true;
    try {
      await request('/v1/models/refresh', { method: 'POST' });
      await refresh();
    } finally {
      $('model-refresh').disabled = false;
    }
  });
  $('orch-save').addEventListener('click', () => saveOrchestrator().catch(error => $('orch-note').textContent = error.message));
  $('orch-run').addEventListener('click', runOrchestrator);
  $('test-all-cli').addEventListener('click', runCliTests);
  $('test-openai').addEventListener('click', runOpenAiTest);

  // Subsystem event listeners
  $('btn-rediscover-tools')?.addEventListener('click', async () => {
    $('btn-rediscover-tools').disabled = true;
    $('btn-rediscover-tools').textContent = 'Scanning PATH...';
    try {
      await request('/v1/tools/discover', { method: 'POST' });
      await refresh();
    } catch (err) {
      alert('Discovery error: ' + err.message);
    } finally {
      $('btn-rediscover-tools').disabled = false;
      $('btn-rediscover-tools').textContent = 'Rediscover Tools';
    }
  });

  document.querySelectorAll('#catalog-class-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalog-class-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderToolCatalog(chip.dataset.class);
    });
  });

  document.querySelectorAll('#pipe-category-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#pipe-category-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentPipeCategory = chip.dataset.cat;
      renderPipelines(cachedPipelines);
    });
  });

  $('btn-open-add-repo')?.addEventListener('click', () => {
    $('repo-id-input').value = '';
    $('repo-name-input').value = '';
    $('repo-path-input').value = '';
    $('repo-desc-input').value = '';
    $('repo-modal').classList.add('open');
  });
  $('close-repo-modal')?.addEventListener('click', () => $('repo-modal').classList.remove('open'));
  $('cancel-repo-btn')?.addEventListener('click', () => $('repo-modal').classList.remove('open'));

  $('save-repo-btn')?.addEventListener('click', async () => {
    const id = $('repo-id-input').value.trim();
    const name = $('repo-name-input').value.trim();
    const path = $('repo-path-input').value.trim();
    const description = $('repo-desc-input').value.trim();
    const assignedGovernancePipeline = $('repo-pipeline-select').value;
    if (!id || !path) { alert('Repository identifier and local path are required'); return; }

    const btn = $('save-repo-btn');
    btn.disabled = true;
    try {
      await request('/v1/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, path, description, assignedGovernancePipeline }),
      });
      $('repo-modal').classList.remove('open');
      await refresh();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('repos-table-container')?.addEventListener('click', async event => {
    const delBtn = event.target.closest('[data-del-repo]');
    if (delBtn) {
      const repoId = delBtn.dataset.delRepo;
      if (!confirm('Unregister repository ' + repoId + '?')) return;
      try {
        await request('/v1/repositories/' + encodeURIComponent(repoId), { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert('Delete error: ' + err.message);
      }
      return;
    }

    const runBtn = event.target.closest('[data-run-repo-pipe]');
    if (runBtn) {
      const pipeId = runBtn.dataset.runRepoPipe;
      const repoId = runBtn.dataset.repoId;
      const repoPath = runBtn.dataset.repoPath;
      showSection('pipelines');
      if ($('pipe-run-select')) $('pipe-run-select').value = pipeId;
      if ($('pipe-run-repo')) $('pipe-run-repo').value = repoId;
      if ($('pipe-run-cwd') && repoPath) $('pipe-run-cwd').value = repoPath;
      $('notice').textContent = 'Loaded pipeline ' + pipeId + ' for repository ' + repoId;
    }
  });

  $('btn-export-audit-json')?.addEventListener('click', () => { window.open('/v1/governance/audit/export?format=json', '_blank'); });
  $('btn-export-audit-md')?.addEventListener('click', () => { window.open('/v1/governance/audit/export?format=markdown', '_blank'); });
  $('btn-export-activity-json')?.addEventListener('click', () => { window.open('/v1/activity/export?format=json', '_blank'); });
  $('btn-export-activity-md')?.addEventListener('click', () => { window.open('/v1/activity/export?format=markdown', '_blank'); });

  $('budget-config-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const note = $('budget-save-note');
    if (note) note.textContent = 'Saving...';
    try {
      await request('/v1/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyBudgetUsd: parseFloat($('cfg-daily-budget').value) || 10,
          monthlyBudgetUsd: parseFloat($('cfg-monthly-budget').value) || 100,
          maxCostPerRunUsd: parseFloat($('cfg-max-cost-run').value) || 0.50,
          maxTokensPerRun: parseInt($('cfg-max-tokens-run').value, 10) || 100000,
          warningThresholdPercent: parseInt($('cfg-warn-threshold').value, 10) || 80,
          hardStopEnabled: $('cfg-hard-stop').value === 'true'
        })
      });
      if (note) note.textContent = 'Limits saved';
      await refresh();
    } catch (err) {
      if (note) note.textContent = err.message;
    }
  });

  $('add-workspace-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const path = $('new-ws-path').value.trim();
    const name = $('new-ws-name').value.trim();
    if (!path) return;
    try {
      await request('/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name })
      });
      $('new-ws-path').value = '';
      $('new-ws-name').value = '';
      await refresh();
      browseDirectory(path);
    } catch (err) {
      alert('Add workspace failed: ' + err.message);
    }
  });

  $('workspaces-table-container')?.addEventListener('click', async event => {
    const delBtn = event.target.closest('[data-del-ws]');
    if (delBtn) {
      const wsId = delBtn.dataset.delWs;
      if (!confirm('Remove workspace ' + wsId + '?')) return;
      try {
        await request('/v1/workspaces/' + encodeURIComponent(wsId), { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
      return;
    }

    const browseBtn = event.target.closest('[data-browse-ws]');
    if (browseBtn) {
      browseDirectory(browseBtn.dataset.browseWs);
      return;
    }

    const useBtn = event.target.closest('[data-use-ws]');
    if (useBtn) {
      $('play-cwd').value = useBtn.dataset.useWs;
      showSection('playground');
      $('notice').textContent = 'Selected workspace in Playground: ' + useBtn.dataset.useWs;
    }
  });

  $('play-ws-select')?.addEventListener('change', () => {
    const val = $('play-ws-select').value;
    if (val) $('play-cwd').value = val;
  });

  $('browser-dirs-list')?.addEventListener('click', async event => {
    const navDir = event.target.closest('[data-nav-dir]');
    if (navDir) {
      browseDirectory(navDir.dataset.navDir);
      return;
    }
    const addDir = event.target.closest('[data-add-dir-ws]');
    if (addDir) {
      const p = addDir.dataset.addDirWs;
      const n = addDir.dataset.name;
      try {
        await request('/v1/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p, name: n })
        });
        await refresh();
      } catch (err) {
        alert('Add failed: ' + err.message);
      }
    }
  });

  $('browser-up-btn')?.addEventListener('click', () => {
    const parent = $('browser-up-btn').dataset.parentPath;
    if (parent) browseDirectory(parent);
  });

  document.querySelectorAll('#activity-level-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#activity-level-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentActivityLevel = chip.dataset.level;
      renderActivity();
    });
  });

  $('activity-search')?.addEventListener('input', event => {
    activityFilterQuery = event.target.value.trim();
    renderActivity();
  });

  $('btn-refresh-analytics')?.addEventListener('click', refresh);

  browseDirectory('');

  // Live event updates via WebSocket
  let eventsConnected = false;
  function connectEvents() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = scheme + '//' + location.host + '/v1/events';
    const token = authToken();
    const ws = token ? new WebSocket(url, ['conduit-token.' + token]) : new WebSocket(url);
    ws.onopen = () => { eventsConnected = true; };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'activity') refresh();
      } catch {}
    };
    ws.onerror = () => {
      if (!eventsConnected) $('notice').textContent = 'Live updates unavailable. Polling every 15s.';
    };
    ws.onclose = () => {
      eventsConnected = false;
      setTimeout(connectEvents, 3000);
    };
  }

  refresh();
  connectEvents();
  setInterval(refresh, 15000);
</script>
</body>
</html>`;

export const HELP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conduit Bridge Help</title><style>${SHARED_STYLE}</style></head>
<body><main class="help"><header><div><h1>Conduit Bridge Help</h1><div class="muted">Installation, provider routing, and operations</div></div><nav class="nav"><a class="link" href="/">Dashboard</a></nav></header>
  <section><h2>Requirements and installation</h2><p>Conduit Bridge runs on Windows Desktop and Linux Desktop. It requires Node.js 24 or newer.</p><pre>npm install
npm run build
node dist/cli.js start --host=127.0.0.1 --port=31338</pre><p>Open <code>http://127.0.0.1:31338/</code>. The dashboard, API, and event stream share this one listener.</p></section>
    <section><h2>Desktop autostart</h2><p>Run <code>./scripts/install-autostart.sh</code> on Linux Desktop or <code>powershell -ExecutionPolicy Bypass -File ./scripts/install-autostart.ps1</code> on Windows Desktop after building. These installers start Conduit as the interactive desktop user. See <code>docs/AUTOSTART.md</code> for uninstall commands.</p></section>
  <section><h2>Provider authentication</h2><p>Conduit supports explicit API credentials, authenticated local CLI tools, and LM Studio. Browser-session providers were removed because real desktop testing showed that their unattended runtime was not consistently reliable across provider security checks.</p><ul><li><code>cli-grok</code>: authenticate the installed Grok CLI.</li><li><code>cli-claude</code>: authenticate Claude Code.</li><li><code>cli-codex</code>: authenticate Codex CLI.</li><li><code>cli-gemini</code>: authenticate the configured Gemini-compatible CLI.</li></ul></section>
  <section><h2>Model routing</h2><ul><li><code>api-*</code> uses a direct provider API or aggregator.</li><li><code>cli-*</code> invokes an installed coding CLI and can isolate accounts.</li><li><code>lmstudio/*</code> forwards to a local OpenAI-compatible LM Studio server.</li></ul><p>The Models page groups the catalog by transport and provider, shows readiness and source, and filters by search, transport, or provider. Use the complete model ID shown there. Availability labels are <strong>verified</strong>, <strong>documented</strong>, or <strong>dynamic</strong>.</p></section>
  <section><h2>OpenAI-compatible endpoints</h2><pre>GET  /health
GET  /v1/status
GET  /v1/models
GET  /v1/capabilities
GET  /v1/metrics
GET  /v1/tools
GET  /v1/pipelines
POST /v1/chat/completions
POST /v1/pipelines/run
POST /v1/pipelines/runs/action
WS   /v1/events</pre><p>The base URL for clients is <code>http://127.0.0.1:31338/v1</code>. Chat supports SSE streaming, <code>fallback_models</code>, provider-specific <code>effort</code> or <code>reasoning_effort</code>, and CLI <code>mode</code> (<code>chat</code>, <code>plan</code>, <code>agent</code>) with optional <code>cwd</code>.</p></section>
  <section><h2>Authentication by transport</h2><ul><li>CLI providers use the CLI's existing authentication. Claude CLI supports neutral <code>first-account</code> and isolated <code>second-account</code> routes.</li><li>API providers use protected environment variables or write-only dashboard settings.</li></ul><p>Never put credentials in the repository, URLs, command arguments, or logs.</p></section>
  <section><h2>Security</h2><ul><li>Loopback is the required desktop bind.</li><li>Cross-site state-changing requests and foreign WebSocket origins are rejected. Allowlisted origins (including another local port) may POST.</li><li>Activity and metrics do not store prompts, responses, cookies, or credentials. Orchestrator history stores a short redacted preview.</li><li>macOS is not a supported CLI target: <code>conduit-bridge start</code> exits. Library embedders may still construct <code>BridgeServer</code>.</li></ul></section>
  <section><h2>Troubleshooting</h2><pre>curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/status
curl http://127.0.0.1:31338/v1/models
node dist/cli.js status</pre><ul><li><strong>CLI unavailable:</strong> install the named CLI, authenticate it normally, and ensure its binary is on PATH.</li><li><strong>API unavailable:</strong> add the provider credential through the write-only Settings form or the documented environment variable.</li></ul><p>See <code>docs/AUTOSTART.md</code> for the desktop startup guide.</p></section>
</main></body></html>`;

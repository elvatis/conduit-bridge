import { GIT_WORKSPACE_HTML, GIT_WORKSPACE_STYLE, GIT_WORKSPACE_SCRIPT } from './ui/git-workspace.js';
import { REPOSITORY_ANALYTICS_HTML, REPOSITORY_ANALYTICS_STYLE, REPOSITORY_ANALYTICS_SCRIPT, REPOSITORY_ANALYTICS_NAV_HTML } from './ui/repository-analytics.js';
import { MODERN_STYLE } from './ui/modern-style.js';
import { SIDEBAR_RESIZE_HTML, SIDEBAR_RESIZE_SCRIPT, SIDEBAR_RESIZE_STYLE } from './ui/sidebar-resize.js';
import { effortControl, EFFORT_STYLE } from './ui/effort-slider.js';
import { TRANSLATIONS } from './i18n.js';
import { I18N_SCRIPT } from './ui/i18n.js';
import { TOOL_COPY_DE, SYSTEM_TOOL_COPY_DE } from './ui/tool-copy.js';
import { decorateSettingTooltips, SETTING_TOOLTIP_SCRIPT, SETTING_TOOLTIP_STYLE } from './ui/index.js';
import { BRAND_ICON } from './ui/brand.js';
import { WORKSPACE_STYLE } from './ui/workspace-style.js';
import { EXECUTION_STYLE, EXECUTION_HTML, EXECUTION_SCRIPT, EXECUTION_NAV_HTML, EXECUTION_TREE_HTML } from './ui/execution.js';
import { SELECT_STYLE, SELECT_SCRIPT } from './ui/select.js';
import { PLATFORM_NEW_CHAT_HTML, PLATFORM_HISTORY_HTML, PLATFORM_HTML, PLATFORM_SCRIPT, PLATFORM_STYLE } from './platform-ui.js';

const SHARED_STYLE = `
  :root {
    color-scheme: dark;
    --bg: #050B16;
    --panel: #0A1729;
    --panel-2: #0D1C33;
    --panel-3: #112340;
    --line: rgba(143,213,236,.18);
    --line-2: rgba(143,213,236,.32);
    --text: #f5faff;
    --body: #c7d4e8;
    --muted: #8fa0bd;
    --blue: #22b4ff;
    --accent: var(--blue);
    --blue-soft: #b9eaff;
    --copper: #ff8a3d;
    --ok: #1fd18a;
    --ok-bg: rgba(31,209,138,.14);
    --warn: #f5b83d;
    --warn-bg: rgba(245,184,61,.14);
    --bad: #ff6f91;
    --bad-bg: rgba(255,111,145,.14);
  }
  * { box-sizing: border-box; min-width: 0; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--body);
    font: 1.0357rem/1.5 Inter, system-ui, -apple-system, sans-serif;
    background-image: radial-gradient(circle at 18% 0%, rgba(34,180,255,.08), transparent 32%), linear-gradient(180deg,#07111f 0%,#050B16 100%);
  }
  #main-layout {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 252px minmax(0,1fr);
    padding: 0;
    transition: grid-template-columns .18s cubic-bezier(.4,0,.2,1);
  }
  #main-layout.sidebar-collapsed {
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
    font: 700 0.8rem var(--font-sans);
    letter-spacing: .16em;
  }
  .brand h1 {
    font-family: Georgia,serif;
    font-size: 1.4286rem;
    margin: 4px 0 2px;
    color: var(--text);
  }
  .brand small {
    color: var(--muted);
    font-size: 0.8214rem;
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
  .nav-group-label {
    font: 600 0.8rem var(--font-sans);
    letter-spacing: .12em;
    color: var(--muted);
    padding: 10px 10px 3px;
    text-transform: uppercase;
    opacity: .55;
    pointer-events: none;
    user-select: none;
  }
  .sidebar.collapsed .nav-group-label { display: none; }
  button > svg { flex-shrink: 0; }
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
    font-size: 0.9643rem;
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
    font-size: 0.8571rem;
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
    font: 0.8rem/1.5 var(--font-sans);
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
    font: 700 0.9286rem var(--font-sans);
    letter-spacing: .08em;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1, h2, h3, p { margin-top: 0; }
  h1 { font-size: 1.8571rem; margin-bottom: 4px; color: var(--text); }
  h2 { font-size: 1.2857rem; margin-bottom: 12px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  h3 { font-size: 1.0714rem; margin-bottom: 5px; color: var(--text); }
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
  .summary-item strong { display: block; font-size: 1.5714rem; color: var(--blue); }
  .summary-item span { color: var(--muted); font-size: 0.8571rem; }
  .status-legend { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted); font-size: 0.8571rem; margin: 0 0 16px; }
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
  .transport strong { color: var(--blue); font-family: var(--font-sans); }
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
    font-size: 0.9286rem;
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
  .model-summary span { border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; color: var(--muted); font-size: 0.8571rem; }
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
  .model-row code { font-size: 0.8571rem; }
  .model-row .model-meta { color: var(--muted); font-size: 0.8571rem; }
  #model-list { max-height: 70vh; overflow: auto; padding-right: 4px; }
  .setting-list { display: grid; gap: 10px; margin: 12px 0 24px; }
  .setting-row { display: grid; grid-template-columns: minmax(150px, .7fr) minmax(180px, 1fr) auto; gap: 10px; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; }
  .setting-row:first-child { border-top: 0; padding-top: 0; }
  .setting-row input { min-width: 0; }
  .setting-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 0.8214rem/1 var(--font-sans);
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
    background: #0A1729;
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
    font-size: 0.8214rem;
    padding: 4px 8px;
    background: #112340;
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
    background: #0A1729;
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
    font-size: 0.8571rem;
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
    font-size: 1rem;
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
    font-size: 0.8571rem;
    font-weight: 600;
    color: var(--blue-soft);
    cursor: pointer;
    user-select: none;
  }
  .tool-cat-title .cat-badge {
    font-size: 0.8rem;
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
    font-size: 0.8571rem;
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
    font-size: 0.8rem;
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
    font-size: 0.8571rem;
  }
  .pipeline-step-pill .step-meta {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: var(--font-sans);
  }
  .pipeline-arrow {
    color: var(--muted);
    font-size: 1rem;
  }
  .checkpoint-badge {
    background: rgba(245,184,61,.18);
    color: var(--warn);
    border: 1px solid rgba(245,184,61,.3);
    font-size: 0.8rem;
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
    background: #07111F;
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
    font-size: 0.9286rem;
  }
  .step-result-content {
    background: #040913;
    border: 1px solid rgba(143,213,236,.1);
    border-radius: 5px;
    padding: 10px;
    font-size: 0.8571rem;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-family: var(--font-sans);
    color: var(--text);
  }

  /* Modal Dialog */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    margin: 0;
    border: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    color: var(--text);
    z-index: 100;
    background: rgba(2,6,12,.78);
    backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal-backdrop[open] {
    display: flex;
  }
  .modal-backdrop::backdrop { background:transparent; }
  body:has(.modal-backdrop[open]) { overflow:hidden; }
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
    flex-shrink: 0;
    padding: 16px 20px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-body {
    min-height: 0;
    overscroll-behavior: contain;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-footer {
    flex-shrink: 0;
    flex-wrap: wrap;
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
    font-size: 1.1429rem;
  }
  .modal-close:hover { color: var(--text); }
  .preset-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .preset-btn {
    font-size: 0.8571rem;
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
    font-size: 0.9286rem;
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
    background: #0A1729;
    color: var(--text);
    padding: 10px 12px;
    font: inherit;
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
  }
  input:hover, select:hover, textarea:hover { border-color: var(--line-2); background: #0D1C33; }
  input:focus, select:focus, textarea:focus { outline: 0; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(34,180,255,.14); }
  textarea { min-height: 92px; resize: vertical; }
  .play-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  #play-output { white-space: pre-wrap; min-height: 54px; margin: 14px 0 0; }
  .activity-list { display: grid; gap: 7px; max-height: 460px; overflow: auto; }
  .activity-event { display: grid; grid-template-columns: 76px 86px minmax(0,1fr); gap: 10px; align-items: start; border-top: 1px solid var(--line); padding: 9px 0; font-size: 0.9286rem; }
  .activity-event:first-child { border-top: 0; }
  .activity-event time, .activity-event .scope { color: var(--muted); font: 0.8571rem var(--font-sans); }
  .activity-event.success .level { color: var(--ok); }
  .activity-event.warning .level { color: var(--warn); }
  .activity-event.error .level { color: var(--bad); }
  .recommendation { border-left: 3px solid var(--copper); padding: 10px 14px; margin: 10px 0; background: var(--panel-2); }
  .help section { margin-bottom: 16px; }
  main.help { display: block; max-width: 1040px; margin: 0 auto; padding: 32px 20px 56px; }
  li { margin: 7px 0; }
  pre { overflow-x: auto; background: #050B16; border: 1px solid var(--line); padding: 14px; border-radius: 6px; }
  @media (max-width: 760px) {
    #main-layout { display: block; }
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
  .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px; margin: 16px 0 24px; }
  .chart-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .chart-header h3 { margin: 0; font-size: 1rem; color: var(--blue-soft); }
  .chart-badge { font: 600 0.8rem var(--font-sans); padding: 2px 6px; border-radius: 4px; background: rgba(34,180,255,.12); color: var(--blue); }
  .svg-chart { width: 100%; height: auto; display: block; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 0.8571rem; color: var(--muted); }
  .legend-item { display: inline-flex; align-items: center; gap: 5px; }
  .legend-color { width: 10px; height: 10px; border-radius: 2px; }

  /* Risk & Classification Badges */
  .risk-badge { font: 700 0.8rem var(--font-sans); padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: .04em; }
  .risk-low { background: rgba(31,209,138,.14); color: var(--ok); border: 1px solid rgba(31,209,138,.3); }
  .risk-medium { background: rgba(245,184,61,.14); color: var(--warn); border: 1px solid rgba(245,184,61,.3); }
  .risk-high { background: rgba(255,138,61,.14); color: var(--copper); border: 1px solid rgba(255,138,61,.3); }
  .risk-critical { background: rgba(255,111,145,.14); color: var(--bad); border: 1px solid rgba(255,111,145,.3); }
  .class-badge { font: 500 0.8rem Inter, sans-serif; padding: 2px 7px; border-radius: 4px; background: rgba(143,213,236,.12); color: var(--blue-soft); border: 1px solid rgba(143,213,236,.25); }

  /* Filter Chips */
  .filter-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 14px; }
  .filter-chip { padding: 4px 10px; border-radius: 999px; font-size: 0.8571rem; border: 1px solid var(--line); background: #0A1729; color: var(--muted); cursor: pointer; transition: all .12s ease; }
  .filter-chip:hover { border-color: var(--line-2); color: var(--text); }
  .filter-chip.active { background: var(--blue); color: #050B16; border-color: var(--blue); font-weight: 600; }

  /* Data Table */
  .data-table { width: 100%; border-collapse: collapse; font-size: 0.9286rem; text-align: left; margin: 10px 0; }
  .data-table th { background: #112340; color: var(--blue-soft); padding: 9px 12px; border-bottom: 1px solid var(--line-2); font-weight: 600; }
  .data-table td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .data-table tr:hover td { background: rgba(17,35,64,.5); }

  /* Budget Meters */
  .budget-gauge { background: #0A1729; border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
  .budget-meter { height: 10px; border-radius: 5px; background: #112340; overflow: hidden; margin: 8px 0; }
  .budget-fill { height: 100%; border-radius: 5px; transition: width .3s ease; }
  .budget-fill.safe { background: #1fd18a; }
  .budget-fill.warn { background: #f5b83d; }
  .budget-fill.danger { background: #ff6f91; }

  /* Directory Browser */
  .dir-browser { background: #0A1729; border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 0.9286rem; }
  .dir-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 5px; cursor: pointer; border: 1px solid transparent; }
  .dir-item:hover { background: #112340; border-color: var(--line); }
  .dir-breadcrumb { display: flex; align-items: center; gap: 8px; padding: 6px 0 10px; border-bottom: 1px solid var(--line); margin-bottom: 8px; font-family: var(--font-sans); color: var(--blue-soft); }

  /* Tool Catalog Grid */
  .tool-catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; margin-top: 12px; }
  .tool-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .tool-card:hover { border-color: var(--line-2); }
  .tool-card-head { display: flex; justify-content: space-between; align-items: center; }

  ${PLATFORM_STYLE}
  ${SETTING_TOOLTIP_STYLE}
  #menu-toggle { display: none; }
  .pipeline-run-fields { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 12px; align-items: end; margin-bottom: 12px; }
  .pipeline-header, .step-result-header, .checkpoint-banner > div, .chart-header { flex-wrap: wrap; gap: 8px; }
  .activity-event, .pipeline-card, .step-result-content, .tool-card, .dir-browser { overflow-wrap: anywhere; }
  .chart-values { padding-left: 20px; font-size: 0.8571rem; overflow-wrap: anywhere; }
  .run-history-item { grid-template-columns: minmax(0,1fr) auto; }
  .data-table { table-layout: fixed; overflow-wrap: anywhere; }
  .data-table td > div { flex-wrap: wrap; }
  @media (max-width: 1100px) {
    .pipeline-run-fields { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  @media (max-width: 800px) {
    .pipeline-run-fields, .page-section [style*="grid-template-columns"], .modal-dialog [style*="grid-template-columns"] { grid-template-columns: minmax(0,1fr) !important; }
    .grid { grid-template-columns: minmax(0,1fr); }
    .pipeline-header, .step-result-header { align-items: stretch; }
    .activity-event:not(.run-history-item) { grid-template-columns: 66px minmax(0,1fr); }
    .activity-event:not(.run-history-item) > :last-child { grid-column: 1 / -1; }
    .data-table th, .data-table td { padding: 6px 4px; font-size: 0.8rem; }
  }
  ${WORKSPACE_STYLE}
  ${EXECUTION_STYLE}
  ${SELECT_STYLE}
  ${GIT_WORKSPACE_STYLE}
  ${REPOSITORY_ANALYTICS_STYLE}
  ${EFFORT_STYLE}
  ${MODERN_STYLE}
  ${SIDEBAR_RESIZE_STYLE}
`;

export const DASHBOARD_HTML = decorateSettingTooltips(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title data-i18n="ui_title">Conduit Bridge - Provider Control Plane</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=cb">
  <meta name="theme-color" content="#050B16">
  <style>${SHARED_STYLE}</style>
</head>
<body>
<main id="main-layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <div class="brand-logo" aria-hidden="true">${BRAND_ICON}</div><div class="brand-info"><h1>Conduit</h1></div>
      </div>
      <button class="collapse-btn" id="sidebar-collapse-btn" type="button" title="Toggle sidebar layout" data-i18n-title="ui_toggle_sidebar_layout" aria-label="Toggle sidebar" data-i18n-aria="ui_toggle_sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9-3 3 3 3"/></svg>
      </button>
    </div>
${PLATFORM_NEW_CHAT_HTML}
<nav class="side-menu" aria-label="Main navigation" data-i18n-aria="ui_main_navigation">${EXECUTION_NAV_HTML}<button id="git-workspace-nav" data-section="git-workspace"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10v3a5 5 0 0 1-5 5H6"/></svg><span class="nav-label" data-i18n="gw_nav">Git workspace</span></button>${REPOSITORY_ANALYTICS_NAV_HTML}<button class="active" data-section="platform" title="Conversation &amp; Agent Workspace" data-i18n-title="h_platform">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>
        <span class="nav-label" data-i18n="nav_platform">Webchat &amp; agents</span>
      </button>
${PLATFORM_HISTORY_HTML}
      <button data-section="models" title="Models" data-i18n-title="nav_models">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
        <span class="nav-label" data-i18n="nav_models">Models</span>
      </button>
      <button data-section="workspaces" title="Workspaces &amp; Working Directories" data-i18n-title="ui_workspaces_directories">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="nav-label" data-i18n="nav_workspaces">Workspaces</span>
      </button></nav>
${EXECUTION_TREE_HTML}
<details class="nav-advanced" id="advanced-nav"><summary title="Tools and administration" data-i18n-title="ui_tools_admin"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7m-3.5-3.5v7"/></svg><span data-i18n="ui_tools_admin">Tools and administration</span></summary>    <nav class="side-menu" aria-label="Dashboard sections" data-i18n-aria="ui_dashboard_sections" id="side-nav">
      <div class="nav-group-label" data-nav-group="core" data-i18n="group_core">Core</div>
      <button data-section="overview" title="Overview" data-i18n-title="nav_overview">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        <span class="nav-label" data-i18n="nav_overview">Overview</span>
      </button>

      <button data-section="playground" title="Playground" data-i18n-title="nav_playground">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <span class="nav-label" data-i18n="nav_playground">Playground</span>
      </button>
      <div class="nav-group-label" data-nav-group="providers" data-i18n="group_providers">Providers</div>
      <button data-section="api-providers" title="API providers" data-i18n-title="nav_api_providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span class="nav-label" data-i18n="nav_api_providers">API providers</span>
      </button>
      <button data-section="cli-providers" title="CLI providers" data-i18n-title="nav_cli_providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
        <span class="nav-label" data-i18n="nav_cli_providers">CLI providers</span>
      </button>
      <button data-section="local-providers" title="Local providers" data-i18n-title="nav_local_providers">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
        <span class="nav-label" data-i18n="nav_local_providers">Local providers</span>
      </button>
      <div class="nav-group-label" data-nav-group="agent_ops" data-i18n="group_agent_ops">Agent Ops</div>
      <button data-section="agent-controls" title="Agent controls" data-i18n-title="nav_agent_controls">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        <span class="nav-label" data-i18n="nav_agent_controls">Agent controls</span>
      </button>
      <button data-section="pipelines" title="Pipelines &amp; Chaining" data-i18n-title="ui_pipelines_chaining">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6"/><circle cx="18" cy="9" r="3"/><path d="M6 15a6 6 0 0 0 6-6V9a6 6 0 0 1 6-6"/></svg>
        <span class="nav-label" data-i18n="nav_pipelines">Pipelines</span>
      </button>
      <button data-section="governance" title="Repository Governance" data-i18n-title="h_governance">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span class="nav-label" data-i18n="nav_governance">Governance</span>
      </button>
      <button data-section="budgets" title="Budget Controls" data-i18n-title="h_budgets">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 6v2"/><path d="M12 16v2"/></svg>
        <span class="nav-label" data-i18n="nav_budgets">Budgets</span>
      </button>

      <div class="nav-group-label" data-nav-group="analytics" data-i18n="group_analytics">Analytics</div>

      <button data-section="usage" title="Usage Statistics" data-i18n-title="ui_usage_statistics">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        <span class="nav-label" data-i18n="nav_usage">Usage</span>
      </button>
      <button data-section="orchestrator" title="Orchestrator" data-i18n-title="nav_orchestrator">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 10.4 6.5 6.5"/><path d="M13.6 10.4l3.9-3.9"/><path d="M10.4 13.6 6.5 17.5"/><path d="M13.6 13.6l3.9 3.9"/></svg>
        <span class="nav-label" data-i18n="nav_orchestrator">Orchestrator</span>
      </button>
      <div class="nav-group-label" data-nav-group="system" data-i18n="group_system">System</div>
      <button data-section="integration" title="Integration tests" data-i18n-title="nav_integration">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="nav-label" data-i18n="nav_integration">Integration tests</span>
      </button>
      <button data-section="recommendations" title="Recommendations" data-i18n-title="nav_recommendations">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        <span class="nav-label" data-i18n="nav_recommendations">Recommendations</span>
      </button>
      <button data-section="activity" title="Activity &amp; Telemetry" data-i18n-title="h_activity">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span class="nav-label" data-i18n="nav_activity">Activity</span>
      </button>


    </nav>    <button class="nav-custom-trigger" id="open-nav-custom-btn" type="button" title="Customize navigation visibility" data-i18n-title="ui_customize_visibility"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="15"/><line x1="12" x2="12" y1="11" y2="3"/><line x1="20" x2="20" y1="21" y2="17"/><line x1="20" x2="20" y1="13" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="15" y2="15"/><line x1="17" x2="23" y1="17" y2="17"/></svg>

      <span data-i18n="ui_customize_nav">Customize Nav</span>
    </button></details><nav class="side-menu sidebar-bottom" aria-label="Settings and help" data-i18n-aria="ui_settings_help">      <button data-section="settings" title="Settings" data-i18n-title="nav_settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span class="nav-label" data-i18n="nav_settings">Settings</span>
      </button>
      <button data-section="help" title="Help &amp; Documentation" data-i18n-title="ui_help_documentation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        <span class="nav-label" data-i18n="nav_help">Help</span>
      </button></nav>

    <div class="side-footer" hidden>
      <span id="side-runtime" data-i18n="ui_loading">Loading...</span>
    </div>
  </aside>

  ${SIDEBAR_RESIZE_HTML}
  <div class="workspace">
    <nav class="appbar" aria-label="Dashboard controls" data-i18n-aria="ui_dashboard_controls">
      <div style="display: flex; align-items: center; gap: 10px;">
        <button id="menu-toggle" type="button" aria-label="Toggle navigation" data-i18n-aria="ui_toggle_navigation" data-i18n="ui_menu">Menu</button>
        <span class="appbrand" id="page-title" data-i18n="nav_platform">Chat</span>
      </div>
      <div class="header-actions">
        <button id="lang-toggle" type="button" title="Switch language" data-i18n-title="ui_switch_language" aria-label="Toggle language" data-i18n-aria="ui_toggle_language"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span id="lang-label">DE</span></button>
        <button id="refresh" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          <span class="action-label" data-i18n="btn_refresh">Refresh</span>
        </button>
      </div>
    </nav>

    <p id="notice" role="status"></p>
    ${PLATFORM_HTML}
    ${EXECUTION_HTML}
    ${GIT_WORKSPACE_HTML.replace('class="gw-page"', 'class="wide page-section gw-page"')}
    ${REPOSITORY_ANALYTICS_HTML}

    <!-- Overview Section -->
    <div id="overview-section" class="page-section">
      <header id="overview" class="anchor">
        <div>
          <h1 data-i18n="h_overview">Operational Dashboard</h1>
          <div class="muted" id="version" data-i18n="ui_loading">Loading...</div>
        </div>
      </header>
      <div class="summary" aria-label="Runtime summary" data-i18n-aria="ui_runtime_summary">
        <div class="summary-item"><strong id="summary-connected">-</strong><span data-i18n="ui_connected_providers">Connected providers</span></div>
        <div class="summary-item"><strong id="summary-models">-</strong><span data-i18n="ui_registered_models">Registered models</span></div>
        <div class="summary-item"><strong id="summary-requests">-</strong><span data-i18n="ui_requests_handled">Requests handled</span></div>
        <div class="summary-item"><strong id="summary-active">-</strong><span data-i18n="ui_active_requests">Active requests</span></div>
      </div>
      <div class="grid">
        <article class="transport"><strong>api-*</strong><h3 data-i18n="ui_direct_apis">Direct APIs</h3><p data-i18n="ui_direct_apis_description">Requests use provider SDK or REST endpoints. Independent API keys managed via protected Bridge settings.</p></article>
        <article class="transport"><strong>cli-*</strong><h3 data-i18n="ui_local_clis">Local coding CLIs</h3><p data-i18n="ui_local_clis_description">Requests route to Claude Code, OpenAI Codex, Antigravity Gemini, or Grok CLI with account isolation.</p></article>
        <article class="transport"><strong>lmstudio/*</strong><h3 data-i18n="ui_local_models">Local models</h3><p data-i18n="ui_local_models_description">Requests route to an OpenAI-compatible LM Studio server on localhost without cloud dependencies.</p></article>
      </div>
    </div>

    <!-- Playground Section -->
    <section id="playground-section" class="playground page-section">
      <h2 data-i18n="h_playground">Local Playground</h2>
      <p class="muted" data-i18n="ui_playground_description">Send interactive test requests through the OpenAI-compatible proxy interface.</p>
      <label><span data-i18n="lbl_model">Model</span><select id="play-model"></select></label>
      <label><span data-i18n="lbl_mode">Mode</span>
        <select id="play-mode">
          <option value="chat" data-i18n="mode_chat_description">Chat (read-only inference)</option>
          <option value="plan" data-i18n="mode_plan_description">Plan (architectural proposal)</option>
          <option value="agent" data-i18n="mode_agent_description">Agent (autonomous workspace writes)</option>
        </select>
      </label>
      <div style="display: grid; grid-template-columns: 1fr minmax(180px, 260px); gap: 10px; align-items: end;">
        <label><span data-i18n="lbl_working_dir">Working directory</span><input id="play-cwd" type="text" placeholder="Absolute path (required when agent mode is selected)" data-i18n-ph="ph_absolute_path"></label>
        <label><span data-i18n="lbl_workspace_quick">Workspace quick select</span><select id="play-ws-select"><option value="" data-i18n="ui_choose_workspace">-- Choose Workspace --</option></select></label>
      </div>
      ${effortControl('play-effort', '#play-model')}
      <label><span data-i18n="lbl_prompt">Prompt</span><textarea id="play-prompt" data-i18n-value="sample_ping">Reply with exactly: pong</textarea></label>
      <div class="play-actions">
        <button id="play-run" class="primary" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span class="action-label" data-i18n="btn_run_test">Run test</span></button>
        <span id="play-note" class="muted"></span>
      </div>
      <pre id="play-output" aria-live="polite" data-i18n="ui_no_test">No test run yet.</pre>
    </section>

    <!-- API Providers Section -->
    <div id="api-providers-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_api_providers">API providers</h2>
        <p class="muted" data-i18n="ui_api_description">Direct cloud APIs configured via environment variables or write-only settings.</p>
        <div id="api-provider-list" data-i18n="ui_loading">Loading...</div>
      </section>
    </div>

    <!-- CLI Providers Section -->
    <div id="cli-providers-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_cli_providers">CLI providers</h2>
        <p class="muted" data-i18n="ui_cli_description">Installed command-line tools leveraging native terminal authentication and workspaces.</p>
        <div id="cli-provider-list" data-i18n="ui_loading">Loading...</div>
      </section>
    </div>

    <!-- Agent Controls Section -->
    <div id="agent-controls-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_agent_controls">Agent controls</h2>
        <p class="muted" data-i18n="ui_agent_description">Govern autonomous agent execution, default run modes, and restricted tools per provider with structured tool selection inspired by OpenClaw.</p>
        <div id="agent-policy-list" data-i18n="ui_loading">Loading...</div>
      </section>

      <section style="margin-top: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h3 data-i18n="h_system_tools">Discovered System Tools</h3>
            <p class="muted" data-i18n="ui_system_tools_description">Automatically detected developer binaries and environments on system PATH.</p>
          </div>
          <button type="button" id="btn-rediscover-tools" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_rediscover_tools">Rediscover Tools</span></button>
        </div>
        <div id="system-tools-list" data-i18n="ui_scanning_system">Scanning system PATH...</div>
      </section>

      <section style="margin-top: 20px;">
        <h3 data-i18n="h_tool_catalog">Tool Catalog</h3>
        <p class="muted" data-i18n="ui_tool_catalog_description">Capability badges, classification tags, and security risk levels for all bridge operations.</p>
        <div class="filter-chips" id="catalog-class-chips">
          <button type="button" class="filter-chip active" data-class="all" data-i18n="ui_all_tools">All Tools</button>
          <button type="button" class="filter-chip" data-class="Read Only" data-i18n="class_read_only">Read Only</button>
          <button type="button" class="filter-chip" data-class="Workspace Modify" data-i18n="class_workspace_modify">Workspace Modify</button>
          <button type="button" class="filter-chip" data-class="System Modify" data-i18n="class_system_modify">System Modify</button>
          <button type="button" class="filter-chip" data-class="Network Access" data-i18n="class_network_access">Network Access</button>
          <button type="button" class="filter-chip" data-class="External Service" data-i18n="class_external_service">External Service</button>
        </div>
        <div id="tool-catalog-container" class="tool-catalog-grid" data-i18n="ui_loading_catalog">Loading catalog...</div>
      </section>
    </div>

    <!-- Pipelines Section -->
    <div id="pipelines-section" class="wide page-section">
      <section>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h2 data-i18n="h_pipelines">Agent Pipelines</h2>
            <p class="muted" data-i18n="ui_pipelines_description">Multi-step agent pipelines across heterogeneous providers with dependency resolution, parallel review stages, and human approval checkpoints.</p>
          </div>
          <button id="btn-open-create-pipeline" class="primary" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_new_pipeline">New Custom Pipeline</span></button>
        </div>

        <div class="pipeline-run-box">
          <h3 data-i18n="h_trigger_pipeline">Trigger Pipeline Execution</h3>
          <p class="muted" data-i18n="ui_trigger_pipeline_description">Launch an end-to-end multi-agent workflow with repository binding and budget controls.</p>
          <div class="pipeline-run-fields">
            <label><span data-i18n="lbl_pipeline">Select Pipeline</span><select id="pipe-run-select"></select></label>
            <label><span data-i18n="lbl_repository">Repository Target</span><select id="pipe-run-repo"><option value="" data-i18n="ui_default_global">Default / Global</option></select></label>
            <label><span data-i18n="lbl_working_dir">Working directory</span><select id="pipe-run-cwd"><option value="" data-i18n="ui_default_workspace">Default Workspace</option></select></label>
            <button id="pipe-run-btn" class="primary" type="button" style="height: 42px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_execute_pipeline">Execute Pipeline</span></button>
          </div>
          <label><span data-i18n="lbl_initial_prompt">Initial Prompt / Task Description</span><textarea id="pipe-run-prompt" placeholder="Describe the goal or codebase problem to solve across the pipeline steps..." data-i18n-ph="ph_initial_prompt" data-i18n-value="sample_pipeline">Refactor the authentication middleware to support token rotation and write comprehensive unit tests.</textarea></label>
          <div id="pipe-live-status" aria-live="polite" aria-atomic="false"></div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 24px; flex-wrap: wrap; gap: 10px;">
          <h3 style="margin: 0;" data-i18n="h_available_pipelines">Pipelines &amp; Governance Templates</h3>
          <div class="filter-chips" id="pipe-category-chips" style="margin: 0;">
            <button type="button" class="filter-chip active" data-cat="all" data-i18n="ui_all">All</button>
            <button type="button" class="filter-chip" data-cat="governance" data-i18n="nav_governance">Governance</button>
            <button type="button" class="filter-chip" data-cat="review" data-i18n="ui_review">Review</button>
            <button type="button" class="filter-chip" data-cat="engineering" data-i18n="ui_engineering">Engineering</button>
            <button type="button" class="filter-chip" data-cat="security" data-i18n="ui_security">Security</button>
            <button type="button" class="filter-chip" data-cat="custom" data-i18n="ui_custom">Custom</button>
          </div>
        </div>
        <div id="pipelines-list" data-i18n="ui_loading_pipelines">Loading pipelines...</div>

        <h3 style="margin-top: 24px;" data-i18n="ui_approval_inbox">Approval Inbox</h3>
        <div id="pipeline-approvals" class="activity-list" data-i18n="ui_no_approvals">No approvals pending.</div>
        <h3 style="margin-top: 24px;" data-i18n="ui_exec_history">Execution History</h3>
        <div id="pipelines-history" class="activity-list" data-i18n="ui_no_runs">No runs recorded yet.</div>
      </section>
    </div>

    <!-- Governance Section -->
    <div id="governance-section" class="wide page-section">
      <section>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
          <div>
            <h2 data-i18n="h_governance">Repository Governance</h2>
            <p class="muted" data-i18n="ui_governance_description">Bind multi-agent governance templates to repositories, configure mandatory approval gates, and track audit records.</p>
          </div>
          <button id="btn-open-add-repo" class="primary" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_register_repo">Register Repository</span></button>
        </div>

        <h3 data-i18n="h_active_repositories">Active Repositories</h3>
        <div id="repos-table-container" data-i18n="ui_loading_repositories">Loading repositories...</div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 28px; margin-bottom: 8px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0;" data-i18n="h_governance_audit">Governance Approval Audit Trail</h3>
            <p class="muted" style="margin: 0; font-size: 0.9286rem;" data-i18n="ui_governance_audit_description">Full audit log of human authorizations, gate sign-offs, and rejections.</p>
          </div>
          <div class="play-actions">
            <button type="button" id="btn-export-audit-json"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_export_json">Export JSON</span></button>
            <button type="button" class="primary" id="btn-export-audit-md"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_export_md">Export Markdown</span></button>
          </div>
        </div>
        <div id="audit-trail-container" data-i18n="ui_loading_audit">Loading audit trail...</div>
      </section>
    </div>

    <!-- Budgets Section -->
    <div id="budgets-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_budgets">Budget Controls</h2>
        <p class="muted" data-i18n="ui_budgets_description">Enforce cost limits, token consumption thresholds, and daily/monthly spending caps with hard stops and soft warnings.</p>

        <div class="grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 20px;">
          <div class="budget-gauge" id="daily-budget-gauge">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong data-i18n="lbl_daily_spending">Daily Spending Budget</strong>
              <span id="daily-budget-text" class="setting-badge ok">$0.00 / $10.00 (0%)</span>
            </div>
            <div class="budget-meter"><div id="daily-budget-fill" class="budget-fill safe" style="width: 0%;"></div></div>
            <small class="muted" id="daily-budget-sub" data-i18n="ui_daily_reset">Resets at midnight UTC</small>
          </div>

          <div class="budget-gauge" id="monthly-budget-gauge">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong data-i18n="lbl_monthly_spending">Monthly Spending Budget</strong>
              <span id="monthly-budget-text" class="setting-badge ok">$0.00 / $100.00 (0%)</span>
            </div>
            <div class="budget-meter"><div id="monthly-budget-fill" class="budget-fill safe" style="width: 0%;"></div></div>
            <small class="muted" id="monthly-budget-sub" data-i18n="ui_monthly_reset">Resets on 1st of month</small>
          </div>
        </div>

        <h3 data-i18n="h_budget_configuration">Budget Configuration</h3>
        <form id="budget-config-form" class="provider-block" style="padding: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px;">
            <label><span data-i18n="lbl_daily_budget">Daily Budget (USD)</span><input type="number" step="0.5" min="0" id="cfg-daily-budget"></label>
            <label><span data-i18n="lbl_monthly_budget">Monthly Budget (USD)</span><input type="number" step="1" min="0" id="cfg-monthly-budget"></label>
            <label><span data-i18n="lbl_max_cost_run">Max Cost Per Run (USD)</span><input type="number" step="0.05" min="0" id="cfg-max-cost-run"></label>
            <label><span data-i18n="lbl_max_tokens_run">Max Tokens Per Run</span><input type="number" step="5000" min="0" id="cfg-max-tokens-run"></label>
            <label><span data-i18n="lbl_warn_threshold">Warning Threshold (%)</span><input type="number" min="10" max="95" id="cfg-warn-threshold"></label>
            <label><span data-i18n="lbl_enforcement">Limit Enforcement</span>
              <select id="cfg-hard-stop">
                <option value="true" data-i18n="ui_hard_stop">Hard Stop (Block execution when exceeded)</option>
                <option value="false" data-i18n="ui_soft_warning">Soft Warning (Notify operator only)</option>
              </select>
            </label>
          </div>
          <div class="play-actions">
            <button type="submit" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_budget">Save Budget Limits</span></button>
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
            <h2 data-i18n="h_workspaces">Workspaces</h2>
            <p class="muted" data-i18n="ui_workspaces_description">Manage validated project working directories, permissions, and browse local filesystem paths safely.</p>
          </div>
        </div>

        <div class="provider-block" style="padding: 14px; margin-bottom: 18px;">
          <h3 style="margin-bottom: 10px;" data-i18n="h_register_workspace">Register New Workspace</h3>
          <form id="add-workspace-form" style="display: grid; grid-template-columns: 1fr minmax(180px, 240px) auto; gap: 10px; align-items: end;">
            <label><span data-i18n="lbl_workspace_path">Workspace Absolute Path</span><input type="text" id="new-ws-path" placeholder="C:\\path\\to\\project" data-i18n-ph="ph_workspace_path"></label>
            <label><span data-i18n="lbl_friendly_name">Friendly Name</span><input type="text" id="new-ws-name" placeholder="Optional label" data-i18n-ph="ph_optional_label"></label>
            <button type="submit" class="primary" style="height: 40px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_add_workspace">Add Workspace</span></button>
          </form>
        </div>

        <h3 data-i18n="h_registered_workspaces">Registered Workspaces</h3>
        <div id="workspaces-table-container" data-i18n="ui_loading_workspaces">Loading workspaces...</div>

        <h3 style="margin-top: 24px;" data-i18n="h_directory_browser">Filesystem Directory Browser</h3>
        <p class="muted" data-i18n="ui_directory_description">Browse directories to verify paths and inspect folder accessibility.</p>
        <div class="dir-browser">
          <div class="dir-breadcrumb">
            <span data-i18n="lbl_path">Path:</span> <strong id="browser-current-path">-</strong>
            <button type="button" id="browser-up-btn" style="padding: 2px 8px; font-size: 0.8rem;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span class="action-label" data-i18n="btn_parent_directory">Up one level</span></button>
          </div>
          <div id="browser-dirs-list" style="display: grid; gap: 4px; max-height: 240px; overflow-y: auto;"></div>
        </div>
      </section>
    </div>

    <!-- Local Providers Section -->
    <div id="local-providers-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_local_providers">Local providers</h2>
        <p class="muted" data-i18n="ui_local_providers_description">On-device services such as LM Studio that require no cloud credentials.</p>
        <div id="local-provider-list" data-i18n="ui_loading">Loading...</div>
      </section>
    </div>

    <!-- Models Section -->
    <div id="models-section" class="wide page-section">
      <section>
        <h2 data-i18n="h_models">Models</h2>
        <p class="muted" data-i18n="ui_models_description">Explore models across transports, context windows, output caps, and availability.</p>
        <div class="model-tools">
          <input id="model-search" type="search" placeholder="Search model, owner, or provider" data-i18n-ph="ph_search_models">
          <select id="model-transport-filter" aria-label="Filter by transport" data-i18n-aria="ui_filter_transport">
            <option value="" data-i18n="ui_all_transports">All transports</option>
            <option value="api-*" data-i18n="ui_direct_apis">Direct APIs</option>
            <option value="cli-*" data-i18n="ui_coding_clis">Coding CLIs</option>
            <option value="lmstudio/*" data-i18n="ui_local_models">Local models</option>
          </select>
          <select id="model-provider-filter" aria-label="Filter by provider" data-i18n-aria="ui_filter_provider">
            <option value="" data-i18n="ui_all_providers">All providers</option>
          </select>
          <button id="model-refresh" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_reload_catalog">Load catalog</span></button>
        </div>
        <div id="model-count" class="muted"></div>
        <div id="model-summary" class="model-summary"></div>
        <div id="model-list" data-i18n="ui_loading">Loading...</div>
      </section>
    </div>

    <!-- Orchestrator Section -->
    <section id="orchestrator-section" class="wide page-section">
      <h2 data-i18n="h_orchestrator">Orchestrator</h2>
      <p class="muted" data-i18n="ui_orchestrator_description">Multi-model consensus and synthesis. Sequential, parallel, and debate strategies.</p>
      <label><span data-i18n="status_enabled">Enabled</span>
        <select id="orch-enabled">
          <option value="false" data-i18n="status_disabled">Disabled</option>
          <option value="true" data-i18n="status_enabled">Enabled</option>
        </select>
      </label>
      <label><span data-i18n="lbl_strategy">Strategy</span>
        <select id="orch-strategy">
          <option value="sequential" data-i18n="strategy_sequential">Sequential review</option>
          <option value="parallel" data-i18n="strategy_parallel">Parallel panel</option>
          <option value="debate" data-i18n="strategy_debate">Debate chain</option>
        </select>
      </label>
      <div id="orch-roles"></div>
      <label><span data-i18n="lbl_fallback_models">Fallback models</span><select id="orch-fallbacks" multiple size="4"></select></label>${effortControl('orch-fallback-effort', '#orch-fallbacks')}
      <div class="play-actions">
        <button id="orch-save" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_orchestration">Save orchestration</span></button>
        <button id="orch-run" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span class="action-label" data-i18n="btn_run_orchestration">Run orchestration</span></button>
        <span id="orch-note" class="muted"></span>
      </div>
      <pre id="orch-output" data-i18n="ui_no_orchestration">No orchestration run yet.</pre>
    </section>

    <!-- Integration Tests Section -->
    <section id="integration-section" class="wide page-section">
      <h2 data-i18n="h_integration">Integration tests</h2>
      <p class="muted" data-i18n="ui_integration_description">Automated verification testing OpenAI routes and provider execution matrices.</p>
      <pre><span data-i18n="ui_base_url">Base URL</span>: http://127.0.0.1:31338/v1
<span data-i18n="ui_endpoint">Endpoint</span>: POST /chat/completions</pre>
      <div class="play-actions">
        <button id="test-all-cli" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span class="action-label" data-i18n="btn_test_clis">Test all CLI providers</span></button>
        <button id="test-openai" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span class="action-label" data-i18n="btn_test_openai">Test OpenAI-compatible route</span></button>
      </div>
      <div id="test-output" class="activity-list" style="margin-top: 14px;" data-i18n="ui_no_integration">No integration test run yet.</div>
    </section>

    <!-- Recommendations Section -->
    <section id="recommendations-section" class="wide page-section">
      <h2 data-i18n="h_recommendations">Recommendations</h2>
      <p class="muted" data-i18n="ui_recommendations_description">Operational guidance for high-reliability agent routing.</p>
      <div class="recommendation"><strong data-i18n="ui_recommend_cli">Use CLI providers for coding work.</strong><br><span class="muted" data-i18n="ui_recommend_cli_detail">They leverage local workspace context, genuine account licenses, and effort level controls.</span></div>
      <div class="recommendation"><strong data-i18n="ui_recommend_api">Use API providers for automation.</strong><br><span class="muted" data-i18n="ui_recommend_api_detail">They use explicit credentials and are suited for background services and scheduled jobs.</span></div>
      <div class="recommendation"><strong data-i18n="ui_recommend_test">Validate changes with ping-pong first.</strong><br><span class="muted" data-i18n="ui_recommend_test_detail">Run the CLI provider matrix, then an OpenAI-compatible request, then pipeline workflows.</span></div>
    </section>

    <!-- Activity Section -->
    <section id="activity-section" class="wide page-section">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
        <div>
          <h2 data-i18n="h_activity">Activity &amp; Telemetry</h2>
          <p class="muted" data-i18n="ui_activity_description">Human-readable operational journal with filtering, correlation tracking, and log export.</p>
        </div>
        <div class="play-actions">
          <button type="button" id="btn-export-activity-json"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_export_json">Export JSON</span></button>
          <button type="button" class="primary" id="btn-export-activity-md"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg><span class="action-label" data-i18n="btn_export_md">Export Markdown</span></button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 12px 0;">
        <div class="filter-chips" id="activity-level-chips" style="margin: 0;">
          <button type="button" class="filter-chip active" data-level="all" data-i18n="ui_all_events">All Events</button>
          <button type="button" class="filter-chip" data-level="info" data-i18n="level_info">Info</button>
          <button type="button" class="filter-chip" data-level="success" data-i18n="level_success">Success</button>
          <button type="button" class="filter-chip" data-level="warning" data-i18n="level_warning">Warning</button>
          <button type="button" class="filter-chip" data-level="error" data-i18n="level_error">Error</button>
        </div>
        <input type="text" id="activity-search" placeholder="Filter log entries..." data-i18n-ph="ph_filter_log" style="max-width: 240px; padding: 6px 10px;">
      </div>

      <div id="activity-log" class="activity-list" data-i18n="ui_no_events">No events yet.</div>
      <h3 style="margin-top: 24px;" data-i18n="h_request_telemetry">Request telemetry</h3>
      <div id="metrics" data-i18n="ui_no_requests">No requests yet.</div>
    </section>

    <!-- Usage Statistics Section -->
    <section id="usage-section" class="wide page-section">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 data-i18n="h_usage">Usage &amp; Analytics</h2>
          <p class="muted" data-i18n="ui_usage_description">Real-time telemetry, model breakdowns, token consumption, and cost tracking.</p>
        </div>
        <button type="button" id="btn-refresh-analytics" class="primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="btn_refresh_analytics">Refresh Analytics</span></button>
      </div>

      <div class="summary">
        <div class="summary-item"><strong id="usage-total">0</strong><span data-i18n="lbl_total_requests">Total requests</span></div>
        <div class="summary-item"><strong id="usage-success">0</strong><span data-i18n="status_successful">Successful</span></div>
        <div class="summary-item"><strong id="usage-failure">0</strong><span data-i18n="status_failed">Failed</span></div>
        <div class="summary-item"><strong id="usage-latency">-</strong><span data-i18n="lbl_average_latency">Average latency</span></div>
      </div>

      <!-- Real-time SVG Charts Grid -->
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3 data-i18n="h_request_volumes">Request Volumes &amp; Latencies</h3>
            <span class="chart-badge" data-i18n="badge_models">MODELS</span>
          </div>
          <div id="chart-requests-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3 data-i18n="h_token_cost">Token &amp; Cost Share</h3>
            <span class="chart-badge" data-i18n="badge_spend">SPEND</span>
          </div>
          <div id="chart-cost-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3 data-i18n="h_pipeline_outcomes">Pipeline Run Outcomes</h3>
            <span class="chart-badge" data-i18n="badge_pipelines">PIPELINES</span>
          </div>
          <div id="chart-pipelines-container" style="min-height: 180px;"></div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3 data-i18n="h_event_severity">Events by Severity</h3>
            <span class="chart-badge" data-i18n="badge_telemetry">TELEMETRY</span>
          </div>
          <div id="chart-activity-container" style="min-height: 180px;"></div>
        </div>
      </div>

      <h3 style="margin-top: 20px;" data-i18n="h_model_metrics">Detailed Model Metrics</h3>
      <div id="usage-table" class="model-list" data-i18n="ui_no_usage">No usage yet.</div>
    </section>

    <!-- Settings Section -->
    <section id="settings-section" class="wide page-section">
      <h2 data-i18n="h_settings">Settings</h2>
      <p class="muted" data-i18n="ui_settings_description">Configure API credentials and platform settings. Secret keys are write-only.</p>
      <section>
        <h3 data-i18n="lbl_api_credentials">API credentials</h3>
        <div id="settings-keys" data-i18n="ui_loading">Loading...</div>
      </section>
    </section>

    <!-- Help Section -->
    <section id="help-section-v2" class="wide page-section">
      <h2 data-i18n="h_help">Help and Operating Guide</h2>
      <p class="muted" data-i18n="ui_help_description">Getting started, connecting clients, and managing autonomous agent policies.</p>
      <section><h3 data-i18n="h_supported_platforms">Supported desktop platforms</h3><p><span data-i18n="help_platforms_dashboard">Conduit Bridge currently supports Windows Desktop and Linux Desktop. It needs Node.js 24 or newer. Start the bridge on the desktop and open</span> <code>http://127.0.0.1:31338/</code>.</p></section>
      <section><h3 data-i18n="h_desktop_autostart">Desktop autostart</h3><p><span data-i18n="help_after_build">After building, use</span> <code>./scripts/install-autostart.sh</code> <span data-i18n="help_linux_or">on Linux Desktop or</span> <code>powershell -ExecutionPolicy Bypass -File .\\scripts\\install-autostart.ps1</code> <span data-i18n="help_windows_start">on Windows Desktop. The bridge starts as the logged-in desktop user on</span> <code>127.0.0.1:31338</code><span data-i18n="help_see_inline">. See</span> <code>docs/guides/autostart.md</code> <span data-i18n="help_removal">for removal and troubleshooting.</span></p></section>
      <section>
        <h3 data-i18n="h_client_endpoints">Client endpoints</h3>
        <pre><span data-i18n="ui_base_url">Base URL</span>: http://127.0.0.1:31338/v1
<span data-i18n="h_models">Models</span>: GET /v1/models
<span data-i18n="lbl_status">Status</span>: GET /v1/status
Chat: POST /v1/chat/completions
<span data-i18n="ui_tools">Tools</span>: GET /v1/tools
Pipelines: GET /v1/pipelines
<span data-i18n="ui_events">Events</span>: ws://127.0.0.1:31338/v1/events</pre>
      </section>
    </section>
  </div>
</main>

<!-- Customize Navigation Modal -->
<dialog class="modal-backdrop" id="nav-modal" aria-labelledby="nav-modal-title">
  <div class="modal-dialog">
    <div class="modal-header">
      <h3 style="margin: 0;" id="nav-modal-title" tabindex="-1" autofocus data-i18n="h_customize_navigation">Customize Navigation Visibility</h3>
      <button class="modal-close" id="close-nav-modal" title="Close" data-i18n-title="ui_close" aria-label="Close" data-i18n-aria="ui_close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg></button>
    </div>
    <div class="modal-body">
      <p class="muted" style="margin: 0;" data-i18n="ui_nav_description">Choose which sections appear in the sidebar navigation. Preferences persist in local browser storage.</p>
      <div>
        <label style="font-weight: 600; color: var(--text);" data-i18n="ui_nav_presets">Presets</label>
        <div class="preset-buttons">
          <button type="button" class="preset-btn" data-preset="all" data-i18n="preset_all">All Features</button>
          <button type="button" class="preset-btn" data-preset="developer" data-i18n="preset_developer">Developer</button>
          <button type="button" class="preset-btn" data-preset="simple" data-i18n="preset_simple">Simple / Chat</button>
          <button type="button" class="preset-btn" data-preset="governance" data-i18n="preset_governance">Ops / Governance</button>
          <button type="button" class="preset-btn" data-preset="bitnet" data-i18n="preset_bitnet">BitNet Testing</button>
        </div>
      </div>
      <div>
        <label style="font-weight: 600; color: var(--text); margin-bottom: 8px;" data-i18n="ui_visible_sections">Visible Sections</label>
        <div class="nav-checkboxes" id="nav-checkboxes-container"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="reset-nav-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg><span class="action-label" data-i18n="ui_reset_defaults">Reset Defaults</span></button>
      <button type="button" class="primary" id="save-nav-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="ui_apply_prefs">Apply Preferences</span></button>
    </div>
  </div>
</dialog>

<!-- Custom Pipeline Builder Modal -->
<dialog class="modal-backdrop" id="pipeline-modal" aria-labelledby="pipeline-modal-title">
  <div class="modal-dialog" style="max-width: 740px;">
    <div class="modal-header">
      <h3 style="margin: 0;" id="pipeline-modal-title" data-i18n="h_create_pipeline">Create Custom Agent Pipeline</h3>
      <button class="modal-close" id="close-pipeline-modal" title="Close" data-i18n-title="ui_close" aria-label="Close" data-i18n-aria="ui_close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg></button>
    </div>
    <div class="modal-body">
      <label><span data-i18n="lbl_pipeline_name">Pipeline Name</span><input type="text" id="pipe-name-input" autofocus placeholder="e.g. Architect -&gt; Implement -&gt; Audit" data-i18n-ph="ph_pipeline_name"></label>
      <label><span data-i18n="lbl_description">Description</span><input type="text" id="pipe-desc-input" placeholder="Brief workflow summary" data-i18n-ph="ph_pipeline_description"></label>
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <label style="font-weight: 600; color: var(--text); margin: 0;" data-i18n="lbl_pipeline_steps">Pipeline Steps</label>
          <button type="button" id="pipe-add-step-btn" style="font-size: 0.8571rem;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_add_step">Add Step</span></button>
        </div>
        <div id="pipe-steps-container" style="display: grid; gap: 10px;"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancel-pipeline-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_cancel">Cancel</span></button>
      <button type="button" class="primary" id="save-pipeline-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="action-label" data-i18n="btn_save_pipeline">Save Pipeline</span></button>
    </div>
  </div>
</dialog>

<!-- Register Repository Modal -->
<dialog class="modal-backdrop" id="repo-modal" aria-labelledby="repo-modal-title">
  <div class="modal-dialog" style="max-width: 580px;">
    <div class="modal-header">
      <h3 style="margin: 0;" id="repo-modal-title" data-i18n="h_register_repository">Register Repository</h3>
      <button class="modal-close" id="close-repo-modal" title="Close" data-i18n-title="ui_close" aria-label="Close" data-i18n-aria="ui_close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg></button>
    </div>
    <div class="modal-body">
      <label><span data-i18n="lbl_repo_identifier">Repository Identifier (e.g. org/repo)</span><input type="text" id="repo-id-input" autofocus placeholder="acme/service-mesh" data-i18n-ph="ph_repo_id"></label>
      <label><span data-i18n="lbl_repo_name">Repository Friendly Name</span><input type="text" id="repo-name-input" placeholder="Acme Service Mesh" data-i18n-ph="ph_repo_name"></label>
      <label><span data-i18n="lbl_local_path">Local Absolute Path</span><input type="text" id="repo-path-input" placeholder="C:\\path\\to\\project" data-i18n-ph="ph_workspace_path"></label>
      <label><span data-i18n="lbl_description">Description</span><input type="text" id="repo-desc-input" placeholder="Purpose and architecture role" data-i18n-ph="ph_repo_description"></label>
      <label><span data-i18n="lbl_governance_pipeline">Assigned Governance Pipeline</span>
        <select id="repo-pipeline-select">
          <option value="standard-governance" data-i18n="pipeline_standard">Standard Governance (Impl -&gt; Review -&gt; Security -&gt; Compliance -&gt; Sign-off)</option>
          <option value="pr-review" data-i18n="pipeline_pr_review">Automated PR Review</option>
          <option value="refactoring-review" data-i18n="pipeline_refactoring">Refactoring Review</option>
          <option value="release-readiness" data-i18n="pipeline_release">Release Readiness Checklist</option>
          <option value="architecture-review" data-i18n="pipeline_architecture">Architecture &amp; Design Review</option>
          <option value="dependency-risk" data-i18n="pipeline_dependency">Dependency Risk Assessment</option>
          <option value="supply-chain-security" data-i18n="pipeline_supply_chain">Supply Chain &amp; Security Posture</option>
          <option value="doc-generation" data-i18n="pipeline_documentation">Documentation Generation</option>
        </select>
      </label>
    </div>
    <div class="modal-footer">
      <button type="button" id="cancel-repo-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg><span class="action-label" data-i18n="btn_cancel">Cancel</span></button>
      <button type="button" class="primary" id="save-repo-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span class="action-label" data-i18n="btn_register_repo">Register Repository</span></button>
    </div>
  </div>
</dialog>

<script>window.__CB_TRANSLATIONS = ${JSON.stringify(TRANSLATIONS).replace(/</g, '\\u003c')};</script>
<script>
  ${I18N_SCRIPT}
  const $ = id => document.getElementById(id);
  const toolCopyDe = ${JSON.stringify(TOOL_COPY_DE)}, systemToolCopyDe = ${JSON.stringify(SYSTEM_TOOL_COPY_DE)};
  function toolText(tool, field = 'displayName') {
    return (currentLang === 'de' ? toolCopyDe[tool.name]?.[field === 'description' ? 1 : 0] : '') || tool[field] || (field === 'description' ? t('ui_no_tool_description') : tool.name);
  }
  function systemToolText(value) { return (currentLang === 'de' ? systemToolCopyDe[value] : '') || localizedValue(value); }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  // Sidebar collapse toggle
  const sidebar = $('sidebar');
  const mainLayout = $('main-layout');
  const collapseBtn = $('sidebar-collapse-btn');

  function setNotice(render, tone = 'info') {
    $('notice').classList.toggle('error', tone === 'error');
    $('notice').classList.toggle('notice-visible', tone !== 'quiet');
    setLocalizedText($('notice'), render);
  }

  function syncSidebarExpanded() {
    const mobile = window.matchMedia?.('(max-width: 760px)').matches;
    const expanded = mobile ? sidebar.classList.contains('open') : !sidebar.classList.contains('collapsed');
    sidebar.inert = Boolean(mobile && !expanded);
    collapseBtn.setAttribute('aria-expanded', String(expanded));
    $('menu-toggle').setAttribute('aria-expanded', String(expanded));
  }
  function initSidebarCollapse() {
    const isCollapsed = localStorage.getItem('conduit_sidebar_collapsed') === 'true';
    if (isCollapsed) {
      sidebar.classList.add('collapsed');
      mainLayout.classList.add('sidebar-collapsed');
    }
    collapseBtn.addEventListener('click', () => {
      if (window.matchMedia?.('(max-width: 760px)').matches) { sidebar.classList.remove('open'); syncSidebarExpanded(); $('menu-toggle').focus(); return; }
      const collapsed = sidebar.classList.toggle('collapsed');
      mainLayout.classList.toggle('sidebar-collapsed', collapsed);
      syncSidebarExpanded();
      localStorage.setItem('conduit_sidebar_collapsed', String(collapsed));
    });
    syncSidebarExpanded();
    window.addEventListener?.('resize', syncSidebarExpanded);
  }
  initSidebarCollapse();
  ${SIDEBAR_RESIZE_SCRIPT}

  // Navigation visibility customization
  const NAV_SECTIONS = [
    { key: 'execution', label: 'ex_nav' },
    { key: 'git-workspace', label: 'gw_nav' },
    { key: 'repository-analytics', label: 'ra_nav' },
    { key: 'overview', label: 'nav_overview' },
    { key: 'platform', label: 'nav_platform' },
    { key: 'playground', label: 'nav_playground' },
    { key: 'api-providers', label: 'nav_api_providers' },
    { key: 'cli-providers', label: 'nav_cli_providers' },
    { key: 'agent-controls', label: 'nav_agent_controls' },
    { key: 'pipelines', label: 'nav_pipelines' },
    { key: 'governance', label: 'nav_governance' },
    { key: 'budgets', label: 'nav_budgets' },
    { key: 'workspaces', label: 'nav_workspaces' },
    { key: 'local-providers', label: 'nav_local_providers' },
    { key: 'models', label: 'nav_models' },
    { key: 'usage', label: 'nav_usage' },
    { key: 'orchestrator', label: 'nav_orchestrator' },
    { key: 'integration', label: 'nav_integration' },
    { key: 'recommendations', label: 'nav_recommendations' },
    { key: 'activity', label: 'nav_activity' },
    { key: 'settings', label: 'nav_settings' },
    { key: 'help', label: 'nav_help' },
  ];

  const PRESETS = {
    all: NAV_SECTIONS.map(s => s.key),
    bitnet: ['overview', 'playground', 'local-providers', 'models', 'usage', 'activity', 'settings'],
    developer: ['overview', 'platform', 'playground', 'cli-providers', 'agent-controls', 'pipelines', 'workspaces', 'models', 'integration', 'activity', 'help'],
    simple: ['overview', 'platform', 'playground', 'pipelines', 'models', 'help'],
    governance: ['overview', 'platform', 'api-providers', 'agent-controls', 'pipelines', 'governance', 'budgets', 'workspaces', 'usage', 'activity', 'settings'],
  };

  function getVisibleNavs() {
    try {
      const saved = localStorage.getItem('conduit_nav_visibility');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
      }
    } catch {}
    return new Set(PRESETS.developer);
  }

  function updateNavGroups() {
    document.querySelectorAll('#side-nav .nav-group-label').forEach(label => {
      let next = label.nextElementSibling, visible = false;
      while (next && !next.classList.contains('nav-group-label')) {
        if (next.matches('button[data-section]') && !next.hidden && next.style.display !== 'none') visible = true;
        next = next.nextElementSibling;
      }
      label.hidden = !visible;
    });
  }
  function applyNavVisibility() {
    const visible = getVisibleNavs();
    document.querySelectorAll('#side-nav button[data-section]').forEach(btn => {
      const key = btn.dataset.section;
      btn.style.display = key === 'execution' || visible.has(key) ? 'flex' : 'none';
    });
    updateNavGroups();
  }

  function openNavModal() {
    const visible = getVisibleNavs();
    const container = $('nav-checkboxes-container');
    setLocalizedHtml(container, () => NAV_SECTIONS.filter(s => !['execution','git-workspace','repository-analytics','platform','models','workspaces','settings','help'].includes(s.key)).map(s =>
      '<label class="nav-checkbox-label">' +
        '<input type="checkbox" data-nav-key="' + esc(s.key) + '"' + (visible.has(s.key) ? ' checked' : '') + '> ' +
        esc(t(s.label)) +
      '</label>'
    ).join(''));
    $('nav-modal').showModal();
  }

  $('open-nav-custom-btn').addEventListener('click', openNavModal);
  $('close-nav-modal').addEventListener('click', () => $('nav-modal').close());
  $('reset-nav-btn').addEventListener('click', () => {
    localStorage.removeItem('conduit_nav_visibility');
    applyNavVisibility();
    $('nav-modal').close();
  });

  $('save-nav-btn').addEventListener('click', () => {
    const checked = [...document.querySelectorAll('#nav-checkboxes-container input[data-nav-key]:checked')].map(cb => cb.dataset.navKey);
    localStorage.setItem('conduit_nav_visibility', JSON.stringify(checked.length ? checked : ['overview']));
    applyNavVisibility();
    $('nav-modal').close();
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
    execution: 'execution-section',
    'git-workspace': 'git-workspace',
    'repository-analytics': 'repository-analytics-section',
    overview: 'overview-section',
    platform: 'platform-section',
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

  let activeSection = 'platform';
  function showSection(name, updateLocation = true) {
    if (!Object.hasOwn(sectionIds, name)) return;
    if (updateLocation && window.location && window.location.hash !== '#' + name) window.history?.pushState(null, '', '#' + name);
    activeSection = name;
    $('ex-sidebar').hidden = name !== 'execution';
    $('ex-create-task').hidden = name !== 'execution';
    $('pf-new-chat').hidden = name === 'execution';
    if (name === 'execution') executionRefresh();
    if (name === 'git-workspace') window.gitWorkspace?.refresh();
    if (name === 'repository-analytics') loadRepositoryAnalytics();
    const section = NAV_SECTIONS.find(item => item.key === name);
    if (section) setLocalizedText($('page-title'), () => t(section.label));
    Object.entries(sectionIds).forEach(([key, id]) => {
      const el = $(id);
      if (el) el.classList.toggle('active', key === name);
    });
    document.querySelectorAll('[data-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.section === name);
    });
    sidebar.classList.remove('open');
    syncSidebarExpanded();
    if (name === 'platform') platformRefresh().catch(error => pfStatus(() => error.message, true));
    scheduleLiveRefresh();
  }

  document.querySelectorAll('[data-section]').forEach(button => {
    button.addEventListener('click', () => { showSection(button.dataset.section); if (button.dataset.section === 'platform') pfTab('chat'); });
  });

  $('menu-toggle').addEventListener('click', () => { sidebar.classList.toggle('open'); syncSidebarExpanded(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); syncSidebarExpanded(); $('menu-toggle').focus(); }
  });

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
      const entered = prompt(t('ui_auth_token_required'));
      if (!entered) throw localizedError(() => t('error_unauthorized'));
      try { sessionStorage.setItem('conduit-auth-token', entered); } catch {}
      options.headers = withAuth(options.headers);
      response = await fetch(path, options);
    }
    const data = await response.json();
    if (!response.ok) throw localizedError(() => data?.error?.message || data?.message || t('error_request_failed'));
    return data;
  }

  let models = [], capabilities = {}, knownTools = [], cachedPipelines = [];
  let cachedRepositories = [], cachedBudgets = {}, cachedWorkspaces = [], cachedAuditTrail = [];
  let cachedSystemTools = [], cachedAnalytics = {}, currentDirBrowsePath = '';
  let currentPipeCategory = 'all', currentToolFilter = 'all', currentActivityLevel = 'all';
  let activityFilterQuery = '', allActivityEvents = [];
  // Keep edits in memory until saved. Background updates must never discard a draft.
  const dirtySections = new Set();
  function markDirty(event) {
    const section = event.target.closest('.page-section');
    if (section) dirtySections.add(section.id);
  }
  document.addEventListener('input', markDirty);
  document.addEventListener('change', markDirty);

  const family = id => id.startsWith('api-') ? 'api-*' : id.startsWith('cli-') ? 'cli-*' : (id.startsWith('lmstudio/') || id.startsWith('bitnet/')) ? 'lmstudio/*' : 'other';
  const familyHelp = {'api-*':'ui_direct_apis','cli-*':'ui_local_clis','lmstudio/*':'ui_local_models','other':'ui_other'};
  const familyOrder = ['api-*','cli-*','lmstudio/*','other'];
  const providerForModel = id => id.startsWith('api-claude/') ? 'claude-api' : id.startsWith('api-gemini/') ? 'gemini-api' : id.startsWith('api-codex/') ? 'codex-api' : id.startsWith('api-openrouter/') ? 'openrouter-api' : id.startsWith('api-perplexity/') ? 'perplexity-api' : id.startsWith('cli-grok/') ? 'cli-grok' : id.startsWith('cli-codex/') ? 'cli-codex' : id.startsWith('cli-claude/') ? 'cli-claude' : id.startsWith('cli-gemini/') ? 'cli-gemini' : id.startsWith('bitnet/') ? 'bitnet' : 'lmstudio';

  function modelOptionGroups(selected) {
    const selectedIds = new Set(Array.isArray(selected) ? selected : [selected]);
    const groups = {};
    models.forEach(model => ((groups[providerForModel(model.id)] ||= []).push(model)));
    return Object.entries(groups).sort(([a],[b]) => modelPriority(a) - modelPriority(b) || a.localeCompare(b)).map(([provider, grouped]) =>
      '<optgroup label="' + esc(provider) + '">' + grouped.sort((a,b) => a.id.localeCompare(b.id)).map(model => {
        const shortName = model.id.slice(model.id.indexOf('/') + 1);
        const ctx = model.contextWindow ? (Math.round(model.contextWindow / 1000) + t('ui_context_abbr')) : '';
        const outCap = model.maxOutputTokens ? (Math.round(model.maxOutputTokens / 1000) + t('ui_output_abbr')) : '';
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
      ? (p.loginType === 'api-key' ? t('status_api_available') : p.loginType === 'cli' ? t('status_cli_authenticated') : t('status_local_available'))
      : (p.loginType === 'api-key' ? t('status_no_api_credential') : p.loginType === 'cli' ? (p.credentialSource === 'CLI not installed' ? t('status_cli_install') : t('status_cli_login')) : t('status_local_unavailable'));
  }

  function renderProviderGroup(items, type, target) {
    const group = items.filter(provider => provider.loginType === type);
    setLocalizedHtml($(target), () => group.length ? '<div class="provider-block">' + group.map(provider =>
      '<div class="provider"><div class="status"><span class="dot ' + stateClass(provider) + '"></span>' + esc(provider.name) + '</div>' +
      '<small>' + esc(stateText(provider)) + (provider.credentialSource ? ' · ' + esc(localizedValue(provider.credentialSource)) : '') + ' · ' + esc(provider.models.length) + (' ' + esc(t('ui_models_registered')) + '</small></div>')
    ).join('') + '</div>' : ('<span class="muted">' + esc(t('ui_no_providers')) + '</span>'));
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
    setLocalizedHtml($('play-model'), () => modelOptionGroups(selectedPlayModel || preferredModels(items)[0]?.id || ''));
    updateEffortOptions();

    const query = ($('model-search')?.value || '').trim().toLowerCase();
    const transport = $('model-transport-filter').value;
    const providerFilter = $('model-provider-filter');
    const selectedProvider = providerFilter.value;
    const providerCounts = {};
    items.forEach(model => { const p = providerForModel(model.id); providerCounts[p] = (providerCounts[p] || 0) + 1; });
    setLocalizedHtml(providerFilter, () => ('<option value="">' + esc(t('ui_all_providers')) + '</option>') + Object.entries(providerCounts).sort(([a],[b]) => a.localeCompare(b)).map(([p,c]) => '<option value="' + esc(p) + '">' + esc(p) + ' (' + c + ')</option>').join(''));
    if (providerCounts[selectedProvider]) providerFilter.value = selectedProvider;
    const provider = providerFilter.value;

    const visible = items.filter(model => {
      const routeProvider = providerForModel(model.id);
      return (!query || model.id.toLowerCase().includes(query) || String(model.owned_by || '').toLowerCase().includes(query) || routeProvider.toLowerCase().includes(query)) &&
        (!transport || family(model.id) === transport) && (!provider || routeProvider === provider);
    });
    setLocalizedText($('model-count'), () => visible.length + (' ' + t('ui_of') + ' ') + items.length + (' ' + t('ui_models_count')));
    const familyCounts = {}; visible.forEach(model => { const name = family(model.id); familyCounts[name] = (familyCounts[name] || 0) + 1; });
    setLocalizedHtml($('model-summary'), () => familyOrder.filter(name => familyCounts[name]).map(name => '<span><strong>' + esc(name) + '</strong> ' + familyCounts[name] + ' · ' + esc(t(familyHelp[name])) + '</span>').join(''));

    const groups = {};
    visible.forEach(model => (((groups[family(model.id)] ||= {})[providerForModel(model.id)] ||= []).push(model)));
    const expand = Boolean(query || transport || provider);
    setLocalizedHtml($('model-list'), () => familyOrder.filter(name => groups[name]).map(name => {
      const providerGroups = Object.entries(groups[name]).sort(([a],[b]) => a.localeCompare(b));
      return '<div class="model-transport-group"><h3><span>' + esc(t(familyHelp[name])) + ' <code>' + esc(name) + '</code></span><small>' + familyCounts[name] + (' ' + t('ui_models_across') + ' ') + providerGroups.length + (' ' + esc(t('ui_providers_count')) + '</small></h3>') + providerGroups.map(([routeProvider, grouped]) => {
        const providerStatus = (lastProviders || []).find(item => item.name === routeProvider);
        const ready = Boolean(providerStatus?.connected);
        const providerState = ready ? t('status_ready') : t('status_unavailable');
        const ordered = grouped.sort((a,b) => a.id.localeCompare(b.id));
        return '<details class="model-provider-group"' + (expand || ordered.length <= 8 ? ' open' : '') + '><summary><span><strong>' + esc(routeProvider) + ('</strong><small>' + esc(t('ui_route_through')) + ' ') + esc(t(familyHelp[name])) + '</small></span><span class="provider-state ' + (ready ? 'ready' : 'unavailable') + '">' + esc(providerState) + '</span><span>' + ordered.length + (' ' + esc(t('ui_models_count')) + '</span></summary><div class="model-provider-models">') + ordered.map(model => {
          const target = model.id.slice(model.id.indexOf('/') + 1);
          const source = model.conduit?.source || model.source || model.owned_by || t('ui_provider_catalog');
          const availability = model.conduit?.availability || model.availability || 'dynamic';
          const ctxInfo = model.contextWindow ? (' · ' + Math.round(model.contextWindow/1000) + t('ui_context_abbr')) : '';
          return '<div class="model-row"><div><strong>' + esc(target) + '</strong><code>' + esc(model.id) + '</code></div><span class="model-meta">' + esc(localizedValue(availability)) + ' · ' + esc(localizedValue(source)) + esc(ctxInfo) + '</span><button type="button" data-use-model="' + esc(model.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' + '<span class="action-label">' + esc(t('btn_use_playground')) + '</span>' + '</button></div>');
        }).join('') + '</div></details>';
      }).join('') + '</div>';
    }).join('') || ('<span class="muted">' + esc(t('ui_no_models_match')) + '</span>'));
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
    ).join('') || ('<span class="muted" style="font-size:0.8571rem;">' + esc(t('ui_no_restrictions')) + '</span>');

    const accordionHtml = categories.map(cat => {
      const toolsInCat = knownTools.filter(tool => tool.category === cat);
      if (!toolsInCat.length) return '';
      const restrictedCount = toolsInCat.filter(tool => selectedTools.has(tool.name)).length;
      return '<div class="tool-cat-block" data-cat-block="' + esc(localizedValue(cat)) + '">' +
        '<div class="tool-cat-title" onclick="this.parentElement.classList.toggle(\\'open\\')">' +
          '<span>' + esc(localizedValue(cat)) + '</span>' +
          '<span class="cat-badge">' + restrictedCount + (' ' + t('ui_of') + ' ') + toolsInCat.length + (' ' + esc(t('ui_restricted')) + '</span>') +
        '</div>' +
        '<div class="tool-pills-list">' +
          toolsInCat.map(tool => {
            const isSelected = selectedTools.has(tool.name);
            const tagClass = tool.mutating ? 'mutating' : 'readonly';
            const tagLabel = tool.mutating ? t('badge_mutating') : t('badge_readonly');
            return '<button type="button" class="tool-pill' + (isSelected ? ' selected' : '') + '" ' +
              'data-tool-name="' + esc(tool.name) + '" ' +
              'data-tool-provider="' + esc(providerName) + '" ' +
              'title="' + esc(toolText(tool, 'description')) + ' (' + (tool.mutating ? t('ui_mutating_state') : t('ui_read_only')) + ')">' +
              '<span class="pill-tag ' + tagClass + '">' + tagLabel + '</span>' +
              '<span>' + esc(tool.name) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="tool-picker-container" data-picker-for="' + esc(providerName) + '">' +
      '<div class="tool-picker-top">' +
        ('<span style="font-size: 0.8571rem; font-weight: 600; color: var(--text);">' + esc(t('lbl_disallowed_tools')) + '</span>') +
        '<div class="tool-picker-actions">' +
          '<button type="button" data-tool-action="mutating" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + ('>' + '<span class="action-label">' + esc(t('btn_restrict_mutating')) + '</span>' + '</button>') +
          '<button type="button" data-tool-action="all" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + ('>' + '<span class="action-label">' + esc(t('btn_select_all')) + '</span>' + '</button>') +
          '<button type="button" data-tool-action="clear" data-target="' + esc(providerName) + '"' + (isCli ? '' : ' disabled') + ('>' + '<span class="action-label">' + esc(t('btn_clear_all')) + '</span>' + '</button>') +
        '</div>' +
      '</div>' +
      '<input type="hidden" name="disallowedTools" value="' + esc(disallowedCsv || '') + '">' +
      '<div class="tool-chips-area" data-chips-for="' + esc(providerName) + '">' + chipsHtml + '</div>' +
      '<div class="tool-categories-accordion" data-accordion-for="' + esc(providerName) + '">' + accordionHtml + '</div>' +
    '</div>';
  }

  function updateToolPickerUi(providerName, newSet) {
    dirtySections.add('agent-controls-section');
    const picker = document.querySelector('[data-picker-for="' + providerName + '"]');
    if (!picker) return;
    const csv = Array.from(newSet).sort().join(',');
    picker.querySelector('input[name="disallowedTools"]').value = csv;

    const chipsArea = picker.querySelector('[data-chips-for="' + providerName + '"]');
    if (chipsArea) {
      setLocalizedHtml(chipsArea, () => Array.from(newSet).sort().map(tool =>
        '<span class="tool-chip"><span>' + esc(tool) + '</span><button type="button" class="chip-del" data-remove-tool="' + esc(tool) + '" data-for-provider="' + esc(providerName) + '">&times;</button></span>'
      ).join('') || ('<span class="muted" style="font-size:0.8571rem;">' + esc(t('ui_no_restrictions')) + '</span>'));
    }

    picker.querySelectorAll('.tool-pill').forEach(pill => {
      const name = pill.dataset.toolName;
      pill.classList.toggle('selected', newSet.has(name));
    });

    picker.querySelectorAll('.tool-cat-block').forEach(block => {
      const cat = block.dataset.catBlock;
      const toolsInCat = knownTools.filter(tool => tool.category === cat);
      const restricted = toolsInCat.filter(tool => newSet.has(tool.name)).length;
      const badge = block.querySelector('.cat-badge');
      if (badge) setLocalizedText(badge, () => restricted + (' ' + t('ui_of') + ' ') + toolsInCat.length + (' ' + t('ui_restricted')));
    });
  }

  function renderAgentPolicies(data) {
    if (dirtySections.has('agent-controls-section')) return;
    const list = $('agent-policy-list');
    if (!list) return;
    const policies = data?.policies || {};
    const entries = Object.entries(policies);
    if (!entries.length) { setLocalizedHtml(list, () => '<span class="muted">' + esc(t('ui_no_policies')) + '</span>'); return; }

    setLocalizedHtml(list, () => entries.map(([name, p]) => {
      const isCli = Boolean(p.hasAgentCapability);
      const badgeClass = isCli ? (p.agentEnabled ? 'ok' : 'warn') : 'muted';
      const badgeText = isCli ? (p.agentEnabled ? t('status_agent_enabled') : t('status_agent_disabled')) : t('status_inference_only');
      return '<div class="provider-block" data-policy-card="' + esc(name) + '">' +
        '<h3><span>' + esc(name) + '</span><span class="setting-badge ' + badgeClass + '">' + esc(badgeText) + '</span></h3>' +
        '<form class="policy-form" data-policy-provider="' + esc(name) + '">' +
          '<div class="policy-controls-row">' +
            ('<label><span>' + esc(t('lbl_agent_mode')) + '</span><select name="agentEnabled"') + (isCli ? '' : ' disabled') + '>' +
              '<option value="true"' + (p.agentEnabled ? ' selected' : '') + ('>' + esc(t('ui_agent_allowed')) + '</option>') +
              '<option value="false"' + (!p.agentEnabled ? ' selected' : '') + ('>' + esc(t('ui_agent_blocked')) + '</option>') +
            '</select></label>' +
            ('<label><span>' + esc(t('lbl_default_run_mode')) + '</span><select name="defaultMode">') +
              (p.supportedModes || ['chat']).map(m => '<option value="' + esc(m) + '"' + (p.defaultMode === m ? ' selected' : '') + '>' + esc(localizedValue(m)) + '</option>').join('') +
            '</select></label>' +
            '<div class="play-actions"><button type="submit" class="primary"' + (isCli ? '' : ' disabled') + ('>' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' + '<span class="action-label">' + esc(t('btn_save_policy')) + '</span>' + '</button><span class="muted" data-feedback-for="') + esc(name) + '"></span></div>' +
          '</div>' +
          (isCli ? renderToolPicker(name, p.disallowedTools, isCli) : '') +
        '</form>' +
      '</div>';
    }).join(''));

    list.querySelectorAll('form[data-policy-provider]').forEach(form => form.addEventListener('submit', saveAgentPolicy));

    // Handle tool clicks and quick action buttons
    list.onclick = event => {
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
          set = new Set(knownTools.map(tool => tool.name));
        } else if (action === 'mutating') {
          set = new Set(knownTools.filter(tool => tool.mutating).map(tool => tool.name));
        } else if (action === 'clear') {
          set = new Set();
        }
        updateToolPickerUi(provider, set);
      }
    };
  }

  async function saveAgentPolicy(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const provider = form.dataset.policyProvider;
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector('[data-feedback-for="' + provider + '"]');
    button.disabled = true;
    if (feedback) setLocalizedText(feedback, () => t('status_saving'));
    try {
      const agentEnabled = form.querySelector('[name="agentEnabled"]').value === 'true';
      const defaultMode = form.querySelector('[name="defaultMode"]').value;
      const disallowedTools = (form.querySelector('[name="disallowedTools"]')?.value || '').trim();
      await request('/v1/settings/agent-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, agentEnabled, defaultMode, disallowedTools }),
      });
      if (feedback) setLocalizedText(feedback, () => t('status_saved'));
      setNotice(() => (t('ui_policy_saved_for') + ' ') + provider, 'info');
      await refresh();
    } catch (error) {
      if (feedback) setLocalizedText(feedback, () => error.message);
      setNotice(() => error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  // Pipelines Subsystem UI
  function pipelineRunName(run) { return pipelineText(cachedPipelines.find(pipe => pipe.id === run.pipelineId)) || run.pipelineName; }
  function renderPipelines(pipelines) {
    cachedPipelines = pipelines || [];
    const select = $('pipe-run-select');
    if (select) {
      const prev = select.value;
      setLocalizedHtml(select, () => cachedPipelines.map(p => '<option value="' + esc(p.id) + '">' + esc(pipelineText(p)) + '</option>').join(''));
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
      setLocalizedHtml(container, () => '<span class="muted">' + esc(t('ui_no_pipelines')) + '</span>');
      return;
    }

    setLocalizedHtml(container, () => filtered.map(pipe => {
      const stepsHtml = (pipe.steps || []).map((step, idx) => {
        const isCheckpoint = Boolean(step.requiresApproval);
        return '<div class="pipeline-step-pill">' +
          '<span class="step-badge">' + (idx + 1) + '</span>' +
          '<strong>' + esc(pipelineText(pipe, 'name', step)) + '</strong>' +
          '<span class="step-meta">[' + esc(step.model) + ' · ' + esc(localizedValue(step.mode || 'chat')) + ']</span>' +
          '<span class="step-meta">' + (step.dependsOn?.length ? (t('ui_after') + ' ') + step.dependsOn.map(esc).join(', ') : t('ui_start_step')) + '</span>' +
          (isCheckpoint ? ('<span class="checkpoint-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' + ' ' + esc(t('ui_approval_gate')) + '</span>') : '') +
        '</div>';
      }).join('');

      return '<div class="pipeline-card" data-pipe-id="' + esc(pipe.id) + '">' +
        '<div class="pipeline-header">' +
          '<div>' +
            '<h3 style="margin: 0 0 4px; color: var(--text);">' + esc(pipelineText(pipe)) + (pipe.isBuiltIn ? (' <span class="setting-badge info">' + esc(t('ui_built_in')) + '</span>') : '') + '</h3>' +
            '<span class="muted" style="font-size: 0.9286rem;">' + esc(pipelineText(pipe, 'description')) + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="primary" data-run-pipe="' + esc(pipe.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>' + '<span class="action-label">' + esc(t('btn_select_run')) + '</span>' + '</button>') +
            (!pipe.isBuiltIn ? '<button type="button" class="danger" data-del-pipe="' + esc(pipe.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg>' + '<span class="action-label">' + esc(t('btn_delete')) + '</span>' + '</button>') : '') +
          '</div>' +
        '</div>' +
        '<div class="pipeline-steps-flow">' + stepsHtml + '</div>' +
      '</div>';
    }).join(''));
  }

  function renderPipelineRuns(runs) {
    cachedRuns = runs || [];
    const approvals = $('pipeline-approvals');
    if (approvals) setLocalizedHtml(approvals, () => cachedRuns.filter(run => run.status === 'waiting_approval').map(run =>
      '<div class="activity-event warning run-history-item"><span><strong>' + esc(pipelineRunName(run)) + ('</strong><br>' + esc(t('ui_step_colon')) + ' ') + esc(run.pendingApprovalStepId || 'pending') + '</span><button type="button" data-view-run="' + esc(run.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 0 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' + '<span class="action-label">' + esc(t('btn_review_approval')) + '</span>' + '</button></div>')
    ).join('') || ('<span class="muted">' + esc(t('ui_no_approvals')) + '</span>'));
    const selected = cachedRuns.find(run => run.id === selectedRunId);
    if (selected) renderLiveRun(selected);
    const container = $('pipelines-history');
    if (!container) return;
    if (!runs || !runs.length) {
      setLocalizedHtml(container, () => '<span class="muted">' + esc(t('ui_no_runs')) + '</span>');
      return;
    }

    setLocalizedHtml(container, () => runs.map(run => {
      const statusClass = run.status === 'completed' ? 'success' : (run.status === 'waiting_approval' ? 'warning' : (run.status === 'running' ? 'info' : 'error'));
      return '<div class="activity-event run-history-item ' + statusClass + '">' +
        '<span>' +
          '<time>' + new Date(run.startedAt).toLocaleString(currentLang) + '</time><br>' +
          '<strong class="level">' + esc(localizedValue(run.status.toUpperCase())) + '</strong> · ' +
          esc(pipelineRunName(run)) + (run.initialPrompt ? ': "' + esc(run.initialPrompt.slice(0, 80)) + (run.initialPrompt.length > 80 ? '...' : '') + '"' : (' ' + t('ui_saved_summary_only'))) +
        '</span><button type="button" data-view-run="' + esc(run.id) + ('">' + '<span class="action-label">' + esc(t('btn_view_run')) + '</span>' + '</button>') +
      '</div>';
    }).join(''));
  }

  let cachedRuns = [], activePipelineRun = null;
  let selectedRunId = sessionStorage.getItem('conduit-selected-run') || '';
  async function openRun(runId) {
    try {
      const result = await request('/v1/pipelines/runs/' + encodeURIComponent(runId));
      renderLiveRun(result.run);
      $('pipe-live-status').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setNotice(() => error.message, 'error'); }
  }
  for (const id of ['pipelines-history', 'pipeline-approvals']) {
    $(id).addEventListener('click', event => {
      const button = event.target.closest('[data-view-run]');
      if (button) openRun(button.dataset.viewRun);
    });
  }
  function renderLiveRun(run) {
    if (run && activePipelineRun && JSON.stringify(run) === JSON.stringify(activePipelineRun)) return;
    const feedbackDraft = run?.id === activePipelineRun?.id ? $('checkpoint-feedback')?.value || '' : '';
    activePipelineRun = run;
    if (run) {
      selectedRunId = run.id;
      sessionStorage.setItem('conduit-selected-run', run.id);
    }
    const box = $('pipe-live-status');
    if (!box) return;
    if (!run) { box.innerHTML = ''; return; }

    setLocalizedHtml(box, () => {
    const statusBadge = run.status === 'completed'
      ? ('<span class="setting-badge ok">' + esc(t('status_completed')) + '</span>')
      : (run.status === 'waiting_approval'
        ? ('<span class="setting-badge warn">' + esc(t('ui_awaiting_operator')) + '</span>')
        : (run.status === 'running'
          ? ('<span class="setting-badge info">' + esc(t('status_running')) + '</span>')
          : '<span class="setting-badge bad">' + esc(localizedValue(run.status.toUpperCase())) + '</span>'));

    let checkpointAlert = '';
    if (run.status === 'waiting_approval' && run.pendingApprovalStepId) {
      const stepName = run.stepResults[run.pendingApprovalStepId]?.stepName || run.pendingApprovalStepId;
      checkpointAlert = '<div class="checkpoint-banner">' +
        ('<div><strong>' + esc(t('ui_checkpoint_reached')) + '</strong>' + ' ' + esc(t('ui_step')) + ' ' + '<code>') + esc(stepName) + ('</code>' + ' ' + esc(t('ui_requires_authorization')) + '</div>') +
        ('<input type="text" id="checkpoint-feedback" placeholder="' + esc(t('ui_optional_feedback')) + '">') +
        '<div style="display: flex; gap: 8px;">' +
          ('<button type="button" class="success" id="btn-approve-step">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 0 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' + '<span class="action-label">' + esc(t('btn_approve')) + '</span>' + '</button>') +
          ('<button type="button" class="danger" id="btn-reject-step">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>' + '<span class="action-label">' + esc(t('btn_reject')) + '</span>' + '</button>') +
        '</div>' +
      '</div>';
    }

    const stepsDetail = Object.values(run.stepResults || {}).map(step => {
      const badge = step.status === 'completed'
        ? ('<span class="setting-badge ok">' + esc(t('ui_done_latency'))) + (step.latencyMs || 0) + ' ms)</span>'
        : (step.status === 'waiting_approval'
          ? ('<span class="setting-badge warn">' + esc(t('ui_paused_checkpoint')) + '</span>')
          : (step.status === 'running'
            ? ('<span class="setting-badge info">' + esc(t('ui_in_flight')) + '</span>')
            : '<span class="setting-badge bad">' + esc(localizedValue(step.status.toUpperCase())) + '</span>'));

      return '<div class="step-result-card ' + esc(step.status) + '">' +
        '<div class="step-result-header">' +
          '<strong>' + esc(pipelineText(cachedPipelines.find(pipe => pipe.id === run.pipelineId), 'name', step)) + ' <small class="muted">(' + esc(step.model) + ')</small></strong>' +
          badge +
        '</div>' +
        (step.content ? '<div class="step-result-content">' + esc(step.content) + '</div>' : '') +
        (step.error ? '<div class="step-result-content" style="color: var(--bad);">' + esc(step.error) + '</div>' : '') +
      '</div>';
    }).join('');

    return '<div style="margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px;">' +
      '<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 8px;">' +
        ('<strong>' + esc(t('ui_run_status')) + ' ') + esc(pipelineRunName(run)) + '</strong>' +
        statusBadge +
      '</div>' +
      ('<div class="muted">' + esc(t('ui_run')) + ' ') + esc(run.id) + (run.error ? ' · ' + esc(run.error) : '') + '</div>' +
      (!run.initialPrompt ? ('<p class="muted">' + esc(t('ui_saved_run_description')) + '</p>') : '') +
      (run.status === 'interrupted' ? ('<p>' + esc(t('ui_interrupted_run_description')) + '</p><button type="button" id="btn-prepare-run">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' + '<span class="action-label">' + esc(t('btn_prepare_run')) + '</span>' + '</button>') : '') +
      (['running', 'waiting_approval'].includes(run.status) ? ('<button type="button" class="danger" id="btn-cancel-run">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>' + '<span class="action-label">' + esc(t('btn_cancel_run')) + '</span>' + '</button>') : '') +
      checkpointAlert +
      '<div style="display: grid; gap: 8px;">' + stepsDetail + '</div>' +
    '</div>';
    });
    if ($('checkpoint-feedback')) $('checkpoint-feedback').value = feedbackDraft;
    $('btn-prepare-run')?.addEventListener('click', () => {
      $('pipe-run-select').value = run.pipelineId;
      $('pipe-run-prompt').value = '';
      $('pipe-run-prompt').focus();
      setNotice(() => t('ui_prepare_run_guidance'), 'info');
    });
    $('btn-cancel-run')?.addEventListener('click', async event => {
      const cancelButton = event.currentTarget;
      cancelButton.disabled = true;
      try {
        const result = await request('/v1/pipelines/runs/action', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: run.id, action: 'cancel' })
        });
        renderLiveRun(result.run);
        scheduleLiveRefresh();
      } catch (error) { setNotice(() => error.message, 'error'); cancelButton.disabled = false; }
    });

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
          alert((t('error_approval') + ' ') + err.message);
          approveBtn.disabled = false;
        }
      });
    }

    const rejectBtn = $('btn-reject-step');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async () => {
        rejectBtn.disabled = true;
        const feedback = $('checkpoint-feedback')?.value || t('ui_rejected_operator');
        try {
          const res = await request('/v1/pipelines/runs/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: run.id, action: 'reject', feedback }),
          });
          renderLiveRun(res.run);
          await refresh();
        } catch (err) {
          alert((t('error_rejection') + ' ') + err.message);
          rejectBtn.disabled = false;
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
      alert(t('error_select_pipeline_prompt'));
      return;
    }
    const btn = $('pipe-run-btn');
    btn.disabled = true;
    setLocalizedText(btn, () => t('status_executing'));
    try {
      const res = await request('/v1/pipelines/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineId, prompt, repository, workingDirectory }),
      });
      renderLiveRun(res.run);
      await refresh();
    } catch (err) {
      alert((t('error_pipeline_execution') + ' ') + err.message);
    } finally {
      btn.disabled = false;
      setLocalizedText(btn, () => t('btn_execute_pipeline'));
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
      if (!confirm(t('confirm_delete_pipeline'))) return;
      try {
        await request('/v1/pipelines/' + pipeId, { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert((t('error_delete_failed') + ' ') + err.message);
      }
    }
  });

  // Pipeline Builder Modal
  let effortControlSequence = 0;
  function addStepToBuilder(step) {
    const container = $('pipe-steps-container');
    const idx = container.children.length + 1;
    const s = step || {
      id: 'step-' + idx,
      name: (t('ui_step') + ' ') + idx,
      model: preferredModels(models)[0]?.id || 'cli-claude/claude-sonnet-5',
      mode: 'chat',
      requiresApproval: false,
      promptTemplate: '{{prompt}}',
    };

    const row = document.createElement('div');
    row.className = 'provider-block model-effort-pair';
    const effortId = 'step-effort-' + (++effortControlSequence);
    row.style.margin = '0';
    row.style.padding = '12px';
    setLocalizedHtml(row, () => '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
      ('<strong>' + esc(t('ui_step')) + ' ') + idx + '</strong>' +
      '<button type="button" class="modal-close" style="color: var(--bad);" title="' + esc(t('btn_remove_step')) + '" aria-label="' + esc(t('btn_remove_step')) + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg></button>' +
    '</div>' +
    '<div class="pipeline-step-fields">' +
      ('<label><span>' + esc(t('lbl_step_name')) + '</span><input type="text" class="step-name-inp" value="') + esc(s.name) + '"></label>' +
      ('<label><span>' + esc(t('lbl_model')) + '</span><select class="step-model-inp">') + modelOptionGroups(s.model) + '</select></label>' + effortControlHtml(effortId,'.step-model-inp',s.effort || '','','',s.fastMode) +
      ('<label><span>' + esc(t('lbl_mode')) + '</span><select class="step-mode-inp">') +
        '<option value="chat"' + (s.mode === 'chat' ? ' selected' : '') + ('>' + esc(t('mode_chat')) + '</option>') +
        '<option value="plan"' + (s.mode === 'plan' ? ' selected' : '') + ('>' + esc(t('mode_plan')) + '</option>') +
        '<option value="agent"' + (s.mode === 'agent' ? ' selected' : '') + ('>' + esc(t('mode_agent')) + '</option>') +
      '</select></label>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">' +
      '<label class="nav-checkbox-label" style="font-size: 0.8571rem;">' +
        '<input type="checkbox" class="step-approval-inp"' + (s.requiresApproval ? ' checked' : '') + ('>' + ' ' + esc(t('lbl_approval_checkpoint'))) +
      '</label>' +
    '</div>' +
    '<label><span>' + esc(t('lbl_prompt_template')) + '</span>' +
      '<textarea class="step-prompt-inp" style="min-height: 56px;">' + esc(s.promptTemplate || '{{prompt}}') + '</textarea>' +
    '</label>');

    row.querySelector('.modal-close').addEventListener('click', () => row.remove());
    container.appendChild(row);
    syncEffortControls(row);
  }

  $('btn-open-create-pipeline').addEventListener('click', () => {
    $('pipe-name-input').value = '';
    $('pipe-desc-input').value = '';
    $('pipe-steps-container').innerHTML = '';
    addStepToBuilder();
    $('pipeline-modal').showModal();
  });
  $('close-pipeline-modal').addEventListener('click', () => $('pipeline-modal').close());
  $('cancel-pipeline-btn').addEventListener('click', () => $('pipeline-modal').close());
  $('pipe-add-step-btn').addEventListener('click', () => addStepToBuilder());

  $('save-pipeline-btn').addEventListener('click', async () => {
    const name = $('pipe-name-input').value.trim();
    const description = $('pipe-desc-input').value.trim();
    if (!name) { alert(t('error_pipeline_name')); return; }

    const stepRows = document.querySelectorAll('#pipe-steps-container > .provider-block');
    if (!stepRows.length) { alert(t('error_pipeline_steps')); return; }

    const steps = [...stepRows].map((row, idx) => ({
      id: 'step-' + (idx + 1),
      name: row.querySelector('.step-name-inp').value.trim() || ((t('ui_step') + ' ') + (idx + 1)),
      model: row.querySelector('.step-model-inp').value,
      effort: row.querySelector('.effort-value').value || undefined, fastMode: row.querySelector('.effort-fast-value').value === 'true',
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
      $('pipeline-modal').close();
      await refresh();
    } catch (err) {
      alert((t('error_save_failed') + ' ') + err.message);
    }
  });

  // Telemetry, Metrics, Usage, Settings
  function renderMetrics(data) {
    const rows = Object.entries(data.models || {}).sort((a,b) => (b[1].requests || 0) - (a[1].requests || 0));
    setLocalizedHtml($('metrics'), () => rows.length
      ? '<div class="model-list">' + rows.map(([model, m]) =>
          '<div><code>' + esc(model) + '</code> · ' + m.successes + '/' + m.requests + (' ' + t('ui_successful_count') + ' ') + (m.averageLatencyMs ?? '-') + (' ' + t('ui_average_ms') + ' ') + m.inFlight + (' ' + t('ui_active_count')) + (m.lastError ? (' · <span class="muted">' + esc(t('ui_last_error')) + ' ') + esc(m.lastError) + '</span>' : '') + '</div>'
        ).join('') + '</div>'
      : t('ui_no_requests'));
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
        ['traceId', 'runId', 'stepId', 'provider', 'model', 'status'].some(key => String(e[key] || '').toLowerCase().includes(q))
      );
    }

    if (!filtered.length) {
      setLocalizedHtml(container, () => t('ui_no_matching_events'));
      return;
    }

    setLocalizedHtml(container, () => filtered.slice(0, 100).map(event =>
      '<div class="activity-event ' + esc(localizedValue(event.level)) + '">' +
        '<time>' + new Date(event.time).toLocaleTimeString(currentLang) + '</time>' +
        '<span class="scope">' + esc(event.scope) + '</span>' +
        '<span>' +
          '<strong class="level">' + esc(localizedValue(event.level)) + '</strong> · ' +
          esc(event.message) +
          ['traceId', 'runId', 'stepId', 'provider', 'model', 'status', 'attempt', 'durationMs'].filter(key => event[key] !== undefined).map(key => ' <code class="trace-pill">' + key + ':' + esc(event[key]) + '</code>').join('') +
        '</span>' +
      '</div>'
    ).join(''));
  }

  function renderSystemTools(tools) {
    cachedSystemTools = tools || [];
    const container = $('system-tools-list');
    if (!container) return;
    const sys = cachedSystemTools;
    if (!sys.length) {
      setLocalizedHtml(container, () => '<span class="muted">' + esc(t('ui_no_system_tools')) + '</span>');
      return;
    }
    setLocalizedHtml(container, () => '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">' +
      sys.map(tool => {
        const isAvail = Boolean(tool.available !== false && (tool.available || tool.detected));
        const displayName = tool.name || tool.displayName || tool.executable;
        const binPath = tool.path || tool.binaryPath || 'PATH';
        const risk = tool.riskLevel || 'Low';
        const riskClass = /^(critical|high)$/i.test(risk) ? 'bad' : (/^medium$/i.test(risk) ? 'warn' : 'ok');
        return '<div class="provider-block" style="padding: 10px; margin: 0;">' +
          '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">' +
            '<strong>' + esc(systemToolText(displayName)) + '</strong>' +
            '<span class="setting-badge ' + (isAvail ? 'ok' : 'bad') + '">' + (isAvail ? t('status_available') : t('status_missing')) + '</span>' +
          '</div>' +
          '<div class="muted" style="font-size: 0.8571rem; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + esc(binPath) + '">' + esc(binPath) + '</div>' +
          '<div style="display: flex; gap: 6px; margin-top: 6px; font-size: 0.8rem;">' +
            '<span class="setting-badge info">' + esc(systemToolText(tool.category || tool.classification || t('group_system'))) + '</span>' +
            '<span class="setting-badge ' + riskClass + ('">' + esc(t('ui_risk')) + ' ') + esc(localizedValue(risk)) + '</span>' +
            (tool.version ? '<span class="setting-badge muted">' + esc(tool.version) + '</span>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>');
  }

  function renderToolCatalog(filterClass) {
    if (filterClass) currentToolFilter = filterClass;
    const container = $('tool-catalog-container');
    if (!container) return;
    let list = knownTools || [];
    if (currentToolFilter && currentToolFilter !== 'all') {
      list = list.filter(tool => tool.classification === currentToolFilter);
    }
    if (!list.length) {
      setLocalizedHtml(container, () => '<span class="muted">' + esc(t('ui_no_tools_match')) + '</span>');
      return;
    }

    setLocalizedHtml(container, () => list.map(tool => {
      const riskClass = /^(critical|high)$/i.test(tool.riskLevel) ? 'bad' : (/^medium$/i.test(tool.riskLevel) ? 'warn' : 'ok');
      return '<div class="tool-card">' +
        '<div class="tool-card-title">' +
          '<div>' +
            '<strong>' + esc(toolText(tool)) + '</strong> ' +
            '<code>' + esc(tool.name) + '</code>' +
          '</div>' +
          '<span class="setting-badge ' + riskClass + ('">' + esc(t('ui_risk')) + ' ') + esc(localizedValue(tool.riskLevel || 'Low')) + '</span>' +
        '</div>' +
        '<div class="tool-card-badges">' +
          '<span class="setting-badge info">' + esc(localizedValue(tool.classification || t('ui_operation'))) + '</span>' +
          '<span class="setting-badge muted">' + esc(localizedValue(tool.category || 'general')) + '</span>' +
          (tool.mutating ? ('<span class="setting-badge warn">' + esc(t('ui_workspace_mutating')) + '</span>') : ('<span class="setting-badge ok">' + esc(t('ui_read_only')) + '</span>')) +
        '</div>' +
        '<p class="tool-card-desc">' + esc(toolText(tool, 'description')) + '</p>' +
      '</div>';
    }).join(''));
  }

  function renderGovernance(repos, audits) {
    cachedRepositories = repos || [];
    cachedAuditTrail = audits || [];

    const repoSelect = $('pipe-run-repo');
    if (repoSelect) {
      const prev = repoSelect.value;
      setLocalizedHtml(repoSelect, () => ('<option value="">' + esc(t('ui_default_global')) + '</option>') +
        cachedRepositories.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + ' (' + esc(r.id) + ')</option>').join(''));
      if (prev && cachedRepositories.some(r => r.id === prev)) repoSelect.value = prev;
    }

    const repoTableContainer = $('repos-table-container');
    if (repoTableContainer) {
      if (!cachedRepositories.length) {
        setLocalizedHtml(repoTableContainer, () => '<span class="muted">' + esc(t('ui_no_repositories')) + '</span>');
      } else {
        setLocalizedHtml(repoTableContainer, () => '<table class="data-table">' +
          '<thead><tr>' +
            ('<th>' + esc(t('lbl_repository_table')) + '</th>') +
            ('<th>' + esc(t('lbl_local_path_table')) + '</th>') +
            ('<th>' + esc(t('lbl_assigned_pipeline')) + '</th>') +
            ('<th>' + esc(t('lbl_policy_overrides')) + '</th>') +
            ('<th>' + esc(t('lbl_actions')) + '</th>') +
          '</tr></thead>' +
          '<tbody>' +
          cachedRepositories.map(r =>
            '<tr>' +
              '<td><strong>' + esc(r.name || r.id) + '</strong><br><small class="muted"><code>' + esc(r.id) + '</code></small></td>' +
              '<td style="font-family: monospace; font-size: 0.8571rem;">' + esc(r.path) + '</td>' +
              '<td><span class="setting-badge info">' + esc(r.assignedGovernancePipeline || r.assignedPipeline || 'standard-governance') + '</span></td>' +
              '<td><small class="muted">' + (r.policyOverrides ? t('ui_custom_rules') + Object.keys(r.policyOverrides).length + (' ' + t('ui_rules_suffix')) : t('ui_standard')) + '</small></td>' +
              '<td>' +
                '<div style="display: flex; gap: 6px;">' +
                  '<button type="button" data-run-repo-pipe="' + esc(r.assignedGovernancePipeline || r.assignedPipeline || 'standard-governance') + '" data-repo-id="' + esc(r.id) + '" data-repo-path="' + esc(r.path) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>' + '<span class="action-label">' + esc(t('btn_run')) + '</span>' + '</button>') +
                  '<button type="button" class="danger" data-del-repo="' + esc(r.id) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg>' + '<span class="action-label">' + esc(t('btn_delete')) + '</span>' + '</button>') +
                '</div>' +
              '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>');
      }
    }

    const auditContainer = $('audit-trail-container');
    if (auditContainer) {
      if (!cachedAuditTrail.length) {
        setLocalizedHtml(auditContainer, () => '<span class="muted">' + esc(t('ui_no_audit')) + '</span>');
      } else {
        setLocalizedHtml(auditContainer, () => '<table class="data-table">' +
          '<thead><tr>' +
            ('<th>' + esc(t('lbl_timestamp')) + '</th>') +
            ('<th>' + esc(t('lbl_decision')) + '</th>') +
            ('<th>' + esc(t('lbl_pipeline_run')) + '</th>') +
            ('<th>' + esc(t('ui_step')) + '</th>') +
            ('<th>' + esc(t('lbl_operator')) + '</th>') +
            ('<th>' + esc(t('lbl_feedback_rationale')) + '</th>') +
          '</tr></thead>' +
          '<tbody>' +
          cachedAuditTrail.slice(0, 30).map(a => {
            const isApproved = a.action === 'approved' || a.decision === 'approved';
            const actionText = (a.action || a.decision || 'unknown').toUpperCase();
            return '<tr>' +
              '<td><time class="muted">' + new Date(a.timestamp).toLocaleString(currentLang) + '</time></td>' +
              '<td><span class="setting-badge ' + (isApproved ? 'ok' : 'bad') + '">' + esc(localizedValue(actionText)) + '</span></td>' +
              '<td><strong>' + esc(a.pipelineId) + '</strong><br><small class="muted"><code>' + esc((a.runId || '').slice(0, 8)) + '</code></small></td>' +
              '<td><code>' + esc(a.stepId) + '</code></td>' +
              '<td><span class="muted">' + esc(a.operator || 'system') + '</span></td>' +
              '<td>' + esc(a.feedback || t('ui_none_provided')) + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>');
      }
    }
  }

  function renderBudgets(budgets) {
    cachedBudgets = budgets || {};
    const cfg = cachedBudgets.config || cachedBudgets;
    const spend = cachedBudgets.usage || {};
    const dailySpent = spend.currentDailyCostUsd ?? 0;
    const dailyLimit = cfg.dailyBudgetUsd ?? 10;
    const dailyPct = Math.min(100, Math.round((dailySpent / (dailyLimit || 1)) * 100));
    const dailyWarn = cfg.warningThresholdPercent ?? 80;
    const dailyClass = dailyPct >= 100 ? 'bad' : (dailyPct >= dailyWarn ? 'warn' : 'ok');
    const dailyFillClass = dailyPct >= 100 ? 'danger' : (dailyPct >= dailyWarn ? 'warn' : 'safe');

    if ($('daily-budget-text')) {
      setLocalizedText($('daily-budget-text'), () => '$' + dailySpent.toFixed(2) + ' / $' + dailyLimit.toFixed(2) + ' (' + dailyPct + '%)');
      $('daily-budget-text').className = 'setting-badge ' + dailyClass;
    }
    if ($('daily-budget-fill')) {
      $('daily-budget-fill').className = 'budget-fill ' + dailyFillClass;
      $('daily-budget-fill').style.width = dailyPct + '%';
    }

    const monthlySpent = spend.currentMonthlyCostUsd ?? 0;
    const monthlyLimit = cfg.monthlyBudgetUsd ?? 100;
    const monthlyPct = Math.min(100, Math.round((monthlySpent / (monthlyLimit || 1)) * 100));
    const monthlyClass = monthlyPct >= 100 ? 'bad' : (monthlyPct >= dailyWarn ? 'warn' : 'ok');
    const monthlyFillClass = monthlyPct >= 100 ? 'danger' : (monthlyPct >= dailyWarn ? 'warn' : 'safe');

    if ($('monthly-budget-text')) {
      setLocalizedText($('monthly-budget-text'), () => '$' + monthlySpent.toFixed(2) + ' / $' + monthlyLimit.toFixed(2) + ' (' + monthlyPct + '%)');
      $('monthly-budget-text').className = 'setting-badge ' + monthlyClass;
    }
    if ($('monthly-budget-fill')) {
      $('monthly-budget-fill').className = 'budget-fill ' + monthlyFillClass;
      $('monthly-budget-fill').style.width = monthlyPct + '%';
    }

    if (!dirtySections.has('budgets-section')) {
      if ($('cfg-daily-budget')) $('cfg-daily-budget').value = cfg.dailyBudgetUsd ?? 10;
      if ($('cfg-monthly-budget')) $('cfg-monthly-budget').value = cfg.monthlyBudgetUsd ?? 100;
      if ($('cfg-max-cost-run')) $('cfg-max-cost-run').value = cfg.maxCostPerRunUsd ?? 0.50;
      if ($('cfg-max-tokens-run')) $('cfg-max-tokens-run').value = cfg.maxTokensPerRun ?? 100000;
      if ($('cfg-warn-threshold')) $('cfg-warn-threshold').value = cfg.warningThresholdPercent ?? 80;
      if ($('cfg-hard-stop')) $('cfg-hard-stop').value = String(cfg.hardStop !== false);
    }
  }

  function renderWorkspaces(workspaces) {
    cachedWorkspaces = workspaces || [];

    const playWsSelect = $('play-ws-select');
    if (playWsSelect) {
      const prev = playWsSelect.value;
      setLocalizedHtml(playWsSelect, () => ('<option value="">' + esc(t('ui_choose_workspace')) + '</option>') +
        cachedWorkspaces.map(w => '<option value="' + esc(w.path) + '">' + esc(w.name || w.path) + '</option>').join(''));
      if (prev && cachedWorkspaces.some(w => w.path === prev)) playWsSelect.value = prev;
    }

    const pipeCwdSelect = $('pipe-run-cwd');
    if (pipeCwdSelect) {
      const prev = pipeCwdSelect.value;
      setLocalizedHtml(pipeCwdSelect, () => ('<option value="">' + esc(t('ui_default_workspace')) + '</option>') +
        cachedWorkspaces.map(w => '<option value="' + esc(w.path) + '">' + esc(w.name || w.path) + '</option>').join(''));
      if (prev && cachedWorkspaces.some(w => w.path === prev)) pipeCwdSelect.value = prev;
    }

    const tableContainer = $('workspaces-table-container');
    if (tableContainer) {
      if (!cachedWorkspaces.length) {
        setLocalizedHtml(tableContainer, () => '<span class="muted">' + esc(t('ui_no_workspaces')) + '</span>');
      } else {
        setLocalizedHtml(tableContainer, () => '<table class="data-table">' +
          '<thead><tr>' +
            ('<th>' + esc(t('lbl_workspace_label')) + '</th>') +
            ('<th>' + esc(t('lbl_absolute_path')) + '</th>') +
            ('<th>' + esc(t('lbl_status')) + '</th>') +
            ('<th>' + esc(t('lbl_permissions')) + '</th>') +
            ('<th>' + esc(t('lbl_actions')) + '</th>') +
          '</tr></thead>' +
          '<tbody>' +
          cachedWorkspaces.map(w =>
            '<tr>' +
              '<td><strong>' + esc(w.name || t('lbl_workspace')) + '</strong></td>' +
              '<td style="font-family: monospace; font-size: 0.8571rem;">' + esc(w.path) + '</td>' +
              '<td><span class="setting-badge ' + (w.exists ? 'ok' : 'bad') + '">' + (w.exists ? t('status_found_disk') : t('status_not_found')) + '</span></td>' +
              '<td><span class="setting-badge ' + (w.isWritable || w.writable ? 'ok' : 'warn') + '">' + (w.isWritable || w.writable ? t('permission_read_write') : t('ui_read_only')) + '</span></td>' +
              '<td>' +
                '<div style="display: flex; gap: 6px;">' +
                  '<button type="button" data-browse-ws="' + esc(w.path) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>' + '<span class="action-label">' + esc(t('btn_browse')) + '</span>' + '</button>') +
                  '<button type="button" data-use-ws="' + esc(w.path) + ('">' + '<span class="action-label">' + esc(t('nav_playground')) + '</span>' + '</button>') +
                  '<button type="button" class="danger" data-del-ws="' + esc(w.id || w.path) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="10" y2="17"/><line x1="14" x2="14" y1="10" y2="17"/></svg>' + '<span class="action-label">' + esc(t('btn_delete')) + '</span>' + '</button>') +
                '</div>' +
              '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>');
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
      if ($('browser-current-path')) setLocalizedText($('browser-current-path'), () => currentDirBrowsePath || '-');
      const listEl = $('browser-dirs-list');
      if (listEl) {
        const dirs = data.directories || [];
        if (!dirs.length) {
          setLocalizedHtml(listEl, () => '<div class="muted" style="padding: 8px;">' + esc(t('ui_no_directories')) + '</div>');
        } else {
          setLocalizedHtml(listEl, () => dirs.map(d =>
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: var(--panel);">' +
              '<div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" data-nav-dir="' + esc(d.path) + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                '<strong>' + esc(d.name) + '</strong>' +
              '</div>' +
              '<button type="button" style="padding: 2px 8px; font-size: 0.8rem;" data-add-dir-ws="' + esc(d.path) + '" data-name="' + esc(d.name) + ('">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>' + '<span class="action-label">' + esc(t('btn_add_workspace')) + '</span>' + '</button>') +
            '</div>'
          ).join(''));
        }
      }
      if ($('browser-up-btn')) {
        const hasParent = Boolean(data.parent);
        $('browser-up-btn').disabled = !hasParent;
        $('browser-up-btn').dataset.parentPath = data.parent || '';
      }
    } catch (err) {
      if ($('browser-dirs-list')) setLocalizedHtml($('browser-dirs-list'), () => '<div class="activity-event error">' + esc(err.message) + '</div>');
    }
  }

  function renderAnalyticsCharts(data) {
    cachedAnalytics = data || {};
    const modelsData = cachedAnalytics.models || [];
    const pipelineData = cachedAnalytics.pipelines || {};
    const activityData = cachedAnalytics.activity || {};
    const tokenData = cachedAnalytics.totals || {};

    const reqContainer = $('chart-requests-container');
    if (reqContainer) {
      if (!modelsData.length) {
        setLocalizedHtml(reqContainer, () => '<div class="muted" style="padding: 30px; text-align: center;">' + esc(t('ui_no_model_requests')) + '</div>');
      } else {
        const topModels = modelsData.slice(0, 5);
        const maxReq = Math.max(...topModels.map(m => m.requests || 1), 1);
        const barHeight = 24;
        const totalHeight = topModels.length * (barHeight + 10) + 20;

        const barsSvg = () => topModels.map((m, i) => {
          const y = i * (barHeight + 10) + 10;
          const barWidth = Math.max(8, Math.round(((m.requests || 0) / maxReq) * 260));
          const shortModel = m.model.split('/').pop() || m.model;
          return '<g>' +
            '<text x="10" y="' + (y + 16) + '" fill="var(--text)" font-size="11" font-family="monospace">' + esc(shortModel.slice(0, 18)) + '</text>' +
            '<rect x="140" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="4" fill="var(--accent)" opacity="0.85"/>' +
            '<text x="' + (146 + barWidth) + '" y="' + (y + 16) + '" fill="var(--muted)" font-size="11">' + m.requests + (' ' + t('ui_request_abbr')) + (m.avgLatencyMs ?? 0) + 'ms)</text>' +
          '</g>';
        }).join('');

        setLocalizedHtml(reqContainer, () => '<svg aria-hidden="true" viewBox="0 0 460 ' + totalHeight + '" width="100%" height="' + totalHeight + '" style="display: block;">' + barsSvg() + '</svg><ul class="chart-values">' + topModels.map(m => '<li>' + esc(m.model) + ': ' + esc(m.requests) + (' ' + t('ui_requests_latency') + ' ') + esc(m.avgLatencyMs ?? 0) + ' ms</li>').join('') + '</ul>');
      }
    }

    const costContainer = $('chart-cost-container');
    if (costContainer) {
      const inTok = modelsData.reduce((sum, model) => sum + (model.inputTokens || 0), 0);
      const outTok = modelsData.reduce((sum, model) => sum + (model.outputTokens || 0), 0);
      const totalTok = inTok + outTok;
      const estCost = tokenData.costUsd || 0;

      if (totalTok === 0 && estCost === 0) {
        setLocalizedHtml(costContainer, () => '<div class="muted" style="padding: 30px; text-align: center;">' + esc(t('ui_no_tokens')) + '</div>');
      } else {
        const inPct = totalTok ? Math.round((inTok / totalTok) * 100) : 50;
        const outPct = 100 - inPct;

        setLocalizedHtml(costContainer, () => '<div style="padding: 10px 0;">' +
          '<div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9286rem;">' +
            ('<span>' + esc(t('lbl_input_colon')) + ' ' + '<strong>') + inTok.toLocaleString(currentLang) + '</strong> (' + inPct + '%)</span>' +
            ('<span>' + esc(t('lbl_output_colon')) + ' ' + '<strong>') + outTok.toLocaleString(currentLang) + '</strong> (' + outPct + '%)</span>' +
          '</div>' +
          '<div style="height: 16px; border-radius: 8px; overflow: hidden; display: flex; background: var(--panel); border: 1px solid var(--line);">' +
            '<div style="width: ' + inPct + ('%; background: var(--accent);" title="' + esc(t('lbl_input_tokens')) + '"></div>') +
            '<div style="width: ' + outPct + ('%; background: var(--ok);" title="' + esc(t('lbl_output_tokens')) + '"></div>') +
          '</div>' +
          '<div style="margin-top: 16px; text-align: center;">' +
            ('<span class="muted" style="font-size: 0.8571rem;">' + esc(t('lbl_estimated_total_cost')) + '</span>') +
            '<div style="font-size: 1.7143rem; font-weight: 700; color: var(--ok); margin-top: 2px;">$' + estCost.toFixed(6) + '</div>' +
            ('<span class="muted" style="font-size: 0.8rem;">' + esc(t('ui_usage_estimates')) + '</span>') +
          '</div>' +
        '</div>');
      }
    }

    const pipeContainer = $('chart-pipelines-container');
    if (pipeContainer) {
      const totalRuns = pipelineData.totalRuns || 0;
      if (totalRuns === 0) {
        setLocalizedHtml(pipeContainer, () => '<div class="muted" style="padding: 30px; text-align: center;">' + esc(t('ui_no_pipeline_runs')) + '</div>');
      } else {
        const completed = pipelineData.completed || 0;
        const waiting = pipelineData.waitingApproval || 0;
        const running = pipelineData.running || 0;
        const failed = (pipelineData.failed || 0) + (pipelineData.rejected || 0) + (pipelineData.cancelled || 0);

        setLocalizedHtml(pipeContainer, () => '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 0;">' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--ok);">' +
            '<div style="font-size: 1.4286rem; font-weight: 700; color: var(--ok);">' + completed + '</div>' +
            ('<div class="muted" style="font-size: 0.8571rem;">' + esc(t('status_completed')) + '</div>') +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--warn);">' +
            '<div style="font-size: 1.4286rem; font-weight: 700; color: var(--warn);">' + waiting + '</div>' +
            ('<div class="muted" style="font-size: 0.8571rem;">' + esc(t('ui_awaiting_gate')) + '</div>') +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--accent);">' +
            '<div style="font-size: 1.4286rem; font-weight: 700; color: var(--accent);">' + running + '</div>' +
            ('<div class="muted" style="font-size: 0.8571rem;">' + esc(t('status_running')) + '</div>') +
          '</div>' +
          '<div class="provider-block" style="padding: 8px; margin: 0; text-align: center; border-left: 4px solid var(--bad);">' +
            '<div style="font-size: 1.4286rem; font-weight: 700; color: var(--bad);">' + failed + '</div>' +
            ('<div class="muted" style="font-size: 0.8571rem;">' + esc(t('ui_failed_rejected_cancelled')) + '</div>') +
          '</div>' +
        '</div>');
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
        setLocalizedHtml(actContainer, () => '<div class="muted" style="padding: 30px; text-align: center;">' + esc(t('ui_no_activity_recorded')) + '</div>');
      } else {
        const maxVal = Math.max(info, success, warning, error, 1);
        const categories = [
          { label: 'level_info', count: info, color: 'var(--accent)' },
          { label: 'level_success', count: success, color: 'var(--ok)' },
          { label: 'level_warning', count: warning, color: 'var(--warn)' },
          { label: 'level_error', count: error, color: 'var(--bad)' }
        ];

        setLocalizedHtml(actContainer, () => '<div style="display: grid; gap: 8px; padding: 4px 0;">' +
          categories.map(c => {
            const pct = Math.max(6, Math.round((c.count / maxVal) * 100));
            return '<div>' +
              '<div style="display: flex; justify-content: space-between; font-size: 0.8571rem; margin-bottom: 2px;">' +
                '<span>' + esc(t(c.label)) + '</span>' +
                '<strong>' + c.count + '</strong>' +
              '</div>' +
              '<div style="height: 8px; border-radius: 4px; background: var(--panel); overflow: hidden;">' +
                '<div style="width: ' + pct + '%; height: 100%; background: ' + c.color + ';"></div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>');
      }
    }
  }

  function renderOrchestrator(data) {
    if (dirtySections.has('orchestrator-section')) return;
    $('orch-enabled').value = String(Boolean(data.enabled));
    $('orch-strategy').value = data.strategy || 'sequential';
    setLocalizedHtml($('orch-roles'), () => (data.roles || []).map((role, i) =>
      ('<div class="model-effort-pair"><label><span>' + esc(t('lbl_role')) + ' ') + (i + 1) + ': ' + esc(localizedValue(role.name)) + '</span><select data-orch-role="' + i + ('"><option value="">' + esc(t('ui_select_model')) + '</option>') + modelOptionGroups(role.model) + '</select></label>' + effortControlHtml('orch-effort-' + i,'[data-orch-role]',role.effort || '','','',role.fastMode) + '</div>'
    ).join(''));
    setLocalizedHtml($('orch-fallbacks'), () => modelOptionGroups(data.fallbackModels || []));
    $('orch-fallback-effort').value = data.fallbackEffort || '';
    setEffortFastMode('orch-fallback-effort',data.fallbackFastMode);
    syncEffortControls();
  }

  async function saveOrchestrator() {
    const roles = [...document.querySelectorAll('[data-orch-role]')].map((select, i) => ({
      name: ['Analyst', 'Reviewer', 'Synthesizer'][i] || (t('lbl_role') + ' ') + (i + 1),
      model: select.value, effort: $('orch-effort-' + i).value || undefined, fastMode: effortFastMode('orch-effort-' + i) ?? false
    }));
    const fallbackModels = [...$('orch-fallbacks').selectedOptions].map(option => option.value);
    const data = await request('/v1/orchestrator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: $('orch-enabled').value === 'true', strategy: $('orch-strategy').value, roles, fallbackModels, fallbackEffort: $('orch-fallback-effort').value || undefined, fallbackFastMode: effortFastMode('orch-fallback-effort') ?? false })
    });
    dirtySections.delete('orchestrator-section');
    renderOrchestrator(data);
    setLocalizedText($('orch-note'), () => t('ui_configuration_saved'));
  }

  async function runOrchestrator() {
    $('orch-run').disabled = true;
    setLocalizedText($('orch-note'), () => t('status_running_ellipsis'));
    try {
      await saveOrchestrator();
      const data = await request('/v1/orchestrator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Compare the current project state and identify the most important next engineering action.' })
      });
      setLocalizedText($('orch-output'), () => data.results.map(r => localizedValue(r.role) + ' (' + r.model + ')\\n' + (r.preview || r.content || '')).join('\\n\\n'));
      setLocalizedText($('orch-note'), () => t('status_completed'));
      showSection('activity');
    } catch (error) {
      setLocalizedText($('orch-output'), () => error.message);
      setLocalizedText($('orch-note'), () => t('status_failed'));
    } finally {
      $('orch-run').disabled = false;
    }
  }

  async function runCliTests() {
    $('test-all-cli').disabled = true;
    setLocalizedText($('test-output'), () => t('ui_running_cli_tests'));
    try {
      const data = await request('/v1/tests/cli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setLocalizedHtml($('test-output'), () => data.results.map(r =>
        '<div class="activity-event ' + (r.ok ? 'success' : 'error') + '"><span class="scope">' + esc(r.provider) + '</span><span>' + (r.ok ? t('status_pass') : t('status_fail')) + '</span><span>' + esc(r.model || '') + ' · ' + esc(r.output || r.error || '') + ' · ' + r.latencyMs + ' ms</span></div>'
      ).join(''));
      showSection('activity');
    } catch (error) {
      setLocalizedText($('test-output'), () => error.message);
    } finally {
      $('test-all-cli').disabled = false;
    }
  }

  async function runOpenAiTest() {
    $('test-openai').disabled = true;
    setLocalizedText($('test-output'), () => t('ui_testing_openai'));
    try {
      const model = models.find(m => m.id.startsWith('cli-'))?.id || models[0]?.id;
      const data = await request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: pong' }], max_tokens: 16 })
      });
      setLocalizedHtml($('test-output'), () => ('<div class="activity-event success"><span class="scope">' + esc(t('ui_openclaw_route')) + '</span><span>' + esc(t('status_pass')) + '</span><span>') + esc(model) + ' · ' + esc(data.choices?.[0]?.message?.content || '') + '</span></div>');
    } catch (error) {
      setLocalizedText($('test-output'), () => error.message);
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
    setLocalizedText($('usage-total'), () => total);
    setLocalizedText($('usage-success'), () => success);
    setLocalizedText($('usage-failure'), () => failure);
    setLocalizedText($('usage-latency'), () => total ? Math.round(latency / total) + ' ms' : '-');
    setLocalizedHtml($('usage-table'), () => rows.length
      ? ('<p class="muted">' + esc(t('lbl_estimated_tokens')) + ' ') + inputTokens + (' ' + t('ui_tokens_in') + ' ') + outputTokens + (' ' + t('ui_tokens_out_cost')) + cost.toFixed(6) + '</p>' +
        rows.map(([model,m]) => '<div><code>' + esc(model) + '</code> · ' + m.requests + (' ' + t('ui_requests_count') + ' ') + m.successes + (' ' + t('ui_successful_count') + ' ') + m.failures + (' ' + t('ui_failed_count') + ' ') + (m.inputTokens || 0) + (' ' + t('ui_input_tokens_count') + ' ') + (m.outputTokens || 0) + (' ' + t('ui_output_tokens_count')) + (m.estimatedCostUsd || 0).toFixed(6) + (' ' + t('ui_estimated_count') + ' ') + (m.averageLatencyMs ?? '-') + (' ' + esc(t('ui_ms_average')) + '</div>')).join('')
      : t('ui_no_usage'));
  }

  function updateEffortOptions() { syncEffortControls(); }

  function renderSettings(data) {
    if (dirtySections.has('settings-section')) return;
    setLocalizedHtml($('settings-keys'), () => '<div class="setting-list">' + Object.entries(data.apiKeys || {}).map(([provider, info]) =>
      '<div class="setting-row"><strong>' + esc(provider) + '</strong><span class="setting-badge ' + (info.configured ? 'ok' : 'muted') + '">' + esc(localizedValue(info.source || (info.configured ? t('status_configured') : t('status_not_detected')))) + '</span><form data-key-provider="' + esc(provider) + '"><input type="password" autocomplete="new-password" placeholder="' + (info.configured ? t('ph_replace_api_key') : t('ph_paste_api_key')) + ('"><button type="submit">' + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' + '<span class="action-label">' + esc(t('btn_save_api_key')) + '</span>' + '</button></form></div>')
    ).join('') + ('</div><p class="muted">' + esc(t('ui_keys_write_only')) + '</p>'));
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
      setNotice(() => (t('ui_credential_saved_for') + ' ') + form.dataset.keyProvider, 'info');
      await refresh();
    } catch (error) {
      $('notice').classList.add('error');
      setNotice(() => error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  // Master Refresh
  let refreshInFlight = false, fullRefreshPending = false, liveRefreshTimer = null;
  function finishRefresh() {
    refreshInFlight = false;
    if (fullRefreshPending) {
      fullRefreshPending = false;
      refresh();
    }
  }
  function scheduleLiveRefresh() {
    if (liveRefreshTimer !== null) return;
    liveRefreshTimer = setTimeout(() => {
      liveRefreshTimer = null;
      refreshLive();
    }, 1000);
  }
  async function refreshLive() {
    if (refreshInFlight || document.hidden) return;
    refreshInFlight = true;
    try {
      // Only active-page data changes with activity; catalogs and settings do not.
      const jobs = [];
      if (activeSection === 'execution') jobs.push(executionRefresh());
      if (activeSection === 'pipelines' || activePipelineRun?.status === 'running') {
        jobs.push(request('/v1/pipelines/runs').then(data => renderPipelineRuns(data.data || [])));
      }
      if (activeSection === 'usage' || activeSection === 'overview') {
        jobs.push(request('/v1/analytics/overview').then(renderAnalyticsCharts));
        jobs.push(request('/v1/metrics').then(data => {
          renderMetrics(data); renderUsage(data);
          const rows = Object.values(data.models || {});
          setLocalizedText($('summary-requests'), () => rows.reduce((sum, model) => sum + model.requests, 0));
          setLocalizedText($('summary-active'), () => rows.reduce((sum, model) => sum + model.inFlight, 0));
        }));
      }
      if (activeSection === 'activity') jobs.push(request('/v1/activity').then(renderActivity));
      if (activeSection === 'budgets') jobs.push(request('/v1/budgets').then(renderBudgets));
      if (activeSection === 'platform') jobs.push(platformRefresh());
      const outcomes = await Promise.allSettled(jobs);
      const failure = outcomes.find(result => result.status === 'rejected');
      if (failure) setNotice(() => (t('error_live_update') + ' ') + failure.reason.message, 'error');
    } finally { finishRefresh(); }
  }
  async function refresh() {
    if (refreshInFlight) { fullRefreshPending = true; return; }
    refreshInFlight = true;
    $('notice').classList.remove('error');
    setNotice(() => t('status_refreshing'), 'quiet');
    try {
      const identity = await request('/v1/platform/me');
      repositoryIdentity(identity.operator);
      pfState.operator = identity.operator;
      exIdentity(identity.operator);
      if (identity.operator?.source === 'operator-token') {
        setLocalizedText($('side-runtime'), () => (t('ui_workspace_access') + ' ') + identity.operator.role);
        if (!['execution','git-workspace','repository-analytics'].includes(activeSection)) showSection('platform');
        await platformRefresh();
        setNotice(() => (t('ui_workspace_loaded_for') + ' ') + pfOperatorName(identity.operator), 'quiet');
        return;
      }
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
      setLocalizedText($('version'), () => 'v' + status.version + (' ' + t('ui_port') + ' ') + status.port + (' ' + t('ui_uptime') + ' ') + Math.floor(status.uptime) + 's');
      setLocalizedText($('side-runtime'), () => '127.0.0.1:' + status.port + ' · v' + status.version);
      setLocalizedText($('summary-connected'), () => status.providers.filter(p => p.connected).length + '/' + status.providers.length);
      setLocalizedText($('summary-models'), () => (modelData.data || []).length);
      const metricRows = Object.values(metricData.models || {});
      setLocalizedText($('summary-requests'), () => metricRows.reduce((n, m) => n + m.requests, 0));
      setLocalizedText($('summary-active'), () => metricRows.reduce((n, m) => n + m.inFlight, 0));

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
      repositoryWorkspaceSync(wsData.data || []);
      renderAnalyticsCharts(analyticsData);
      platformSyncModels();
      // Chat history and projects are visible beside every page, including deep links.
      await platformRefresh();

      setNotice(() => (t('ui_updated') + ' ') + new Date().toLocaleTimeString(currentLang), 'quiet');
    } catch (error) {
      setNotice(() => error.message, 'error');
    } finally { finishRefresh(); }
  }

  $('model-list').addEventListener('click', event => {
    const use = event.target.closest('[data-use-model]');
    if (!use) return;
    $('pf-chat-model').value = use.dataset.useModel;
    showSection('platform');
    pfTab('chat');
    pfContextSummary();
    setNotice(() => use.dataset.useModel + (' ' + t('ui_selected_playground')), 'info');
  });

  async function runPlayground() {
    const button = $('play-run');
    button.disabled = true;
    setLocalizedText($('play-note'), () => t('status_running_ellipsis'));
    setLocalizedText($('play-output'), () => '');
    try {
      const cwd = $('play-cwd').value.trim();
      const body = {
        model: $('play-model').value,
        mode: $('play-mode').value,
        effort: $('play-effort').value, fastMode: effortFastMode('play-effort') ?? false,
        messages: [{ role: 'user', content: $('play-prompt').value }],
        max_tokens: 64
      };
      if (cwd) body.cwd = cwd;
      const result = await request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setLocalizedText($('play-output'), () => result.choices?.[0]?.message?.content || JSON.stringify(result, null, 2));
      setLocalizedText($('play-note'), () => t('status_completed'));
    } catch (error) {
      setLocalizedText($('play-output'), () => error.message);
      setLocalizedText($('play-note'), () => t('status_failed'));
    } finally {
      button.disabled = false;
    }
  }

  $('play-model').addEventListener('change', updateEffortOptions);
  $('play-run').addEventListener('click', runPlayground);
  $('refresh').addEventListener('click', () => { pfState.models = null; pfState.workspaces = null; exState.catalogs = false; return refresh(); });
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
  $('orch-save').addEventListener('click', () => saveOrchestrator().catch(error => setLocalizedText($('orch-note'), () => error.message)));
  $('orch-run').addEventListener('click', runOrchestrator);
  $('test-all-cli').addEventListener('click', runCliTests);
  $('test-openai').addEventListener('click', runOpenAiTest);

  // Subsystem event listeners
  $('btn-rediscover-tools')?.addEventListener('click', async () => {
    $('btn-rediscover-tools').disabled = true;
    setLocalizedText($('btn-rediscover-tools'), () => t('status_scanning_path'));
    try {
      await request('/v1/tools/discover', { method: 'POST' });
      await refresh();
    } catch (err) {
      alert((t('error_discovery') + ' ') + err.message);
    } finally {
      $('btn-rediscover-tools').disabled = false;
      setLocalizedText($('btn-rediscover-tools'), () => t('btn_rediscover_tools'));
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
    $('repo-modal').showModal();
  });
  $('close-repo-modal')?.addEventListener('click', () => $('repo-modal').close());
  $('cancel-repo-btn')?.addEventListener('click', () => $('repo-modal').close());

  $('save-repo-btn')?.addEventListener('click', async () => {
    const id = $('repo-id-input').value.trim();
    const name = $('repo-name-input').value.trim();
    const path = $('repo-path-input').value.trim();
    const description = $('repo-desc-input').value.trim();
    const assignedGovernancePipeline = $('repo-pipeline-select').value;
    if (!id || !path) { alert(t('error_repo_required')); return; }

    const btn = $('save-repo-btn');
    btn.disabled = true;
    try {
      await request('/v1/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, path, description, assignedGovernancePipeline }),
      });
      $('repo-modal').close();
      await refresh();
    } catch (err) {
      alert((t('error_save_failed') + ' ') + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('repos-table-container')?.addEventListener('click', async event => {
    const delBtn = event.target.closest('[data-del-repo]');
    if (delBtn) {
      const repoId = delBtn.dataset.delRepo;
      if (!confirm((t('confirm_unregister_repo') + ' ') + repoId + '?')) return;
      try {
        await request('/v1/repositories/' + encodeURIComponent(repoId), { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert((t('error_delete') + ' ') + err.message);
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
      setNotice(() => (t('ui_loaded_pipeline') + ' ') + pipeId + (' ' + t('ui_for_repository') + ' ') + repoId, 'info');
    }
  });

  $('btn-export-audit-json')?.addEventListener('click', () => { window.open('/v1/governance/audit/export?format=json', '_blank'); });
  $('btn-export-audit-md')?.addEventListener('click', () => { window.open('/v1/governance/audit/export?format=markdown', '_blank'); });
  $('btn-export-activity-json')?.addEventListener('click', () => { window.open('/v1/activity/export?format=json', '_blank'); });
  $('btn-export-activity-md')?.addEventListener('click', () => { window.open('/v1/activity/export?format=markdown', '_blank'); });

  $('budget-config-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const note = $('budget-save-note');
    if (note) setLocalizedText(note, () => t('status_saving'));
    try {
      await request('/v1/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyBudgetUsd: Number($('cfg-daily-budget').value),
          monthlyBudgetUsd: Number($('cfg-monthly-budget').value),
          maxCostPerRunUsd: Number($('cfg-max-cost-run').value),
          maxTokensPerRun: Number($('cfg-max-tokens-run').value),
          warningThresholdPercent: Number($('cfg-warn-threshold').value),
          hardStop: $('cfg-hard-stop').value === 'true'
        })
      });
      if (note) setLocalizedText(note, () => t('ui_limits_saved'));
      dirtySections.delete('budgets-section');
      await refresh();
    } catch (err) {
      if (note) setLocalizedText(note, () => err.message);
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
      alert((t('error_add_workspace') + ' ') + err.message);
    }
  });

  $('workspaces-table-container')?.addEventListener('click', async event => {
    const delBtn = event.target.closest('[data-del-ws]');
    if (delBtn) {
      const wsId = delBtn.dataset.delWs;
      if (!confirm((t('confirm_remove_workspace') + ' ') + wsId + '?')) return;
      try {
        await request('/v1/workspaces/' + encodeURIComponent(wsId), { method: 'DELETE' });
        await refresh();
      } catch (err) {
        alert((t('error_delete_failed') + ' ') + err.message);
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
      setNotice(() => (t('ui_selected_workspace') + ' ') + useBtn.dataset.useWs, 'info');
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
        alert((t('error_add') + ' ') + err.message);
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
        if (data.type === 'activity' || data.type === 'platform_run' || data.type === 'pipeline_run') scheduleLiveRefresh();
      } catch {}
    };
    ws.onerror = () => {
      if (!eventsConnected) setNotice(() => t('ui_live_unavailable'), 'quiet');
    };
    ws.onclose = () => {
      eventsConnected = false;
      setTimeout(connectEvents, 3000);
    };
  }

  ${PLATFORM_SCRIPT}
  ${EXECUTION_SCRIPT}
  ${GIT_WORKSPACE_SCRIPT}
  ${REPOSITORY_ANALYTICS_SCRIPT}
  let repositoryActor = '';
  function repositoryIdentity(operator) {
    const key = JSON.stringify(operator || null);
    if (key === repositoryActor) return;
    repositoryActor = key;
    $('git-workspace-nav').dataset.detected = 'false';
    window.gitWorkspace.configure({workspaces:[],workspaceId:'',canWrite:false,language:currentLang,request});
    raReset();
    pfState.workspaces = null;
    // Identity initialization invalidates a deep-link load that may already be in flight.
    if (activeSection === 'repository-analytics') loadRepositoryAnalytics(true);
  }
  function repositoryWorkspaceSync(workspaces = pfState.workspaces || [], workspaceId) {
    if (!window.gitWorkspace) return;
    const selected = workspaceId && workspaces.some(item => item.id === workspaceId) ? workspaceId : undefined;
    return window.gitWorkspace.configure({request,workspaces,language:currentLang,canWrite:pfState.operator?.role === 'admin',...(selected ? {workspaceId:selected} : {})});
  }
  document.addEventListener('git-workspace-detected',event => { $('git-workspace-nav').dataset.detected = String(!!event.detail.detected); });
  document.addEventListener('change',event => { if (['pf-chat-workspace','ex-workspace'].includes(event.target.id)) repositoryWorkspaceSync(undefined,event.target.value); });
  ${SETTING_TOOLTIP_SCRIPT}
  ${SELECT_SCRIPT}
  pfRenderTranscript();
  const sectionFromLocation = () => { const name = window.location?.hash?.slice(1) || 'platform'; if (Object.hasOwn(sectionIds, name)) showSection(name, false); };
  window.addEventListener('hashchange', sectionFromLocation);
  if (window.location?.hash) sectionFromLocation();
  refresh();
  connectEvents();
  setInterval(refreshLive, 15000);
  setInterval(() => {
    if (activePipelineRun?.status === 'running') scheduleLiveRefresh();
  }, 3000);
</script>
</body>
</html>`);

export const HELP_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg?v=cb"><title data-i18n="help_title">Conduit Bridge Help</title><style>${SHARED_STYLE}</style></head>
<body><main class="help"><header><div><h1 data-i18n="help_title">Conduit Bridge Help</h1><div class="muted" data-i18n="help_subtitle">Installation, provider routing, and operations</div></div><nav class="nav"><button id="lang-toggle" type="button" title="Switch language" data-i18n-title="ui_switch_language" aria-label="Toggle language" data-i18n-aria="ui_toggle_language"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span id="lang-label">DE</span></button><a class="link" href="/" data-i18n="help_dashboard">Dashboard</a></nav></header>
  <section><h2 data-i18n="help_installation">Requirements and installation</h2><p data-i18n="help_platforms">Conduit Bridge runs on Windows Desktop and Linux Desktop. It requires Node.js 24 or newer.</p><pre>npm install
npm run build
node dist/cli.js start --host=127.0.0.1 --port=31338</pre><p><span data-i18n="help_open">Open</span> <code>http://127.0.0.1:31338/</code><span data-i18n="help_shared_listener">. The dashboard, API, and event stream share this one listener.</span></p></section>
    <section><h2 data-i18n="h_desktop_autostart">Desktop autostart</h2><p><span data-i18n="help_run">Run</span> <code>./scripts/install-autostart.sh</code> <span data-i18n="help_linux_or">on Linux Desktop or</span> <code>powershell -ExecutionPolicy Bypass -File ./scripts/install-autostart.ps1</code> <span data-i18n="help_windows_installers">on Windows Desktop after building. These installers start Conduit as the interactive desktop user. See</span> <code>docs/guides/autostart.md</code> <span data-i18n="help_uninstall">for uninstall commands.</span></p></section>
  <section><h2 data-i18n="help_provider_auth">Provider authentication</h2><p data-i18n="help_provider_auth_description">Conduit supports explicit API credentials, authenticated local CLI tools, and LM Studio. Browser-session providers were removed because real desktop testing showed that their unattended runtime was not consistently reliable across provider security checks.</p><ul><li><code>cli-grok</code><span data-i18n="help_auth_grok">: authenticate the installed Grok CLI.</span></li><li><code>cli-claude</code><span data-i18n="help_auth_claude">: authenticate Claude Code.</span></li><li><code>cli-codex</code><span data-i18n="help_auth_codex">: authenticate Codex CLI.</span></li><li><code>cli-gemini</code><span data-i18n="help_auth_gemini">: authenticate the configured Gemini-compatible CLI.</span></li></ul></section>
  <section><h2 data-i18n="help_model_routing">Model routing</h2><ul><li><code>api-*</code> <span data-i18n="help_route_api">uses a direct provider API or aggregator.</span></li><li><code>cli-*</code> <span data-i18n="help_route_cli">invokes an installed coding CLI and can isolate accounts.</span></li><li><code>lmstudio/*</code> <span data-i18n="help_route_local">forwards to a local OpenAI-compatible LM Studio server.</span></li></ul><p><span data-i18n="help_models_description">The Models page groups the catalog by transport and provider, shows readiness and source, and filters by search, transport, or provider. Use the complete model ID shown there. Availability labels are</span> <strong data-i18n="availability_verified">verified</strong>, <strong data-i18n="availability_documented">documented</strong><span data-i18n="help_comma_or">, or</span> <strong data-i18n="availability_dynamic">dynamic</strong>.</p></section>
  <section><h2 data-i18n="help_endpoints">OpenAI-compatible endpoints</h2><pre>GET  /health
GET  /v1/status
GET  /v1/models
GET  /v1/capabilities
GET  /v1/metrics
GET  /v1/tools
GET  /v1/pipelines
POST /v1/chat/completions
POST /v1/pipelines/run
POST /v1/pipelines/runs/action
WS   /v1/events</pre><p><span data-i18n="help_base_url">The base URL for clients is</span> <code>http://127.0.0.1:31338/v1</code><span data-i18n="help_chat_streaming">. Chat supports SSE streaming,</span> <code>fallback_models</code><span data-i18n="help_provider_specific">, provider-specific</span> <code>effort</code> <span data-i18n="help_or">or</span> <code>reasoning_effort</code><span data-i18n="help_and_cli">, and CLI</span> <code>mode</code> (<code>chat</code>, <code>plan</code>, <code>agent</code><span data-i18n="help_optional">) with optional</span> <code>cwd</code>.</p></section>
  <section><h2 data-i18n="help_auth_transport">Authentication by transport</h2><ul><li><span data-i18n="help_cli_authentication">CLI providers use the CLI&#39;s existing authentication. Claude CLI supports neutral</span> <code>first-account</code> <span data-i18n="help_isolated">and isolated</span> <code>second-account</code> <span data-i18n="help_routes">routes.</span></li><li data-i18n="help_api_authentication">API providers use protected environment variables or write-only dashboard settings.</li></ul><p data-i18n="help_credentials">Never put credentials in the repository, URLs, command arguments, or logs.</p></section>
  <section><h2 data-i18n="ui_security">Security</h2><ul><li data-i18n="help_loopback">Loopback is the required desktop bind.</li><li data-i18n="help_origins">Cross-site state-changing requests and foreign WebSocket origins are rejected. Allowlisted origins (including another local port) may POST.</li><li data-i18n="help_privacy">Activity and metrics do not store prompts, responses, cookies, or credentials. Orchestrator history stores a short redacted preview.</li><li><span data-i18n="help_macos">macOS is not a supported CLI target:</span> <code>conduit-bridge start</code> <span data-i18n="help_library_embed">exits. Library embedders may still construct</span> <code>BridgeServer</code>.</li></ul></section>
  <section><h2 data-i18n="help_troubleshooting">Troubleshooting</h2><pre>curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/status
curl http://127.0.0.1:31338/v1/models
node dist/cli.js status</pre><ul><li><strong data-i18n="help_cli_unavailable">CLI unavailable:</strong> <span data-i18n="help_cli_fix">install the named CLI, authenticate it normally, and ensure its binary is on PATH.</span></li><li><strong data-i18n="help_api_unavailable">API unavailable:</strong> <span data-i18n="help_api_fix">add the provider credential through the write-only Settings form or the documented environment variable.</span></li></ul><p><span data-i18n="help_see">See</span> <code>docs/guides/autostart.md</code> <span data-i18n="help_startup_guide">for the desktop startup guide.</span></p></section>
</main><script>window.__CB_TRANSLATIONS = ${JSON.stringify(TRANSLATIONS).replace(/</g, '\\u003c')};</script><script>${I18N_SCRIPT}</script></body></html>`;

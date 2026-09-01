const SHARED_STYLE = `
  :root { color-scheme: dark; --bg: #050b16; --panel: #0a1729; --panel-2: #0d1c33; --line: rgba(143,213,236,.18); --line-2: rgba(143,213,236,.30); --text: #f5faff; --body: #c7d4e8; --muted: #8fa0bd; --blue: #22b4ff; --blue-soft: #b9eaff; --copper: #ff8a3d; --ok: #1fd18a; --warn: #f5b83d; --bad: #ff6f91; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--body); font: 15px/1.5 Inter, system-ui, sans-serif; background-image: linear-gradient(180deg,#07111f 0%,#050b16 100%); }
  main { min-height: 100vh; display: grid; grid-template-columns: 248px minmax(0,1fr); padding: 0; }
  .sidebar { position: sticky; top: 0; height: 100vh; padding: 26px 15px; background: rgba(5,11,22,.96); border-right: 1px solid var(--line); display: flex; flex-direction: column; }
  .brand { padding: 4px 13px 30px; }
  .brand-mark { color: var(--blue); font: 700 11px ui-monospace,monospace; letter-spacing: .18em; }
  .brand h1 { font-family: Georgia,serif; font-size: 22px; margin: 8px 0 2px; }
  .brand small { color: var(--muted); }
  .side-menu { display: grid; gap: 4px; }
  .side-menu button { border: 0; border-left: 2px solid transparent; border-radius: 5px; background: transparent; color: var(--muted); padding: 11px 13px; text-align: left; cursor: pointer; }
  .side-menu button:hover { color: var(--text); background: var(--panel); }
  .side-menu button.active { color: var(--text); background: var(--panel-2); border-left-color: var(--blue); }
  .side-footer { margin-top: auto; padding: 15px 13px 0; color: var(--muted); font: 12px/1.6 ui-monospace,monospace; }
  .workspace { min-width: 0; padding: 0 clamp(18px,4vw,54px) 56px; }
  .page-section { display: none !important; }
  .page-section.active { display: block !important; }
  header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  .appbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 12px 12px;
    margin-bottom: 24px;
    background: rgba(5,11,22,.94);
    border-bottom: 1px solid var(--line);
  }
  .appbrand { color: var(--blue); font: 700 13px ui-monospace, monospace; white-space: nowrap; }
  .appnav { display: none; }
  .appnav a { color: var(--muted); text-decoration: none; padding: 6px 9px; border-radius: 5px; white-space: nowrap; }
  .appnav a:hover { color: var(--text); background: #374151; }
  h1, h2, h3, p { margin-top: 0; letter-spacing: 0; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-bottom: 14px; }
  h3 { font-size: 15px; margin-bottom: 5px; }
  .muted, small { color: var(--muted); }
  .nav { display: flex; gap: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .summary { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 10px; margin: 0 0 16px; }
  .summary-item { background: #182230; border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; }
  .summary-item strong { display: block; font-size: 22px; color: var(--blue); }
  .summary-item span { color: var(--muted); font-size: 12px; }
  .status-legend { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin: 0 0 16px; }
  .status-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .anchor { scroll-margin-top: 76px; }
  section, .transport { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
  .transport { min-height: 154px; }
  .transport strong { color: var(--blue); font-family: ui-monospace, monospace; }
  .transport p { color: var(--muted); margin-bottom: 0; }
  .provider-block { margin: 16px 0; padding: 14px 16px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; }
  .provider-block h3 { display: flex; justify-content: space-between; color: var(--blue); }
  .provider-block h3 small { font-weight: 400; }
  .provider { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; border-top: 1px solid var(--line); padding: 12px 0; }
  .provider:first-child { border-top: 0; padding-top: 0; }
  .provider small { grid-column: 1; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 2; grid-row: 1 / span 2; justify-content: end; }
  button, .link { border: 1px solid #4b5563; border-radius: 6px; background: #374151; color: var(--text); padding: 7px 10px; cursor: pointer; text-decoration: none; }
  button:hover, .link:hover { background: #4b5563; }
  button:disabled { cursor: wait; opacity: .6; }
  .status { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); }
  .dot.ok { background: var(--ok); }
  .dot.warn { background: var(--warn); }
  .model-list { display: grid; gap: 5px; }
  .model-tools { display: grid; grid-template-columns: minmax(220px,1fr) 160px 210px auto; gap: 8px; margin-bottom: 12px; }
  .model-tools input { flex: 1; min-width: 0; }
  .model-summary { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0 14px; }
  .model-summary span { border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; color: var(--muted); font-size: 12px; }
  .model-transport-group { margin: 14px 0 20px; }
  .model-transport-group > h3 { display: flex; justify-content: space-between; color: var(--blue); margin-bottom: 8px; }
  .model-provider-group { background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; margin: 8px 0; overflow: hidden; }
  .model-provider-group > summary { display: grid; grid-template-columns: minmax(190px,1fr) auto auto; align-items: center; gap: 12px; padding: 11px 13px; cursor: pointer; list-style-position: inside; }
  .model-provider-group > summary strong { color: var(--text); }
  .model-provider-group > summary small { display: block; font-weight: 400; }
  .model-provider-group > summary .ready { color: var(--ok); }
  .model-provider-group > summary .unavailable { color: var(--warn); }
  .model-provider-models { border-top: 1px solid var(--line); padding: 4px 13px 8px; }
  .model-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(150px,.45fr) auto; gap: 12px; align-items: center; border-top: 1px solid var(--line); padding: 9px 0; }
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
  .setting-badge { color: var(--ok); font: 12px ui-monospace,monospace; }
  code { color: var(--blue); overflow-wrap: anywhere; }
  #notice { min-height: 24px; color: var(--muted); margin: 0 0 18px; }
  .wide { margin-top: 16px; }
  .playground { margin-top: 16px; }
  label { display: grid; gap: 6px; color: var(--muted); margin-bottom: 12px; }
  input, select, textarea { width: 100%; border: 1px solid rgba(143,213,236,.24); border-radius: 7px; background: #0b1a2e; color: var(--text); padding: 10px 12px; font: inherit; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
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
  .login-grid { display: grid; gap: 12px; }
  .login-card { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 16px; align-items: start; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; }
  .login-card h3 { grid-column: 1; margin: 0; display: flex; align-items: center; gap: 8px; color: var(--text); }
  .login-card .login-state { font: 12px ui-monospace,monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; }
  .login-card.state-ok .login-state { color: var(--ok); border-color: rgba(31,209,138,.45); }
  .login-card.state-warn .login-state { color: var(--warn); border-color: rgba(245,184,61,.45); }
  .login-card.state-bad .login-state { color: var(--bad); border-color: rgba(255,111,145,.45); }
  .login-card .login-message { grid-column: 1; margin: 0; color: var(--body); }
  .login-card .login-next { grid-column: 1; margin: 0; color: var(--muted); }
  .login-card .login-meta { grid-column: 1; margin: 0; color: var(--muted); font-size: 12px; }
  .login-card .actions { grid-column: 2; grid-row: 1 / span 2; }
  .login-card details { grid-column: 1 / -1; margin-top: 4px; }
  .login-card summary { cursor: pointer; color: var(--muted); font-size: 12px; }
  .login-card details dl { display: grid; grid-template-columns: minmax(140px,auto) 1fr; gap: 4px 12px; margin: 10px 0 0; font-size: 12px; }
  .login-card details dt { color: var(--muted); }
  .login-card details dd { margin: 0; color: var(--body); overflow-wrap: anywhere; }
  .login-warning { grid-column: 1 / -1; border-left: 3px solid var(--warn); background: var(--panel-2); padding: 9px 13px; margin: 4px 0 0; color: var(--body); font-size: 13px; }
  .login-notes { display: grid; gap: 8px; margin: 0 0 14px; }
  @media (max-width: 760px) { .login-card { grid-template-columns: 1fr; } .login-card .actions { grid-column: 1; grid-row: auto; justify-content: start; } }
  .test-grid { display: grid; gap: 8px; }
  .test-row { display: grid; grid-template-columns: minmax(160px, .7fr) minmax(0, 1fr) auto; gap: 10px; align-items: center; border-top: 1px solid var(--line); padding: 10px 0; }
  .recommendation { border-left: 3px solid var(--copper); padding: 10px 14px; margin: 10px 0; background: var(--panel-2); }
  .help section { margin-bottom: 16px; }
  main.help { display: block; max-width: 1040px; margin: 0 auto; padding: 32px 20px 56px; }
  li { margin: 7px 0; }
  pre { overflow-x: auto; background: #111827; border: 1px solid var(--line); padding: 14px; border-radius: 6px; }
  @media (max-width: 760px) { main { display: block; } .sidebar { position: fixed; z-index: 30; width: min(290px,86vw); transform: translateX(-102%); transition: transform .18s ease; box-shadow: 18px 0 45px rgba(0,0,0,.35); } .sidebar.open { transform: translateX(0); } .workspace { padding: 0 16px 42px; } .appbar { gap: 9px; } .summary { grid-template-columns: repeat(2, 1fr); } #menu-toggle { display: inline-block !important; order: -1; } .actions { grid-column: 1 / -1; grid-row: auto; justify-content: start; } .setting-row, .model-tools, .model-row { grid-template-columns: 1fr; gap: 6px; } .model-provider-group > summary { grid-template-columns: 1fr auto; } .model-provider-group > summary .provider-state { grid-column: 1; } }
  #menu-toggle { display: none; }
`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conduit Bridge</title><style>${SHARED_STYLE}</style></head>
<body><main><aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark">OPEN SOURCE / COMMUNITY</div><h1>Conduit Bridge</h1><small>Provider control plane</small></div><nav class="side-menu" aria-label="Dashboard sections"><button class="active" data-section="overview">Overview</button><button data-section="playground">Playground</button><button data-section="providers">Providers</button><button data-section="models">Models</button><button data-section="usage">Usage</button><button data-section="orchestrator">Orchestrator</button><button data-section="integration">Integration tests</button><button data-section="recommendations">Recommendations</button><button data-section="activity">Activity</button><button data-section="settings">Settings</button><button data-section="help">Help</button></nav><div class="side-footer"><span id="side-runtime">Loading...</span></div></aside><div class="workspace">
  <nav class="appbar" aria-label="Dashboard controls"><button id="menu-toggle" type="button" aria-label="Toggle navigation">Menu</button><span class="appbrand">CONDUIT BRIDGE</span><button id="refresh" type="button">Refresh</button></nav>
  <p id="notice" role="status"></p>
  <div id="overview-section" class="page-section active">
  <header id="overview" class="anchor"><div><h1>Operational Dashboard</h1><div class="muted" id="version">Loading...</div></div></header>
  <div class="summary" aria-label="Runtime summary"><div class="summary-item"><strong id="summary-connected">-</strong><span>Connected providers</span></div><div class="summary-item"><strong id="summary-models">-</strong><span>Registered models</span></div><div class="summary-item"><strong id="summary-requests">-</strong><span>Requests handled</span></div><div class="summary-item"><strong id="summary-active">-</strong><span>Active requests</span></div></div>
  <div class="grid">
    <article class="transport"><strong>web-*</strong><h3>Browser sessions</h3><p>Playwright drives the provider website. Sessions use persistent browser profiles and require an interactive provider login.</p></article>
    <article class="transport"><strong>api-*</strong><h3>Direct APIs</h3><p>Requests use the provider SDK or REST API. Credentials come from the local CLI, environment, or protected bridge configuration.</p></article>
    <article class="transport"><strong>cli-*</strong><h3>Local coding CLIs</h3><p>Requests are handed to an installed CLI such as Claude Code, Codex, Gemini CLI, or Grok CLI.</p></article>
    <article class="transport"><strong>lmstudio/*</strong><h3>Local models</h3><p>Requests go to an OpenAI-compatible LM Studio server on the local machine. No cloud login is required.</p></article>
  </div>
  </div>
  <section id="playground-section" class="playground page-section"><h2>Local Playground</h2><p class="muted">Send a small test request through the same OpenAI-compatible route used by clients.</p>
    <label>Model<select id="play-model"></select></label>
    <label>Effort<select id="play-effort"></select></label>
    <label>Prompt<textarea id="play-prompt">Reply with exactly: pong</textarea></label>
    <div class="play-actions"><button id="play-run" type="button">Run test</button><span id="play-note" class="muted"></span></div>
    <pre id="play-output" aria-live="polite">No test run yet.</pre>
  </section>
  <div id="providers-section" class="wide page-section"><section><header><div><h2>Browser sign-in</h2><div class="muted">Sign in to a web provider in a browser window on this machine</div></div></header><div id="login-panel">Loading...</div></section><section class="wide"><header><div><h2>Providers</h2><div class="muted">Grouped by how requests are executed</div></div></header><div id="provider-list">Loading...</div></section></div>
  <div id="models-section" class="wide page-section"><section><h2>Models by transport and provider</h2><p class="muted">Choose a transport first, then expand a provider to see its exact model IDs.</p><div class="model-tools"><input id="model-search" type="search" placeholder="Search model, owner, or provider"><select id="model-transport-filter" aria-label="Filter by transport"><option value="">All transports</option><option value="web-*">Browser sessions</option><option value="api-*">Direct APIs</option><option value="cli-*">Coding CLIs</option><option value="lmstudio/*">Local models</option></select><select id="model-provider-filter" aria-label="Filter by provider"><option value="">All providers</option></select><button id="model-refresh" type="button">Refresh catalogs</button></div><div id="model-count" class="muted"></div><div id="model-summary" class="model-summary"></div><div id="model-list">Loading...</div></section></div>
  <section id="orchestrator-section" class="wide page-section"><h2>Orchestrator</h2><p class="muted">Configure a multi-model run. Each role receives the same task, so you can compare viewpoints or build a staged review.</p><label><span>Enabled</span><select id="orch-enabled"><option value="false">Disabled</option><option value="true">Enabled</option></select></label><label><span>Strategy</span><select id="orch-strategy"><option value="sequential">Sequential review</option><option value="parallel">Parallel panel</option><option value="debate">Debate chain</option></select></label><div id="orch-roles"></div><label><span>Fallback models</span><select id="orch-fallbacks" multiple size="4"></select></label><div class="play-actions"><button id="orch-save" type="button">Save orchestration</button><button id="orch-run" type="button">Run orchestration</button><span id="orch-note" class="muted"></span></div><pre id="orch-output">No orchestration run yet.</pre></section>
  <section id="integration-section" class="wide page-section"><h2>Integration tests</h2><p class="muted">These tests use the same local OpenAI-compatible route that OpenClaw WebChat, Conduit VS Code, curl, and other clients use.</p><pre>Base URL: http://127.0.0.1:31338/v1
Model:    cli-grok/grok-4.6
Request:  POST /chat/completions</pre><div class="play-actions"><button id="test-all-cli" type="button">Test all CLI providers</button><button id="test-openai" type="button">Test OpenAI-compatible route</button></div><div id="test-output" class="activity-list">No integration test run yet.</div></section>
  <section id="recommendations-section" class="wide page-section"><h2>Recommendations</h2><p class="muted">Operational guidance for a reliable local model gateway.</p><div class="recommendation"><strong>Use CLI providers for coding work.</strong><br><span class="muted">They expose the installed coding tools, account isolation, and provider-specific effort controls.</span></div><div class="recommendation"><strong>Use API providers for automation.</strong><br><span class="muted">They are more stable for services, scheduled jobs, and OpenClaw WebChat integrations.</span></div><div class="recommendation"><strong>Use browser providers as interactive fallbacks.</strong><br><span class="muted">Browser sessions depend on cookies, UI changes, and an interactive login display.</span></div><div class="recommendation"><strong>Validate changes with ping-pong first.</strong><br><span class="muted">Run the CLI matrix, then a real OpenAI-compatible request, then the orchestrator.</span></div></section>
  <section id="activity-section" class="wide page-section"><h2>Activity and logs</h2><p class="muted">Live operational events from authentication, routing, requests, and settings. Prompts, responses, and credentials are never logged.</p><div id="activity-log" class="activity-list">No events yet.</div><h3>Request telemetry</h3><div id="metrics">No requests yet.</div></section>
  <section id="usage-section" class="wide page-section"><h2>Usage statistics</h2><p class="muted">In-memory usage since the last bridge restart. No prompt or response content is stored.</p><div class="summary"><div class="summary-item"><strong id="usage-total">0</strong><span>Total requests</span></div><div class="summary-item"><strong id="usage-success">0</strong><span>Successful</span></div><div class="summary-item"><strong id="usage-failure">0</strong><span>Failed</span></div><div class="summary-item"><strong id="usage-latency">-</strong><span>Average latency</span></div></div><div id="usage-table" class="model-list">No usage yet.</div></section>
  <section id="settings-section" class="wide page-section"><h2>Settings</h2><p class="muted">Manage provider configuration. Secret values are write-only and never returned by the bridge.</p><section><h3>API credentials</h3><div id="settings-keys">Loading...</div><h3>Browser sessions</h3><p class="muted">Start a provider login on the Providers page. Its browser viewer appears on that provider's card and uses this same port.</p><div id="settings-profiles">Loading...</div><h3>CLI accounts</h3><div id="settings-accounts">Loading...</div></section></section>
  <section id="help-section-v2" class="wide page-section"><h2>Help and operating guide</h2><p class="muted">Install, connect clients, sign in to browser providers, and diagnose the bridge.</p>
    <section><h3>Run anywhere</h3><p>Conduit Bridge needs Node.js 24 or newer and Chromium. OpenClaw is optional. On Windows, macOS, or desktop Linux, start the bridge and open <code>http://127.0.0.1:31338/</code>.</p></section>
    <section><h3>Recommended for a remote OpenClaw server</h3><p>Run Conduit Bridge on the local workstation so Chromium, cookies, browser storage, and coding CLIs remain local. Reverse-forward the complete bridge to the server. OpenClaw can keep calling <code>http://127.0.0.1:31338/v1</code>.</p><pre>ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -R 127.0.0.1:31338:127.0.0.1:31338 &lt;server&gt;</pre><p>The server port must be free and the tunnel works only while the workstation is online. A dashboard page cannot safely extract another site's HttpOnly cookies or complete browser profile.</p></section>
    <section><h3>Fully remote bridge</h3><p>If Conduit Bridge itself must run on Linux, keep 31338 bound to loopback, render Chromium on Xvfb, and forward the dashboard to the workstation.</p><pre>ssh -L 31338:127.0.0.1:31338 &lt;server&gt;</pre></section>
    <section><h3>Browser sign-in</h3><p>Choose <strong>Providers</strong>, then <strong>Start login</strong>. Conduit starts ordinary headed Chromium, attaches after launch, and keeps <code>navigator.webdriver</code> false. Choose <strong>Open login browser</strong> to use the built-in page viewer. Its frames and validated mouse and keyboard events use port 31338. No separate remote-desktop service is involved.</p><p>On a desktop the Chromium window is also visible locally. A remote server can render Chromium on Xvfb. Complete security checks yourself, then choose <strong>Check login status</strong>. Profiles stay below <code>~/.conduit/profiles/</code>.</p></section>
    <section><h3>Model transports</h3><ul><li><code>web-*</code>: persistent browser sessions.</li><li><code>api-*</code>: direct provider APIs and aggregators.</li><li><code>cli-*</code>: installed coding CLIs and isolated accounts.</li><li><code>lmstudio/*</code>: a local OpenAI-compatible LM Studio endpoint.</li></ul><p>Send the complete model ID shown on the Models page.</p></section>
    <section><h3>Client endpoints</h3><pre>Base URL: http://127.0.0.1:31338/v1
Models:   GET /v1/models
Status:   GET /v1/status
Chat:     POST /v1/chat/completions
Responses: POST /v1/responses
Embeddings: POST /v1/embeddings
Events:   ws://127.0.0.1:31338/v1/events</pre><p>Use <code>fallback_models</code> for ordered recovery and <code>effort</code> or <code>reasoning_effort</code> where supported.</p></section>
    <section><h3>Security and troubleshooting</h3><ul><li>Keep 31338 on loopback and use SSH forwarding for remote access.</li><li>An external bind requires <code>authToken</code> and an explicit origin allowlist.</li><li>Activity and metrics never store prompts, responses, cookies, or credentials.</li><li>If login cannot start, verify Chromium, <code>DISPLAY</code>, and Xvfb on a remote host.</li><li>If restore fails after login, inspect Technical details and try the matching <code>api-*</code> or <code>cli-*</code> transport.</li></ul><p>The standalone <a class="link" href="/help">Help page</a> and <code>docs/BROWSER-LOGIN.md</code> contain the full deployment guide.</p></section>
  </section>
</div></main><script>
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  document.querySelector('.brand-mark').textContent = 'OPEN SOURCE / COMMUNITY';
  const legend = document.createElement('div'); legend.className = 'status-legend'; legend.innerHTML = '<span><i class="dot ok"></i>Green: connected and ready</span><span><i class="dot warn"></i>Yellow: profile exists, session needs attention</span><span><i class="dot"></i>Red: not configured or unavailable</span>'; $('overview-section').insertBefore(legend, $('overview-section').querySelector('.grid'));
  const family = id => id.startsWith('web-') ? 'web-*' : id.startsWith('api-') ? 'api-*' : id.startsWith('cli-') ? 'cli-*' : id.startsWith('lmstudio/') ? 'lmstudio/*' : 'other';
  const familyHelp = {'web-*':'Browser sessions','api-*':'Direct APIs','cli-*':'Local coding CLIs','lmstudio/*':'Local models','other':'Other'};
  const familyOrder = ['web-*','api-*','cli-*','lmstudio/*','other'];
  const providerForModel = id => id.startsWith('web-grok/') ? 'grok' : id.startsWith('web-claude/') ? 'claude' : id.startsWith('web-gemini/') ? 'gemini' : id.startsWith('web-chatgpt/') ? 'chatgpt' : id.startsWith('web-perplexity/') ? 'perplexity' : id.startsWith('api-claude/') ? 'claude-api' : id.startsWith('api-gemini/') ? 'gemini-api' : id.startsWith('api-codex/') ? 'codex-api' : id.startsWith('api-openrouter/') ? 'openrouter-api' : id.startsWith('api-perplexity/') ? 'perplexity-api' : id.startsWith('cli-grok/') ? 'grok-cli' : id.startsWith('cli-codex/') ? 'cli-codex' : id.startsWith('cli-claude/') ? 'cli-claude' : id.startsWith('cli-gemini/') ? 'cli-gemini' : 'lmstudio';
  let models = [], capabilities = {};
  const sectionIds = { overview: 'overview-section', playground: 'playground-section', providers: 'providers-section', models: 'models-section', usage: 'usage-section', orchestrator: 'orchestrator-section', integration: 'integration-section', recommendations: 'recommendations-section', activity: 'activity-section', settings: 'settings-section', help: 'help-section-v2' };
  function showSection(name) { Object.entries(sectionIds).forEach(([key, id]) => $(id).classList.toggle('active', key === name)); document.querySelectorAll('[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === name)); $('sidebar').classList.remove('open'); }
  const stateClass = p => p.sessionValid ? 'ok' : (p.hasProfile ? 'warn' : '');
  const stateText = p => {
    if (p.sessionValid && p.loginType === 'browser') return 'Browser session active · web-* ready';
    if (p.sessionValid && p.loginType === 'api-key') return 'API credential available · api-* ready';
    if (p.sessionValid) return 'CLI authenticated · cli-* ready';
    if (p.loginType === 'browser') return p.hasProfile ? 'Browser profile exists · authentication required' : 'No browser profile · login required';
    if (p.loginType === 'api-key') return p.hasProfile ? 'API credential configured · provider unavailable' : 'No API credential · add a key in Settings';
    return 'CLI unavailable · authenticate the local tool';
  };
  const authText = p => p.loginType === 'browser' ? 'Web provider' : (p.loginType === 'api-key' ? 'Direct API' : 'Local CLI');
  async function request(path, options) { const response = await fetch(path, options); const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || data?.message || 'Request failed'); return data; }
  function renderProviders(items) {
    lastProviders = items;
    const groups = [['browser', 'Browser providers', 'web-*', 'Web sessions backed by persistent browser profiles'], ['api-key', 'API providers', 'api-*', 'Direct APIs and OpenAI-compatible aggregators'], ['cli', 'CLI providers', 'cli-*', 'Installed local coding tools']];
    const html = groups.map(([type, title, prefix, description]) => {
      const group = items.filter(p => type === 'cli' ? p.loginType === 'api-key' && (p.name.startsWith('cli-') || p.name.endsWith('-cli')) : type === 'api-key' ? p.loginType === 'api-key' && !p.name.startsWith('cli-') && !p.name.endsWith('-cli') : p.loginType === type);
      if (!group.length) return '';
      return '<div class="provider-block"><h3>' + title + '<small>' + prefix + '</small></h3><p class="muted">' + description + '</p>' + group.map(p => {
        const canLogin = p.loginType === 'browser';
        const live = loginStates[p.name];
        const liveNote = live && LOGIN_TERMINAL.indexOf(live.state) === -1 ? ' · login ' + esc(live.state) : '';
        return '<div class="provider"><div class="status"><span class="dot ' + stateClass(p) + '"></span>' + esc(p.name) + '</div>' +
          '<div class="actions">' + (canLogin ? '<button data-login="' + esc(p.name) + '">Start login</button>' : '') + (p.hasProfile ? '<button data-logout="' + esc(p.name) + '">Disconnect</button>' : '') + '</div>' +
          '<small>' + esc(stateText(p)) + liveNote + ' · ' + esc(authText(p)) + ' · ' + esc(p.models.length) + ' models registered</small></div>';
      }).join('') + '</div>';
    }).join('');
    $('provider-list').innerHTML = html || 'No providers registered.';
    // Scoped to #provider-list: a document-wide query would re-bind the login
    // panel's buttons on every 15-second refresh.
    $('provider-list').querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => login(button.dataset.login, button)));
    $('provider-list').querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', () => logout(button.dataset.logout, button)));
  }
  function modelOptionGroups(selected) {
    const selectedIds = new Set(Array.isArray(selected) ? selected : [selected]);
    const groups = {};
    models.forEach(model => ((groups[providerForModel(model.id)] ||= []).push(model)));
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([provider, grouped]) =>
      '<optgroup label="' + esc(provider) + '">' + grouped.sort((a,b) => a.id.localeCompare(b.id)).map(model =>
        '<option value="' + esc(model.id) + '"' + (selectedIds.has(model.id) ? ' selected' : '') + '>' + esc(model.id.slice(model.id.indexOf('/') + 1)) + '</option>'
      ).join('') + '</optgroup>'
    ).join('');
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
    items.forEach(model => { const provider = providerForModel(model.id); providerCounts[provider] = (providerCounts[provider] || 0) + 1; });
    providerFilter.innerHTML = '<option value="">All providers</option>' + Object.entries(providerCounts).sort(([a],[b]) => a.localeCompare(b)).map(([provider,count]) => '<option value="' + esc(provider) + '">' + esc(provider) + ' (' + count + ')</option>').join('');
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
        const ready = Boolean(providerStatus?.sessionValid);
        const providerState = ready ? 'Ready' : (providerStatus?.hasProfile ? 'Needs authentication' : 'Unavailable');
        const ordered = grouped.sort((a,b) => a.id.localeCompare(b.id));
        return '<details class="model-provider-group"' + (expand || ordered.length <= 8 ? ' open' : '') + '><summary><span><strong>' + esc(routeProvider) + '</strong><small>Route through ' + esc(familyHelp[name].toLowerCase()) + '</small></span><span class="provider-state ' + (ready ? 'ready' : 'unavailable') + '">' + esc(providerState) + '</span><span>' + ordered.length + ' models</span></summary><div class="model-provider-models">' + ordered.map(model => {
          const target = model.id.slice(model.id.indexOf('/') + 1);
          const source = model.conduit?.source || model.source || model.owned_by || 'provider catalog';
          const availability = model.conduit?.availability || model.availability || 'dynamic';
          return '<div class="model-row"><div><strong>' + esc(target) + '</strong><code>' + esc(model.id) + '</code></div><span class="model-meta">' + esc(availability) + ' · ' + esc(source) + '</span><button type="button" data-use-model="' + esc(model.id) + '">Use in Playground</button></div>';
        }).join('') + '</div></details>';
      }).join('') + '</div>';
    }).join('') || '<span class="muted">No matching models.</span>';
  }
  function renderMetrics(data) { const rows = Object.entries(data.models || {}).sort((a,b) => (b[1].requests || 0) - (a[1].requests || 0)); $('metrics').innerHTML = rows.length ? '<div class="model-list">' + rows.map(([model, m]) => '<div><code>' + esc(model) + '</code> · ' + m.successes + '/' + m.requests + ' successful · ' + (m.averageLatencyMs ?? '-') + ' ms avg · ' + m.inFlight + ' active' + (m.lastError ? ' · <span class="muted">last error: ' + esc(m.lastError) + '</span>' : '') + '</div>').join('') + '</div>' : 'No requests yet.'; }
  function renderActivity(data) { const events = data.events || []; $('activity-log').innerHTML = events.length ? events.map(event => '<div class="activity-event ' + esc(event.level) + '"><time>' + new Date(event.time).toLocaleTimeString() + '</time><span class="scope">' + esc(event.scope) + '</span><span><strong class="level">' + esc(event.level) + '</strong> · ' + esc(event.message) + '</span></div>').join('') : 'No events yet.'; }
  function renderOrchestrator(data) { $('orch-enabled').value = String(Boolean(data.enabled)); $('orch-strategy').value = data.strategy || 'sequential'; $('orch-roles').innerHTML = (data.roles || []).map((role, i) => '<label><span>Role ' + (i + 1) + ': ' + esc(role.name) + '</span><select data-orch-role="' + i + '"><option value="">Select a model</option>' + modelOptionGroups(role.model) + '</select></label>').join(''); $('orch-fallbacks').innerHTML = modelOptionGroups(data.fallbackModels || []); }
  async function saveOrchestrator() { const roles = [...document.querySelectorAll('[data-orch-role]')].map((select, i) => ({ name: ['Analyst', 'Reviewer', 'Synthesizer'][i] || 'Role ' + (i + 1), model: select.value })); const fallbackModels = [...$('orch-fallbacks').selectedOptions].map(option => option.value); const data = await request('/v1/orchestrator', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:$('orch-enabled').value === 'true', strategy:$('orch-strategy').value, roles, fallbackModels})}); renderOrchestrator(data); $('orch-note').textContent = 'Configuration saved'; }
  async function runOrchestrator() { $('orch-run').disabled = true; $('orch-note').textContent = 'Running...'; try { await saveOrchestrator(); const data = await request('/v1/orchestrator/run', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:'Compare the current project state and identify the most important next engineering action.'})}); $('orch-output').textContent = data.results.map(r => r.role + ' (' + r.model + ')\\n' + r.content).join('\\n\\n'); $('orch-note').textContent = 'Completed'; showSection('activity'); } catch (error) { $('orch-output').textContent = error.message; $('orch-note').textContent = 'Failed'; } finally { $('orch-run').disabled = false; } }
  async function runCliTests() { $('test-all-cli').disabled = true; $('test-output').textContent = 'Running CLI provider matrix...'; try { const data = await request('/v1/tests/cli', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}); $('test-output').innerHTML = data.results.map(r => '<div class="activity-event ' + (r.ok ? 'success' : 'error') + '"><span class="scope">' + esc(r.provider) + '</span><span>' + (r.ok ? 'PASS' : 'FAIL') + '</span><span>' + esc(r.model || '') + ' · ' + esc(r.output || r.error || '') + ' · ' + r.latencyMs + ' ms</span></div>').join(''); showSection('activity'); } catch (error) { $('test-output').textContent = error.message; } finally { $('test-all-cli').disabled = false; } }
  async function runOpenAiTest() { $('test-openai').disabled = true; $('test-output').textContent = 'Testing OpenAI-compatible route...'; try { const model = models.find(m => m.id.startsWith('cli-'))?.id || models[0]?.id; const data = await request('/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model, messages:[{role:'user',content:'Reply with exactly: pong'}], max_tokens:16})}); $('test-output').innerHTML = '<div class="activity-event success"><span class="scope">OpenClaw route</span><span>PASS</span><span>' + esc(model) + ' · ' + esc(data.choices?.[0]?.message?.content || '') + '</span></div>'; } catch (error) { $('test-output').textContent = error.message; } finally { $('test-openai').disabled = false; } }
  function renderUsage(data) { const rows = Object.entries(data.models || {}).sort((a,b) => b[1].requests - a[1].requests); const total = rows.reduce((n,[,m]) => n + m.requests, 0); const success = rows.reduce((n,[,m]) => n + m.successes, 0); const failure = rows.reduce((n,[,m]) => n + m.failures, 0); const latency = rows.reduce((n,[,m]) => n + m.totalLatencyMs, 0); const inputTokens = rows.reduce((n,[,m]) => n + (m.inputTokens || 0), 0); const outputTokens = rows.reduce((n,[,m]) => n + (m.outputTokens || 0), 0); const cost = rows.reduce((n,[,m]) => n + (m.estimatedCostUsd || 0), 0); $('usage-total').textContent = total; $('usage-success').textContent = success; $('usage-failure').textContent = failure; $('usage-latency').textContent = total ? Math.round(latency / total) + ' ms' : '-'; $('usage-table').innerHTML = rows.length ? '<p class="muted">Estimated tokens: ' + inputTokens + ' in / ' + outputTokens + ' out · estimated cost: $' + cost.toFixed(6) + '</p>' + rows.map(([model,m]) => '<div><code>' + esc(model) + '</code> · ' + m.requests + ' requests · ' + m.successes + ' successful · ' + m.failures + ' failed · ' + (m.inputTokens || 0) + ' input tokens · ' + (m.outputTokens || 0) + ' output tokens · $' + (m.estimatedCostUsd || 0).toFixed(6) + ' estimated · ' + (m.averageLatencyMs ?? '-') + ' ms average</div>').join('') : 'No usage yet.'; }
  function updateEffortOptions() { const model = $('play-model').value; const provider = providerForModel(model); const info = capabilities[provider] || { values: ['none','minimal','low','medium','high','xhigh','max'] }; $('play-effort').innerHTML = info.values.map(value => '<option value="' + value + '">' + value + (info.aliases && info.aliases[value] ? ' (maps to ' + info.aliases[value] + ')' : '') + '</option>').join(''); }
  function renderSettings(data) { $('settings-keys').innerHTML = '<div class="setting-list">' + Object.entries(data.apiKeys || {}).map(([provider, info]) => '<div class="setting-row"><strong>' + esc(provider) + '</strong><span class="setting-badge">' + esc(info.source || (info.configured ? 'Configured' : 'Not detected')) + '</span><form data-key-provider="' + esc(provider) + '"><input type="password" autocomplete="new-password" placeholder="' + (info.configured ? 'Replace stored API key' : 'Paste API key') + '"><button type="submit">Save API key</button></form></div>').join('') + '</div><p class="muted">Keys are write-only. A successful save is shown as <code>Bridge config</code> after refresh.</p>'; $('settings-profiles').innerHTML = '<div class="setting-list">' + (data.profiles || []).map(p => '<div class="setting-row"><strong>' + esc(p.provider) + '</strong><span>' + (p.connected ? 'Browser session active · web-* ready' : (p.hasProfile ? 'Browser profile exists · authentication required' : 'No browser profile · login required')) + '</span><code>' + esc(p.status) + '</code></div>').join('') + '</div>'; $('settings-accounts').innerHTML = Object.entries(data.accounts || {}).map(([provider, accounts]) => '<div class="setting-row"><strong>' + esc(provider) + '</strong><span>' + accounts.map(account => '<code>' + esc(account) + '</code>').join(' ') + '</span><small>Neutral account IDs</small></div>').join(''); document.querySelectorAll('[data-key-provider]').forEach(form => form.addEventListener('submit', saveKey)); }
  async function saveKey(event) { event.preventDefault(); const form = event.currentTarget; const input = form.querySelector('input'); if (!input.value) return; const button = form.querySelector('button'); button.disabled = true; try { await request('/v1/settings/api-key', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:form.dataset.keyProvider, key:input.value})}); input.value = ''; $('notice').textContent = 'Credential saved for ' + form.dataset.keyProvider; await refresh(); } catch (error) { $('notice').textContent = error.message; } finally { button.disabled = false; } }
  async function refresh() { $('notice').textContent = 'Refreshing...'; try { const [status, modelData, capabilityData, metricData, settings, activity, orchestrator] = await Promise.all([request('/v1/status'), request('/v1/models'), request('/v1/capabilities'), request('/v1/metrics'), request('/v1/settings'), request('/v1/activity'), request('/v1/orchestrator')]); capabilities = capabilityData.effort || {}; restoringSessions = Boolean(status.restoringSessions); $('version').textContent = 'v' + status.version + ' · port ' + status.port + ' · uptime ' + Math.floor(status.uptime) + 's'; $('side-runtime').textContent = '127.0.0.1:' + status.port + ' · v' + status.version; $('summary-connected').textContent = status.providers.filter(p => p.connected).length + '/' + status.providers.length; $('summary-models').textContent = (modelData.data || []).length; const metricRows = Object.values(metricData.models || {}); $('summary-requests').textContent = metricRows.reduce((n, m) => n + m.requests, 0); $('summary-active').textContent = metricRows.reduce((n, m) => n + m.inFlight, 0); renderProviders(status.providers); renderModels(modelData.data || []); renderMetrics(metricData); renderUsage(metricData); renderSettings(settings); renderActivity(activity); renderOrchestrator(orchestrator); $('notice').textContent = 'Updated ' + new Date().toLocaleTimeString(); } catch (error) { $('notice').textContent = error.message; } }
  const LOGIN_LABELS = { grok: 'Grok', claude: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT', perplexity: 'Perplexity' };
  const LOGIN_TONE = { authenticated: 'ok', browser_ready: 'warn', waiting_for_user: 'warn', verifying: 'warn', starting: 'warn', challenge_detected: 'warn', blocked: 'bad', timeout: 'bad', failed: 'bad', cancelled: '' };
  const LOGIN_TERMINAL = ['authenticated', 'blocked', 'timeout', 'failed', 'cancelled'];
  const LOGIN_OVERRIDDEN_BY_SESSION = ['blocked', 'timeout', 'failed', 'cancelled'];
  const loginProviders = () => (lastProviders || []).filter(p => p.loginType === 'browser').map(p => p.name);
  let lastProviders = [], loginStates = {}, loginEnv = {}, loginViewer = {}, restoringSessions = false;

  const relTime = ms => { if (!ms && ms !== 0) return 'never'; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; };

  function loginCardHtml(provider) {
    const status = (lastProviders || []).find(p => p.name === provider) || {};
    const reportedState = loginStates[provider];
    const staleAttempt = status.sessionValid && reportedState && LOGIN_OVERRIDDEN_BY_SESSION.indexOf(reportedState.state) !== -1;
    const state = staleAttempt ? null : reportedState;
    if (staleAttempt) delete loginStates[provider];
    const env = loginEnv[provider] || {};
    const viewer = loginViewer[provider] || {};
    const name = LOGIN_LABELS[provider] || provider;
    const current = state ? state.state : (status.sessionValid ? 'signed in' : (restoringSessions ? 'checking' : 'not signed in'));
    const tone = state ? (LOGIN_TONE[current] || '') : (status.sessionValid ? 'ok' : 'warn');
    const busy = state && LOGIN_TERMINAL.indexOf(state.state) === -1;
    const message = state ? state.message : (status.sessionValid
      ? name + ' is signed in. The saved profile is reused automatically.'
      : (restoringSessions ? 'Checking the saved ' + name + ' session...'
        : (status.hasProfile ? name + ' has a saved profile but is not signed in.' : name + ' is not signed in yet.')));
    const next = state ? state.nextAction
      : (status.sessionValid ? ''
        : (restoringSessions ? 'This runs once at startup and takes a moment.'
          : 'Choose "Start login" and complete the sign-in in the login browser window.'));
    const diagnostics = (state && state.diagnostics) || {};

    // The controls come from the state machine's own per-state contract, so the
    // panel cannot offer an action that does not apply — pressing "Check login
    // status" during a check would close the very window in use.
    const allowed = state && state.actions ? state.actions : (busy ? ['open_browser', 'recheck', 'cancel'] : ['retry', 'recheck']);
    const buttons = [];
    if (allowed.indexOf('open_browser') !== -1 && viewer.url) {
      buttons.push('<a class="link" href="' + esc(viewer.url) + '" target="_blank" rel="noopener">Open login browser</a>');
    }
    if (!busy) {
      buttons.push('<button data-login-start="' + esc(provider) + '">' + (status.sessionValid ? 'Sign in again' : 'Start login') + '</button>');
    }
    if (allowed.indexOf('recheck') !== -1 && (busy || status.hasProfile)) {
      buttons.push('<button data-login-recheck="' + esc(provider) + '">Check login status</button>');
    }
    if (allowed.indexOf('cancel') !== -1 && busy) {
      buttons.push('<button data-login-cancel="' + esc(provider) + '">Cancel</button>');
    }
    if (allowed.indexOf('use_api_key') !== -1) {
      buttons.push('<button data-section="settings">Use an API key</button>');
    }

    const rows = [
      ['Browser viewer', viewer.available ? 'Available on this port' : 'Not running'],
      ['Saved profile', status.hasProfile ? 'Yes' : 'No'],
      ['Provider session', status.sessionValid ? 'Signed in' : ((status.session && status.session.status) || 'unknown')],
      ['Last change', state ? relTime(state.updatedAt) : relTime(status.session && status.session.lastVerified)],
      ['Login browser mode', diagnostics.browserMode || 'native attached browser'],
      ['Remote interaction', 'Built into port 31338'],
      ['Window manager', env.windowManager === false ? 'None on the virtual desktop' : 'Present'],
    ];
    if (diagnostics.challengeKind) rows.push(['Security check', diagnostics.challengeKind.replace(/_/g, ' ')]);
    if (diagnostics.rayId) rows.push(['Provider reference', diagnostics.rayId]);
    if (diagnostics.httpStatus) rows.push(['Last HTTP status', String(diagnostics.httpStatus)]);
    if (diagnostics.finalUrl) rows.push(['Last page', diagnostics.finalUrl]);
    if (diagnostics.pageTitle) rows.push(['Page title', diagnostics.pageTitle]);
    if (diagnostics.reason) rows.push(['Last message', diagnostics.reason]);
    const restore = status.lastLoginDiagnostics || {};
    if (restore.reason) rows.push(['Last session restore', restore.reason]);
    if (restore.challengeKind) rows.push(['Restore security check', restore.challengeKind.replace(/_/g, ' ')]);
    if (restore.finalUrl) rows.push(['Restore landed on', restore.finalUrl]);

    return '<div class="login-card state-' + tone + '">' +
      '<h3>' + esc(name) + '<span class="login-state">' + esc(current) + '</span></h3>' +
      '<div class="actions">' + buttons.join('') + '</div>' +
      '<p class="login-message">' + esc(message) + '</p>' +
      (next ? '<p class="login-next">' + esc(next) + '</p>' : '') +
      (state && busy ? '<p class="login-meta">Started ' + relTime(state.startedAt) + '</p>' : '') +
      '<details><summary>Technical details</summary><dl>' +
        rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
      '</dl></details>' +
    '</div>';
  }

  function renderLoginPanel() {
    const providers = loginProviders();
    if (!providers.length) { $('login-panel').innerHTML = 'No browser providers registered.'; return; }
    // Environment warnings describe the machine, so they belong once above the
    // cards rather than repeated on every provider.
    const blocked = [...new Set(providers
      .map(p => loginEnv[p] || {})
      .filter(e => e.ready === false)
      .map(e => e.reason || 'A graphical session is required to sign in to a web provider.'))];
    const notes = blocked.concat([...new Set(providers.flatMap(p => (loginEnv[p] || {}).warnings || []))]);
    $('login-panel').innerHTML =
      (notes.length ? '<div class="login-notes">' + notes.map(w => '<p class="login-warning">' + esc(w) + '</p>').join('') + '</div>' : '') +
      '<div class="login-grid">' + providers.map(loginCardHtml).join('') + '</div>';
  }

  async function loadLoginEnvironment(provider) {
    try {
      const data = await request('/v1/login/' + encodeURIComponent(provider) + '/status');
      loginEnv[provider] = data.environment || {};
      loginViewer[provider] = data.viewer || {};
      if (data.login) loginStates[provider] = data.login;
      else if (!data.active) delete loginStates[provider];
    } catch (error) { /* the panel still renders from /v1/status */ }
  }

  async function refreshLoginPanel() {
    await Promise.all(loginProviders().map(loadLoginEnvironment));
    renderLoginPanel();
  }

  function applyLoginState(snapshot) {
    if (!snapshot || !snapshot.provider) return;
    loginStates[snapshot.provider] = snapshot;
    renderLoginPanel();
    $('notice').textContent = snapshot.message + (snapshot.nextAction ? ' ' + snapshot.nextAction : '');
    if (LOGIN_TERMINAL.indexOf(snapshot.state) !== -1) { loadLoginEnvironment(snapshot.provider).then(renderLoginPanel); refresh(); }
  }

  async function login(provider, button) {
    button.disabled = true;
    showSection('providers');
    $('notice').textContent = 'Preparing a browser session for ' + (LOGIN_LABELS[provider] || provider) + '...';
    try {
      const result = await request('/v1/login/' + encodeURIComponent(provider), { method: 'POST' });
      if (result.login) loginStates[provider] = result.login;
      if (result.viewer) loginViewer[provider] = result.viewer;
      $('notice').textContent = result.message;
      renderLoginPanel();
    } catch (error) {
      $('notice').textContent = error.message;
    } finally { button.disabled = false; refreshLoginPanel(); }
  }

  async function loginRecheck(provider, button) {
    button.disabled = true;
    let answer = '';
    $('notice').textContent = 'Checking the ' + (LOGIN_LABELS[provider] || provider) + ' sign-in...';
    try {
      const result = await request('/v1/login/' + encodeURIComponent(provider) + '/recheck', { method: 'POST' });
      if (result.login) loginStates[provider] = result.login;
      answer = result.message || answer;
    } catch (error) { answer = error.message; }
    finally {
      button.disabled = false;
      await refreshLoginPanel();
      // refresh() rewrites #notice, so the answer is written after it rather
      // than before — otherwise it is destroyed milliseconds later.
      await refresh();
      if (answer) $('notice').textContent = answer;
    }
  }

  async function loginCancel(provider, button) {
    button.disabled = true;
    let answer = '';
    try {
      const result = await request('/v1/login/' + encodeURIComponent(provider) + '/cancel', { method: 'POST' });
      if (result.login) loginStates[provider] = result.login;
      answer = (LOGIN_LABELS[provider] || provider) + ' login cancelled.';
    } catch (error) { answer = error.message; }
    finally {
      button.disabled = false;
      await refreshLoginPanel();
      await refresh();
      if (answer) $('notice').textContent = answer;
    }
  }

  // One delegated listener, bound once: the panel is re-rendered often and
  // per-element listeners would accumulate on every render.
  $('login-panel').addEventListener('click', event => {
    const section = event.target.closest('[data-section]');
    if (section) return showSection(section.dataset.section);
    const start = event.target.closest('[data-login-start]');
    if (start) return login(start.dataset.loginStart, start);
    const recheck = event.target.closest('[data-login-recheck]');
    if (recheck) return loginRecheck(recheck.dataset.loginRecheck, recheck);
    const cancel = event.target.closest('[data-login-cancel]');
    if (cancel) return loginCancel(cancel.dataset.loginCancel, cancel);
  });
  $('model-list').addEventListener('click', event => {
    const use = event.target.closest('[data-use-model]');
    if (!use) return;
    $('play-model').value = use.dataset.useModel;
    updateEffortOptions();
    showSection('playground');
    $('notice').textContent = use.dataset.useModel + ' selected in Playground.';
  });
  async function logout(provider, button) { button.disabled = true; try { await request('/v1/logout/' + encodeURIComponent(provider), { method: 'POST' }); $('notice').textContent = provider + ' logged out'; } catch (error) { $('notice').textContent = error.message; } finally { button.disabled = false; refresh(); } }
  async function runPlayground() { const button = $('play-run'); button.disabled = true; $('play-note').textContent = 'Running...'; $('play-output').textContent = ''; try { const result = await request('/v1/chat/completions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ model: $('play-model').value, effort: $('play-effort').value, messages: [{role:'user', content: $('play-prompt').value}], max_tokens: 64 }) }); $('play-output').textContent = result.choices?.[0]?.message?.content || JSON.stringify(result, null, 2); $('play-note').textContent = 'Completed'; } catch (error) { $('play-output').textContent = error.message; $('play-note').textContent = 'Failed'; } finally { button.disabled = false; } }
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.section))); $('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open')); $('play-model').addEventListener('change', updateEffortOptions); $('play-run').addEventListener('click', runPlayground);
  $('refresh').addEventListener('click', refresh); $('model-search').addEventListener('input', () => renderModels(models)); $('model-transport-filter').addEventListener('change', () => renderModels(models)); $('model-provider-filter').addEventListener('change', () => renderModels(models)); $('model-refresh').addEventListener('click', async () => { $('model-refresh').disabled = true; try { await request('/v1/models/refresh', {method:'POST'}); await refresh(); } finally { $('model-refresh').disabled = false; } }); $('orch-save').addEventListener('click', () => saveOrchestrator().catch(error => $('orch-note').textContent = error.message)); $('orch-run').addEventListener('click', runOrchestrator); $('test-all-cli').addEventListener('click', runCliTests); $('test-openai').addEventListener('click', runOpenAiTest);
  $('usage-section').querySelector('.muted').textContent = 'Persistent local telemetry inspired by Winbar. Token and cost values are estimates unless the provider reports exact usage. No prompt or response content is stored.';
  let eventsConnected = false;
  function connectEvents() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(scheme + '//' + location.host + '/v1/events');
    ws.onopen = () => { eventsConnected = true; };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'login') applyLoginState(data.login);
        else if (data.type === 'activity') refresh();
      } catch {}
    };
    ws.onerror = () => { if (!eventsConnected) $('notice').textContent = 'Live updates are unavailable. The dashboard will keep refreshing every 15 seconds.'; };
    ws.onclose = () => { eventsConnected = false; setTimeout(connectEvents, 3000); };
  }
  refresh().then(refreshLoginPanel); connectEvents(); setInterval(refresh, 15000); setInterval(refreshLoginPanel, 30000);
</script></body></html>`;

export const HELP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conduit Bridge Help</title><style>${SHARED_STYLE}</style></head>
<body><main class="help"><header><div><h1>Conduit Bridge Help</h1><div class="muted">Installation, browser login, provider routing, and operations</div></div><nav class="nav"><a class="link" href="/">Dashboard</a></nav></header>
  <section><h2>Requirements and installation</h2><p>Conduit Bridge runs independently of OpenClaw. It requires Node.js 24 or newer and Chromium on Windows, macOS, or Linux.</p><pre>npm install
npx playwright install chromium
npm run build
node dist/cli.js start --host=127.0.0.1 --port=31338</pre><p>Open <code>http://127.0.0.1:31338/</code>. The dashboard, API, event stream, and browser-login viewer share this one listener.</p></section>
  <section><h2>Recommended: local bridge for remote OpenClaw</h2><p>Run Conduit Bridge on the workstation where Chromium is visible. Keep the complete browser profile local and reverse-forward the bridge to the remote server:</p><pre>ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -R 127.0.0.1:31338:127.0.0.1:31338 &lt;server&gt;</pre><p>OpenClaw can keep using <code>http://127.0.0.1:31338/v1</code> on the server. Port 31338 must be free there, and the tunnel is available only while the workstation is online. This is safer and more complete than trying to export HttpOnly cookies, encrypted storage, or device-bound session state.</p></section>
  <section><h2>Fully remote Linux over SSH</h2><p>When the bridge itself must stay on the server, keep it bound to loopback and forward its only user-facing port from your workstation:</p><pre>ssh -L 31338:127.0.0.1:31338 &lt;server&gt;</pre><p>Then open <code>http://127.0.0.1:31338/</code> locally. A server without a desktop needs Xvfb so Chromium has a rendering target:</p><pre>Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
DISPLAY=:99 node dist/cli.js start --host=127.0.0.1 --port=31338</pre><p>Xvfb does not expose a remote-desktop port. Conduit captures the active login page itself and carries frames and validated input through 31338.</p></section>
  <section><h2>Browser-provider sign-in</h2><ol><li>Open <strong>Providers</strong> in the dashboard.</li><li>Choose <strong>Start login</strong> for Grok, Claude, Gemini, ChatGPT, or Perplexity.</li><li>Choose <strong>Open login browser</strong> on that provider card.</li><li>Complete the provider sign-in and any security check yourself.</li><li>Choose <strong>Check login status</strong>.</li></ol><p>Conduit starts ordinary headed Chromium first and attaches to its fixed loopback DevTools endpoint afterwards. The browser keeps its native Linux or desktop identity and reports <code>navigator.webdriver === false</code>. Conduit never applies a user-agent override or stealth flag.</p><p>The viewer exposes only JPEG frames and bounded pointer, wheel, keyboard, and text events. Raw DevTools commands are not accepted. Profiles are stored below <code>~/.conduit/profiles/</code> and reused by restore.</p><p>Security checks are detected and reported. Conduit never solves, suppresses, replays, or bypasses one.</p></section>
  <section><h2>Model routing</h2><ul><li><code>web-*</code> uses a persistent browser profile.</li><li><code>api-*</code> uses a direct provider API or aggregator.</li><li><code>cli-*</code> invokes an installed coding CLI and can isolate accounts.</li><li><code>lmstudio/*</code> forwards to a local OpenAI-compatible LM Studio server.</li></ul><p>The Models page groups the catalog by transport and provider, shows readiness and source, and filters by search, transport, or provider. Use the complete model ID shown there. Availability labels are <strong>verified</strong>, <strong>documented</strong>, or <strong>dynamic</strong>.</p></section>
  <section><h2>OpenAI-compatible endpoints</h2><pre>GET  /health
GET  /v1/status
GET  /v1/models
GET  /v1/capabilities
GET  /v1/metrics
POST /v1/chat/completions
POST /v1/responses
POST /v1/embeddings
POST /v1/compare
WS   /v1/events</pre><p>The base URL for clients is <code>http://127.0.0.1:31338/v1</code>. Chat supports SSE streaming, <code>fallback_models</code>, and provider-specific <code>effort</code> or <code>reasoning_effort</code>.</p></section>
  <section><h2>Authentication by transport</h2><ul><li>Browser providers keep their own persistent profile.</li><li>CLI providers use the CLI's existing authentication. Claude CLI supports neutral <code>first-account</code> and isolated <code>second-account</code> routes.</li><li>API providers use protected environment variables or write-only dashboard settings.</li></ul><p>Never put credentials in the repository, URLs, command arguments, or logs.</p></section>
  <section><h2>Security</h2><ul><li>Loopback is the default and recommended bind.</li><li>Remote access should use the SSH tunnel above.</li><li>An external bind requires <code>authToken</code> and an explicit <code>allowedOrigins</code> list.</li><li>Cross-site state-changing requests and foreign WebSocket origins are rejected.</li><li>Activity and metrics do not store prompts, responses, cookies, or credentials.</li><li>URL fragments and query strings are removed from login diagnostics.</li></ul></section>
  <section><h2>Troubleshooting</h2><pre>curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/status
curl http://127.0.0.1:31338/v1/models
node dist/cli.js status</pre><ul><li><strong>No graphical session:</strong> start Xvfb and set <code>DISPLAY</code> for the bridge service.</li><li><strong>Profile already in use:</strong> stop the active browser. Conduit clears only stale locks.</li><li><strong>Security check does not resolve:</strong> use the matching <code>api-*</code> or <code>cli-*</code> transport.</li><li><strong>Restore is signed out:</strong> start a fresh login and inspect Technical details on the provider card.</li><li><strong>Remote dashboard unavailable:</strong> verify the SSH tunnel and that 31338 listens on server loopback.</li></ul><p>See <code>docs/BROWSER-LOGIN.md</code> for the detailed browser lifecycle and systemd example.</p></section>
</main></body></html>`;

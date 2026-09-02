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
<body><main><aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark">OPEN SOURCE / COMMUNITY</div><h1>Conduit Bridge</h1><small>Provider control plane</small></div><nav class="side-menu" aria-label="Dashboard sections"><button class="active" data-section="overview">Overview</button><button data-section="playground">Playground</button><button data-section="api-providers">API providers</button><button data-section="cli-providers">CLI providers</button><button data-section="local-providers">Local providers</button><button data-section="models">Models</button><button data-section="usage">Usage</button><button data-section="orchestrator">Orchestrator</button><button data-section="integration">Integration tests</button><button data-section="recommendations">Recommendations</button><button data-section="activity">Activity</button><button data-section="settings">Settings</button><button data-section="help">Help</button></nav><div class="side-footer"><span id="side-runtime">Loading...</span></div></aside><div class="workspace">
  <nav class="appbar" aria-label="Dashboard controls"><button id="menu-toggle" type="button" aria-label="Toggle navigation">Menu</button><span class="appbrand">CONDUIT BRIDGE</span><button id="refresh" type="button">Refresh</button></nav>
  <p id="notice" role="status"></p>
  <div id="overview-section" class="page-section active">
  <header id="overview" class="anchor"><div><h1>Operational Dashboard</h1><div class="muted" id="version">Loading...</div></div></header>
  <div class="summary" aria-label="Runtime summary"><div class="summary-item"><strong id="summary-connected">-</strong><span>Connected providers</span></div><div class="summary-item"><strong id="summary-models">-</strong><span>Registered models</span></div><div class="summary-item"><strong id="summary-requests">-</strong><span>Requests handled</span></div><div class="summary-item"><strong id="summary-active">-</strong><span>Active requests</span></div></div>
  <div class="grid">
    <article class="transport"><strong>api-*</strong><h3>Direct APIs</h3><p>Requests use the provider SDK or REST API. Credentials come from protected bridge configuration or provider environment variables. CLI authentication is separate.</p></article>
    <article class="transport"><strong>cli-*</strong><h3>Local coding CLIs</h3><p>Requests are handed to an installed CLI such as Claude Code, Codex, Gemini CLI, or Grok CLI.</p></article>
    <article class="transport"><strong>lmstudio/*</strong><h3>Local models</h3><p>Requests go to an OpenAI-compatible LM Studio server on the local machine. No cloud login is required.</p></article>
  </div>
  </div>
  <section id="playground-section" class="playground page-section"><h2>Local Playground</h2><p class="muted">Send a small test request through the same OpenAI-compatible route used by clients.</p>
    <label>Model<select id="play-model"></select></label>
    <label>Mode<select id="play-mode"><option value="chat">Chat (read-only)</option><option value="plan">Plan</option><option value="agent">Agent (writes cwd)</option></select></label>
    <label>Working directory<input id="play-cwd" type="text" placeholder="Absolute path (required for agent)"></label>
    <label>Effort<select id="play-effort"></select></label>
    <label>Prompt<textarea id="play-prompt">Reply with exactly: pong</textarea></label>
    <div class="play-actions"><button id="play-run" type="button">Run test</button><span id="play-note" class="muted"></span></div>
    <pre id="play-output" aria-live="polite">No test run yet.</pre>
  </section>
  <div id="api-providers-section" class="wide page-section"><section><h2>API providers</h2><p class="muted">Direct provider APIs with independently configured API keys.</p><div id="api-provider-list">Loading...</div></section></div><div id="cli-providers-section" class="wide page-section"><section><h2>CLI providers</h2><p class="muted">Installed tools using their own local authentication.</p><div id="cli-provider-list">Loading...</div></section></div><div id="local-providers-section" class="wide page-section"><section><h2>Local providers</h2><p class="muted">Local services that do not use a cloud credential.</p><div id="local-provider-list">Loading...</div></section></div>
  <div id="models-section" class="wide page-section"><section><h2>Models by transport and provider</h2><p class="muted">Choose a transport first, then expand a provider to see its exact model IDs.</p><div class="model-tools"><input id="model-search" type="search" placeholder="Search model, owner, or provider"><select id="model-transport-filter" aria-label="Filter by transport"><option value="">All transports</option><option value="api-*">Direct APIs</option><option value="cli-*">Coding CLIs</option><option value="lmstudio/*">Local models</option></select><select id="model-provider-filter" aria-label="Filter by provider"><option value="">All providers</option></select><button id="model-refresh" type="button">Refresh catalogs</button></div><div id="model-count" class="muted"></div><div id="model-summary" class="model-summary"></div><div id="model-list">Loading...</div></section></div>
  <section id="orchestrator-section" class="wide page-section"><h2>Orchestrator</h2><p class="muted">Configure a multi-model run. Sequential and parallel give each role the same task. Debate feeds prior answers forward and asks the last role to critique and synthesize.</p><label><span>Enabled</span><select id="orch-enabled"><option value="false">Disabled</option><option value="true">Enabled</option></select></label><label><span>Strategy</span><select id="orch-strategy"><option value="sequential">Sequential review</option><option value="parallel">Parallel panel</option><option value="debate">Debate chain</option></select></label><div id="orch-roles"></div><label><span>Fallback models</span><select id="orch-fallbacks" multiple size="4"></select></label><div class="play-actions"><button id="orch-save" type="button">Save orchestration</button><button id="orch-run" type="button">Run orchestration</button><span id="orch-note" class="muted"></span></div><pre id="orch-output">No orchestration run yet.</pre></section>
  <section id="integration-section" class="wide page-section"><h2>Integration tests</h2><p class="muted">These tests use the same local OpenAI-compatible route that OpenClaw WebChat, Conduit VS Code, curl, and other clients use.</p><pre>Base URL: http://127.0.0.1:31338/v1
Model:    cli-grok/grok-4.6
Request:  POST /chat/completions</pre><div class="play-actions"><button id="test-all-cli" type="button">Test all CLI providers</button><button id="test-openai" type="button">Test OpenAI-compatible route</button></div><div id="test-output" class="activity-list">No integration test run yet.</div></section>
  <section id="recommendations-section" class="wide page-section"><h2>Recommendations</h2><p class="muted">Operational guidance for a reliable local model gateway.</p><div class="recommendation"><strong>Use CLI providers for coding work.</strong><br><span class="muted">They use the installed coding tools, their legitimate account login, account isolation, and provider-specific effort controls.</span></div><div class="recommendation"><strong>Use API providers for automation.</strong><br><span class="muted">They use explicit provider credentials and are suitable for services, scheduled jobs, and OpenClaw integrations.</span></div><div class="recommendation"><strong>Validate changes with ping-pong first.</strong><br><span class="muted">Run the CLI matrix, then a real OpenAI-compatible request, then the orchestrator.</span></div></section>
  <section id="activity-section" class="wide page-section"><h2>Activity and logs</h2><p class="muted">Live operational events from authentication, routing, requests, and settings. Prompts, responses, and credentials are never logged.</p><div id="activity-log" class="activity-list">No events yet.</div><h3>Request telemetry</h3><div id="metrics">No requests yet.</div></section>
  <section id="usage-section" class="wide page-section"><h2>Usage statistics</h2><p class="muted">In-memory usage since the last bridge restart. No prompt or response content is stored.</p><div class="summary"><div class="summary-item"><strong id="usage-total">0</strong><span>Total requests</span></div><div class="summary-item"><strong id="usage-success">0</strong><span>Successful</span></div><div class="summary-item"><strong id="usage-failure">0</strong><span>Failed</span></div><div class="summary-item"><strong id="usage-latency">-</strong><span>Average latency</span></div></div><div id="usage-table" class="model-list">No usage yet.</div></section>
  <section id="settings-section" class="wide page-section"><h2>Settings</h2><p class="muted">Manage direct API credentials. Secret values are write-only and never returned by the bridge. CLI authentication is managed by each installed tool.</p><section><h3>API credentials</h3><div id="settings-keys">Loading...</div></section></section>
  <section id="help-section-v2" class="wide page-section"><h2>Help and operating guide</h2><p class="muted">Install, connect clients, configure API and CLI providers, and diagnose the bridge.</p>
    <section><h3>Supported desktop platforms</h3><p>Conduit Bridge currently supports Windows Desktop and Linux Desktop. It needs Node.js 24 or newer. Start the bridge on the desktop and open <code>http://127.0.0.1:31338/</code>.</p></section>
    <section><h3>Desktop autostart</h3><p>After building, use <code>./scripts/install-autostart.sh</code> on Linux Desktop or <code>powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1</code> on Windows Desktop. The bridge starts as the logged-in desktop user on <code>127.0.0.1:31338</code>. See <code>docs/AUTOSTART.md</code> for removal and troubleshooting.</p></section>
    <section><h3>Model transports</h3><ul><li><code>api-*</code>: direct provider APIs and aggregators.</li><li><code>cli-*</code>: installed coding CLIs and isolated accounts.</li><li><code>lmstudio/*</code>: a local OpenAI-compatible LM Studio endpoint.</li></ul><p>Send the complete model ID shown on the Models page.</p></section>
    <section><h3>Client endpoints</h3><pre>Base URL: http://127.0.0.1:31338/v1
Models:   GET /v1/models
Status:   GET /v1/status
Chat:     POST /v1/chat/completions
Responses: POST /v1/responses
Embeddings: POST /v1/embeddings
Events:   ws://127.0.0.1:31338/v1/events</pre><p>Use <code>fallback_models</code> for ordered recovery and <code>effort</code> or <code>reasoning_effort</code> where supported. CLI chat accepts <code>mode</code> (<code>chat</code>, <code>plan</code>, <code>agent</code>) and <code>cwd</code>. Agent requires an absolute existing <code>cwd</code>.</p></section>
    <section><h3>Security and troubleshooting</h3><ul><li>Keep 31338 on the local desktop loopback interface.</li><li>Activity and metrics never store prompts, responses, cookies, or credentials. Orchestrator history stores a short redacted preview, not full transcripts.</li><li>If a CLI is unavailable, verify that it is installed, authenticated, and on PATH.</li><li>API keys and CLI authentication are deliberately independent; configure the transport you intend to use.</li><li>When an auth token is configured, the dashboard prompts for it and sends it on API calls and the event socket. <code>conduit-bridge status</code> uses the same token from config.</li></ul><p>The standalone <a class="link" href="/help">Help page</a>, <code>docs/AUTOSTART.md</code> contain the full deployment guide.</p></section>
  </section>
</div></main><script>
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  document.querySelector('.brand-mark').textContent = 'OPEN SOURCE / COMMUNITY';
  const legend = document.createElement('div'); legend.className = 'status-legend'; legend.innerHTML = '<span><i class="dot ok"></i>Green: connected and ready</span><span><i class="dot"></i>Red: not configured or unavailable</span>'; $('overview-section').insertBefore(legend, $('overview-section').querySelector('.grid'));
  const family = id => id.startsWith('api-') ? 'api-*' : id.startsWith('cli-') ? 'cli-*' : id.startsWith('lmstudio/') ? 'lmstudio/*' : 'other';
  const familyHelp = {'api-*':'Direct APIs','cli-*':'Local coding CLIs','lmstudio/*':'Local models','other':'Other'};
  const familyOrder = ['api-*','cli-*','lmstudio/*','other'];
  const providerForModel = id => id.startsWith('api-claude/') ? 'claude-api' : id.startsWith('api-gemini/') ? 'gemini-api' : id.startsWith('api-codex/') ? 'codex-api' : id.startsWith('api-openrouter/') ? 'openrouter-api' : id.startsWith('api-perplexity/') ? 'perplexity-api' : id.startsWith('cli-grok/') ? 'cli-grok' : id.startsWith('cli-codex/') ? 'cli-codex' : id.startsWith('cli-claude/') ? 'cli-claude' : id.startsWith('cli-gemini/') ? 'cli-gemini' : 'lmstudio';
  let models = [], capabilities = {};
  const sectionIds = { overview: 'overview-section', playground: 'playground-section', 'api-providers': 'api-providers-section', 'cli-providers': 'cli-providers-section', 'local-providers': 'local-providers-section', models: 'models-section', usage: 'usage-section', orchestrator: 'orchestrator-section', integration: 'integration-section', recommendations: 'recommendations-section', activity: 'activity-section', settings: 'settings-section', help: 'help-section-v2' };
  function showSection(name) { Object.entries(sectionIds).forEach(([key, id]) => $(id).classList.toggle('active', key === name)); document.querySelectorAll('[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === name)); $('sidebar').classList.remove('open'); }
  const stateClass = p => p.connected ? 'ok' : '';
  const stateText = p => p.connected
    ? (p.loginType === 'api-key' ? 'API credential available' : p.loginType === 'cli' ? 'CLI authenticated' : 'Local service available')
    : (p.loginType === 'api-key' ? 'No API credential · add a key in Settings' : p.loginType === 'cli' ? (p.credentialSource === 'CLI not installed' ? 'CLI unavailable · install the tool' : 'CLI unavailable · authenticate the tool') : 'Local service unavailable');
  function authToken() { try { return sessionStorage.getItem('conduit-auth-token') || ''; } catch { return ''; } }
  function withAuth(headers) { const token = authToken(); const out = Object.assign({}, headers || {}); if (token) out.Authorization = 'Bearer ' + token; return out; }
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
  let lastProviders = [];
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
        const ready = Boolean(providerStatus?.connected);
        const providerState = ready ? 'Ready' : 'Unavailable';
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
  async function runOrchestrator() { $('orch-run').disabled = true; $('orch-note').textContent = 'Running...'; try { await saveOrchestrator(); const data = await request('/v1/orchestrator/run', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:'Compare the current project state and identify the most important next engineering action.'})}); $('orch-output').textContent = data.results.map(r => r.role + ' (' + r.model + ')\\n' + (r.preview || r.content || '')).join('\\n\\n'); $('orch-note').textContent = 'Completed'; showSection('activity'); } catch (error) { $('orch-output').textContent = error.message; $('orch-note').textContent = 'Failed'; } finally { $('orch-run').disabled = false; } }
  async function runCliTests() { $('test-all-cli').disabled = true; $('test-output').textContent = 'Running CLI provider matrix...'; try { const data = await request('/v1/tests/cli', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}); $('test-output').innerHTML = data.results.map(r => '<div class="activity-event ' + (r.ok ? 'success' : 'error') + '"><span class="scope">' + esc(r.provider) + '</span><span>' + (r.ok ? 'PASS' : 'FAIL') + '</span><span>' + esc(r.model || '') + ' · ' + esc(r.output || r.error || '') + ' · ' + r.latencyMs + ' ms</span></div>').join(''); showSection('activity'); } catch (error) { $('test-output').textContent = error.message; } finally { $('test-all-cli').disabled = false; } }
  async function runOpenAiTest() { $('test-openai').disabled = true; $('test-output').textContent = 'Testing OpenAI-compatible route...'; try { const model = models.find(m => m.id.startsWith('cli-'))?.id || models[0]?.id; const data = await request('/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model, messages:[{role:'user',content:'Reply with exactly: pong'}], max_tokens:16})}); $('test-output').innerHTML = '<div class="activity-event success"><span class="scope">OpenClaw route</span><span>PASS</span><span>' + esc(model) + ' · ' + esc(data.choices?.[0]?.message?.content || '') + '</span></div>'; } catch (error) { $('test-output').textContent = error.message; } finally { $('test-openai').disabled = false; } }
  function renderUsage(data) { const rows = Object.entries(data.models || {}).sort((a,b) => b[1].requests - a[1].requests); const total = rows.reduce((n,[,m]) => n + m.requests, 0); const success = rows.reduce((n,[,m]) => n + m.successes, 0); const failure = rows.reduce((n,[,m]) => n + m.failures, 0); const latency = rows.reduce((n,[,m]) => n + m.totalLatencyMs, 0); const inputTokens = rows.reduce((n,[,m]) => n + (m.inputTokens || 0), 0); const outputTokens = rows.reduce((n,[,m]) => n + (m.outputTokens || 0), 0); const cost = rows.reduce((n,[,m]) => n + (m.estimatedCostUsd || 0), 0); $('usage-total').textContent = total; $('usage-success').textContent = success; $('usage-failure').textContent = failure; $('usage-latency').textContent = total ? Math.round(latency / total) + ' ms' : '-'; $('usage-table').innerHTML = rows.length ? '<p class="muted">Estimated tokens: ' + inputTokens + ' in / ' + outputTokens + ' out · estimated cost: $' + cost.toFixed(6) + '</p>' + rows.map(([model,m]) => '<div><code>' + esc(model) + '</code> · ' + m.requests + ' requests · ' + m.successes + ' successful · ' + m.failures + ' failed · ' + (m.inputTokens || 0) + ' input tokens · ' + (m.outputTokens || 0) + ' output tokens · $' + (m.estimatedCostUsd || 0).toFixed(6) + ' estimated · ' + (m.averageLatencyMs ?? '-') + ' ms average</div>').join('') : 'No usage yet.'; }
  function updateEffortOptions() { const model = $('play-model').value; const provider = providerForModel(model); const info = capabilities[provider] || { values: ['none','minimal','low','medium','high','xhigh','max'] }; $('play-effort').innerHTML = info.values.map(value => '<option value="' + value + '">' + value + (info.aliases && info.aliases[value] ? ' (maps to ' + info.aliases[value] + ')' : '') + '</option>').join(''); }
  function renderSettings(data) { $('settings-keys').innerHTML = '<div class="setting-list">' + Object.entries(data.apiKeys || {}).map(([provider, info]) => '<div class="setting-row"><strong>' + esc(provider) + '</strong><span class="setting-badge">' + esc(info.source || (info.configured ? 'Configured' : 'Not detected')) + '</span><form data-key-provider="' + esc(provider) + '"><input type="password" autocomplete="new-password" placeholder="' + (info.configured ? 'Replace stored API key' : 'Paste API key') + '"><button type="submit">Save API key</button></form></div>').join('') + '</div><p class="muted">Keys are write-only and independent from CLI authentication.</p>'; document.querySelectorAll('[data-key-provider]').forEach(form => form.addEventListener('submit', saveKey)); }
  async function saveKey(event) { event.preventDefault(); const form = event.currentTarget; const input = form.querySelector('input'); if (!input.value) return; const button = form.querySelector('button'); button.disabled = true; try { await request('/v1/settings/api-key', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:form.dataset.keyProvider, key:input.value})}); input.value = ''; $('notice').textContent = 'Credential saved for ' + form.dataset.keyProvider; await refresh(); } catch (error) { $('notice').textContent = error.message; } finally { button.disabled = false; } }
  async function refresh() { $('notice').textContent = 'Refreshing...'; try { const [status, modelData, capabilityData, metricData, settings, activity, orchestrator] = await Promise.all([request('/v1/status'), request('/v1/models'), request('/v1/capabilities'), request('/v1/metrics'), request('/v1/settings'), request('/v1/activity'), request('/v1/orchestrator')]); capabilities = capabilityData.effort || {}; $('version').textContent = 'v' + status.version + ' · port ' + status.port + ' · uptime ' + Math.floor(status.uptime) + 's'; $('side-runtime').textContent = '127.0.0.1:' + status.port + ' · v' + status.version; $('summary-connected').textContent = status.providers.filter(p => p.connected).length + '/' + status.providers.length; $('summary-models').textContent = (modelData.data || []).length; const metricRows = Object.values(metricData.models || {}); $('summary-requests').textContent = metricRows.reduce((n, m) => n + m.requests, 0); $('summary-active').textContent = metricRows.reduce((n, m) => n + m.inFlight, 0); renderProviders(status.providers); renderModels(modelData.data || []); renderMetrics(metricData); renderUsage(metricData); renderSettings(settings); renderActivity(activity); renderOrchestrator(orchestrator); $('notice').textContent = 'Updated ' + new Date().toLocaleTimeString(); } catch (error) { $('notice').textContent = error.message; } }
  $('model-list').addEventListener('click', event => {
    const use = event.target.closest('[data-use-model]');
    if (!use) return;
    $('play-model').value = use.dataset.useModel;
    updateEffortOptions();
    showSection('playground');
    $('notice').textContent = use.dataset.useModel + ' selected in Playground.';
  });
  async function runPlayground() { const button = $('play-run'); button.disabled = true; $('play-note').textContent = 'Running...'; $('play-output').textContent = ''; try { const cwd = $('play-cwd').value.trim(); const body = { model: $('play-model').value, mode: $('play-mode').value, effort: $('play-effort').value, messages: [{role:'user', content: $('play-prompt').value}], max_tokens: 64 }; if (cwd) body.cwd = cwd; const result = await request('/v1/chat/completions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); $('play-output').textContent = result.choices?.[0]?.message?.content || JSON.stringify(result, null, 2); $('play-note').textContent = 'Completed'; } catch (error) { $('play-output').textContent = error.message; $('play-note').textContent = 'Failed'; } finally { button.disabled = false; } }
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.section))); $('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open')); $('play-model').addEventListener('change', updateEffortOptions); $('play-run').addEventListener('click', runPlayground);
  $('refresh').addEventListener('click', refresh); $('model-search').addEventListener('input', () => renderModels(models)); $('model-transport-filter').addEventListener('change', () => renderModels(models)); $('model-provider-filter').addEventListener('change', () => renderModels(models)); $('model-refresh').addEventListener('click', async () => { $('model-refresh').disabled = true; try { await request('/v1/models/refresh', {method:'POST'}); await refresh(); } finally { $('model-refresh').disabled = false; } }); $('orch-save').addEventListener('click', () => saveOrchestrator().catch(error => $('orch-note').textContent = error.message)); $('orch-run').addEventListener('click', runOrchestrator); $('test-all-cli').addEventListener('click', runCliTests); $('test-openai').addEventListener('click', runOpenAiTest);
  $('usage-section').querySelector('.muted').textContent = 'Persistent local telemetry inspired by Winbar. Token and cost values are estimates unless the provider reports exact usage. No prompt or response content is stored.';
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
    ws.onerror = () => { if (!eventsConnected) $('notice').textContent = 'Live updates are unavailable. The dashboard will keep refreshing every 15 seconds.'; };
    ws.onclose = () => { eventsConnected = false; setTimeout(connectEvents, 3000); };
  }
  refresh(); connectEvents(); setInterval(refresh, 15000);
</script></body></html>`;

export const HELP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conduit Bridge Help</title><style>${SHARED_STYLE}</style></head>
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
POST /v1/chat/completions
POST /v1/responses
POST /v1/embeddings
POST /v1/compare
WS   /v1/events</pre><p>The base URL for clients is <code>http://127.0.0.1:31338/v1</code>. Chat supports SSE streaming, <code>fallback_models</code>, provider-specific <code>effort</code> or <code>reasoning_effort</code>, and CLI <code>mode</code> (<code>chat</code>, <code>plan</code>, <code>agent</code>) with optional <code>cwd</code>.</p></section>
  <section><h2>Authentication by transport</h2><ul><li>CLI providers use the CLI's existing authentication. Claude CLI supports neutral <code>first-account</code> and isolated <code>second-account</code> routes.</li><li>API providers use protected environment variables or write-only dashboard settings.</li></ul><p>Never put credentials in the repository, URLs, command arguments, or logs.</p></section>
  <section><h2>Security</h2><ul><li>Loopback is the required desktop bind.</li><li>Cross-site state-changing requests and foreign WebSocket origins are rejected. Allowlisted origins (including another local port) may POST.</li><li>Activity and metrics do not store prompts, responses, cookies, or credentials. Orchestrator history stores a short redacted preview.</li><li>macOS is not a supported CLI target: <code>conduit-bridge start</code> exits. Library embedders may still construct <code>BridgeServer</code>.</li></ul></section>
  <section><h2>Troubleshooting</h2><pre>curl http://127.0.0.1:31338/health
curl http://127.0.0.1:31338/v1/status
curl http://127.0.0.1:31338/v1/models
node dist/cli.js status</pre><ul><li><strong>CLI unavailable:</strong> install the named CLI, authenticate it normally, and ensure its binary is on PATH.</li><li><strong>API unavailable:</strong> add the provider credential through the write-only Settings form or the documented environment variable.</li></ul><p>See <code>docs/AUTOSTART.md</code> for the desktop startup guide.</p></section>
</main></body></html>`;

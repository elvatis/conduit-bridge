const icon = (body: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const branchIcon = icon('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m0-5h6a6 6 0 0 0 6-4"/>');
const downloadIcon = icon('<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>');
const refreshIcon = icon('<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>');

export const REPOSITORY_ANALYTICS_NAV_HTML = `<button data-section="repository-analytics" title="Repository analytics" data-i18n-title="ra_nav">${branchIcon}<span class="nav-label" data-i18n="ra_nav">Repository analytics</span></button>`;

export const REPOSITORY_ANALYTICS_HTML = `<section id="repository-analytics-section" class="wide page-section ra-page" aria-labelledby="ra-heading">
  <header class="ra-heading"><div><div class="ra-eyebrow"><span class="ra-brand-dot"></span> ELVATIS <span>/</span> <span data-i18n="ra_eyebrow">REPOSITORY INTELLIGENCE</span></div><h2 id="ra-heading" data-i18n="ra_heading">A clearer view of your code.</h2><p data-i18n="ra_subheading">Production, tests, and the history that connects them.</p></div><div class="ra-source"><label><span data-i18n="ra_repo">Repository</span><select id="ra-repository" disabled aria-label="Repository" data-i18n-aria="ra_repo"><option value="">—</option></select></label><label><span data-i18n="ra_branch">Branch</span><select id="ra-branch" disabled aria-label="Branch" data-i18n-aria="ra_branch"><option value="HEAD">HEAD</option></select></label></div></header>
  <div class="ra-topline"><span>${branchIcon}<span id="ra-source-name">—</span></span><span id="ra-metadata">—</span></div>
  <div class="ra-toolbar"><div class="ra-presets" role="group" aria-label="Date range" data-i18n-aria="ra_range">${[7, 30, 90, 180].map(days => `<button type="button" data-ra-days="${days}" aria-pressed="${days === 30}">${days} days</button>`).join('')}<button type="button" data-ra-days="all" aria-pressed="false" data-i18n="ra_all">All time</button></div><span id="ra-date-range" class="ra-date-range">—</span><div class="ra-tools"><label><span class="visually-hidden" data-i18n="ra_metric">Line metric</span><select id="ra-metric"><option value="nonblank" data-i18n="ra_nonblank">Nonblank LOC</option><option value="total" data-i18n="ra_total">Total LOC</option></select></label><button type="button" id="ra-export" disabled>${downloadIcon}<span data-i18n="ra_export">Export CSV</span></button><button type="button" id="ra-refresh" title="Refresh" data-i18n-title="ra_refresh" aria-label="Refresh" data-i18n-aria="ra_refresh">${refreshIcon}</button></div></div>
  <div id="ra-state" class="ra-state" role="status"><span data-i18n="ra_loading">Reading repository snapshots…</span></div>
  <div id="ra-content" hidden><div id="ra-kpis" class="ra-kpis"></div>
    <article class="ra-card ra-main"><header class="ra-card-heading"><div><h3 data-i18n="ra_series">Production &amp; test LOC over time</h3><p id="ra-chart-subtitle"></p></div><div class="ra-legend"><button type="button" data-ra-series="production" aria-pressed="true"><i class="ra-dot ra-production"></i><span data-i18n="ra_prod_short">Production</span></button><button type="button" data-ra-series="tests" aria-pressed="true"><i class="ra-dot ra-tests"></i><span data-i18n="ra_test_short">Tests</span></button></div></header>
      <div class="ra-plot"><svg id="ra-chart" viewBox="0 0 1000 292" preserveAspectRatio="xMidYMid meet" tabindex="0" role="img" aria-label="Production & test LOC over time" data-i18n-aria="ra_series" aria-describedby="ra-chart-help"></svg><div id="ra-tooltip" class="ra-tooltip" hidden></div></div>
      <div class="ra-chart-footer"><div class="ra-snapshot-controls"><button type="button" id="ra-previous" title="Previous snapshot" data-i18n-title="ra_previous" aria-label="Previous snapshot" data-i18n-aria="ra_previous"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button><button type="button" id="ra-pin" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m8 3 8 0-2 7 4 4v2H6v-2l4-4-2-7ZM12 16v6"/></svg><span data-i18n="ra_pin_action">Pin snapshot</span></button><button type="button" id="ra-next" title="Next snapshot" data-i18n-title="ra_next" aria-label="Next snapshot" data-i18n-aria="ra_next"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m10 5 7 7-7 7"/></svg></button></div><span id="ra-chart-help" class="visually-hidden"><span data-i18n="ra_hover">Hover to inspect</span><span class="ra-divider">·</span><span data-i18n="ra_pin">Click to pin</span></span><span id="ra-pin-state" role="status"></span><button type="button" id="ra-unpin" hidden data-i18n="ra_unpin">Release snapshot</button></div>
      <div class="ra-brush"><div class="ra-brush-heading"><span data-i18n="ra_brush">Scrub repository history</span><span id="ra-brush-range"></span></div><div class="ra-brush-track"><svg id="ra-brush-chart" viewBox="0 0 1000 42" preserveAspectRatio="none" aria-hidden="true"></svg><div id="ra-brush-selection"></div><input id="ra-range-start" type="range" min="0" max="0" value="0" aria-label="History start" data-i18n-aria="ra_start"><input id="ra-range-end" type="range" min="0" max="0" value="0" aria-label="History end" data-i18n-aria="ra_end"></div></div>
    </article>
    <div class="ra-bottom"><article class="ra-card"><header class="ra-card-heading"><div><h3 data-i18n="ra_movement">Net movement between snapshots</h3><p data-i18n="ra_movement_note">Each bar compares recorded snapshots; gaps may span several days.</p></div></header><div id="ra-movement"></div></article><article class="ra-card"><header class="ra-card-heading"><div><h3 data-i18n="ra_distribution">Where the lines live</h3><p id="ra-distribution-date"></p></div></header><div id="ra-distribution"></div></article></div>
    <p id="ra-partial" class="ra-notice" hidden></p>
    <details class="ra-method"><summary data-i18n="ra_method">How these numbers are measured</summary><p id="ra-coverage" class="ra-coverage"></p><p data-i18n="ra_ratio_note"></p><p data-i18n="ra_movement_note"></p><p data-i18n="ra_scope">Committed source files only.</p><p data-i18n="ra_test_rule">Tests are classified by file and directory names.</p><p id="ra-history-limit"></p><p id="ra-cache-time"></p></details>
    <details class="ra-data"><summary data-i18n="ra_table">Inspect snapshot data</summary><div id="ra-table" class="ra-table-wrap"></div></details>
  </div>
</section>`;

export const REPOSITORY_ANALYTICS_STYLE = String.raw`
  .ra-page.ra-page { max-width:none; width:100%; padding:0; background:transparent; border:0; box-shadow:none; --ra-prod:#22B4FF; --ra-test:#FF8A3D; --ra-mono:'Cascadia Code','SFMono-Regular',Consolas,monospace; }
  .ra-page [hidden] { display:none !important; }
  .ra-heading { display:flex; justify-content:space-between; align-items:end; gap:24px; margin:0 0 24px; }
  .ra-eyebrow { display:flex; align-items:center; gap:9px; color:var(--muted,#8FA0BD); font-size:0.8rem; font-weight:500; letter-spacing:.075em; margin-bottom:13px; }
  .ra-eyebrow > span:nth-child(2) { opacity:.4; }
  .ra-brand-dot { width:6px; height:6px; background:var(--ra-test); border-radius:50%; }
  .ra-heading h2 { font-size:clamp(1.7857rem,2.5vw,2.5rem); margin:0 0 9px; letter-spacing:-.045em; }
  .ra-heading p { font-size:0.8571rem; color:var(--muted); margin:0; line-height:1.6; }
  .ra-source { display:flex; gap:10px; max-width:48%; }
  .ra-source label { min-width:0; width:190px; margin:0; }
  .ra-source label > span { font-size:0.8rem; color:var(--muted); display:block; margin-bottom:6px; }
  .ra-page select,.ra-page .select-trigger { font-size:0.8rem; min-height:35px; padding:7px 10px; border-radius:9px; }
  .ra-topline { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--muted); font:0.8rem var(--ra-mono); padding:13px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .ra-topline > span:first-child { display:flex; align-items:center; gap:8px; min-width:0; }
  #ra-source-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ra-topline svg { color:var(--ra-prod); flex:none; }
  .ra-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:21px 0; }
  .ra-presets { display:flex; padding:3px; gap:2px; border:1px solid var(--line); border-radius:10px; background:#ffffff02; }
  .ra-presets button { min-height:28px; border:0; padding:6px 9px; border-radius:7px; background:transparent; color:var(--muted); font-size:0.8rem; white-space:nowrap; }
  .ra-presets button[aria-pressed="true"] { color:var(--blue-soft,#B9EAFF); background:#22b4ff18; }
  .ra-date-range { color:var(--muted); font:0.8rem var(--ra-mono); }
  .ra-tools { display:flex; align-items:center; gap:7px; margin-left:auto; }
  .ra-tools label { margin:0; width:156px; }
  .ra-tools button { font-size:0.8rem; min-height:34px; background:transparent; padding:7px 10px; border-radius:9px; }
  .ra-tools #ra-refresh { padding:7px 8px; }
  .ra-state { padding:65px 24px; color:var(--muted); border:1px dashed var(--line-2); border-radius:16px; text-align:center; line-height:1.8; font-size:0.9286rem; }
  .ra-state p { font-size:0.8rem; margin:7px 0 0; }
  .ra-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; margin-bottom:18px; }
  .ra-card,.ra-kpi { background:var(--panel,#0C182A); border:1px solid var(--line,#b6d9ff12); border-radius:14px; padding:20px; min-width:0; }
  .ra-kpi { position:relative; overflow:hidden; min-height:146px; }
  .ra-kpi-label { color:var(--muted); display:flex; align-items:center; gap:7px; font-size:0.8rem; margin-bottom:18px; }
  .ra-dot { display:inline-block; width:6px; height:6px; border-radius:50%; flex:none; }
  .ra-production { background:var(--ra-prod); } .ra-tests { background:var(--ra-test); }
  .ra-kpi strong { display:block; font:500 clamp(1.5rem,2.2vw,30px)/1.2 var(--ra-mono); letter-spacing:-.045em; color:var(--text); position:relative; z-index:1; }
  .ra-kpi-delta { color:var(--body); font:0.8rem var(--ra-mono); margin-top:12px; position:relative; z-index:1; }
  .ra-kpi small { display:block; color:var(--muted); font-size:0.8rem; margin-top:8px; position:relative; z-index:1; line-height:1.5; }
  .ra-kpi-spark { position:absolute; bottom:0; right:0; width:58%; height:58px; opacity:.23; }
  .ra-card-heading { display:flex; align-items:start; justify-content:space-between; gap:16px; margin:0 0 19px; }
  .ra-card-heading h3 { font-size:0.9286rem; font-weight:500; letter-spacing:-.015em; margin:0 0 7px; }
  .ra-card-heading p { color:var(--muted); font-size:0.8rem; margin:0; line-height:1.7; }
  .ra-legend,.ra-legend > span { display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--muted); }
  .ra-legend { gap:15px; padding-top:2px; white-space:nowrap; }
  .ra-plot { position:relative; height:clamp(20rem,30vh,28rem); }
  #ra-chart { width:100%; height:100%; overflow:visible; cursor:crosshair; outline-offset:3px; touch-action:pan-y; }
  .ra-chart-grid { stroke:var(--line); stroke-dasharray:3 6; }
  .ra-axis { fill:var(--muted); font:0.8rem var(--ra-mono); }
  .ra-tooltip { position:absolute; right:12px; top:12px; width:222px; pointer-events:none; border:1px solid var(--line-2); border-radius:11px; background:#071221f5; padding:13px; box-shadow:0 8px 25px #0004; font:0.8rem/1.8 var(--ra-mono); z-index:2; }
  .ra-tooltip header { display:flex; justify-content:space-between; color:var(--muted); padding:0 0 8px; margin:0 0 8px; border-bottom:1px solid var(--line); }
  .ra-tooltip div { display:flex; justify-content:space-between; gap:9px; }
  .ra-tooltip code { display:block; background:transparent; color:var(--muted); padding:6px 0 0; font-size:0.8rem; overflow-wrap:anywhere; }
  .ra-chart-footer { display:flex; align-items:center; gap:10px; min-height:29px; font-size:0.8rem; color:var(--muted); }
  .ra-divider { margin:0 7px; opacity:.6; }
  #ra-pin-state { color:var(--ra-test); margin-left:auto; }
  #ra-unpin { padding:4px 7px; min-height:25px; font-size:0.8rem; background:transparent; }
  .ra-brush { border-top:1px solid var(--line); padding-top:15px; margin-top:6px; }
  .ra-brush-heading { display:flex; justify-content:space-between; gap:12px; font-size:0.8rem; color:var(--muted); margin-bottom:10px; }
  #ra-brush-range { font-family:var(--ra-mono); }
  .ra-brush-track { position:relative; height:42px; background:#050b1670; border:1px solid var(--line); border-radius:7px; }
  #ra-brush-chart { width:100%; height:100%; opacity:.5; }
  #ra-brush-selection { position:absolute; top:0; bottom:0; border:1px solid #22b4ff55; background:#22b4ff0d; border-radius:5px; pointer-events:none; }
  .ra-brush input[type="range"] { appearance:none; position:absolute; inset:0; width:100%; height:42px; min-height:0; padding:0; margin:0; border:0; background:none; box-shadow:none; pointer-events:none; }
  .ra-brush input[type="range"]::-webkit-slider-thumb { appearance:none; width:12px; height:34px; pointer-events:auto; cursor:ew-resize; background:#91A4BD; border:4px solid #233A54; border-radius:4px; box-shadow:0 0 0 1px #8fa0bd55; }
  .ra-brush input[type="range"]::-moz-range-thumb { width:5px; height:26px; pointer-events:auto; cursor:ew-resize; background:#91A4BD; border:4px solid #233A54; border-radius:4px; }
  .ra-brush input:focus-visible { outline:2px solid var(--ra-prod); outline-offset:3px; }
  .ra-bottom { display:grid; grid-template-columns:1.16fr 1fr; gap:18px; margin-top:18px; }
  #ra-movement { height:13rem; } #ra-movement svg { width:100%; height:100%; display:block; }
  .ra-distribution-bar { display:flex; height:14px; overflow:hidden; border-radius:4px; background:var(--line); margin:22px 0 16px; }
  .ra-distribution-bar span { min-width:0; }
  .ra-distribution-summary { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:0.8rem; margin-bottom:20px; }
  .ra-distribution-summary strong { color:var(--body); font:0.8rem var(--ra-mono); margin-left:7px; }
  .ra-directory { display:grid; grid-template-columns:minmax(0,1fr) 86px 72px; align-items:center; gap:10px; font-size:0.8rem; margin-top:12px; }
  .ra-directory code { background:none; padding:0; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; color:var(--body); }
  .ra-directory .ra-mini-bar { display:flex; height:3px; border-radius:2px; background:var(--line); overflow:hidden; }
  .ra-directory > span:last-child { font:0.8rem var(--ra-mono); text-align:right; color:var(--muted); }
  .ra-coverage { color:var(--muted); font-size:0.8rem; line-height:1.7; margin:17px 2px 10px; }
  .ra-notice { color:#F6BF98; background:#ff8a3d09; border:1px solid #ff8a3d20; padding:11px 13px; border-radius:9px; font-size:0.8rem; line-height:1.7; }
  .ra-method,.ra-data { font-size:0.8rem; line-height:1.8; color:var(--muted); margin:10px 2px; }
  .ra-method summary,.ra-data summary { cursor:pointer; width:max-content; max-width:100%; }
  .ra-method p { max-width:110ch; margin:8px 0; }
  .ra-table-wrap { overflow:auto; margin-top:12px; border:1px solid var(--line); border-radius:9px; }
  .ra-table-wrap table { width:100%; border-collapse:collapse; font:0.8rem var(--ra-mono); }
  .ra-table-wrap th,.ra-table-wrap td { text-align:right; padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
  .ra-table-wrap th:first-child,.ra-table-wrap td:first-child { text-align:left; }
  .ra-table-wrap th { font-family:var(--font-sans); color:var(--muted); }
  @media(max-width:1100px) { .ra-heading { align-items:start; flex-direction:column; gap:18px; } .ra-source { max-width:100%; width:100%; } .ra-source label { width:230px; } .ra-tools { margin-left:0; } .ra-kpi { padding:17px; } }
  @media(max-width:800px) { .ra-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .ra-bottom { grid-template-columns:minmax(0,1fr); } .ra-topline { align-items:start; flex-direction:column; font-size:0.8rem; } .ra-plot { height:245px; } .ra-card { padding:16px; } .ra-card-heading { flex-wrap:wrap; gap:10px; } }
  @media(max-width:450px) { .ra-presets button { font-size:0.8rem; padding:6px 7px; } .ra-kpis { gap:9px; } .ra-kpi { padding:13px; min-height:140px; } .ra-kpi strong { font-size:1.4286rem; } .ra-kpi-delta { font-size:0.8rem; } .ra-heading h2 { font-size:1.8571rem; } .ra-tooltip { width:196px; right:1px; } .ra-tools { width:100%; } .ra-tools label { flex:1; } .ra-date-range { width:100%; } }
`;

export const REPOSITORY_ANALYTICS_SCRIPT = String.raw`
  const raState = { report:null, repositories:[], repository:'', branch:'HEAD', days:30, metric:'nonblank', start:0, end:0, hover:null, pinned:false, visibleSeries:new Set(['production','tests']), loading:false, epoch:0, initialized:false };
  const raNumber = value => Number(value).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-US');
  const raSigned = value => (value > 0 ? '+' : '') + raNumber(value);
  const raCompact = value => Intl.NumberFormat(currentLang === 'de' ? 'de-DE' : 'en-US', { notation:'compact', maximumFractionDigits:1 }).format(value);
  const raDate = value => new Date(value).toLocaleDateString('en-US', { timeZone:'UTC', month:'2-digit', day:'2-digit', year:'numeric' });
  const raRatio = snapshot => snapshot.production[raState.metric] ? (snapshot.tests[raState.metric] / snapshot.production[raState.metric]).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '×' : '—';
  const raSnapshots = () => raState.report?.snapshots || [];
  const raVisible = () => raSnapshots().slice(raState.start, raState.end + 1);
  function raDates(items) { return items.length ? raDate(items[0].timestamp) + ' → ' + raDate(items.at(-1).timestamp) : '—'; }
  function raPreset(days) {
    raState.days = days; raState.pinned = false; raState.hover = null;
    const all = raSnapshots(), cutoff = all.length && days !== 'all' ? all.at(-1).timestamp - Number(days) * 86400000 : -Infinity;
    const start = all.findIndex(snapshot => snapshot.timestamp >= cutoff);
    raState.start = Math.max(0, start); raState.end = Math.max(0, all.length - 1); raRender();
  }
  function raPath(values, width, height, pad = 0) {
    if (!values.length) return '';
    const max = Math.max(1, ...values), span = Math.max(1, values.length - 1);
    return values.map((value, index) => (index ? 'L' : 'M') + (pad + index / span * (width - pad * 2)).toFixed(2) + ',' + (height - pad - value / max * (height - pad * 2)).toFixed(2)).join(' ');
  }
  function raSpark(values, color) { const path = raPath(values, 220, 58, 2); return '<svg class="ra-kpi-spark" viewBox="0 0 220 58" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + ' L218,58 L2,58Z" fill="' + color + '" opacity=".12"/><path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.5"/></svg>'; }
  function raDelta(current, first, valid) { if (!valid) return '—'; const delta = current - first; return raSigned(delta) + (first ? ' (' + (delta > 0 ? '+' : '') + (delta / first * 100).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits:1 }) + '%)' : ''); }
  function raRenderKpis(items) {
    const first = items[0], last = items.at(-1), metric = raState.metric, valid = items.length > 1 && items.every(item => item.complete);
    const card = (label, value, delta, note, spark, kind = '') => '<article class="ra-kpi"><div class="ra-kpi-label">' + (kind ? '<i class="ra-dot ra-' + kind + '"></i>' : '') + esc(t(label)) + '</div><strong>' + esc(value) + '</strong><div class="ra-kpi-delta">' + esc(delta) + '</div><small>' + esc(note) + '</small>' + spark + '</article>';
    const total = item => item.production[metric] + item.tests[metric];
    const prodChange = last.production[metric] - first.production[metric], testChange = last.tests[metric] - first.tests[metric];
    const ratioChange = valid && first.production[metric] && last.production[metric] ? (last.tests[metric] / last.production[metric] - first.tests[metric] / first.production[metric]) : null;
    $('ra-kpis').innerHTML = card('ra_production', (last.complete ? '' : '≥ ') + raNumber(last.production[metric]), raDelta(last.production[metric], first.production[metric], valid), t('ra_files', {count:raNumber(last.production.files)}), raSpark(items.map(item => item.production[metric]), '#22B4FF'), 'production') + card('ra_tests', (last.complete ? '' : '≥ ') + raNumber(last.tests[metric]), raDelta(last.tests[metric], first.tests[metric], valid), t('ra_files', {count:raNumber(last.tests.files)}), raSpark(items.map(item => item.tests[metric]), '#FF8A3D'), 'tests') + card('ra_ratio', last.complete ? raRatio(last) : '—', ratioChange == null ? '—' : (ratioChange > 0 ? '+' : '') + ratioChange.toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-US', {maximumFractionDigits:2}) + '× ' + t('ra_since'), t('ra_ratio_note'), raSpark(items.map(item => item.production[metric] ? item.tests[metric] / item.production[metric] : 0), '#8FA0BD')) + card('ra_net', valid ? (prodChange + testChange > 0 ? '+' : '') + raCompact(prodChange + testChange) : '—', valid ? raSigned(prodChange) + ' ' + t('ra_prod_short') + ' · ' + raSigned(testChange) + ' ' + t('ra_test_short') : t(items.length < 2 ? 'ra_one' : 'ra_partial_short'), t('ra_since'), raSpark(items.map(total), '#22B4FF'));
  }
  function raChartGeometry(items) {
    const rect = $('ra-chart')?.getBoundingClientRect?.();
    const scale = typeof getComputedStyle === 'function' ? (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16 : 1;
    const width = Math.max(280, rect?.width || 1000), height = Math.max(230, rect?.height || 292), left = 66 * scale, right = width - 18 * scale, top = 15 * scale, bottom = height - 44 * scale, max = Math.max(1, ...items.flatMap(item => [item.production[raState.metric],item.tests[raState.metric]])) * 1.12;
    const start = items[0].timestamp, span = Math.max(1, items.at(-1).timestamp - start);
    return { width,height,left,right,top,bottom,max, x:item => items.length === 1 ? (left + right) / 2 : left + (item.timestamp - start) / span * (right-left), y:value => bottom - value / max * (bottom-top) };
  }
  function raChartTicks(items, geometry, pixelWidth) {
    if (!items.length) return [];
    const last = items.length - 1;
    if (!last || items[0].timestamp === items[last].timestamp) return [0];
    const width = pixelWidth > 0 ? pixelWidth : geometry.width;
    // Dates at either end point inward; reserve enough room for those labels too.
    const gap = Math.max(125, 150 * geometry.width / width, geometry.left * 2.3), selected = [0,last];
    const interior = Math.max(0, Math.min(2, Math.floor(width / 190) - 2));
    for (let slot = 1; slot <= interior; slot++) {
      const target = geometry.left + (geometry.right - geometry.left) * slot / (interior + 1);
      const candidates = items.map((item,index) => ({index,x:geometry.x(item)})).filter(candidate => candidate.index > 0 && candidate.index < last).sort((a,b) => Math.abs(a.x-target)-Math.abs(b.x-target));
      const candidate = candidates.find(candidate => selected.every(index => Math.abs(candidate.x-geometry.x(items[index])) >= gap));
      if (candidate) selected.push(candidate.index);
    }
    return selected.sort((a,b) => a-b);
  }
  function raRenderChart(items) {
    const g = raChartGeometry(items), metric = raState.metric;
    $('ra-chart').setAttribute('viewBox', '0 0 ' + g.width + ' ' + g.height);
    let html = '<defs><linearGradient id="ra-prod-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#22B4FF" stop-opacity=".12"/><stop offset="1" stop-color="#22B4FF" stop-opacity="0"/></linearGradient><linearGradient id="ra-test-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FF8A3D" stop-opacity=".08"/><stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/></linearGradient></defs>';
    for (let index=0; index<=4; index++) { const value = g.max * index / 4, y = g.y(value); html += '<line class="ra-chart-grid" x1="' + g.left + '" x2="' + g.right + '" y1="' + y + '" y2="' + y + '"/><text class="ra-axis" x="' + (g.left - 14) + '" y="' + (y+3) + '" text-anchor="end">' + esc(raCompact(value)) + '</text>'; }
    for (const [category,color,fill] of [['production','#22B4FF','ra-prod-fill'],['tests','#FF8A3D','ra-test-fill']]) {
      if (!raState.visibleSeries.has(category)) continue;
      const path = items.map((item,index) => (index ? 'L':'M') + g.x(item).toFixed(2) + ',' + g.y(item[category][metric]).toFixed(2)).join(' ');
      html += '<path d="' + path + ' L' + g.x(items.at(-1)) + ',' + g.bottom + ' L' + g.x(items[0]) + ',' + g.bottom + 'Z" fill="url(#' + fill + ')"/><path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round"/>';
      html += items.map(item => '<circle cx="' + g.x(item) + '" cy="' + g.y(item[category][metric]) + '" r="2.5" fill="' + color + '"/>').join('');
    }
    const ticks = raChartTicks(items, g, $('ra-chart').getBoundingClientRect().width);
    html += ticks.map(index => '<text class="ra-axis" x="' + g.x(items[index]) + '" y="' + (g.height - 9) + '" text-anchor="' + (index === 0 ? 'start' : index === items.length-1 ? 'end':'middle') + '">' + esc(raDate(items[index].timestamp)) + '</text>').join('');
    html += '<g id="ra-crosshair" hidden><line x1="0" x2="0" y1="' + g.top + '" y2="' + g.bottom + '" stroke="#8FA0BD" stroke-dasharray="3 4"/><circle r="4" fill="#22B4FF" stroke="#0C182A" stroke-width="2"/><circle r="4" fill="#FF8A3D" stroke="#0C182A" stroke-width="2"/></g>';
    $('ra-chart').innerHTML = html; $('ra-chart').setAttribute('aria-label', t('ra_series') + '. ' + raDates(items) + '. ' + t('ra_keyboard'));
    $('ra-chart-subtitle').textContent = raDates(items) + ' · ' + t(metric === 'nonblank' ? 'ra_nonblank' : 'ra_total');
    const all = raSnapshots(), max = Math.max(1, ...all.flatMap(item=>[item.production[metric],item.tests[metric]]));
    const mini = (category,color) => '<path d="' + all.map((item,index)=>(index?'L':'M') + (index/Math.max(1,all.length-1)*1000) + ',' + (39-item[category][metric]/max*34)).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5"/>';
    $('ra-brush-chart').innerHTML = mini('production','#22B4FF') + mini('tests','#FF8A3D');
    for (const [id,value,key] of [['ra-range-start',raState.start,'ra_start'],['ra-range-end',raState.end,'ra_end']]) { const input=$(id); input.max=String(Math.max(0,all.length-1)); input.value=String(value); input.disabled=all.length<2; input.setAttribute('aria-valuetext',t(key) + ': ' + raDate(all[value].timestamp)); }
    const denominator = Math.max(1,all.length-1); $('ra-brush-selection').style.left=raState.start/denominator*100+'%'; $('ra-brush-selection').style.width=(all.length<2?100:(raState.end-raState.start)/denominator*100)+'%';
    $('ra-brush-range').textContent = raDates(items);
    raInspect(raState.hover);
  }
  function raInspect(index) {
    const items = raVisible(), tooltip=$('ra-tooltip'), crosshair=$('ra-crosshair');
    if (!crosshair) return;
    $('ra-pin')?.setAttribute('aria-pressed', String(raState.pinned));
    if ($('ra-previous')) $('ra-previous').disabled = !items.length || index === 0;
    if ($('ra-next')) $('ra-next').disabled = !items.length || index === items.length - 1;
    if (index == null || !items[index]) { tooltip.hidden=true; crosshair.setAttribute('hidden',''); $('ra-pin-state').textContent=''; $('ra-unpin').hidden=true; return; }
    raState.hover=index; const item=items[index],g=raChartGeometry(items),x=g.x(item),metric=raState.metric;
    crosshair.removeAttribute('hidden'); const line=crosshair.querySelector('line'), dots=crosshair.querySelectorAll('circle');
    line.setAttribute('x1',x); line.setAttribute('x2',x);
    ['production','tests'].forEach((category,i)=>{dots[i].setAttribute('cx',x);dots[i].setAttribute('cy',g.y(item[category][metric]));dots[i].style.display=raState.visibleSeries.has(category)?'':'none';});
    tooltip.hidden=false; tooltip.style.right=x>g.width*.65?'auto':'12px'; tooltip.style.left=x>g.width*.65?g.left+'px':'auto';
    tooltip.innerHTML='<header><span>'+esc(raDate(item.timestamp))+'</span><span>UTC</span></header><div><span>'+esc(t('ra_prod_short'))+'</span><b style="color:#22B4FF">'+(item.complete?'':'≥ ')+raNumber(item.production[metric])+'</b></div><div><span>'+esc(t('ra_test_short'))+'</span><b style="color:#FF8A3D">'+(item.complete?'':'≥ ')+raNumber(item.tests[metric])+'</b></div><div><span>'+esc(t('ra_ratio'))+'</span><b>'+(item.complete?raRatio(item):'—')+'</b></div><code>'+esc(item.sha)+'</code>';
    $('ra-pin-state').textContent=raState.pinned?t('ra_pinned'):''; $('ra-unpin').hidden=!raState.pinned;
  }
  function raRenderMovement(items) {
    const values=items.slice(1).map((item,index)=>({item,previous:items[index],value:item.production[raState.metric]+item.tests[raState.metric]-items[index].production[raState.metric]-items[index].tests[raState.metric]}));
    const valid=values.filter(value=>value.item.complete&&value.previous.complete);
    if (!valid.length) { $('ra-movement').innerHTML='<p class="muted">'+esc(t(items.length<2?'ra_one':'ra_partial_short'))+'</p>'; return; }
    const box=$('ra-movement').getBoundingClientRect(),w=Math.max(280,box.width||600),h=Math.max(190,box.height||190),left=42,right=w-14,mid=(h-36)/2;
    const max=Math.max(1,...valid.map(value=>Math.abs(value.value))),step=(right-left)/Math.max(1,values.length),width=Math.min(30,step*.58);
    let html='<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+esc(t('ra_movement'))+'"><line x1="'+left+'" x2="'+right+'" y1="'+mid+'" y2="'+mid+'" stroke="#8FA0BD" opacity=".25"/><text class="ra-axis" x="25" y="'+(mid+4)+'" text-anchor="end">0</text>';
    values.forEach((item,index)=>{if(!item.item.complete||!item.previous.complete)return;const height=Math.abs(item.value)/max*(mid-18),x=left+step*(index+.5)-width/2;html+='<rect x="'+x+'" y="'+(item.value>=0?mid-height:mid)+'" width="'+width+'" height="'+Math.max(1,height)+'" rx="2" fill="'+(item.value>=0?'#22B4FF':'#FF8A3D')+'" opacity=".8"><title>'+esc(raDate(item.previous.timestamp)+' → '+raDate(item.item.timestamp)+': '+raSigned(item.value))+'</title></rect>';});
    html+='<text class="ra-axis" x="'+left+'" y="'+(h-8)+'">'+esc(raDate(items[0].timestamp))+'</text><text class="ra-axis" x="'+right+'" y="'+(h-8)+'" text-anchor="end">'+esc(raDate(items.at(-1).timestamp))+'</text></svg>';$('ra-movement').innerHTML=html;
  }

  function raRenderDistribution(snapshot) {
    const metric=raState.metric,p=snapshot.production[metric],tests=snapshot.tests[metric],total=p+tests;
    $('ra-distribution-date').textContent=raDate(snapshot.timestamp)+' · '+t(metric==='nonblank'?'ra_nonblank':'ra_total');
    if (!total) { $('ra-distribution').innerHTML='<p class="muted">'+esc(t('ra_no_source'))+'</p>'; return; }
    let html='<div class="ra-distribution-bar" role="img" aria-label="'+esc(t('ra_prod_short')+': '+raNumber(p)+', '+t('ra_test_short')+': '+raNumber(tests))+'"><span class="ra-production" style="width:'+p/total*100+'%"></span><span class="ra-tests" style="width:'+tests/total*100+'%"></span></div><div class="ra-distribution-summary"><span><i class="ra-dot ra-production"></i> '+esc(t('ra_prod_short'))+'<strong>'+raNumber(p)+'</strong></span><span><i class="ra-dot ra-tests"></i> '+esc(t('ra_test_short'))+'<strong>'+raNumber(tests)+'</strong></span></div>';
    const directories=[...snapshot.directories].sort((a,b)=>(b.production[metric]+b.tests[metric])-(a.production[metric]+a.tests[metric]));
    const visible=directories.slice(0,4);if(directories.length>4){const other={name:t('ra_other'),production:{[metric]:0},tests:{[metric]:0}};directories.slice(4).forEach(item=>{other.production[metric]+=item.production[metric];other.tests[metric]+=item.tests[metric];});visible.push(other);}
    html+=visible.map(item=>'<div class="ra-directory"><code title="'+esc(item.name)+'">'+esc(item.name)+'</code><span class="ra-mini-bar"><i class="ra-production" style="width:'+item.production[metric]/total*100+'%"></i><i class="ra-tests" style="width:'+item.tests[metric]/total*100+'%"></i></span><span>'+raNumber(item.production[metric]+item.tests[metric])+'</span></div>').join('');$('ra-distribution').innerHTML=html;
  }
  function raRender() {
    document.querySelectorAll('[data-ra-days]').forEach(button=>{button.setAttribute('aria-pressed',String(String(raState.days)===button.dataset.raDays));if(button.dataset.raDays!=='all')button.textContent=t('ra_day_preset',{days:button.dataset.raDays});});
    if (!raState.report) return;
    const report=raState.report,items=raVisible();
    $('ra-source-name').textContent=report.repository.name+' / '+report.branch;
    $('ra-metadata').textContent=t('ra_snapshot')+' '+(report.coverage.newestAt?raDate(report.coverage.newestAt)+' '+new Date(report.coverage.newestAt).toISOString().slice(11,16)+' UTC':'—')+' · '+raNumber(report.coverage.historyDays)+' '+t('ra_days');
    $('ra-date-range').textContent=raDates(items);
    $('ra-content').hidden=!items.length; $('ra-state').hidden=Boolean(items.length); $('ra-export').disabled=!items.length;
    if (!items.length) { $('ra-state').textContent=t(report.status==='error'?(report.error==='invalid_branch'?'ra_invalid_branch':report.error==='scan_limit'?'ra_scan_limit':'ra_error'):report.status==='empty'?'ra_empty':'ra_no_range'); return; }
    raRenderKpis(items);raRenderChart(items);raRenderMovement(items);raRenderDistribution(items.at(-1));
    $('ra-coverage').textContent=t('ra_coverage',{snapshots:raNumber(report.snapshots.length),commits:raNumber(report.coverage.commits)})+(report.coverage.sampled?' · '+t('ra_sampled'):'')+(report.coverage.historyTruncated?' · '+t('ra_truncated',{limit:report.coverage.maxCommits}):'');
    const last=items.at(-1);$('ra-partial').hidden=report.status!=='partial';$('ra-partial').textContent=t('ra_partial',{files:raNumber(last.skippedFiles),snapshots:raNumber(report.coverage.omittedSnapshots)});
    $('ra-history-limit').textContent=report.coverage.historyTruncated?t('ra_truncated',{limit:report.coverage.maxCommits}):'';
    $('ra-cache-time').textContent=t('ra_cached',{time:new Date(report.generatedAt).toLocaleString(currentLang==='de'?'de-DE':'en-US')});
    $('ra-table').innerHTML='<table><thead><tr>'+['ra_date','ra_production','ra_tests','ra_ratio','ra_commit'].map(key=>'<th scope="col">'+esc(t(key))+'</th>').join('')+'</tr></thead><tbody>'+items.map(item=>'<tr><td>'+esc(raDate(item.timestamp))+'</td><td>'+(item.complete?'':'≥ ')+raNumber(item.production[raState.metric])+'</td><td>'+(item.complete?'':'≥ ')+raNumber(item.tests[raState.metric])+'</td><td>'+(item.complete?raRatio(item):'—')+'</td><td><code title="'+esc(item.sha)+'">'+esc(item.sha.slice(0,12))+'</code></td></tr>').join('')+'</tbody></table>';
  }
  function raReset() {
    ++raState.epoch; raState.report=null; raState.repositories=[]; raState.repository=''; raState.branch='HEAD'; raState.loading=false; raState.initialized=false;
    $('ra-content').hidden=true; $('ra-state').hidden=false; $('ra-state').textContent=t('ra_no_repos');
    $('ra-repository').innerHTML=''; $('ra-branch').innerHTML=''; $('ra-export').disabled=true;
  }
  async function loadRepositoryAnalytics(force = false) {
    if (!$('repository-analytics-section') || raState.loading || (!force && raState.initialized)) return;
    const epoch=++raState.epoch;raState.loading=true;$('ra-refresh').disabled=true;$('ra-repository').disabled=true;$('ra-branch').disabled=true;$('ra-state').hidden=false;$('ra-content').hidden=true;$('ra-export').disabled=true;
    $('ra-state').innerHTML='<span>'+esc(t('ra_loading'))+'</span><p>'+esc(t('ra_loading_note'))+'</p>';
    try {
      const repositories=await request('/v1/analytics/repositories');if(epoch!==raState.epoch)return;
      raState.repositories=(repositories.data||[]).filter(repo=>repo&&typeof repo.id==='string');
      if(!raState.repositories.length){raState.report=null;raState.initialized=true;$('ra-state').textContent=t('ra_no_repos');return;}
      if(!raState.repositories.some(repo=>repo.id===raState.repository)){raState.repository=raState.repositories[0].id;raState.branch='HEAD';}
      $('ra-repository').innerHTML=raState.repositories.map(repo=>'<option value="'+esc(repo.id)+'">'+esc(repo.name||repo.id)+'</option>').join('');$('ra-repository').value=raState.repository;
      const report=await request('/v1/analytics/repository?repository='+encodeURIComponent(raState.repository)+'&branch='+encodeURIComponent(raState.branch));if(epoch!==raState.epoch)return;
      raState.report=report;raState.initialized=true;const branchOptions=[...new Set(['HEAD',...(report.branches||[])])];
      $('ra-branch').innerHTML=branchOptions.map(branch=>'<option value="'+esc(branch)+'">'+esc(branch==='HEAD'?'HEAD'+(report.branch!=='HEAD'?' · '+report.branch:''):branch)+'</option>').join('');$('ra-branch').value=raState.branch;
      raPreset(raState.days);
    } catch { if(epoch===raState.epoch){raState.report=null;raState.initialized=false;$('ra-state').textContent=t('ra_error');} }
    finally { if(epoch===raState.epoch){raState.loading=false;$('ra-refresh').disabled=false;$('ra-repository').disabled=!raState.repositories.length;$('ra-branch').disabled=!raState.report?.branches.length;} }
  }
  function raExportCsv() {
    const report=raState.report;if(!report||!raVisible().length)return;
    const safe=value=>{let text=String(value);if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const rows=[['repository','branch','date_utc','commit','metric','production_loc','test_loc','production_files','test_files','complete','skipped_files','history_truncated','sampled_history']];
    raVisible().forEach(item=>rows.push([report.repository.id,report.branch,new Date(item.timestamp).toISOString(),item.sha,raState.metric,item.production[raState.metric],item.tests[raState.metric],item.production.files,item.tests.files,item.complete,item.skippedFiles,report.coverage.historyTruncated,report.coverage.sampled]));
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='repository-analytics-'+new Date().toISOString().slice(0,10)+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function raPointerIndex(event) {const items=raVisible();if(!items.length)return null;const rect=$('ra-chart').getBoundingClientRect(),g=raChartGeometry(items),x=(event.clientX-rect.left)/rect.width*g.width;return items.reduce((best,item,index)=>Math.abs(g.x(item)-x)<Math.abs(g.x(items[best])-x)?index:best,0);}
  $('ra-repository')?.addEventListener('change',()=>{raState.repository=$('ra-repository').value;raState.branch='HEAD';loadRepositoryAnalytics(true);});
  $('ra-branch')?.addEventListener('change',()=>{raState.branch=$('ra-branch').value;loadRepositoryAnalytics(true);});
  $('ra-refresh')?.addEventListener('click',()=>loadRepositoryAnalytics(true));
  $('ra-metric')?.addEventListener('change',()=>{raState.metric=$('ra-metric').value==='total'?'total':'nonblank';raRender();});
  document.querySelectorAll('[data-ra-days]').forEach(button=>button.addEventListener('click',()=>raPreset(button.dataset.raDays==='all'?'all':Number(button.dataset.raDays))));
  ['ra-range-start','ra-range-end'].forEach(id=>$(id)?.addEventListener('input',()=>{if(id==='ra-range-start')raState.start=Math.min(Number($(id).value),raState.end);else raState.end=Math.max(Number($(id).value),raState.start);raState.days='custom';raState.pinned=false;raState.hover=null;raRender();}));
  $('ra-chart')?.addEventListener('pointermove',event=>{if(!raState.pinned)raInspect(raPointerIndex(event));});
  $('ra-chart')?.addEventListener('pointerleave',()=>{if(!raState.pinned){raState.hover=null;raInspect(null);}});
  $('ra-chart')?.addEventListener('click',event=>{raState.pinned=!raState.pinned;raInspect(raPointerIndex(event));});
  $('ra-chart')?.addEventListener('keydown',event=>{const items=raVisible();if(!items.length)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();raState.pinned=false;raInspect(event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,(raState.hover??items.length-1)+(event.key==='ArrowLeft'?-1:1))));}else if(event.key==='Enter'||event.key===' '){event.preventDefault();raState.pinned=!raState.pinned;raInspect(raState.hover??items.length-1);}else if(event.key==='Escape'){raState.pinned=false;raState.hover=null;raInspect(null);}});
  $('ra-unpin')?.addEventListener('click',()=>{raState.pinned=false;raState.hover=null;raInspect(null);$('ra-chart').focus();});
  function raStepSnapshot(delta) {
    const items=raVisible(); if(!items.length)return;
    const next=Math.max(0,Math.min(items.length-1,(raState.hover??(delta<0?items.length: -1))+delta));
    raState.pinned=true; raInspect(next);
  }
  $('ra-previous')?.addEventListener('click',()=>raStepSnapshot(-1));
  $('ra-next')?.addEventListener('click',()=>raStepSnapshot(1));
  $('ra-pin')?.addEventListener('click',()=>{raState.pinned=!raState.pinned;raInspect(raState.pinned?(raState.hover??raVisible().length-1):null);});
  document.querySelectorAll('[data-ra-series]').forEach(button=>button.addEventListener('click',()=>{
    const series=button.dataset.raSeries;
    if(raState.visibleSeries.has(series)){if(raState.visibleSeries.size===1)return;raState.visibleSeries.delete(series);}else raState.visibleSeries.add(series);
    document.querySelectorAll('[data-ra-series]').forEach(control=>control.setAttribute('aria-pressed',String(raState.visibleSeries.has(control.dataset.raSeries))));
    if(raVisible().length)raRenderChart(raVisible());
  }));
  $('ra-export')?.addEventListener('click',raExportCsv);
  if (typeof ResizeObserver !== 'undefined' && $('ra-chart')) {
    let previousSize = '';
    new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect.width || 0), size = width + ':' + Math.round(entries[0]?.contentRect.height || 0);
      if (width > 0 && size !== previousSize) { previousSize = size; if (!raState.loading && raVisible().length) { raRenderChart(raVisible()); raRenderMovement(raVisible()); } }
    }).observe($('ra-chart'));
  }
  if($('repository-analytics-section'))new MutationObserver(()=>{if($('repository-analytics-section').classList.contains('active'))loadRepositoryAnalytics();}).observe($('repository-analytics-section'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>raRender()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  raRender();
`;

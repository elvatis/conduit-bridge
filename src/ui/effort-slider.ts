import { supportsFastMode } from '../fast-mode.js';
import { effortCapabilities } from '../effort.js';

/** Keep the wire value separate from the range index as providers change. */
export function effortControl(id: string, modelSelector: string, value = '', providerSelector = '', fallbackSelector = '', fastMode?: boolean): string {
  const safe = (text: string) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const bolt = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></svg>';
  return `<div class="effort-control" data-effort-model="${safe(modelSelector)}" data-effort-provider="${safe(providerSelector)}" data-effort-fallback="${safe(fallbackSelector)}"><input type="hidden" class="effort-value" id="${safe(id)}" value="${safe(value)}"><input type="hidden" class="effort-fast-value" id="${safe(id)}-fast" value="${fastMode === undefined ? '' : String(fastMode)}"><button type="button" class="effort-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${safe(id)}-popover">${bolt}<span data-i18n="lbl_effort">Effort</span><span class="effort-trigger-value">Default</span><span class="effort-trigger-fast" hidden data-i18n="ex_fast_badge">Fast</span><span aria-hidden="true">⌃</span></button><div class="effort-popover" id="${safe(id)}-popover" popover="auto" role="dialog" aria-labelledby="${safe(id)}-label"><header>${bolt}<div class="effort-title"><span class="effort-model-label"></span><output id="${safe(id)}-value" for="${safe(id)}-range">Default</output></div><button type="button" class="effort-close" aria-label="Close" data-i18n-aria="ui_close">›</button></header><div class="effort-range-label"><label id="${safe(id)}-label" for="${safe(id)}-range" data-i18n="lbl_effort">Effort</label><span class="effort-step-count"></span></div><div class="effort-track"><input type="range" id="${safe(id)}-range" min="0" max="0" step="1" value="0" aria-describedby="${safe(id)}-value" title="Controls reasoning effort. Higher levels can take longer." data-i18n-title="tip_effort"></div><div class="effort-scale"><span data-i18n="ex_effort_default">Default</span><span class="effort-scale-max"></span></div><label class="effort-speed-row"><span><span class="effort-speed-label" data-i18n="ex_faster_speed">Faster speed</span><small class="effort-speed-note" id="${safe(id)}-speed-note" data-i18n="ex_fast_cost">Higher usage or cost. Account availability applies.</small></span><input type="checkbox" class="effort-fast-toggle" role="switch" aria-describedby="${safe(id)}-speed-note" aria-label="Faster speed" data-i18n-aria="ex_faster_speed"></label></div></div>`;
}

export const EFFORT_STYLE = String.raw`
  :root { --color-bg-surface:#102035; --color-accent-start:#22B4FF; --color-accent-end:#FF8A3D; --color-thumb:#fff; --color-text-primary:#ECF4FE; }
  .effort-control { min-width:0; margin:0 0 12px; align-self:end; }
  button.effort-trigger { display:inline-flex; align-items:center; gap:7px; min-height:34px; max-width:100%; padding:6px 10px; background:#ffffff06; border:1px solid var(--line); border-radius:10px; font-size:0.8rem; color:var(--muted); white-space:nowrap; }
  .effort-trigger > svg { color:var(--color-accent-start); }
  .effort-trigger-value { color:var(--color-text-primary); font-weight:600; }
  .effort-trigger[aria-expanded="true"] { background:#22B4FF12; border-color:#22B4FF40; }
  .effort-popover { position:fixed; inset:auto; margin:0; box-sizing:border-box; width:310px; max-width:calc(100vw - 24px); padding:18px; border:1px solid var(--card-border,#ffffff14); border-radius:16px; background:var(--card-bg,var(--color-bg-surface)); color:var(--color-text-primary); box-shadow:0 16px 55px #0007,0 2px 9px #0004; z-index:1000; }
  .effort-popover::backdrop { background:transparent; }
  .effort-popover header { display:flex; align-items:center; gap:9px; margin:0 0 20px; }
  .effort-popover header > svg { color:var(--accent-icon,var(--color-accent-start)); flex:none; }
  .effort-title { display:flex; align-items:baseline; gap:6px; min-width:0; flex:1; font-size:0.9286rem; font-weight:600; }
  .effort-model-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .effort-title output { color:var(--accent-text,var(--color-accent-end)); white-space:nowrap; }
  button.effort-close { flex:none; padding:0 4px; min-height:26px; border:0; background:transparent; color:var(--muted); font-size:1.6429rem; }
  .effort-range-label { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:0.8rem; margin-bottom:12px; }
  .effort-range-label label { margin:0; font:inherit; }
  .effort-track { position:relative; height:20px; background:var(--slider-empty,#ffffff09); border-radius:999px; }
  .effort-track::before { content:''; position:absolute; inset:0 auto 0 0; width:var(--effort-fill,0%); border-radius:inherit; background:linear-gradient(to right,var(--slider-from,var(--color-accent-start)),var(--slider-to,var(--color-accent-end))); }
  .effort-track::after { content:''; position:absolute; inset:0 auto 0 0; width:var(--effort-fill,0%); border-radius:inherit; pointer-events:none; opacity:.45; background-image:radial-gradient(circle at 9px 6px,#fff 0 1px,transparent 1.5px),radial-gradient(circle at 26px 14px,#fff 0 .7px,transparent 1.4px); background-size:38px 20px; }
  .effort-control input[type="range"] { position:relative; z-index:1; display:block; appearance:none; width:100%; height:20px; min-height:0; padding:0; margin:0; border:0; border-radius:999px; background:transparent; cursor:pointer; box-shadow:none; touch-action:pan-y; }
  .effort-control input[type="range"]::-webkit-slider-thumb { appearance:none; width:26px; height:26px; background:var(--color-thumb); border:0; border-radius:50%; box-shadow:0 2px 7px #0005,0 0 12px #ffffff20; }
  .effort-control input[type="range"]::-moz-range-thumb { width:26px; height:26px; background:var(--color-thumb); border:0; border-radius:50%; box-shadow:0 2px 7px #0005; }
  .effort-control input[type="range"]:focus-visible { outline:2px solid var(--color-accent-start); outline-offset:7px; }
  .effort-trigger-fast { color:var(--color-accent-end); font-size:0.8rem; }
  .effort-trigger-fast[hidden] { display:none; }
  .effort-speed-row { display:flex; align-items:center; justify-content:space-between; gap:15px; margin:17px 0 0; padding-top:14px; border-top:1px solid var(--line); cursor:pointer; }
  .effort-speed-label { display:block; color:var(--color-text-primary); font-size:0.8571rem; font-weight:500; }
  .effort-speed-note { display:block; color:var(--muted); font-size:0.8rem; line-height:1.5; max-width:205px; margin-top:4px; }
  .effort-speed-row input[type="checkbox"] { appearance:none; width:39px; height:23px; min-width:39px; padding:3px; margin:0; border:1px solid #ffffff15; border-radius:999px; background:#ffffff14; box-shadow:none; cursor:pointer; }
  .effort-speed-row input[type="checkbox"]::before { content:''; display:block; width:15px; height:15px; border-radius:50%; background:var(--color-thumb); box-shadow:0 1px 4px #0004; transition:transform .15s ease; }
  .effort-speed-row input[type="checkbox"]:checked { background:var(--color-accent-start); border-color:transparent; }
  .effort-speed-row input[type="checkbox"]:checked::before { transform:translateX(16px); }
  .effort-speed-row:has(input:disabled) { opacity:.5; cursor:default; }
  .effort-speed-row input:focus-visible { outline:2px solid var(--color-accent-start); outline-offset:4px; }
  .effort-scale { display:flex; justify-content:space-between; margin-top:12px; color:var(--muted); font-size:0.8rem; }
  .effort-control:has(.effort-trigger:disabled) { opacity:.5; }
  .composer-bottom .effort-control,.ex-composer .effort-control { flex:none; margin:0; }
  .model-effort-pair { min-width:0; }
  @media(max-width:760px) { .composer-bottom .effort-control { margin-right:auto; } }
`;

export const EFFORT_SCRIPT = String.raw`
  const effortControlHtml = ${effortControl.toString()};
  const effortCapability = ${effortCapabilities.toString()};
  const effortSupportsFastMode = ${supportsFastMode.toString()};
  function effortFastMode(id) { const value = $(id + '-fast')?.value; return value === 'true' ? true : value === 'false' ? false : undefined; }
  function setEffortFastMode(id, value) { const field = $(id + '-fast'); if (field) field.value = typeof value === 'boolean' ? String(value) : ''; }
  function effortModelProvider(id) {
    if (typeof providerForModel === 'function') return providerForModel(id);
    return (pfState.models || []).find(model => model.id === id)?.provider || '';
  }
  function syncEffortControls(root = document) {
    const controls = [...root.querySelectorAll('.effort-control')];
    if (root.matches?.('.effort-control')) controls.unshift(root);
    controls.forEach(control => {
      const scope = control.closest('.model-effort-pair') || document;
      let model = scope.querySelector(control.dataset.effortModel);
      if (!model?.value && control.dataset.effortFallback) model = document.querySelector(control.dataset.effortFallback) || model;
      const provider = control.dataset.effortProvider && document.querySelector(control.dataset.effortProvider);
      const selected = model?.multiple ? [...model.selectedOptions].map(option => option.value).filter(Boolean) : [model?.value || ''];
      const ladders = (selected.length ? selected : ['']).map(id => effortCapability(provider?.value || effortModelProvider(id)).values);
      const values = ['', ...ladders[0].filter(value => ladders.every(ladder => ladder.includes(value)))];
      const field = control.querySelector('.effort-value'), range = control.querySelector('[type="range"]'), output = control.querySelector('output');
      control._effortValues = values;
      const card = control.querySelector('.effort-popover');
      if (!card.showPopover && control.querySelector('.effort-trigger').getAttribute('aria-expanded') !== 'true') card.hidden = true;
      if (!values.includes(field.value)) field.value = '';
      range.max = String(values.length - 1); range.value = String(values.indexOf(field.value));
      const fastField = control.querySelector('.effort-fast-value'), fastToggle = control.querySelector('.effort-fast-toggle');
      const supportsFast = selected.length > 0 && selected.every(id => effortSupportsFastMode(provider?.value || effortModelProvider(id),id));
      if (!supportsFast && fastField.value === 'true') fastField.value = 'false';
      const fallback = control.dataset.effortFallback ? [...document.querySelectorAll('.effort-control')].find(other => other.dataset.effortModel === control.dataset.effortFallback) : undefined;
      const fastValue = fastField.value || fallback?.querySelector('.effort-fast-value')?.value || 'false';
      fastToggle.checked = supportsFast && fastValue === 'true'; fastToggle.disabled = field.disabled || !supportsFast;
      control.querySelector('.effort-trigger-fast').hidden = !fastToggle.checked;
      const note = control.querySelector('.effort-speed-note'), noteKey = supportsFast ? 'ex_fast_cost' : 'ex_fast_unavailable';
      note.dataset.i18n = noteKey; if (note.textContent !== t(noteKey)) note.textContent = t(noteKey);
      range.disabled = field.disabled;
      control.querySelector('.effort-trigger').disabled = field.disabled;
      const label = field.value ? field.value.charAt(0).toUpperCase() + field.value.slice(1) : t('ex_effort_default');
      if (output.textContent !== label) output.textContent = label;
      const write = (selector, text) => { const node = control.querySelector(selector); if (node.textContent !== text) node.textContent = text; };
      write('.effort-trigger-value', label);
      write('.effort-model-label', model?.selectedOptions?.[0]?.textContent?.split(' · ')[0] || model?.value || provider?.value || t('lbl_model'));
      write('.effort-scale-max', values.at(-1)?.toUpperCase() || '');
      write('.effort-step-count', String(Number(range.value) + 1) + ' / ' + values.length);
      range.setAttribute('aria-valuetext',label);
      const percent = Number(range.value) / Math.max(1,Number(range.max)) * 100;
      control.querySelector('.effort-track').style.setProperty('--effort-fill',percent + '%');
    });
  }
  function positionEffortPopover(control) {
    const trigger = control.querySelector('.effort-trigger'), card = control.querySelector('.effort-popover'), rect = trigger.getBoundingClientRect();
    const width = Math.min(310,window.innerWidth - 24), height = card.offsetHeight || 173;
    card.style.left = Math.max(12,Math.min(rect.left + rect.width / 2 - width / 2,window.innerWidth - width - 12)) + 'px';
    card.style.top = Math.max(12,rect.top >= height + 20 ? rect.top - height - 10 : Math.min(rect.bottom + 10,window.innerHeight - height - 12)) + 'px';
  }
  function closeEffortPopover(control) {
    const card = control.querySelector('.effort-popover');
    if (card.hidePopover) card.hidePopover(); else card.hidden = true;
    control.querySelector('.effort-trigger').setAttribute('aria-expanded','false');
  }
  document.addEventListener('click',event => {
    const trigger = event.target.closest('.effort-trigger'), close = event.target.closest('.effort-close');
    if (close) { const control = close.closest('.effort-control'); closeEffortPopover(control); control.querySelector('.effort-trigger').focus(); }
    if (!trigger) return;
    const control = trigger.closest('.effort-control'), card = control.querySelector('.effort-popover');
    syncEffortControls(control);
    if (trigger.getAttribute('aria-expanded') === 'true') { closeEffortPopover(control); return; }
    document.querySelectorAll('.effort-trigger[aria-expanded="true"]').forEach(other => closeEffortPopover(other.closest('.effort-control')));
    if (card.showPopover) card.showPopover(); else card.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    positionEffortPopover(control);
    control.querySelector('[type="range"]').focus();
  });
  document.addEventListener('toggle',event => { if (event.target.matches?.('.effort-popover')) event.target.closest('.effort-control').querySelector('.effort-trigger').setAttribute('aria-expanded',String(event.newState === 'open')); },true);
  document.addEventListener('keydown',event => { if (event.key === 'Escape') document.querySelectorAll('.effort-trigger[aria-expanded="true"]').forEach(trigger => { closeEffortPopover(trigger.closest('.effort-control')); trigger.focus(); }); });
  window.addEventListener('resize',() => document.querySelectorAll('.effort-trigger[aria-expanded="true"]').forEach(trigger => positionEffortPopover(trigger.closest('.effort-control'))));
  document.addEventListener('scroll',event => { if (!event.target.closest?.('.effort-popover')) document.querySelectorAll('.effort-trigger[aria-expanded="true"]').forEach(trigger => closeEffortPopover(trigger.closest('.effort-control'))); },true);
  document.addEventListener('input', event => {
    const range = event.target.closest('.effort-control input[type="range"]');
    if (!range) { if (event.target.matches('[id="pf-profile-model"]')) syncEffortControls(); return; }
    const control = range.closest('.effort-control'), field = control.querySelector('.effort-value');
    field.value = control._effortValues?.[Number(range.value)] || '';
    syncEffortControls(control);
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.effort-fast-toggle')) {
      const control = event.target.closest('.effort-control');
      control.querySelector('.effort-fast-value').value = String(event.target.checked);
      syncEffortControls();
    } else if (event.target.matches('select,[id="pf-profile-model"],.effort-value')) syncEffortControls();
  });
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('.effort-control,select,option,optgroup') || node.querySelector('.effort-control'))))) syncEffortControls();
  }).observe(document.body,{childList:true,subtree:true});
  queueMicrotask(() => syncEffortControls());
`;

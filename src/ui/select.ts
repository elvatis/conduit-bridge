/** Progressive enhancement: native selects remain the form and routing source of truth. */
export const SELECT_STYLE = String.raw`
  select { appearance:none; padding-right:34px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238FA0BD' stroke-width='1.8'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 11px center; }
  select[multiple],select[size] { background-image:none; padding-right:12px; }
  select.enhanced-native-select { position:absolute !important; width:1px !important; height:1px !important; padding:0 !important; border:0 !important; clip-path:inset(50%) !important; overflow:hidden !important; }
  .select-trigger { width:100%; min-height:40px; justify-content:space-between; text-align:left; gap:12px; border:1px solid var(--line-2); background:var(--panel); color:var(--text); padding:9px 12px; font:inherit; font-size:0.9286rem; border-radius:9px; }
  .select-trigger > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .select-trigger > svg { width:16px; height:16px; color:var(--muted); flex:none; transition:transform .15s; }
  .select-trigger:hover,.select-trigger[aria-expanded="true"] { border-color:var(--blue); background:var(--panel-2); }
  .select-trigger[aria-expanded="true"] > svg { transform:rotate(180deg); color:var(--blue); }
  .select-trigger:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
  .select-trigger:disabled { opacity:.5; cursor:not-allowed; }
  .select-trigger[aria-invalid="true"] { border-color:var(--bad); }
  .composer-model .select-trigger { min-height:34px; border-color:transparent; background:transparent; padding:6px 8px; font-size:0.8571rem; width:auto; max-width:100%; color:var(--body); }
  .composer-model .select-trigger:hover { background:var(--panel-3); border-color:var(--line); }
  .select-popover { position:fixed; z-index:1000; background:var(--panel); border:1px solid var(--line-2); border-radius:12px; padding:8px; box-shadow:0 18px 56px #0009,0 0 0 1px #22b4ff08; font-family:var(--font-sans); }
  .select-search-wrap { position:relative; margin-bottom:7px; }
  .select-search-wrap > svg { position:absolute; left:11px; top:12px; width:16px; height:16px; color:var(--muted); pointer-events:none; }
  .select-popover .select-search { width:100%; height:40px; padding:8px 12px 8px 35px; border:1px solid var(--line); border-radius:7px; background:var(--bg); font:inherit; font-size:0.9286rem; color:var(--text); }
  .select-options { overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--line-2) transparent; }
  .select-option { display:flex; width:100%; align-items:center; justify-content:space-between; gap:12px; padding:9px 11px; border:0; border-radius:7px; font:inherit; font-size:0.9286rem; text-align:left; background:transparent; color:var(--body); cursor:pointer; }
  .select-option span { overflow-wrap:anywhere; }
  .select-option svg { flex:none; color:var(--blue); }
  .select-option[aria-selected="true"] { background:#22b4ff12; color:var(--text); }
  .select-option.is-active,.select-option:hover:not(:disabled) { background:var(--panel-3); color:var(--text); outline:1px solid var(--line); outline-offset:-1px; }
  .select-option:disabled { opacity:.45; cursor:not-allowed; }
  .select-group { padding:11px 11px 5px; font-size:0.8rem; font-weight:600; letter-spacing:.05em; color:var(--muted); }
  .select-empty { padding:22px 12px; margin:0; text-align:center; color:var(--muted); font-size:0.9286rem; }
`;

export const SELECT_SCRIPT = String.raw`
  const enhancedSelects = new Map();
  let openSelect = null, selectSequence = 0, selectSyncQueued = false;
  const selectChevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const selectCheck = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
  function selectLabel(select) {
    const label = select.labels?.[0];
    return select.getAttribute('aria-label') || label?.querySelector('[data-i18n]')?.textContent || label?.querySelector('span')?.textContent || t('ui_select_option');
  }
  function selectEntries(select) {
    return Array.from(select.options).map((option,index) => ({ index, value:option.value, label:option.label, disabled:option.disabled || option.parentElement?.disabled, group:option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '' }));
  }
  function syncSelectTrigger(select, ui) {
    const value = select.selectedOptions[0]?.label || t('ui_select_option');
    if (ui.text.textContent !== value) ui.text.textContent = value;
    const label = selectLabel(select) + ': ' + value;
    if (ui.trigger.getAttribute('aria-label') !== label) ui.trigger.setAttribute('aria-label',label);
    const disabled = select.matches(':disabled');
    if (ui.trigger.disabled !== disabled) ui.trigger.disabled = disabled;
    if (ui.trigger.hidden !== select.hidden) ui.trigger.hidden = select.hidden;
    const description = select.getAttribute('aria-describedby');
    if (description && ui.trigger.getAttribute('aria-describedby') !== description) ui.trigger.setAttribute('aria-describedby',description);
    if (select.validity.valid) ui.trigger.removeAttribute('aria-invalid');
  }
  function closeSelect(restoreFocus = false) {
    if (!openSelect) return;
    const current = openSelect; openSelect = null;
    current.ui.trigger.setAttribute('aria-expanded','false');
    current.panel.remove();
    if (restoreFocus && current.ui.trigger.isConnected && !current.ui.trigger.disabled) current.ui.trigger.focus();
  }
  function positionSelect() {
    if (!openSelect) return;
    const {ui,panel,list} = openSelect, rect = ui.trigger.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { closeSelect(); return; }
    const width = Math.min(Math.max(Math.min(rect.width,440),320),innerWidth-24);
    const below = innerHeight-rect.bottom-12, above = rect.top-12;
    const up = below < 240 && above > below;
    const height = Math.min(380,Math.max(120,(up ? above : below)-8));
    panel.style.width = width+'px';
    panel.style.left = Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px';
    list.style.maxHeight = Math.max(60,height-64)+'px';
    panel.style.top = (up ? Math.max(12,rect.top-panel.offsetHeight-8) : rect.bottom+8)+'px';
  }
  function activateSelectOption(index) {
    if (!openSelect) return;
    const current = openSelect;
    current.active = index;
    current.list.querySelectorAll('[role="option"]').forEach(option => option.classList.toggle('is-active',Number(option.dataset.index) === index));
    const option = current.list.querySelector('[data-index="'+index+'"]');
    if (option) { current.search.setAttribute('aria-activedescendant',option.id); option.scrollIntoView({block:'nearest'}); }
    else current.search.removeAttribute('aria-activedescendant');
  }
  function renderSelectOptions() {
    if (!openSelect) return;
    const current = openSelect, query = current.search.value.trim().toLocaleLowerCase();
    const entries = selectEntries(current.select).filter(item => (item.label+' '+item.group+' '+item.value).toLocaleLowerCase().includes(query));
    current.visible = entries.filter(item => !item.disabled).map(item => item.index);
    const fragment = document.createDocumentFragment(); let group;
    for (const entry of entries) {
      if (entry.group && entry.group !== group) {
        const heading = document.createElement('div'); heading.className='select-group'; heading.textContent=entry.group; fragment.appendChild(heading);
      }
      group=entry.group;
      const option=document.createElement('button'); option.type='button'; option.className='select-option'; option.tabIndex=-1;
      option.setAttribute('role','option'); option.setAttribute('aria-selected',String(entry.index===current.select.selectedIndex));
      option.id=current.ui.id+'-option-'+entry.index; option.dataset.index=String(entry.index); option.disabled=Boolean(entry.disabled);
      const label=document.createElement('span'); label.textContent=entry.label; option.appendChild(label);
      if(entry.index===current.select.selectedIndex) option.insertAdjacentHTML('beforeend',selectCheck);
      option.addEventListener('click',()=>{
        current.select.selectedIndex=entry.index;
        current.select.dispatchEvent(new Event('input',{bubbles:true}));
        current.select.dispatchEvent(new Event('change',{bubbles:true}));
        syncSelectTrigger(current.select,current.ui); closeSelect(true);
      });
      fragment.appendChild(option);
    }
    if (!entries.length) { const empty=document.createElement('p'); empty.className='select-empty'; empty.setAttribute('role','status'); empty.textContent=t('ui_no_matching_options'); fragment.appendChild(empty); }
    current.list.replaceChildren(fragment);
    const active=current.visible.includes(current.active)?current.active:current.visible.includes(current.select.selectedIndex)?current.select.selectedIndex:current.visible[0];
    activateSelectOption(active); positionSelect();
  }
  function showSelect(select,ui) {
    if (select.matches(':disabled')) return;
    if (openSelect?.select===select) { closeSelect(true); return; }
    closeSelect(); syncSelectTrigger(select,ui);
    const panel=document.createElement('div'); panel.className='select-popover'; panel.dataset.selectUi='true'; panel.id=ui.id;
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',selectLabel(select));
    const searchWrap=document.createElement('div'); searchWrap.className='select-search-wrap';
    searchWrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>';
    const search=document.createElement('input'); search.type='search'; search.className='select-search'; search.placeholder=t('ui_search_options');
    search.setAttribute('aria-label',t('ui_search_options')); search.setAttribute('role','combobox'); search.setAttribute('aria-expanded','true'); search.setAttribute('aria-autocomplete','list'); search.setAttribute('autocomplete','off');
    const list=document.createElement('div'); list.className='select-options'; list.id=ui.id+'-list'; list.setAttribute('role','listbox'); list.setAttribute('aria-label',selectLabel(select)); search.setAttribute('aria-controls',list.id);
    searchWrap.appendChild(search); panel.append(searchWrap,list); (select.closest('dialog') || document.body).appendChild(panel);
    openSelect={select,ui,panel,search,list,active:select.selectedIndex,visible:[]}; ui.trigger.setAttribute('aria-expanded','true');
    search.addEventListener('input',renderSelectOptions);
    search.addEventListener('keydown',event=>{
      if(!openSelect)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSelect(true);return;}
      if(event.key==='Tab'){closeSelect(true);return;}
      const {visible,active}=openSelect;
      if(event.key==='ArrowDown'||event.key==='ArrowUp') { event.preventDefault(); const next=visible.indexOf(active)+(event.key==='ArrowDown'?1:-1); activateSelectOption(visible[Math.max(0,Math.min(visible.length-1,next))]); }
      if(event.key==='Enter'){event.preventDefault();openSelect.list.querySelector('[data-index="'+active+'"]')?.click();}
    });
    renderSelectOptions(); search.focus();
  }
  function refreshSelectControls() {
    for(const [select,ui] of enhancedSelects) {
      if(!select.isConnected) { if(openSelect?.select===select)closeSelect(); ui.trigger.remove(); enhancedSelects.delete(select); continue; }
      syncSelectTrigger(select,ui);
    }
    document.querySelectorAll('select:not([multiple]):not([size])').forEach(select=>{
      if(enhancedSelects.has(select))return;
      const trigger=document.createElement('button'); trigger.type='button'; trigger.className='select-trigger'; trigger.dataset.selectUi='true';
      const text=document.createElement('span'); trigger.appendChild(text); trigger.insertAdjacentHTML('beforeend',selectChevron);
      const ui={trigger,text,id:'select-menu-'+(++selectSequence)}; enhancedSelects.set(select,ui);
      trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-controls',ui.id);
      select.classList.add('enhanced-native-select'); select.tabIndex=-1; select.setAttribute('aria-hidden','true'); select.after(trigger);
      trigger.addEventListener('click',()=>showSelect(select,ui));
      trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();showSelect(select,ui);}});
      select.addEventListener('focus',()=>trigger.focus());
      select.addEventListener('invalid',event=>{event.preventDefault();trigger.setAttribute('aria-invalid','true');trigger.focus();});
      select.addEventListener('change',()=>syncSelectTrigger(select,ui));
      syncSelectTrigger(select,ui);
    });
    if(openSelect) {
      if(openSelect.ui.trigger.disabled || !openSelect.ui.trigger.getClientRects().length) { closeSelect(); return; }
      openSelect.search.placeholder=t('ui_search_options'); openSelect.search.setAttribute('aria-label',t('ui_search_options'));
      renderSelectOptions();
    }
  }
  function queueSelectSync() { if(selectSyncQueued)return; selectSyncQueued=true; queueMicrotask(()=>{selectSyncQueued=false;refreshSelectControls();}); }
  function initializeSelectControls() {
    refreshSelectControls();
    new MutationObserver(records=>{
      if(records.some(record=>!((record.target.nodeType===1?record.target:record.target.parentElement)?.closest('[data-select-ui]'))))queueSelectSync();
    }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','selected']});
    document.addEventListener('pointerdown',event=>{if(openSelect&&!openSelect.panel.contains(event.target)&&!openSelect.ui.trigger.contains(event.target))closeSelect();});
    document.addEventListener('change',queueSelectSync); document.addEventListener('reset',queueSelectSync);
    window.addEventListener('resize',()=>closeSelect());
    document.addEventListener('scroll',event=>{if(openSelect&&!openSelect.panel.contains(event.target))positionSelect();},true);
  }
  if (typeof MutationObserver==='function') {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeSelectControls,{once:true});
    else initializeSelectControls();
  }
`;

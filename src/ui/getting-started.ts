const icon = (path: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const close = icon('<path d="m6 6 12 12M6 18 18 6"/>');
const search = icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');
const arrow = icon('<path d="M5 12h14m-6-6 6 6-6 6"/>');
const EXAMPLES = ['explain', 'review', 'plan', 'insights'] as const;
export const NAV_SEARCH_BUTTON = `<button type="button" id="nav-search-open" title="Find a page (Ctrl+K)" aria-label="Find a page (Ctrl+K)" data-i18n-title="start_find_page" data-i18n-aria="start_find_page">${search}</button>`;
export const INTRO_OFFER_HTML = `<aside id="intro-offer" class="intro-offer" aria-labelledby="intro-offer-title" hidden><div><strong id="intro-offer-title" data-i18n="start_offer">New here?</strong><span data-i18n="start_offer_detail">Get your bearings in a minute.</span></div><div class="intro-offer-actions"><button type="button" data-open-intro data-i18n="start_open">Quick introduction</button><button type="button" id="intro-dismiss" title="Dismiss introduction" aria-label="Dismiss introduction" data-i18n-title="start_dismiss" data-i18n-aria="start_dismiss">${close}</button></div></aside>`;
export const HELP_EXAMPLES_HTML = `<section class="help-examples" aria-labelledby="help-examples-title"><div class="help-examples-heading"><div><h3 id="help-examples-title" data-i18n="start_examples">Examples for your first task</h3><p class="muted" data-i18n="start_examples_intro">Choose a starting point. Review the draft before sending it.</p></div><button type="button" data-open-intro data-i18n="start_reopen">Open introduction</button></div><div class="help-example-grid">${EXAMPLES.map(id => `<article class="help-example" id="help-example-${id}"><h4 data-i18n="start_${id}_title">${id}</h4><p data-i18n="start_${id}_help"></p><details><summary data-i18n="start_show_example">Show example</summary><p class="help-example-prompt" data-i18n="start_${id}_prompt"></p></details><button type="button" data-use-example="${id}">${arrow}<span class="action-label" data-i18n="${id === 'insights' ? 'start_go_insights' : 'start_use_example'}">Use example</span></button></article>`).join('')}</div></section>`;
export const GETTING_STARTED_HTML = `<dialog id="intro-dialog" class="modal-backdrop" aria-labelledby="intro-title"><div class="modal-dialog intro-dialog"><div class="modal-header"><h3 id="intro-title" data-i18n="start_title">Your first steps with Conduit</h3><button type="button" class="modal-close" id="intro-close" title="Close" aria-label="Close" data-i18n-title="ui_close" data-i18n-aria="ui_close">${close}</button></div><div class="modal-body" tabindex="0" role="region" aria-labelledby="intro-title"><p class="muted" data-i18n="start_intro">Start with a conversation. Add tools and automation when you need them.</p><ol class="intro-steps"><li><strong data-i18n="start_step1">Choose a model</strong><p data-i18n="start_step1_help">Open Models to see which providers are available. API keys are managed in Settings.</p></li><li><strong data-i18n="start_step2">Describe your task</strong><p data-i18n="start_step2_help">Chat is a good place for questions. Execution adds workspace access, limits and approval controls.</p></li><li><strong data-i18n="start_step3">Review and keep the results</strong><p data-i18n="start_step3_help">Open the source messages, inspect Git changes, or use Insights to gather what your saved chats have in common.</p></li></ol><p class="intro-shortcut"><kbd>Ctrl</kbd> + <kbd>K</kbd><span data-i18n="start_shortcut">finds any page. Help keeps the examples and this introduction.</span></p></div><div class="modal-footer"><button type="button" id="intro-examples" data-i18n="start_browse_examples">Browse examples</button><button type="button" id="intro-done" class="primary" autofocus>${icon('<path d="m5 12 4 4L19 6"/>')}<span class="action-label" data-i18n="start_done">Got it</span></button></div></div></dialog>
<dialog id="nav-search-dialog" class="modal-backdrop" aria-labelledby="nav-search-title"><div class="modal-dialog nav-search-dialog"><div class="modal-header"><h3 id="nav-search-title" data-i18n="start_find_page_title">Find a page</h3><button type="button" class="modal-close" id="nav-search-close" title="Close" aria-label="Close" data-i18n-title="ui_close" data-i18n-aria="ui_close">${close}</button></div><div class="modal-body"><label class="nav-search-label"><span class="visually-hidden" data-i18n="start_search_label">Page name</span><input type="search" id="nav-search-input" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="nav-search-results" autocomplete="off" placeholder="Chat, workflows, insights…" data-i18n-ph="start_search_placeholder" autofocus></label><p id="nav-search-count" class="visually-hidden" role="status"></p><div id="nav-search-results" role="listbox" aria-label="Pages" data-i18n-aria="start_pages"></div></div></div></dialog>`;

export const GETTING_STARTED_STYLE = String.raw`
  .skip-link { position:fixed; left:1rem; top:-8rem; z-index:100; padding:.75rem 1rem; background:var(--panel-2); color:var(--text); border:2px solid var(--blue); border-radius:8px; }
  .skip-link:focus { top:1rem; }
  .intro-offer { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border:1px solid var(--line-2); border-radius:16px; background:var(--panel-2); margin-bottom:1.5rem; flex:none; }
  .intro-offer > div:first-child { display:flex; flex-wrap:wrap; gap:.5rem; } .intro-offer span { color:var(--body); }
  .intro-offer-actions { display:flex; align-items:center; gap:.75rem; flex:none; }
  #intro-dismiss,#nav-search-open { width:44px; min-height:44px; padding:0; }
  .intro-dialog { max-width:720px; } .intro-steps { display:grid; gap:1.25rem; padding-left:1.5rem; margin:0; }
  .intro-steps li { padding-left:.5rem; } .intro-steps li::marker { color:var(--copper); font-weight:600; } .intro-steps p { margin:.4rem 0 0; color:var(--body); }
  .intro-shortcut { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; padding-top:1rem; border-top:1px solid var(--line); margin:0; color:var(--muted); font-size:.875rem; }
  kbd { padding:.1rem .3rem; border:1px solid var(--line-2); border-radius:4px; }
  .help-examples-heading { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; }
  .help-examples-heading h3 { margin:0; } .help-examples-heading p { margin:.5rem 0 0; }
  .help-example-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1.5rem; }
  .help-example { display:flex; flex-direction:column; align-items:flex-start; gap:.75rem; padding:1.25rem; border:1px solid var(--line); border-radius:16px; background:var(--panel-2); }
  .help-example h4,.help-example p { margin:0; } .help-example h4 { font-size:1rem; } .help-example p { color:var(--body); }
  .help-example details { width:100%; margin:0 0 .25rem; } .help-example summary { cursor:pointer; color:var(--blue-soft); padding:.35rem 0; }
  .help-example .help-example-prompt { margin-top:.75rem; padding:.85rem; border-left:2px solid var(--copper); background:var(--panel); border-radius:6px; }
  .help-example > button { margin-top:auto; } .help-technical { margin-top:1.5rem; } .help-technical > summary { cursor:pointer; padding:1rem; background:var(--panel); border-radius:12px; }
  .help-technical > section { margin-top:1.5rem; }
  .page-section > section + section { margin-top:1.5rem; }
  .nav-search-dialog { max-width:600px; } .nav-search-label { margin:0; } #nav-search-results { display:grid; gap:.4rem; max-height:50dvh; overflow:auto; padding:.3rem; }
  #nav-search-results button { display:flex; align-items:center; justify-content:space-between; gap:1rem; width:100%; padding:.7rem 1rem; text-align:left; border:1px solid transparent; background:transparent; }
  #nav-search-results button[aria-selected="true"] { border-color:var(--blue); background:var(--panel-3); }
  #nav-search-results small { color:var(--muted); }
  .compact-action { width:var(--control-height); min-height:var(--control-height); padding:0; flex:none; }
  .compact-action > .action-label { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  #intro-offer[hidden] { display:none; }
  @container workspace (max-width:45rem) { .help-example-grid { grid-template-columns:minmax(0,1fr); } }
  @media(max-width:600px) { .intro-offer { flex-wrap:wrap; } .intro-offer-actions { width:100%; justify-content:space-between; } }
`;

export const GETTING_STARTED_SCRIPT = String.raw`
  const introPreference = 'conduit_intro_seen_v1'; let introOpener = null, introDestination = '';
  function introDismiss() { $('intro-offer').hidden = true; try { localStorage.setItem(introPreference,'true'); } catch {} }
  try { $('intro-offer').hidden = localStorage.getItem(introPreference) === 'true'; } catch { $('intro-offer').hidden = false; }
  function introOpen() { if (document.querySelector('dialog[open]')) return; introOpener = document.activeElement; introDestination = ''; introDismiss(); $('intro-dialog').showModal(); }
  function focusSection(name) { const target = $(sectionIds[name]); const heading = target?.querySelector('h1,h2,h3'); if (heading) { heading.tabIndex = -1; heading.focus(); } }
  document.addEventListener('click',event => {
    if (event.target.closest('[data-open-intro]')) introOpen();
    const topic = event.target.closest('[data-help-topic]');
    if (topic) { showSection('help'); const example = $('help-example-' + topic.dataset.helpTopic); if (example) { example.querySelector('details').open = true; example.tabIndex = -1; example.focus(); example.scrollIntoView({block:'center'}); } }
    const use = event.target.closest('[data-use-example]');
    if (use) {
      const id = use.dataset.useExample; if (!['explain','review','plan','insights'].includes(id)) return;
      if (id === 'insights') { showSection('insights'); focusSection('insights'); return; }
      const destination = id === 'explain' ? 'platform' : 'execution'; showSection(destination);
      if (destination === 'platform') pfTab('chat');
      const input = $(destination === 'platform' ? 'pf-chat-input' : 'ex-prompt');
      input.value = input.value.trim() ? input.value + '\n\n' + t('start_' + id + '_prompt') : t('start_' + id + '_prompt');
      input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); input.scrollIntoView({block:'center'});
      setNotice(() => t('start_example_loaded'),'info');
    }
  });
  $('intro-dismiss').addEventListener('click',introDismiss);
  $('intro-close').addEventListener('click',() => $('intro-dialog').close());
  $('intro-done').addEventListener('click',() => $('intro-dialog').close());
  $('intro-examples').addEventListener('click',() => { introDestination = 'help'; $('intro-dialog').close(); });
  $('intro-dialog').addEventListener('close',() => { if (introDestination) { showSection(introDestination); focusSection(introDestination); } else if (introOpener?.isConnected && introOpener.checkVisibility()) introOpener.focus(); else $('nav-search-open').focus(); });
  document.querySelector('.skip-link').addEventListener('click',event => { event.preventDefault(); $('workspace-content').focus(); });

  let navSearchRows = [], navSearchIndex = 0, navSearchOpener = null, navSearchDestination = '';
  function navSearchRender() {
    const query = $('nav-search-input').value.trim().toLocaleLowerCase(currentLang);
    navSearchRows = NAV_SECTIONS.filter(item => (t(item.label) + ' ' + item.key).toLocaleLowerCase(currentLang).includes(query));
    navSearchIndex = Math.min(navSearchIndex,Math.max(0,navSearchRows.length-1));
    setLocalizedHtml($('nav-search-results'),() => navSearchRows.map((item,index) => '<button type="button" role="option" tabindex="-1" id="nav-search-option-' + index + '" data-nav-result="' + esc(item.key) + '" aria-selected="' + (index === navSearchIndex) + '"><span>' + esc(t(item.label)) + '</span>' + (item.key === activeSection ? '<small>' + esc(t('start_current_page')) + '</small>' : '') + '</button>').join(''));
    setLocalizedText($('nav-search-count'),() => t(navSearchRows.length ? 'start_matches' : 'start_no_matches',{count:navSearchRows.length}));
    $('nav-search-count').classList.toggle('visually-hidden',navSearchRows.length > 0);
    if (navSearchRows.length) $('nav-search-input').setAttribute('aria-activedescendant','nav-search-option-' + navSearchIndex); else $('nav-search-input').removeAttribute('aria-activedescendant');
  }
  function navSearchOpen() { if (document.querySelector('dialog[open]')) return; navSearchOpener = document.activeElement; navSearchDestination = ''; $('nav-search-input').value = ''; navSearchIndex = 0; navSearchRender(); $('nav-search-dialog').showModal(); $('nav-search-input').focus(); }
  function navSearchChoose(name) { if (!Object.hasOwn(sectionIds,name)) return; navSearchDestination = name; $('nav-search-dialog').close(); }
  $('nav-search-open').addEventListener('click',navSearchOpen);
  $('nav-search-close').addEventListener('click',() => $('nav-search-dialog').close());
  $('nav-search-dialog').addEventListener('close',() => { if (navSearchDestination) { const name = navSearchDestination; showSection(name); focusSection(name); } else navSearchOpener?.focus(); });
  $('nav-search-input').addEventListener('input',() => { navSearchIndex = 0; navSearchRender(); });
  $('nav-search-input').addEventListener('keydown',event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('nav-search-dialog').close(); return; }
    if (['ArrowDown','ArrowUp','Enter'].includes(event.key)) event.preventDefault();
    if (event.key === 'Enter' && navSearchRows[navSearchIndex]) navSearchChoose(navSearchRows[navSearchIndex].key);
    if (navSearchRows.length && ['ArrowDown','ArrowUp'].includes(event.key)) {
      navSearchIndex = (navSearchIndex + (event.key === 'ArrowDown' ? 1 : -1) + navSearchRows.length) % navSearchRows.length;
      navSearchRender(); $('nav-search-option-' + navSearchIndex)?.scrollIntoView({block:'nearest'});
    }
  });
  $('nav-search-results').addEventListener('click',event => { const row = event.target.closest('[data-nav-result]'); if (row) navSearchChoose(row.dataset.navResult); });
  document.addEventListener('keydown',event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); navSearchOpen(); } });
  for (const id of ['pf-save-chat','pf-export-chat','pf-delete-chat','pipe-add-step-btn']) {
    const button = $(id), label = button?.querySelector('.action-label'), key = label?.dataset.i18n;
    if (button?.querySelector('svg') && key) { button.classList.add('compact-action'); button.dataset.i18nTitle = key; button.title = t(key); }
  }
`;

export const GETTING_STARTED_COPY = {
  en: {
    start_offer:'New here?', start_offer_detail:'Get your bearings in a minute.', start_open:'Quick introduction', start_dismiss:'Dismiss introduction', start_title:'Your first steps with Conduit', start_intro:'Start with a conversation. Add tools and automation when you need them.', start_step1:'Choose a model', start_step1_help:'Open Models to see which providers are available. API keys are managed in Settings.', start_step2:'Describe your task', start_step2_help:'Chat is a good place for questions. Execution adds workspace access, limits and approval controls.', start_step3:'Review and keep the results', start_step3_help:'Open the source messages, inspect Git changes, or use Insights to gather what your saved chats have in common.', start_shortcut:'finds any page. Help keeps the examples and this introduction.', start_done:'Got it', start_browse_examples:'Browse examples', start_reopen:'Open introduction', start_examples:'Examples for your first task', start_examples_intro:'Choose a starting point. Review the draft before sending it.', start_show_example:'Show example', start_use_example:'Use as draft', start_go_insights:'Open insights', start_example_loaded:'Example added to your draft. Nothing has been sent.', start_technical:'Technical reference', start_skip:'Skip to content',
    start_explain_title:'Understand a topic', start_explain_help:'Use Chat for a clear explanation with a concrete example.', start_explain_prompt:'Explain the difference between an API provider and a local model in plain language. Give one concrete example of each and finish with three questions to help me choose.',
    start_review_title:'Review a change', start_review_help:'Use Execution with a workspace and a read-only or planning permission scope.', start_review_prompt:'Review the current workspace changes without editing files. Summarize the intended behavior, identify concrete defects with file references, and suggest the smallest useful verification steps. Separate confirmed findings from assumptions.',
    start_plan_title:'Make a bounded plan', start_plan_help:'State the desired result, constraints and acceptance criteria.', start_plan_prompt:'Plan an improvement to the getting-started documentation in this workspace. First identify the audience and missing examples. Propose three small steps with acceptance criteria. Do not modify files or run commands yet.',
    start_insights_title:'Connect previous conversations', start_insights_help:'BitNet reads your complete saved messages locally and groups selected original statements with sources.', start_insights_prompt:'Example: one chat chooses SQLite, another records a successful persistence check, and a third leaves a backup test open. Insights can group these as a decision, a result and an open task. Source links let you verify each conclusion.',
    start_find_page:'Find a page (Ctrl+K)', start_find_page_title:'Find a page', start_search_label:'Page name', start_search_placeholder:'Chat, workflows, insights…', start_pages:'Pages', start_matches:'{count} matching pages', start_no_matches:'No matching pages', start_current_page:'Current page',
  },
  de: {
    start_offer:'Neu hier?', start_offer_detail:'In einer Minute orientieren.', start_open:'Kurze Einführung', start_dismiss:'Einführung ausblenden', start_title:'Ihre ersten Schritte mit Conduit', start_intro:'Beginnen Sie mit einem Gespräch. Ergänzen Sie Tools und Automatisierung nach Bedarf.', start_step1:'Modell auswählen', start_step1_help:'Unter Modelle sehen Sie verfügbare Anbieter. API-Schlüssel verwalten Sie in den Einstellungen.', start_step2:'Aufgabe beschreiben', start_step2_help:'Chat eignet sich für Fragen. Ausführung ergänzt Zugriff auf Arbeitsbereiche, Limits und Freigaben.', start_step3:'Ergebnisse prüfen und festhalten', start_step3_help:'Öffnen Sie Quellnachrichten, prüfen Sie Git-Änderungen oder bündeln Sie unter Erkenntnisse die Ergebnisse Ihrer gespeicherten Chats.', start_shortcut:'findet jede Seite. Unter Hilfe stehen die Beispiele und diese Einführung bereit.', start_done:'Verstanden', start_browse_examples:'Beispiele ansehen', start_reopen:'Einführung öffnen', start_examples:'Beispiele für die erste Aufgabe', start_examples_intro:'Wählen Sie einen Ausgangspunkt. Prüfen Sie den Entwurf vor dem Senden.', start_show_example:'Beispiel anzeigen', start_use_example:'Als Entwurf einsetzen', start_go_insights:'Erkenntnisse öffnen', start_example_loaded:'Beispiel zum Entwurf hinzugefügt. Es wurde nichts gesendet.', start_technical:'Technische Referenz', start_skip:'Zum Inhalt springen',
    start_explain_title:'Ein Thema verstehen', start_explain_help:'Nutzen Sie Chat für eine klare Erklärung mit einem konkreten Beispiel.', start_explain_prompt:'Erkläre den Unterschied zwischen einem API-Anbieter und einem lokalen Modell in einfachen Worten. Nenne je ein konkretes Beispiel und schließe mit drei Fragen, die mir bei der Auswahl helfen.',
    start_review_title:'Eine Änderung prüfen', start_review_help:'Wählen Sie unter Ausführung einen Arbeitsbereich und den Berechtigungsumfang Nur lesen oder Planen.', start_review_prompt:'Prüfe die aktuellen Änderungen im Arbeitsbereich, ohne Dateien zu bearbeiten. Fasse das beabsichtigte Verhalten zusammen, benenne konkrete Fehler mit Dateiverweisen und schlage die kleinsten sinnvollen Prüfschritte vor. Trenne belegte Befunde von Annahmen.',
    start_plan_title:'Einen begrenzten Plan erstellen', start_plan_help:'Benennen Sie das gewünschte Ergebnis, Grenzen und Abnahmekriterien.', start_plan_prompt:'Plane eine Verbesserung der Einstiegsdokumentation in diesem Arbeitsbereich. Bestimme zuerst die Zielgruppe und fehlende Beispiele. Schlage drei kleine Schritte mit Abnahmekriterien vor. Ändere noch keine Dateien und führe noch keine Befehle aus.',
    start_insights_title:'Frühere Gespräche verbinden', start_insights_help:'BitNet liest Ihre vollständigen gespeicherten Nachrichten lokal und ordnet ausgewählte Originalaussagen mit Quellen.', start_insights_prompt:'Beispiel: Ein Chat legt SQLite fest, ein weiterer hält eine erfolgreiche Speicherprüfung fest, ein dritter lässt einen Backup-Test offen. Erkenntnisse kann dies als Entscheidung, Ergebnis und offene Aufgabe bündeln. Quellverweise helfen, jede Aussage zu prüfen.',
    start_find_page:'Seite finden (Strg+K)', start_find_page_title:'Seite finden', start_search_label:'Seitenname', start_search_placeholder:'Chat, Abläufe, Erkenntnisse …', start_pages:'Seiten', start_matches:'{count} passende Seiten', start_no_matches:'Keine passenden Seiten', start_current_page:'Aktuelle Seite',
  },
};

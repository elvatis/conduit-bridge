const icon = (path: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const bulb = icon('<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>');
const refresh = icon('<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>');
const stop = icon('<rect x="6" y="6" width="12" height="12" rx="2"/>');
export const INSIGHTS_NAV_HTML = `<button type="button" data-section="insights" title="Insights" data-i18n-title="ins_nav">${bulb}<span class="nav-label" data-i18n="ins_nav">Insights</span></button>`;
export const INSIGHTS_HTML = `<section id="insights-section" class="wide page-section" aria-labelledby="ins-heading">
  <header class="ins-heading"><div><h2 id="ins-heading" data-i18n="ins_heading">What your conversations reveal</h2><p class="muted" data-i18n="ins_intro">Selected original statements from your saved conversations, grouped by BitNet.</p></div><div class="ins-actions"><button type="button" id="ins-refresh" class="primary">${refresh}<span class="action-label" data-i18n="ins_refresh">Build insights</span></button><button type="button" id="ins-cancel" hidden title="Cancel analysis" aria-label="Cancel analysis" data-i18n-title="ins_cancel" data-i18n-aria="ins_cancel">${stop}</button></div></header>
  <div class="ins-status-panel"><span class="ins-local">${bulb}<span data-i18n="ins_local">Local BitNet</span></span><p id="ins-coverage" class="muted"></p><p id="ins-status" role="status"></p><progress id="ins-progress" max="100" value="0" hidden aria-label="Analysis progress" data-i18n-aria="ins_progress"></progress><p id="ins-stale" hidden data-i18n="ins_stale">Conversations changed. Refresh to include the current history.</p><p id="ins-error" role="alert" hidden></p></div>
  <div id="ins-empty" class="ins-empty"><h3 data-i18n="ins_empty_title">Keep the useful parts.</h3><p data-i18n="ins_empty">Start an analysis to gather insights across your own saved chats. Long conversations are processed in small sections.</p><button type="button" data-help-topic="insights" data-i18n="ins_example_link">How it works, with an example</button></div>
  <div id="ins-results" class="ins-grid" hidden>${(['finding', 'decision', 'lesson', 'action'] as const).map(kind => `<section class="ins-card" aria-labelledby="ins-${kind}-heading"><h3 id="ins-${kind}-heading" data-i18n="ins_${kind}">${kind}</h3><ul id="ins-${kind}" class="ins-items"></ul></section>`).join('')}</div>
  <p class="ins-note muted" data-i18n="ins_note">BitNet selects original statements. Its selection and categories can be wrong. Check the linked messages before acting. Only complete messages are included; nothing is executed or added to memory automatically.</p>
</section>`;

export const INSIGHTS_STYLE = String.raw`
  .ins-heading { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:1rem 2rem; margin-bottom:1.5rem; }
  .ins-heading h2 { margin:0 0 .75rem; } .ins-heading p { margin:0; }
  .ins-actions { display:flex; align-items:center; gap:.75rem; }
  .ins-status-panel { padding:1.25rem 1.5rem; border:1px solid var(--line); border-radius:18px; background:var(--panel); margin-bottom:1.5rem; }
  .ins-status-panel p { margin:.65rem 0 0; } .ins-local { display:inline-flex; align-items:center; gap:.5rem; font-weight:600; }
  #ins-progress { width:100%; height:.5rem; margin-top:1rem; accent-color:var(--copper); }
  #ins-error { color:var(--bad); } #ins-stale { color:var(--warn); }
  .ins-empty { padding:clamp(1.5rem,5vw,4rem); text-align:center; border:1px dashed var(--line-2); border-radius:20px; }
  .ins-empty p { max-width:58ch; margin:1rem auto 1.5rem; color:var(--body); }
  .ins-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1.5rem; }
  .ins-card { margin:0; padding:1.5rem; border:1px solid var(--line); border-radius:20px; background:var(--panel); }
  .ins-card h3 { margin:0 0 1.25rem; } .ins-items { margin:0; padding:0; list-style:none; }
  .ins-items > li { padding:1rem 0; border-top:1px solid var(--line); overflow-wrap:anywhere; } .ins-items > li:first-child { padding-top:0; border:0; }
  .ins-items p { margin:0; } .ins-items details { margin-top:.75rem; } .ins-items summary { color:var(--blue-soft); cursor:pointer; width:fit-content; padding:.35rem 0; }
  .ins-sources { list-style:none; padding:0; margin:.5rem 0 0; display:grid; gap:.5rem; }
  .ins-sources button { justify-content:flex-start; text-align:left; width:100%; white-space:normal; padding:.5rem .75rem; background:var(--panel-2); }
  .ins-sources blockquote { margin:.5rem .25rem .75rem; padding:.5rem .75rem; border-left:2px solid var(--blue); color:var(--body); font-size:.875rem; white-space:pre-wrap; }
  .ins-note { font-size:.875rem; line-height:1.6; margin:1.5rem 0; max-width:90ch; }
  #insights-section [hidden] { display:none !important; }
  @container workspace (max-width:52rem) { .ins-grid { grid-template-columns:minmax(0,1fr); } }
`;

export const INSIGHTS_SCRIPT = String.raw`
  let insightsData = null, insightsOperator = null, insightsEpoch = 0, insightsLoading = null, insightsKey = '', insightsActionError = '';
  function insightsReset() { ++insightsEpoch; insightsData = null; insightsOperator = null; insightsLoading = null; insightsKey = ''; insightsActionError = ''; $('ins-results').hidden = true; $('ins-empty').hidden = false; }
  function insightsRender() {
    const data = insightsData || {}, job = data.job || {}, report = data.report, running = job.status === 'running';
    const canOperate = ['admin','operator'].includes(insightsOperator?.role);
    $('ins-refresh').disabled = Boolean(data.busy) || !canOperate;
    $('ins-cancel').hidden = !running; $('ins-cancel').disabled = !canOperate;
    setLocalizedText($('ins-refresh'), () => t(['cancelled','interrupted','error'].includes(job.status) && job.completed ? 'ins_resume' : report ? 'ins_update' : 'ins_refresh'));
    setLocalizedText($('ins-coverage'), () => t('ins_available',{sessions:data.availableSessions || 0,messages:data.availableMessages || 0,excluded:data.excludedMessages || 0}));
    setLocalizedText($('ins-status'), () => running ? job.phase === 'merging' ? t('ins_merging') : t('ins_reading',{done:job.completed || 0,total:job.total || 0}) : report ? t('ins_generated',{sessions:report.sessions,messages:report.messages,date:new Date(report.generatedAt).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-US'),language:report.language.toUpperCase()}) : canOperate ? t('ins_state_' + (job.status || 'idle')) : t('ins_view_only'));
    $('ins-progress').hidden = !running; $('ins-progress').value = job.total ? Math.min(95,Math.round(job.completed / job.total * 95)) : 0;
    $('ins-stale').hidden = !data.stale;
    const errorKey = job.errorCode && !['cancelled'].includes(job.errorCode) ? 'ins_error_' + job.errorCode : '';
    $('ins-error').hidden = !insightsActionError && !errorKey;
    setLocalizedText($('ins-error'), () => insightsActionError ? t(insightsActionError) : (errorKey ? t(errorKey) : ''));
    $('ins-empty').hidden = Boolean(report) || running; $('ins-results').hidden = !report;
    const key = JSON.stringify(report || null); if (key === insightsKey) return; insightsKey = key;
    for (const kind of ['finding','decision','lesson','action']) setLocalizedHtml($('ins-' + kind), () => {
      const items = (report?.items || []).filter(item => item.kind === kind);
      return items.length ? items.map(item => '<li><p>' + esc(item.text) + '</p><details><summary>' + esc(t('ins_sources',{count:item.sources.length})) + '</summary><ul class="ins-sources">' + item.sources.map((source,index) => '<li><button type="button" data-ins-item="' + esc(item.id) + '" data-ins-source="' + index + '">' + esc((source.title || t('ui_untitled_conversation')) + (source.messageNumber ? ' · ' + t('ins_message',{number:source.messageNumber}) : '')) + '</button>' + (source.quote && source.quote !== item.text ? '<blockquote>' + esc(source.quote) + '</blockquote>' : '') + '</li>').join('') + '</ul></details></li>').join('') : '<li class="muted">' + esc(t('ins_no_evidence')) + '</li>';
    });
  }
  async function loadInsights() {
    if (insightsLoading) return insightsLoading;
    const epoch = insightsEpoch;
    const pending = (async () => {
      try {
        const [identity,data] = await Promise.all([pfApi('/me'),pfApi('/insights')]);
        if (epoch !== insightsEpoch) return;
        if (data.ownerId !== identity.operator?.operatorId) throw new Error('Insight identity changed');
        insightsOperator = identity.operator; insightsData = data; insightsRender();
      } catch (error) {
        if (epoch !== insightsEpoch) return;
        insightsData = null; insightsOperator = null; insightsRender();
        $('ins-error').hidden = false; setLocalizedText($('ins-error'), () => t('ins_load_failed'));
      }
    })();
    insightsLoading = pending;
    try { await pending; } finally { if (insightsLoading === pending) insightsLoading = null; }
  }
  $('ins-refresh').addEventListener('click',async () => {
    $('ins-refresh').disabled = true; insightsActionError = '';
    try { await pfApi('/insights/refresh',{language:currentLang}); }
    catch (error) { insightsActionError = 'ins_start_failed'; }
    await insightsLoading; await loadInsights();
  });
  $('ins-cancel').addEventListener('click',async () => {
    $('ins-cancel').disabled = true;
    try { await pfApi('/insights/cancel',{}); insightsActionError = ''; }
    catch (error) { insightsActionError = 'ins_cancel_failed'; }
    await insightsLoading; await loadInsights();
  });
  $('ins-results').addEventListener('click',async event => {
    const button = event.target.closest('[data-ins-item]'); if (!button) return;
    const item = insightsData?.report?.items.find(item => item.id === button.dataset.insItem), source = item?.sources[Number(button.dataset.insSource)];
    if (!source) return;
    try { showSection('platform'); pfTab('chat'); await pfOpenSession(source.sessionId); const message = $('pf-message-' + source.messageId); if (message) { message.tabIndex = -1; message.focus(); message.scrollIntoView({block:'center'}); } }
    catch (error) { pfStatus(() => t('ins_source_missing'),true); }
  });
  setInterval(() => { if (activeSection === 'insights' && !document.hidden && insightsData?.job?.status === 'running') loadInsights(); },2500);
`;

export const INSIGHTS_COPY = {
  en: {
    ins_nav:'Insights', ins_heading:'What your conversations reveal', ins_intro:'Selected original statements from your saved conversations, grouped by BitNet.', ins_refresh:'Build insights', ins_update:'Refresh insights', ins_resume:'Continue analysis', ins_cancel:'Cancel analysis', ins_progress:'Analysis progress', ins_local:'Local BitNet',
    ins_available:'{sessions} own chats · {messages} complete messages · {excluded} unfinished or empty messages excluded', ins_generated:'Based on {sessions} chats and {messages} messages · {date} · Original wording', ins_stale:'Conversations changed. Refresh to include the current history.',
    ins_empty_title:'Keep the useful parts.', ins_empty:'Start an analysis to gather insights across your own saved chats. Long conversations are processed in small sections.', ins_example_link:'How it works, with an example', ins_note:'BitNet selects original statements. Its selection and categories can be wrong. Check the linked messages before acting. Only complete messages are included; nothing is executed or added to memory automatically.',
    ins_finding:'Results', ins_decision:'Decisions', ins_lesson:'Lessons', ins_action:'Tasks and requests', ins_message:'Message {number}', ins_sources:'Sources ({count})', ins_no_evidence:'No statements selected in this category.', ins_reading:'Reading sections: {done} of {total}', ins_merging:'Combining the results…', ins_view_only:'This account can read insights. An operator can start an analysis.',
    ins_state_idle:'Ready when you are.', ins_state_cancelled:'Analysis stopped. Continue to reuse the completed sections.', ins_state_interrupted:'The previous run was interrupted. Continue from the saved progress.', ins_state_error:'The analysis could not finish.', ins_state_complete:'Analysis complete.',
    ins_error_time_limit:'The time limit was reached. Continue to process the remaining sections.', ins_error_sources_changed:'Source messages changed during analysis. Start again with the current history.', ins_error_analysis_failed:'Local analysis failed. Check BitNet availability and retry; completed sections are retained.', ins_load_failed:'Insights could not be loaded. Try refreshing.', ins_start_failed:'Analysis could not be started. Check availability and your permissions.', ins_cancel_failed:'Analysis could not be stopped. Try again.', ins_source_missing:'The source message is no longer available.',
  },
  de: {
    ins_nav:'Erkenntnisse', ins_heading:'Was aus Ihren Gesprächen bleibt', ins_intro:'Ausgewählte Originalaussagen aus gespeicherten Gesprächen, von BitNet geordnet.', ins_refresh:'Erkenntnisse bündeln', ins_update:'Erkenntnisse aktualisieren', ins_resume:'Auswertung fortsetzen', ins_cancel:'Auswertung abbrechen', ins_progress:'Fortschritt der Auswertung', ins_local:'Lokales BitNet',
    ins_available:'{sessions} eigene Chats · {messages} vollständige Nachrichten · {excluded} unvollständige oder leere Nachrichten ausgelassen', ins_generated:'Aus {sessions} Chats und {messages} Nachrichten · {date} · Originalwortlaut', ins_stale:'Gespräche wurden geändert. Aktualisieren Sie die Auswertung für den aktuellen Verlauf.',
    ins_empty_title:'Das Nützliche festhalten.', ins_empty:'Bündeln Sie Erkenntnisse aus Ihren eigenen gespeicherten Chats. Lange Gespräche werden in kleinen Abschnitten verarbeitet.', ins_example_link:'So funktioniert es, mit Beispiel', ins_note:'BitNet wählt Originalaussagen aus. Auswahl und Kategorien können Fehler enthalten. Prüfen Sie vor dem Handeln die verknüpften Nachrichten. Nur vollständige Nachrichten fließen ein; es werden keine Aufgaben ausgeführt oder Erinnerungen automatisch übernommen.',
    ins_finding:'Ergebnisse', ins_decision:'Entscheidungen', ins_lesson:'Erkenntnisse', ins_action:'Aufgaben und Anfragen', ins_message:'Nachricht {number}', ins_sources:'Quellen ({count})', ins_no_evidence:'Keine Aussagen in dieser Kategorie ausgewählt.', ins_reading:'Abschnitte lesen: {done} von {total}', ins_merging:'Ergebnisse zusammenführen …', ins_view_only:'Dieses Konto kann Erkenntnisse lesen. Ein Operator kann die Auswertung starten.',
    ins_state_idle:'Bereit für die Auswertung.', ins_state_cancelled:'Auswertung gestoppt. Beim Fortsetzen werden fertige Abschnitte wiederverwendet.', ins_state_interrupted:'Der vorige Lauf wurde unterbrochen. Setzen Sie ihn am gespeicherten Stand fort.', ins_state_error:'Die Auswertung konnte nicht abgeschlossen werden.', ins_state_complete:'Auswertung abgeschlossen.',
    ins_error_time_limit:'Das Zeitlimit wurde erreicht. Setzen Sie die Auswertung der übrigen Abschnitte fort.', ins_error_sources_changed:'Quellnachrichten wurden während der Auswertung geändert. Starten Sie mit dem aktuellen Verlauf erneut.', ins_error_analysis_failed:'Lokale Auswertung fehlgeschlagen. Prüfen Sie BitNet und versuchen Sie es erneut; fertige Abschnitte bleiben erhalten.', ins_load_failed:'Erkenntnisse konnten nicht geladen werden. Versuchen Sie es erneut.', ins_start_failed:'Die Auswertung konnte nicht starten. Prüfen Sie Verfügbarkeit und Berechtigungen.', ins_cancel_failed:'Die Auswertung konnte nicht gestoppt werden. Versuchen Sie es erneut.', ins_source_missing:'Die Quellnachricht ist nicht mehr verfügbar.',
  },
};

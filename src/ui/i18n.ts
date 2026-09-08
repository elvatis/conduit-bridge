import { PIPELINE_COPY_DE, PIPELINE_ORIGINALS } from './pipeline-copy.js';

/** Browser-side localization shared by the dashboard and its standalone help page. */
export const I18N_SCRIPT = String.raw`
  let currentLang = 'de';
  try { currentLang = localStorage.getItem('conduit_lang') === 'en' ? 'en' : 'de'; } catch {}
  function t(key, values) {
    const text = window.__CB_TRANSLATIONS?.[currentLang]?.[key] ?? key;
    return values ? text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match) : text;
  }
  const displayTranslationKeys = {
    connected: 'status_connected', disconnected: 'status_disconnected',
    running: 'status_running', completed: 'status_completed', failed: 'status_failed',
    waiting_approval: 'status_waiting_approval', approved: 'status_approved', rejected: 'status_rejected',
    queued: 'status_queued', cancelled: 'status_cancelled', interrupted: 'status_interrupted',
    exhausted: 'status_exhausted', recorded: 'status_recorded', pending: 'status_pending',
    candidate: 'status_candidate', unknown: 'status_unknown', skipped: 'status_skipped',
    available: 'status_available', missing: 'status_missing', ready: 'status_ready', unavailable: 'status_unavailable',
    enabled: 'status_enabled', disabled: 'status_disabled', configured: 'status_configured',
    verified: 'availability_verified', documented: 'availability_documented', dynamic: 'availability_dynamic',
    chat: 'mode_chat', plan: 'mode_plan', agent: 'mode_agent',
    info: 'level_info', success: 'level_success', warning: 'level_warning', error: 'level_error',
    low: 'risk_low', medium: 'risk_medium', high: 'risk_high', critical: 'risk_critical',
    user: 'scope_user', workspace: 'scope_workspace', provider: 'scope_provider', profile: 'scope_profile',
    ephemeral: 'retention_ephemeral', retained: 'retention_retained', manual: 'source_manual', system: 'ui_system',
    'read only': 'class_read_only', 'read-only': 'ui_read_only', 'workspace modify': 'class_workspace_modify',
    'system modify': 'class_system_modify', 'network access': 'class_network_access', 'external service': 'class_external_service',
    'file operations': 'category_file_operations', 'shell / terminal': 'category_shell', 'web access': 'category_web',
    'mcp tools': 'category_mcp', 'workspace editing': 'category_workspace', 'notebook operations': 'category_notebook',
    'custom provider tools': 'category_provider', general: 'category_general',
    analyst: 'role_analyst', reviewer: 'role_reviewer', synthesizer: 'role_synthesizer',
    admin: 'role_admin', operator: 'lbl_operator', viewer: 'role_viewer',
    none: 'effort_none', minimal: 'effort_minimal', xhigh: 'effort_xhigh', max: 'effort_max',
    vault: 'source_vault', env: 'source_env', environment: 'source_env', ultra: 'effort_ultra', ultracode: 'effort_ultracode',
    'bridge config': 'source_bridge_config', 'not detected': 'status_not_detected',
    'cli not installed': 'status_cli_not_installed',
  };
  function effortLabel(value) { return value ? t('effort_' + value) : t('ex_effort_default'); }
  const pipelineCopyDe = ${JSON.stringify(PIPELINE_COPY_DE)};
  const pipelineOriginals = ${JSON.stringify(PIPELINE_ORIGINALS)};
  function pipelineText(pipe, field = 'name', step) {
    const original = pipelineOriginals[pipe?.id];
    const known = pipe?.isBuiltIn || original && pipe.name === original.name && pipe.description === original.description;
    const copy = currentLang === 'de' && known ? pipelineCopyDe[pipe.id] : null;
    if (step) {
      const id = step.id || step.stepId, value = step.name || step.stepName;
      return copy && original?.steps[id] === value ? copy.steps[id] || value : value;
    }
    return copy?.[field] || pipe?.[field] || '';
  }
  function pfOperatorName(operator) { return operator.operatorId === 'local-admin' && operator.displayName === 'Local administrator' ? t('ui_local_administrator') : operator.displayName || operator.operatorId; }
  function localizedValue(value) {
    const text = String(value ?? '');
    const key = displayTranslationKeys[text.toLowerCase()];
    return key ? t(key) : text;
  }
  function localizedError(render) {
    const error = new Error(render());
    Object.defineProperty(error, 'message', { configurable: true, get: render });
    return error;
  }

  // Keep references to the text nodes created by each renderer. A language change
  // updates only those nodes and accessible labels, preserving controls, listeners,
  // selection, focus, drafts, scroll positions, and independently streamed content.
  const localizedBindings = new Map();
  const editedLocalizedValues = new WeakSet();
  document.addEventListener('input', event => {
    if (event.target.matches?.('[data-i18n-value]')) editedLocalizedValues.add(event.target);
  });
  const localizedAttributes = ['title', 'placeholder', 'aria-label', 'label'];
  function localizationNodes(root) {
    const result = [];
    const visit = node => {
      if (node.nodeType === 3) result.push({ node, value: node.nodeValue });
      if (node.nodeType === 1) for (const name of localizedAttributes) {
        if (node.hasAttribute(name)) result.push({ node, name, value: node.getAttribute(name) });
      }
      for (const child of node.childNodes || []) visit(child);
    };
    for (const child of root.childNodes || []) visit(child);
    return result;
  }
  function setLocalizedHtml(element, render) {
    element.removeAttribute?.('data-i18n');
    element.innerHTML = render();
    localizedBindings.set(element, { render, nodes: localizationNodes(element), html: true });
  }
  function appendLocalizedHtml(element, render) {
    const template = document.createElement('template');
    template.innerHTML = render();
    const nodes = localizationNodes(template.content);
    const anchor = document.createComment('localized content');
    element.appendChild(anchor);
    element.appendChild(template.content);
    localizedBindings.set(anchor, { render, nodes, html: true });
  }
  function setLocalizedText(element, render) {
    // Action labels live beside their SVG, including transient busy-state labels.
    const target = element.tagName === 'BUTTON' ? element.querySelector('.action-label') || element : element;
    target.removeAttribute?.('data-i18n');
    const value = String(render());
    target.textContent = value;
    localizedBindings.set(target, { render, value, html: false });
  }
  function setLocalizedValue(element, render) {
    element.removeAttribute?.('data-i18n-value');
    const value = String(render());
    element.value = value;
    localizedBindings.set(element, { render, value, html: false, property: 'value' });
  }
  function refreshLocalizedBindings() {
    for (const [element, binding] of localizedBindings) {
      if (!element.isConnected) { localizedBindings.delete(element); continue; }
      if (!binding.html) {
        const value = String(binding.render());
        const property = binding.property || 'textContent';
        if (element[property] === binding.value && value !== binding.value) element[property] = value;
        binding.value = value;
        continue;
      }
      const template = document.createElement('template');
      template.innerHTML = binding.render();
      const next = localizationNodes(template.content);
      // A background render owns structural changes; localization never rebuilds a form.
      if (next.length !== binding.nodes.length) continue;
      binding.nodes.forEach((previous, index) => {
        const fresh = next[index];
        if (!previous.node.isConnected || previous.name !== fresh.name) return;
        const value = previous.name ? previous.node.getAttribute(previous.name) : previous.node.nodeValue;
        if (value === previous.value && fresh.value !== previous.value) {
          if (previous.name) previous.node.setAttribute(previous.name, fresh.value);
          else previous.node.nodeValue = fresh.value;
        }
        previous.value = fresh.value;
      });
    }
  }
  function applyLang(lang) {
    currentLang = lang === 'en' ? 'en' : 'de';
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll('[data-i18n-value]').forEach(element => {
      const previous = element.dataset.i18nCurrentValue ?? element.defaultValue;
      const value = t(element.dataset.i18nValue);
      if (!editedLocalizedValues.has(element) && element.value === previous) element.value = value;
      element.dataset.i18nCurrentValue = value;
    });
    for (const [attribute, property] of [['data-i18n-ph', 'placeholder'], ['data-i18n-title', 'title'], ['data-i18n-aria', 'aria-label']]) {
      document.querySelectorAll('[' + attribute + ']').forEach(element => element.setAttribute(property, t(element.getAttribute(attribute))));
    }
    refreshLocalizedBindings();
    if (typeof syncEffortControls === 'function') syncEffortControls();
    window.gitWorkspace?.setLanguage(currentLang);
    if (typeof updateSettingTooltipLanguage === 'function') updateSettingTooltipLanguage();
    try { localStorage.setItem('conduit_lang', currentLang); } catch {}
    const label = document.getElementById('lang-label');
    if (label) label.textContent = currentLang === 'de' ? 'EN' : 'DE';
  }
  window.applyLang = applyLang;
  window.t = t;
  function initializeLanguage() {
    document.getElementById('lang-toggle')?.addEventListener('click', () => applyLang(currentLang === 'de' ? 'en' : 'de'));
    applyLang(currentLang);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeLanguage, { once: true });
  else initializeLanguage();
`;

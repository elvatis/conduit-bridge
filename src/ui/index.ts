import { DYNAMIC_SETTING_TOOLTIPS, SETTING_TOOLTIP_IDS, TOOLTIP_REGISTRY, getSettingTooltip, type SettingTooltipKey } from './tooltips.js';

/** A small server-rendered component contract for the existing vanilla HTML interface. */
export interface UiComponent<Props> {
  readonly name: string;
  render(props: Readonly<Props>): string;
}

/** Properties needed to render a uniquely described setting-help indicator. */
export interface SettingHelpProps {
  readonly setting: SettingTooltipKey;
  readonly descriptionId: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

/** Render help without adding a labelable button that would steal the input's implicit label. */
export const settingHelpComponent: UiComponent<SettingHelpProps> = {
  name: 'SettingHelp',
  render({ setting, descriptionId }) {
    const tooltip = getSettingTooltip(setting);
    if (!tooltip) throw new Error(`Unknown setting tooltip: ${setting}`);
    if (!/^[A-Za-z][\w:.-]*$/.test(descriptionId)) throw new Error('A safe, unique tooltip description ID is required');
    return `<span class="setting-help-wrap" data-setting-help="${escapeHtml(setting)}"><span class="setting-help-icon" tabindex="0" role="img" aria-label="Help: ${escapeHtml(tooltip.label)}" aria-describedby="${descriptionId}" title="${escapeHtml(tooltip.help)}">?</span><span class="setting-help-bubble" id="${descriptionId}" role="tooltip">${escapeHtml(tooltip.help)}</span></span>`;
  },
};

/** Add registry-backed help to known static controls while leaving scripts and control values untouched. */
export function decorateSettingTooltips(html: string): string {
  const script = html.search(/<script\b/i);
  const markup = script < 0 ? html : html.slice(0, script);
  const suffix = script < 0 ? '' : html.slice(script);
  return markup.replace(/<label\b([^>]*)>([\s\S]*?)<\/label>/g, (whole, attributes: string, content: string) => {
    if (content.includes('data-setting-help=')) return whole;
    const control = /<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/.exec(content);
    if (!control) return whole;
    const setting = SETTING_TOOLTIP_IDS[control[1]];
    if (!setting) return whole;
    const tooltip = getSettingTooltip(setting)!;
    const descriptionId = `setting-help-${control[1]}`;
    let opening = control[0];
    const description = /\baria-describedby="([^"]*)"/.exec(opening);
    opening = description
      ? opening.replace(description[0], `aria-describedby="${description[1]} ${descriptionId}"`)
      : opening.replace(/>$/, ` aria-describedby="${descriptionId}">`);
    if (!/\btitle=/.test(opening)) opening = opening.replace(/>$/, ` title="${escapeHtml(tooltip.help)}">`);
    opening = opening.replace(/>$/, ` data-setting-tooltip-key="${setting}">`);
    const caption = `<span class="setting-caption">${content.slice(0, control.index)}${settingHelpComponent.render({ setting, descriptionId })}</span>`;
    return `<label${attributes}>${caption}${opening}${content.slice(control.index + control[0].length)}</label>`;
  }) + suffix;
}

/** Hover and keyboard-focus presentation that fits within each setting's own label width. */
export const SETTING_TOOLTIP_STYLE = String.raw`
  .setting-caption { display: flex; align-items: center; gap: 7px; position: relative; width: 100%; }
  .setting-help-wrap { display: inline-flex; flex-shrink: 0; font-weight: 400; }
  .setting-help-icon { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border: 1px solid var(--line-2); border-radius: 50%; color: var(--blue-soft); font: 600 12px/1 system-ui,sans-serif; cursor: help; }
  .setting-help-icon:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  .setting-help-bubble { position: absolute; z-index: 60; left: 0; top: calc(100% + 5px); width: min(340px,100%); min-width: 0; padding: 10px 12px; color: var(--text); background: #152940; border: 1px solid var(--line-2); border-radius: 7px; box-shadow: 0 5px 18px rgba(0,0,0,.3); font: 12px/1.5 system-ui,sans-serif; white-space: normal; overflow-wrap: anywhere; visibility: hidden; opacity: 0; pointer-events: none; }
  .setting-help-wrap:hover .setting-help-bubble, .setting-help-wrap:focus-within .setting-help-bubble { visibility: visible; opacity: 1; pointer-events: auto; }
  .setting-help-wrap[data-dismissed="true"] .setting-help-bubble { visibility: hidden; opacity: 0; pointer-events: none; }
`;

/** Enhance controls created by policy and pipeline renderers without replacing their forms or event handlers. */
export const SETTING_TOOLTIP_SCRIPT = `
  const settingTooltipRegistry = ${JSON.stringify(TOOLTIP_REGISTRY).replace(/</g, '\\u003c')};
  const dynamicSettingTooltips = ${JSON.stringify(DYNAMIC_SETTING_TOOLTIPS)};
  let settingTooltipSequence = 0;
  function attachDynamicSettingHelp(control, key) {
    const help = settingTooltipRegistry[key]; if (!help) return;
    const previousId = control.getAttribute('data-setting-tooltip-description');
    if (previousId && document.getElementById(previousId)) return;
    const label = control.closest('label');
    const picker = control.closest('.tool-picker-container');
    let caption = label?.querySelector('.setting-caption') || label?.querySelector('span') || picker?.querySelector('.tool-picker-top > span');
    if (!caption && label) { caption = document.createElement('span'); label.appendChild(caption); }
    if (!caption) { caption = document.createElement('span'); control.insertAdjacentElement('beforebegin', caption); }
    caption.classList.add('setting-caption');
    const descriptionId = 'setting-help-dynamic-' + (++settingTooltipSequence);
    const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    caption.insertAdjacentHTML('beforeend', '<span class="setting-help-wrap" data-setting-help="' + escape(key) + '"><span class="setting-help-icon" tabindex="0" role="img" aria-label="Help: ' + escape(help.label) + '" aria-describedby="' + descriptionId + '" title="' + escape(help.help) + '">?</span><span class="setting-help-bubble" id="' + descriptionId + '" role="tooltip">' + escape(help.help) + '</span></span>');
    control.setAttribute('data-setting-tooltip-description', descriptionId);
    control.setAttribute('data-setting-tooltip-key', key);
    control.setAttribute('title', help.help);
    const existing = (control.getAttribute('aria-describedby') || '').split(/\\s+/).filter(id => id && id !== previousId);
    control.setAttribute('aria-describedby', [...existing, descriptionId].join(' '));
  }
  function installDynamicSettingTooltips(root = document) {
    for (const binding of dynamicSettingTooltips) {
      if (root.matches?.(binding.selector)) attachDynamicSettingHelp(root, binding.key);
      root.querySelectorAll(binding.selector).forEach(control => attachDynamicSettingHelp(control, binding.key));
    }
  }
  installDynamicSettingTooltips();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1 && !node.closest?.('[data-setting-help]')) installDynamicSettingTooltips(node);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { const help = event.target.closest?.('[data-setting-help]'); if (help) help.dataset.dismissed = 'true'; } });
  document.addEventListener('focusout', event => { const help = event.target.closest?.('[data-setting-help]'); if (help) delete help.dataset.dismissed; });
  document.addEventListener('pointerout', event => { const help = event.target.closest?.('[data-setting-help]'); if (help && !help.contains(event.relatedTarget)) delete help.dataset.dismissed; });
  document.addEventListener('click', event => { const icon = event.target.closest?.('.setting-help-icon'); if (icon) { event.preventDefault(); icon.focus(); } });
`;

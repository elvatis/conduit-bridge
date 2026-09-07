import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { TOOLTIP_REGISTRY, SETTING_TOOLTIP_IDS, DYNAMIC_SETTING_TOOLTIPS, getSettingTooltip } from '../src/ui/tooltips.js';
import { decorateSettingTooltips, settingHelpComponent, SETTING_TOOLTIP_SCRIPT } from '../src/ui/index.js';
import { DASHBOARD_HTML } from '../src/dashboard.js';

describe('setting tooltip registry and components', () => {
  it('keeps all registered help concise and all bindings valid', () => {
    for (const [key, value] of Object.entries(TOOLTIP_REGISTRY)) {
      expect(value.help.length, key).toBeLessThanOrEqual(120);
      expect(value.help.length, key).toBeGreaterThan(10);
    }
    for (const key of [...Object.values(SETTING_TOOLTIP_IDS), ...DYNAMIC_SETTING_TOOLTIPS.map(binding => binding.key)]) expect(getSettingTooltip(key)).toBeDefined();
    expect(getSettingTooltip('toString')).toBeUndefined();
  });

  it('decorates every mapped static setting without touching scripts or form values', () => {
    const markup = DASHBOARD_HTML.split('<script>')[0];
    for (const [id, key] of Object.entries(SETTING_TOOLTIP_IDS)) {
      expect(markup, id).toContain(`id="${id}"`);
      expect(markup, id).toContain(`id="setting-help-${id}"`);
      expect(markup, id).toContain(`data-setting-tooltip-key="${key}"`);
    }
    const source = '<label><span>Cost</span><input id="cfg-daily-budget" value="42" aria-describedby="existing"></label><script>const label = "<label>untouched</label>";</script>';
    const rendered = decorateSettingTooltips(source);
    expect(rendered).toContain('value="42"');
    expect(rendered).toContain('aria-describedby="existing setting-help-cfg-daily-budget"');
    expect(rendered).toContain('<script>const label = "<label>untouched</label>";</script>');
    expect(decorateSettingTooltips(rendered)).toBe(rendered);
  });

  it('exposes focusable described help without stealing an implicit input label', () => {
    const html = settingHelpComponent.render({ setting: 'session.retention', descriptionId: 'help-retention' });
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-describedby="help-retention"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('title="Conversations are always saved');
    expect(html).not.toContain('<button');
  });

  it('adds unique help to dynamic controls once while preserving values and existing descriptions', () => {
    const ids = new Set<string>();
    const caption = { html: '', classList: { add() {} }, insertAdjacentHTML(_position: string, html: string) { this.html += html; for (const match of html.matchAll(/id="([^"]+)"/g)) ids.add(match[1]); } };
    const label = { querySelector: () => caption };
    const attributes = new Map([['aria-describedby', 'existing']]);
    const control = { value: 'agent', closest: (selector: string) => selector === 'label' ? label : null, getAttribute: (name: string) => attributes.get(name), setAttribute: (name: string, value: string) => attributes.set(name, value) };
    const events = new Map<string, (event: any) => void>();
    const context = createContext({ document: { querySelectorAll: () => [], getElementById: (id: string) => ids.has(id) ? {} : null, addEventListener: (type: string, handler: (event: any) => void) => events.set(type, handler) }, control });
    runInContext(SETTING_TOOLTIP_SCRIPT, context);
    runInContext(`attachDynamicSettingHelp(control, 'agentPolicy.defaultMode'); attachDynamicSettingHelp(control, 'agentPolicy.defaultMode')`, context);
    expect(control.value).toBe('agent');
    expect(ids.size).toBe(1);
    expect(attributes.get('aria-describedby')).toBe('existing setting-help-dynamic-1');
    expect(attributes.get('title')).toBe(TOOLTIP_REGISTRY['agentPolicy.defaultMode'].help);
    const help = { dataset: {} as Record<string, string> };
    events.get('keydown')!({ key: 'Escape', target: { closest: () => help } });
    expect(help.dataset.dismissed).toBe('true');
    events.get('focusout')!({ target: { closest: () => help } });
    expect(help.dataset.dismissed).toBeUndefined();
  });
});

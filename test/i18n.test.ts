import { describe, expect, it } from 'vitest';
import { createContext, runInContext, Script } from 'node:vm';
import { TRANSLATIONS } from '../src/i18n.js';
import { DASHBOARD_HTML, HELP_HTML } from '../src/dashboard.js';
import { I18N_SCRIPT } from '../src/ui/i18n.js';
import { TOOLTIP_REGISTRY } from '../src/ui/tooltips.js';
import { readFileSync } from 'node:fs';
import { PRESET_PIPELINES } from '../src/pipelines.js';
import { buildCodingPipelines } from '../src/platform-presets.js';
import { KNOWN_TOOLS } from '../src/cli-mode.js';
import { PIPELINE_COPY_DE } from '../src/ui/pipeline-copy.js';
import { TOOL_COPY_DE } from '../src/ui/tool-copy.js';
import { EFFORT_LEVELS } from '../src/effort.js';

function languageHarness(storedLanguage?: string) {
  const stored = new Map<string,string>(storedLanguage ? [['conduit_lang',storedLanguage]] : []);
  const ready: Array<() => void> = [];
  const elements = new Map<string,any>();
  function element(id: string, attributes: Record<string,string> = {}) {
    const node: any = {
      id, attributes, dataset: {}, textContent: '', value: '', isConnected: true,
      tagName: 'SPAN', listeners: new Map<string,() => void>(), childNodes: [],
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
      removeAttribute: (name: string) => { delete attributes[name]; },
      hasAttribute: (name: string) => name in attributes,
      addEventListener: (name: string, callback: () => void) => node.listeners.set(name, callback),
      querySelector: () => null,
    };
    for (const [key,value] of Object.entries(attributes)) if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_,letter) => letter.toUpperCase())] = value;
    elements.set(id,node); return node;
  }
  element('lang-label'); element('lang-toggle');
  const document = {
    documentElement: { lang: '' }, readyState: 'loading',
    getElementById: (id: string) => elements.get(id),
    querySelectorAll: (selector: string) => [...elements.values()].filter(node => node.hasAttribute(selector.slice(1,-1))),
    addEventListener: (name: string, callback: () => void) => { if (name === 'DOMContentLoaded') ready.push(callback); },
  };
  const context = createContext({ document, window: { __CB_TRANSLATIONS: TRANSLATIONS }, localStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string,value: string) => stored.set(key,value) } });
  new Script(I18N_SCRIPT).runInContext(context);
  return { context, stored, document, elements, element, initialize: () => ready.forEach(callback => callback()), run: (source: string) => runInContext(source,context) };
}

describe('interface localization', () => {
  it('covers all shipped pipeline steps and tool descriptions without changing executable definitions', () => {
    const coding = buildCodingPipelines({ planner:'model',implementer:'model',reviewer:'model',security:'model' });
    for (const preset of [...PRESET_PIPELINES,...coding]) {
      const copy = PIPELINE_COPY_DE[preset.id];
      expect(copy?.name,preset.id).toBeTruthy(); expect(copy?.description,preset.id).toBeTruthy();
      for (const step of preset.steps) expect(copy?.steps[step.id],preset.id + '/' + step.id).toBeTruthy();
    }
    for (const tool of KNOWN_TOOLS) {
      expect(TOOL_COPY_DE[tool.name]?.[0],tool.name).toBeTruthy();
      expect(TOOL_COPY_DE[tool.name]?.[1],tool.name).toBeTruthy();
    }
  });

  it('localizes effort levels for display while retaining the provider wire values', () => {
    const ui = languageHarness(); ui.initialize();
    const values = ['', ...EFFORT_LEVELS];
    expect(values.map(value => ui.run('effortLabel(' + JSON.stringify(value) + ')'))).toEqual(['Standard','Keine','Minimal','Niedrig','Mittel','Hoch','Sehr hoch','Maximum','Höchster Aufwand','Maximum (Ultracode)']);
    ui.run('applyLang("en")');
    expect(ui.run('effortLabel("high")')).toBe('High');
  });
  it('keeps browser source and translations valid UTF-8 on Windows', () => {
    for (const file of ['src/i18n.ts', 'src/platform-ui.ts']) expect(() => new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))).not.toThrow();
    expect(TRANSLATIONS.de.ui_vault_description).toContain('Gespräche');
    expect(TRANSLATIONS.de.tip_session_retention || TRANSLATIONS.de['tip_session.retention']).not.toContain('Temporäre Texte');
  });
  it('has matching nonempty catalogs, interpolation parameters, and help for every setting', () => {
    expect(Object.keys(TRANSLATIONS.de).sort()).toEqual(Object.keys(TRANSLATIONS.en).sort());
    for (const key of Object.keys(TRANSLATIONS.en)) {
      expect(TRANSLATIONS.de[key].trim(),key).not.toBe('');
      const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      expect(parameters(TRANSLATIONS.de[key]),key).toEqual(parameters(TRANSLATIONS.en[key]));
    }
    for (const key of Object.keys(TOOLTIP_REGISTRY)) {
      expect(TRANSLATIONS.en['tip_' + key],key).toBeTruthy();
      expect(TRANSLATIONS.de['tip_label_' + key],key).toMatch(/^Hilfe: /);
    }
  });

  it('resolves every static translation attribute and every literal browser key', () => {
    for (const html of [DASHBOARD_HTML,HELP_HTML]) {
      for (const match of html.matchAll(/data-i18n(?:-ph|-title|-aria)?="([^"]+)"/g)) expect(TRANSLATIONS.en[match[1]],match[1]).toBeDefined();
      for (const match of html.matchAll(/\bt\('([^']+)'\)/g)) expect(TRANSLATIONS.en[match[1]],match[1]).toBeDefined();
      expect(html).not.toMatch(/data-i18n="[^"]+"\s+data-i18n=/);
    }
  });

  it('defaults to German, translates accessible labels, and persists the other-language toggle', () => {
    const ui = languageHarness();
    const heading = ui.element('heading', {'data-i18n':'h_models'});
    const input = ui.element('prompt', {'data-i18n-ph':'ph_initial_prompt','data-i18n-title':'tip_prompt','data-i18n-aria':'lbl_prompt'});
    input.value = 'Keep this draft unchanged';
    ui.initialize();
    expect(ui.document.documentElement.lang).toBe('de');
    expect(heading.textContent).toBe('Modelle');
    expect(input.attributes.placeholder).toBe(TRANSLATIONS.de.ph_initial_prompt);
    expect(input.attributes.title).toBe(TRANSLATIONS.de.tip_prompt);
    expect(input.attributes['aria-label']).toBe(TRANSLATIONS.de.lbl_prompt);
    expect(ui.elements.get('lang-label').textContent).toBe('EN');
    ui.elements.get('lang-toggle').listeners.get('click')();
    expect(ui.stored.get('conduit_lang')).toBe('en');
    expect(heading.textContent).toBe('Models');
    expect(ui.elements.get('lang-label').textContent).toBe('DE');
    expect(input.value).toBe('Keep this draft unchanged');
    const reload = languageHarness(ui.stored.get('conduit_lang')); reload.initialize();
    expect(reload.document.documentElement.lang).toBe('en');
  });

  it('validates persisted and requested languages and falls back to the key for missing text', () => {
    const ui = languageHarness('fr'); ui.initialize();
    expect(ui.document.documentElement.lang).toBe('de');
    ui.run('applyLang("__proto__")');
    expect(ui.stored.get('conduit_lang')).toBe('de');
    expect(ui.run('t("untranslated_key")')).toBe('untranslated_key');
  });

  it('relabels busy actions without replacing their SVG or overriding newer status text', () => {
    const ui = languageHarness('en'); ui.initialize();
    const button = ui.element('action'); button.tagName = 'BUTTON';
    const label = ui.element('action-label', {'data-i18n':'btn_execute_pipeline'});
    const icon = { tagName: 'svg' }; button.childNodes = [icon,label];
    button.querySelector = () => label;
    ui.context.button = button;
    ui.run(`setLocalizedText(button, () => t('status_executing')); applyLang('de')`);
    expect(label.textContent).toBe('Wird ausgeführt …');
    expect(button.childNodes[0]).toBe(icon);
    ui.run(`setLocalizedText(button, () => t('btn_execute_pipeline')); applyLang('en')`);
    expect(label.textContent).toBe('Execute Pipeline');
    label.textContent = 'A newer provider error';
    ui.run(`applyLang('de')`);
    expect(label.textContent).toBe('A newer provider error');
  });

  it('does not reinstate initial loading or empty-state copy over runtime data', () => {
    const ui = languageHarness('en'); ui.initialize();
    const runtime = ui.element('runtime', {'data-i18n':'ui_loading'});
    const output = ui.element('output', {'data-i18n':'ui_no_test'});
    ui.context.runtime = runtime; ui.context.output = output;
    ui.run(`setLocalizedText(runtime, () => '127.0.0.1:31338'); setLocalizedText(output, () => 'Actual model response'); applyLang('de')`);
    expect(runtime.textContent).toBe('127.0.0.1:31338');
    expect(output.textContent).toBe('Actual model response');
  });

  it('keeps all primary and danger actions visible with leading SVG icons', () => {
    const markup = DASHBOARD_HTML.slice(0,DASHBOARD_HTML.indexOf('<script>'));
    for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      if (!/class="[^"]*\b(?:primary|danger)\b/.test(match[1])) continue;
      expect(match[2].trimStart(),match[1]).toMatch(/^<svg width="18" height="18"/);
      expect(match[2],match[1]).toContain('class="action-label"');
    }
    const groups = [...markup.matchAll(/class="nav-group-label"[^>]*data-nav-group="([^"]+)"/g)].map(match => match[1]);
    expect(groups).toEqual(['core','providers','agent_ops','analytics','system']);
    expect(markup.indexOf('data-section="local-providers"')).toBeLessThan(markup.indexOf('data-section="agent-controls"'));
  });
});

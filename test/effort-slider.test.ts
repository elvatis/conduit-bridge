import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { EFFORT_SCRIPT, effortControl } from '../src/ui/effort-slider.js';
import { I18N_SCRIPT } from '../src/ui/i18n.js';
import { TRANSLATIONS } from '../src/i18n.js';

// Exercise the shipped control logic against fields and native input events.
// Browser QA covers top-layer positioning, keyboard focus and track rendering.
function slider() {
  const handlers = new Map<string, (event: any) => void>();
  const nodes = new Map<string, any>();
  const node = (selector: string): any => {
    if (!nodes.has(selector)) nodes.set(selector, { value:'', textContent:'', disabled:false, dataset:{}, attributes:{} as Record<string,string>,
      setAttribute(key: string, value: string) { this.attributes[key] = value; },
      getAttribute(key: string) { return this.attributes[key]; },
      style: { setProperty() {} }, dispatchEvent(event: any) { handlers.get(event.type)?.({target:this}); },
      matches: () => selector === '.effort-value', closest: () => control,
    });
    return nodes.get(selector);
  };
  const model: any = { value:'cli-claude/test', selectedOptions:[{value:'cli-claude/test',textContent:'Claude · CLI'}] };
  const control: any = { dataset:{effortModel:'#model',effortProvider:'',effortFallback:''},
    querySelector:node, querySelectorAll:() => [], closest:() => null, matches:() => true,
  };
  const provider: any = {value:'cli-gemini'};
  const document = {body:{},readyState:'loading', querySelectorAll:() => [control], querySelector:(selector: string) => selector === '#provider' ? provider : model,
    addEventListener:(type: string, fn: any) => handlers.set(type,fn),
  };
  const context = createContext({document,window:{__CB_TRANSLATIONS:TRANSLATIONS,addEventListener() {}},localStorage:{getItem:()=> 'en'},MutationObserver:class {observe() {}},queueMicrotask() {},
    Event:class { constructor(readonly type: string) {} },
    providerForModel:(id: string) => id.split('/')[0],
  });
  runInContext(I18N_SCRIPT + EFFORT_SCRIPT,context);
  const sync = () => runInContext('syncEffortControls()',context);
  const input = (index: number) => {
    const range = node('[type="range"]'); range.value = String(index);
    handlers.get('input')!({target:{closest:() => range}});
  };
  return {node,model,control,provider,sync,input,change:(target: any) => handlers.get('change')!({target})};
}

describe('shared effort popover', () => {
  it('keeps provider wire values independent of indices and resets incompatible levels', () => {
    const ui = slider(); ui.sync(); ui.input(3);
    expect(ui.node('.effort-value').value).toBe('high');
    expect(ui.node('output').textContent).toBe('High');
    expect(ui.node('[type="range"]').attributes['aria-valuetext']).toBe('High');
    ui.model.value = 'cli-codex/test'; ui.sync();
    expect(ui.node('[type="range"]').value).toBe('5');
    expect(ui.node('.effort-value').value).toBe('high');
    ui.input(7); expect(ui.node('.effort-value').value).toBe('max');
    ui.model.value = 'cli-gemini/test'; ui.sync();
    expect(ui.node('.effort-value').value).toBe('');
    expect(ui.node('[type="range"]').max).toBe('3');
    expect(ui.node('.effort-trigger-value').textContent).toBe('Default');
  });

  it('uses the supported intersection for comparisons and explicit profile provider', () => {
    const ui = slider(); ui.model.multiple = true;
    ui.model.selectedOptions = [{value:'cli-codex/a'},{value:'cli-gemini/b'}]; ui.sync();
    expect([...ui.control._effortValues]).toEqual(['','low','medium','high']);
    ui.input(2); expect(ui.node('.effort-value').value).toBe('medium');
    ui.control.dataset.effortProvider = '#provider'; ui.provider.value = 'cli-claude'; ui.sync();
    expect(ui.node('[type="range"]').max).toBe('6');
    expect(ui.node('.effort-value').value).toBe('medium');
    ui.node('.effort-value').disabled = true; ui.sync();
    expect(ui.node('.effort-trigger').disabled).toBe(true);
  });

  it('toggles speed independently and disables it when the next model cannot support it', () => {
    const ui = slider(); ui.model.value = 'cli-claude/claude-opus-5'; ui.sync(); ui.input(3);
    const toggle = ui.node('.effort-fast-toggle'); toggle.checked = true; toggle.matches = (selector: string) => selector === '.effort-fast-toggle';
    ui.change(toggle);
    expect(ui.node('.effort-fast-value').value).toBe('true');
    expect(ui.node('.effort-value').value).toBe('high');
    expect(ui.node('.effort-trigger-fast').hidden).toBe(false);
    ui.model.value = 'cli-gemini/gemini-3.8-flash'; ui.sync();
    expect(toggle.checked).toBe(false); expect(toggle.disabled).toBe(true);
    expect(ui.node('.effort-fast-value').value).toBe('false');
    expect(ui.node('.effort-value').value).toBe('high');
  });

  it('escapes dynamic IDs, model selectors and stored effort in generated markup', () => {
    const html = effortControl('step-"<script>', '[data-model="x"]', '"><img src=x>');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img');
    expect(html).toContain('popover="auto"'); expect(html).toContain('type="range"');
    expect(html).toContain('&quot;&gt;&lt;img');
  });
});

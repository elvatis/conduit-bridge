import { describe, expect, it } from 'vitest';
import { createContext, runInContext, Script } from 'node:vm';
import { PLATFORM_SCRIPT } from '../src/platform-ui.js';
import { TRANSLATIONS } from '../src/i18n.js';
import { I18N_SCRIPT } from '../src/ui/i18n.js';

type Option = { value: string; textContent: string; selected: boolean };
class Element {
  id: string;
  options: Option[] = [];
  textContent = '';
  disabled = false;
  hidden = false;
  style = {};
  dataset: Record<string, string> = {};
  listeners = new Map<string, (...args: any[]) => unknown>();
  private html = '';
  private inputValue = '';
  classList = { toggle() {} };
  constructor(id: string) { this.id = id; }
  set innerHTML(value: string) {
    this.html = value;
    this.options = Array.from(value.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g), match => ({ value: match[1], textContent: match[3], selected: match[2].includes('selected') }));
  }
  get innerHTML() { return this.html; }
  get selectedOptions() { return this.options.filter(option => option.selected); }
  get value() { return this.options.length ? this.selectedOptions[0]?.value || this.options[0]?.value || '' : this.inputValue; }
  set value(value: string) { this.inputValue = value; for (const option of this.options) option.selected = option.value === value; }
  addEventListener(event: string, handler: (...args: any[]) => unknown) { this.listeners.set(event, handler); }
  appendChild(option: Option) { this.options.push(option); }
  setAttribute() {}
  focus() {}
}

function workspace(lang = 'en') {
  const elements = new Map<string, Element>();
  const element = (id: string) => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id)!; };
  const calls: Array<{ path: string; options: any; body: any }> = [];
  const fixtures = new Map<string, any>();
  const context = createContext({
    $: element,
    esc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!),
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => ({ value: '', textContent: '', selected: false }), addEventListener() {}, readyState: 'loading', documentElement: { lang }, hidden: false },
    window: { __CB_TRANSLATIONS: TRANSLATIONS }, localStorage: { getItem: () => lang, setItem() {} },
    request: async (path: string, options: any) => { calls.push({ path, options, body: options?.body ? JSON.parse(options.body) : undefined }); return structuredClone(fixtures.get(path) ?? { data: [] }); },
    models: [{ id: 'cli-codex/first' }, { id: 'cli-gemini/second' }], cachedWorkspaces: [], activeSection: 'platform',
    setInterval() {}, withAuth: (headers: unknown) => headers,
    TextDecoder, Uint8Array, AbortController, console,
  });
  new Script(I18N_SCRIPT).runInContext(context);
  // This contract harness models HTML as a string; native DOM identity is covered
  // by the localization/browser checks rather than this platform API fixture.
  runInContext('appendLocalizedHtml = (element, render) => { element.innerHTML += render(); }',context);
  new Script(PLATFORM_SCRIPT).runInContext(context);
  return { element, calls, fixtures, context, run: (source: string) => runInContext(source, context) };
}

describe('platform workspace browser behavior', () => {
  it('shows readable chat model labels while preserving provider routing IDs', () => {
    const ui = workspace();
    ui.run(`pfState.models = [{id:'api-openrouter/openai/gpt-6-astra'},{id:'cli-codex/gpt-5.6-sol'}]; platformSyncModels()`);
    expect(ui.element('pf-chat-model').options.map(option => option.value)).toEqual(['api-openrouter/openai/gpt-6-astra','cli-codex/gpt-5.6-sol']);
    expect(ui.element('pf-chat-model').options[0].textContent).toBe('GPT-6 Astra · OpenRouter');
    expect(ui.element('pf-chat-model').options[1].textContent).toBe('GPT-5.6 Sol · Codex');
  });

  it('changes the next model without replacing the transcript and submits explicit versioned context', () => {
    const ui = workspace();
    ui.run(`pfState.session = {id:'s', messages:[{id:'m',role:'user',content:'Existing conversation'}]}; pfRenderTranscript();`);
    ui.element('pf-chat-model').value = 'cli-codex/first';
    ui.element('pf-chat-context').value = '8192'; ui.element('pf-chat-output').value = '256';
    ui.element('pf-chat-skills').options = [{ value: 'skill-review@3', textContent: 'Review v3', selected: true }];
    ui.element('pf-chat-memories').options = [{ value: 'memory-1', textContent: 'A preference', selected: true }];
    const initial = ui.run(`pfChatBody('Continue')`);
    ui.element('pf-chat-model').value = 'cli-gemini/second';
    const changed = ui.run(`pfChatBody('Continue')`);
    expect(initial.model).toBe('cli-codex/first');
    expect(changed).toMatchObject({ model: 'cli-gemini/second', skillRefs: [{ id: 'skill-review', version: 3 }], memoryIds: ['memory-1'], contextTokens: 8192, maxOutputTokens: 256, stream: true });
    expect(ui.element('pf-transcript').innerHTML).toContain('Existing conversation');
    expect(ui.run(`pfState.session.id`)).toBe('s');
  });

  it('preserves separate composer drafts while switching server conversations', async () => {
    const ui = workspace();
    ui.run(`pfState.session = {id:'one',title:'First',messages:[]}`);
    ui.element('pf-chat-input').value = 'An unfinished first message';
    ui.fixtures.set('/v1/platform/sessions/two', { session: { id: 'two', title: 'Second', retention: 'ephemeral', messages: [] } });
    await ui.run(`pfOpenSession('two')`);
    expect(ui.element('pf-chat-input').value).toBe('');
    ui.element('pf-chat-input').value = 'An unfinished second message';
    ui.fixtures.set('/v1/platform/sessions/one', { session: { id: 'one', title: 'First', retention: 'retained', messages: [] } });
    await ui.run(`pfOpenSession('one')`);
    expect(ui.element('pf-chat-input').value).toBe('An unfinished first message');
    expect(ui.run(`pfState.drafts.get('two')`)).toBe('An unfinished second message');
    expect(ui.element('pf-chat-retention').value).toBe('retained');
  });

  it('parses fragmented UTF-8 SSE data and CRLF frames without dropping deltas', async () => {
    const ui = workspace();
    const bytes = new TextEncoder().encode('data: {"type":"delta","delta":"Grüße"}\r\n\r\ndata: {"type":"done"}\r\n\r\n');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    ui.context.stream = { body: stream };
    await ui.run(`globalThis.events = []; pfReadEventStream(stream, event => events.push(event))`);
    expect(ui.run(`events.map(event => event.type)`)).toEqual(['delta', 'done']);
    expect(ui.run(`events[0].delta`)).toBe('Grüße');
  });

  it('keeps selected historical skill versions when the catalog gets a newer version', () => {
    const ui = workspace();
    ui.element('pf-chat-skills').options = [{ value: 'review@1', textContent: 'Review · v1', selected: true }];
    ui.run(`pfState.skills = [{id:'review',name:'Review',version:2}]; pfRenderSkillOptions()`);
    expect(ui.run(`pfRefs('pf-chat-skills')`)).toEqual([{ id: 'review', version: 1 }]);
    expect(ui.element('pf-chat-skills').options.map(option => option.value)).toEqual(['review@2', 'review@1']);
  });

  it('requires an explicit non-user memory scope and saves new content for review', async () => {
    const ui = workspace();
    ui.run(`pfState.tab = 'memory'`);
    ui.element('pf-memory-title').value = 'Repository convention'; ui.element('pf-memory-content').value = 'Use short examples.';
    ui.element('pf-memory-scope').value = 'workspace';
    await expect(ui.run('pfSaveMemory()')).rejects.toThrow('Enter a scope identifier');
    expect(ui.calls).toHaveLength(0);
    ui.element('pf-memory-scope-id').value = 'ws-example';
    ui.fixtures.set('/v1/platform/memories', { memory: { id: 'memory-new', title: 'Repository convention', content: 'Use short examples.', scope: 'workspace', scopeId: 'ws-example', status: 'candidate', revision: 1 } });
    await ui.run('pfSaveMemory()');
    expect(ui.calls[0].body).toMatchObject({ scope: 'workspace', scopeId: 'ws-example', status: 'candidate', provenance: { sourceType: 'manual' } });
    expect(ui.element('pf-memory-review').hidden).toBe(false);
  });

  it('publishes a new immutable skill version with an optimistic version check', async () => {
    const ui = workspace();
    ui.run(`pfState.tab = 'library'; pfState.library = 'skills'; pfState.entry = {id:'review',version:4}`);
    ui.element('pf-entry-name').value = 'Review'; ui.element('pf-entry-description').value = 'A careful review'; ui.element('pf-entry-body').value = 'State evidence first.';
    ui.element('pf-entry-modes').options = [{ value: 'chat', textContent: 'Chat', selected: true }];
    ui.fixtures.set('/v1/platform/skills', { skill: { id: 'review', name: 'Review', body: 'State evidence first.', version: 5, modes: ['chat'] } });
    await ui.run('pfSaveEntry()');
    expect(ui.calls[0]).toMatchObject({ path: '/v1/platform/skills', body: { id: 'review', expectedVersion: 4, body: 'State evidence first.', modes: ['chat'] } });
  });

  it('omits empty profile keys so saving settings cannot accidentally clear a credential', async () => {
    const ui = workspace();
    ui.run(`pfState.tab = 'system'; pfEditProfile({id:'profile-a',name:'Work',provider:'cli-codex',hasCredential:true})`);
    ui.fixtures.set('/v1/platform/profiles', { profile: { id: 'profile-a', name: 'Work', provider: 'cli-codex', hasCredential: true } });
    await ui.run('pfSaveProfile()');
    expect(ui.calls[0].body).toMatchObject({ id: 'profile-a', name: 'Work', provider: 'cli-codex' });
    expect(ui.calls[0].body).not.toHaveProperty('apiKey');
    expect(ui.element('pf-profile-credential-status').textContent).toContain('cannot be displayed');
  });

  it('loads scoped models and workspaces without requesting legacy endpoints or admin profiles', async () => {
    const ui = workspace();
    ui.fixtures.set('/v1/platform/me', { operator: { operatorId: 'reviewer', role: 'reviewer', source: 'operator-token', workspaceIds: ['ws-one'] } });
    ui.fixtures.set('/v1/platform/models', { data: [{ id: 'cli-codex/scoped' }] });
    ui.fixtures.set('/v1/platform/workspaces', { data: [{ id: 'ws-one', name: 'Allowed workspace' }] });
    await ui.run('platformRefresh()');
    expect(ui.calls.every(call => call.path.startsWith('/v1/platform/'))).toBe(true);
    expect(ui.calls.some(call => call.path === '/v1/platform/profiles')).toBe(false);
    expect(ui.element('pf-chat-model').options.map(option => option.value)).toEqual(['cli-codex/scoped']);
    expect(ui.element('pf-chat-workspace').options.map(option => option.value)).toEqual(['', 'ws-one']);
    expect(ui.element('pf-chat-send').disabled).toBe(true);
    expect(ui.element('pf-tab-system').hidden).toBe(true);
  });

  it('saves a changed retention preference before sending conversation content', async () => {
    const ui = workspace();
    ui.run(`pfState.session = {id:'retention-test',title:'Sensitive discussion',retention:'retained',revision:1,messages:[]}`);
    ui.element('pf-chat-title').value = 'Sensitive discussion';
    ui.element('pf-chat-retention').value = 'ephemeral';
    ui.element('pf-chat-model').value = 'cli-codex/first';
    ui.element('pf-chat-input').value = 'Keep this only for the current service session.';
    ui.element('pf-chat-context').value = '8192'; ui.element('pf-chat-output').value = '256';
    ui.fixtures.set('/v1/platform/sessions/retention-test', { session: { id: 'retention-test', title: 'Sensitive discussion', retention: 'ephemeral', revision: 2, messages: [] } });
    let sent: any;
    ui.context.fetch = async (_path: string, options: any) => {
      expect(ui.calls[0]).toMatchObject({ path: '/v1/platform/sessions/retention-test', options: { method: 'PATCH' }, body: { retention: 'ephemeral', expectedRevision: 1 } });
      sent = JSON.parse(options.body);
      return new Response('data: {"type":"delta","delta":"Understood."}\n\ndata: {"type":"done"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    };
    await ui.run('pfSendChat()');
    expect(sent).toMatchObject({ content: 'Keep this only for the current service session.', expectedRevision: 2 });
  });

  it('discloses omitted conversation context using the server token inspection', () => {
    const ui = workspace();
    ui.run(`pfRenderContextInspection({context:{estimatedInputTokens:500,maxOutputTokens:100,contextTokens:1000,selectedMessageIds:['m3','m4'],omittedMessageIds:['m1','m2'],selectedMemoryIds:['memory'],summaryUsed:true}})`);
    const text = ui.element('pf-context-inspection').innerHTML;
    expect(text).toContain('500 estimated input tokens');
    expect(text).toContain('2 prior messages included');
    expect(text).toContain('2 older messages omitted');
    expect(text).toContain('reviewed conversation summary is included');
  });

  it('retrieves an exact historical skill version when restoring a pinned attachment', async () => {
    const ui = workspace();
    ui.fixtures.set('/v1/platform/skills/review?version=2', { skill: { id: 'review', name: 'Review', version: 2 } });
    await ui.run(`pfHydrateSkillOptions('pf-chat-skills', ['review@2'])`);
    expect(ui.calls[0].path).toBe('/v1/platform/skills/review?version=2');
    expect(ui.run(`pfRefs('pf-chat-skills')`)).toEqual([{ id: 'review', version: 2 }]);
  });

  it('loads coding presets and installs the chosen role models without replacing catalog drafts', async () => {
    const ui = workspace();
    ui.run(`pfState.operator = {role:'admin',source:'bridge-token'}`);
    ui.element('pf-preset-model').value = 'cli-codex/first';
    ui.element('pf-preset-security').value = 'cli-gemini/second';
    ui.element('pf-entry-body').value = 'Unfinished agent instructions';
    ui.fixtures.set('/v1/platform/presets?model=cli-codex%2Ffirst', { data: [{ id: 'platform-bugfix', name: 'Bugfix review', description: 'Collect regression evidence.', steps: [{ requiresApproval: true }, {}] }] });
    ui.fixtures.set('/v1/platform/presets/platform-bugfix/install', { pipeline: { id: 'platform-bugfix', name: 'Bugfix review' } });
    await ui.run('pfLoadPresets()');
    expect(ui.element('pf-presets-list').innerHTML).toContain('2 steps · 1 approval checkpoints');
    await ui.run(`pfInstallPreset('platform-bugfix')`);
    expect(ui.calls[1]).toMatchObject({ path: '/v1/platform/presets/platform-bugfix/install', body: { model: 'cli-codex/first', security: 'cli-gemini/second' } });
    expect(ui.element('pf-preset-open').hidden).toBe(false);
    expect(ui.element('pf-entry-body').value).toBe('Unfinished agent instructions');
    ui.run(`pfState.operator = {role:'viewer'}`);
    await expect(ui.run(`pfInstallPreset('platform-bugfix')`)).rejects.toThrow('administrator role');
    expect(ui.calls).toHaveLength(2);
  });

  it('uses German labels with unchanged scope, status and model values', async () => {
    const ui = workspace('de');
    ui.element('pf-chat-model').value = 'cli-codex/first';
    ui.run(`pfState.session = {id:'s',messages:[{id:'m',role:'user',content:'Save agent'}]}; pfRenderTranscript()`);
    expect(ui.element('pf-transcript').innerHTML).toContain('Save agent');
    expect(ui.element('pf-transcript').innerHTML).toContain('>Sie</strong>');
    expect(ui.element('pf-transcript').innerHTML).toContain('Kopieren');
    ui.run(`pfState.tab = 'memory'`);
    ui.element('pf-memory-title').value = 'Konvention'; ui.element('pf-memory-content').value = 'Kurze Beispiele';
    ui.element('pf-memory-scope').value = 'workspace'; ui.element('pf-memory-scope-id').value = 'ws';
    ui.fixtures.set('/v1/platform/memories', { memory: { id:'m',scope:'workspace',scopeId:'ws',status:'candidate',revision:1 } });
    await ui.run('pfSaveMemory()');
    expect(ui.calls[0].body).toMatchObject({ scope:'workspace', status:'candidate' });
    expect(ui.element('pf-status').textContent).toBe('Erinnerung gespeichert.');
  });
});

import { test, expect, type Page } from '@playwright/test';
import { installFixture, modelId, stamp, sections } from './fixture.mjs';

const select=(page:Page,id:string,value:string|string[])=>page.locator('#'+id).selectOption(value,{force:true});
const tab=(page:Page,name:string)=>select(page,'pf-view-select',name);
async function effort(page:Page,id:string,fast=false) {
  await page.locator('#'+id).locator('..').locator('.effort-trigger').click();
  await page.locator('#'+id+'-range').press('End');
  if(fast)await page.locator('#'+id+'-popover .effort-fast-toggle').check();
  await page.locator('#'+id+'-popover .effort-close').click();
  return page.locator('#'+id).inputValue();
}

test('navigation width drags, persists, cancels and supports keyboard reset',async({page})=>{
  const fixture=await installFixture(page);await fixture.open('execution');
  const handle=page.locator('#sidebar-resizer'),panel=page.locator('#sidebar'),before=(await panel.boundingBox())!.width;
  const rect=(await handle.boundingBox())!;await page.mouse.move(rect.x+5,200);await page.mouse.down();await page.mouse.move(rect.x+85,200,{steps:8});await page.mouse.up();
  await expect.poll(async()=>Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before+80));
  await page.reload();await expect.poll(async()=>Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before+80));
  await handle.focus();await handle.press('Home');await expect(handle).toHaveAttribute('aria-valuenow','240');
  await handle.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','248');
  await handle.press('Enter');await expect.poll(async()=>Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before));
  const reset=(await handle.boundingBox())!;await page.mouse.move(reset.x+5,200);await page.mouse.down();await page.mouse.move(reset.x+100,200);await page.keyboard.press('Escape');await page.mouse.up();
  await expect.poll(async()=>Math.round((await panel.boundingBox())!.width)).toBe(Math.round(before));
  await page.locator('#sidebar-collapse-btn').click();await expect(handle).toBeHidden();await page.locator('#sidebar-collapse-btn').click();await expect(handle).toBeVisible();
  await page.setViewportSize({width:390,height:720});await expect(handle).toBeHidden();await page.locator('#menu-toggle').click();await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(page.locator('#menu-toggle')).toBeFocused();
  expect(fixture.errors).toEqual([]);
});

test('navigation keyboard steps remain exact during animation and clamp to the viewport',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});const fixture=await installFixture(page);await fixture.open('execution');const handle=page.locator('#sidebar-resizer');
  await handle.focus();await handle.press('Home');await handle.press('ArrowRight');await handle.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','256');await handle.press('Shift+ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','288');
  await page.setViewportSize({width:768,height:1080});await handle.press('End');await expect(handle).toHaveAttribute('aria-valuenow','408');await expect.poll(async()=>Math.round((await page.locator('#sidebar').boundingBox())!.width)).toBe(408);
  for(const name of sections) {
    await page.evaluate(name=>(window as any).showSection(name),name);
    expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth),`${name} with maximum navigation width`).toBeLessThanOrEqual(769);
  }
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('short desktop navigation does not overlap and all links remain reachable',async({page},info)=>{
  await page.setViewportSize({width:1280,height:720});const fixture=await installFixture(page,{language:'de'});await fixture.open('execution');await page.locator('#ex-demo').click();
  const tasks=await page.locator('#ex-sidebar').boundingBox(),advanced=await page.locator('.nav-advanced').boundingBox();
  expect(advanced!.y).toBeGreaterThanOrEqual(tasks!.y+tasks!.height-1);
  await page.locator('[data-section="settings"]').scrollIntoViewIfNeeded();await page.locator('[data-section="settings"]').click();await expect(page.locator('#settings-section')).toHaveClass(/active/);
  await page.screenshot({path:info.outputPath('short-window-navigation.png')});expect(fixture.errors).toEqual([]);
});

test('navigation visibility and language preferences survive reload',async({page})=>{
  const fixture=await installFixture(page);await fixture.open();await page.locator('.nav-advanced > summary').click();await page.locator('#open-nav-custom-btn').click();
  await page.locator('[data-preset="all"]').click();await page.locator('#save-nav-btn').click();await page.reload();
  await page.locator('.nav-advanced > summary').click();await expect(page.locator('[data-section="budgets"]')).toBeVisible();
  await page.locator('#lang-toggle').click();await expect(page.locator('html')).toHaveAttribute('lang','de');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','de');
  expect(await page.evaluate(()=>localStorage.getItem('conduit_lang'))).toBe('de');expect(fixture.errors).toEqual([]);
});

test('project assignment keeps conversation messages after reopening and reload',async({page})=>{
  const fixture=await installFixture(page,{sessions:true});const projects:any[]=[];
  fixture.on('GET','/v1/platform/projects',()=>({data:projects}));
  fixture.on('POST','/v1/platform/projects',record=>{const project={id:'project-demo',name:record.body.name,userId:'demo',revision:1,createdAt:stamp,updatedAt:stamp};projects.push(project);return {project};});
  fixture.on('PATCH','/v1/platform/sessions/session-demo',record=>{expect(record.body.expectedRevision).toBe(fixture.data.session.revision);Object.assign(fixture.data.session,record.body,{revision:fixture.data.session.revision+1});return {session:fixture.data.session};});
  await fixture.open();await page.locator('#pf-new-project').click();await page.locator('#pf-project-name').fill('Workspace launch');await page.locator('#pf-project-save').click();await expect(page.locator('[data-pf-project="project-demo"]')).toBeVisible();
  await page.locator('[data-pf-session="session-demo"]').click();await select(page,'pf-chat-project','project-demo');await expect(page.locator('[data-pf-project="project-demo"] [data-pf-session="session-demo"]')).toBeVisible();
  await page.reload();await page.locator('[data-pf-project="project-demo"] > summary').click();await page.locator('[data-pf-session="session-demo"]').click();await expect(page.locator('#pf-transcript')).toContainText('Keep the execution controls clear');
  await page.locator('#pf-session-search').fill('Workspace launch');await expect(page.locator('[data-pf-session="session-demo"]')).toBeVisible();expect(fixture.data.session.workspaceId).toBe('workspace-demo');expect(fixture.data.session.messages).toHaveLength(1);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('vault settings, dirty refresh, text search and scan requests work',async({page})=>{
  const fixture=await installFixture(page);fixture.on('PATCH','/v1/platform/vault/settings',record=>{Object.assign(fixture.payloads['/v1/platform/vault'].settings,record.body);return fixture.payloads['/v1/platform/vault'];});fixture.on('POST','/v1/platform/vault/scan',()=>({queued:true}));await fixture.open();await tab(page,'vault');
  await page.locator('#pf-vault-interval').fill('120');await select(page,'pf-vault-enabled','false');await page.locator('#refresh').click();await expect(page.locator('#pf-vault-interval')).toHaveValue('120');
  await page.locator('#pf-vault-save').click();await expect.poll(()=>fixture.requests.find(r=>r.method==='PATCH')?.body).toEqual({enabled:false,intervalMinutes:120});
  await page.locator('#pf-vault-query').fill('workspace');await page.locator('#pf-vault-search-form button[type="submit"]').click();await expect(page.locator('#pf-vault-results')).toContainText('No matching');
  expect(fixture.requests.some(r=>r.path==='/v1/platform/vault/search'&&r.query.includes('query=workspace'))).toBe(true);
  await page.locator('#pf-vault-scan').click();await expect.poll(()=>fixture.requests.some(r=>r.path==='/v1/platform/vault/scan')).toBe(true);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('memory requires scope, saves a candidate and applies reviewed revisions',async({page})=>{
  const fixture=await installFixture(page);let memory:any;
  fixture.on('GET','/v1/platform/memories',()=>({data:memory?[memory]:[]}));
  fixture.on('POST','/v1/platform/memories',record=>{memory={...record.body,id:'memory-demo',revision:1,createdAt:stamp,updatedAt:stamp};return {memory};});
  fixture.on('PATCH','/v1/platform/memories/memory-demo',record=>{expect(record.body.revision).toBe(memory.revision);memory={...memory,...record.body,revision:memory.revision+1};return {memory};});
  await fixture.open();await tab(page,'memory');await page.locator('#pf-memory-title').fill('Workspace convention');await page.locator('#pf-memory-content').fill('Use one shared rhythm for controls.');await select(page,'pf-memory-scope','workspace');await page.locator('#pf-memory-save').click();expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(0);
  await page.locator('#pf-memory-scope-id').fill('workspace-demo');await page.locator('#pf-memory-save').click();await expect(page.locator('#pf-memory-review')).toBeVisible();expect(memory.status).toBe('candidate');await page.locator('#pf-memory-approve').click();await expect(page.locator('#pf-memory-review')).toBeHidden();expect(memory.status).toBe('approved');expect(memory.revision).toBe(2);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('provider profiles submit every setting and preserve existing credentials',async({page})=>{
  const fixture=await installFixture(page);let profile:any;
  fixture.on('GET','/v1/platform/profiles',()=>({data:profile?[profile]:[]}));
  fixture.on('POST','/v1/platform/profiles',record=>{profile={...record.body,id:'profile-demo',revision:(profile?.revision||0)+1,hasCredential:true};delete profile.apiKey;return {profile};});await fixture.open();await tab(page,'system');await page.locator('#pf-profile-new').click();
  await page.locator('#pf-profile-name').fill('Coding profile');await select(page,'pf-profile-provider','cli-codex');await page.locator('#pf-profile-model').fill(modelId);await page.locator('#pf-profile-executable').fill('/demo/bin/codex');await page.locator('#pf-profile-key').fill('demo-profile-credential');await page.locator('#pf-profile-concurrency').fill('3');await select(page,'pf-profile-enabled','false');const level=await effort(page,'pf-profile-effort',true);
  await page.locator('#pf-profile-form button[type="submit"]').click();await expect(page.locator('#pf-profile-key')).toHaveValue('');
  expect(fixture.requests.find(r=>r.method==='POST')!.body).toMatchObject({name:'Coding profile',provider:'cli-codex',model:modelId,cliExecutable:'/demo/bin/codex',apiKey:'demo-profile-credential',maxConcurrent:3,enabled:false,defaultEffort:level,defaultFastMode:true});
  await page.locator('#pf-profile-name').fill('Renamed profile');await page.locator('#pf-profile-form button[type="submit"]').click();await expect.poll(()=>fixture.requests.filter(r=>r.method==='POST').length).toBe(2);expect(fixture.requests.filter(r=>r.method==='POST')[1].body).not.toHaveProperty('apiKey');expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('agent library stores model, permission mode, instructions and effort',async({page})=>{
  const fixture=await installFixture(page);let agent:any;fixture.on('GET','/v1/platform/agents',()=>({data:agent?[agent]:[]}));fixture.on('POST','/v1/platform/agents',record=>{agent={...record.body,id:'agent-demo',revision:1,createdAt:stamp,updatedAt:stamp};return {agent};});await fixture.open();await tab(page,'library');await page.locator('[data-pf-library="agents"]').click();await page.locator('#pf-new-entry').click();
  await page.locator('#pf-entry-name').fill('Workspace reviewer');await page.locator('#pf-entry-description').fill('Inspect changed code.');await page.locator('#pf-entry-body').fill('Review code and provide reproducible evidence.');await select(page,'pf-entry-model',modelId);await select(page,'pf-entry-mode','plan');const level=await effort(page,'pf-entry-effort');await page.locator('#pf-library-form button[type="submit"]').click();await expect(page.locator('#pf-library-list')).toContainText('Workspace reviewer');
  expect(agent).toMatchObject({name:'Workspace reviewer',instructions:'Review code and provide reproducible evidence.',model:modelId,mode:'plan',defaultEffort:level,defaultFastMode:false});expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('orchestrator role and fallback options persist with independent effort values',async({page})=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/orchestrator',record=>{fixture.payloads['/v1/orchestrator']=record.body;return record.body;});await fixture.open('orchestrator');await select(page,'orch-enabled','true');await select(page,'orch-strategy','parallel');await select(page,'orch-fallbacks',[modelId]);const level=await effort(page,'orch-effort-0',true);await page.locator('#orch-save').click();await expect(page.locator('#orch-note')).toContainText('saved');
  const sent=fixture.requests.find(r=>r.method==='POST')!.body;expect(sent).toMatchObject({enabled:true,strategy:'parallel',fallbackModels:[modelId],fallbackFastMode:false});expect(sent.roles[0]).toMatchObject({model:modelId,effort:level,fastMode:true});expect(sent.roles[1].fastMode).toBe(false);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('provider policy changes preserve explicit permission and tool restrictions',async({page})=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/settings/agent-policy',record=>{Object.assign(fixture.payloads['/v1/settings/agent-policy'].policies['cli-codex'],record.body);return {saved:true};});fixture.payloads['/v1/tools']={data:[{name:'Bash',category:'Shell / Terminal',mutating:true,description:'Execute a bounded shell command.'}],system_tools:[]};await fixture.open('agent-controls');const form=page.locator('[data-policy-provider="cli-codex"]');await form.locator('[name="agentEnabled"]').selectOption('false',{force:true});await form.locator('[name="defaultMode"]').selectOption('chat',{force:true});await form.locator('[data-tool-name="Bash"]').click();await form.locator('button[type="submit"]').click();await expect.poll(()=>fixture.requests.find(r=>r.method==='POST')?.body).toEqual({provider:'cli-codex',agentEnabled:false,defaultMode:'chat',disallowedTools:'Bash'});expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('pipeline builder retains two steps, dependency order and approval setting',async({page},info)=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/pipelines',record=>({pipeline:{...record.body,id:'pipeline-demo'}}));await fixture.open('pipelines');await page.locator('#btn-open-create-pipeline').click();await page.locator('#pipe-name-input').fill('Review and validate');await page.locator('#pipe-desc-input').fill('Two bounded stages.');await page.locator('.step-name-inp').fill('Review');await page.locator('.step-model-inp').selectOption(modelId,{force:true});await page.locator('.step-mode-inp').selectOption('plan',{force:true});await page.locator('.step-approval-inp').check();await page.locator('#pipe-add-step-btn').click();await page.locator('.step-name-inp').nth(1).fill('Validate');await page.locator('.step-model-inp').nth(1).selectOption(modelId,{force:true});await page.screenshot({path:info.outputPath('pipeline-builder.png')});await page.locator('#save-pipeline-btn').click();await expect(page.locator('#pipeline-modal')).not.toHaveClass(/open/);
  const sent=fixture.requests.find(r=>r.method==='POST')!.body;expect(sent.steps).toHaveLength(2);expect(sent.steps[0]).toMatchObject({name:'Review',mode:'plan',requiresApproval:true,fastMode:false});expect(sent.steps[1].dependsOn).toEqual(['step-1']);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('storage setting submits a selected backend and invalid restore does not send',async({page})=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/platform/storage/config',record=>({storage:{backend:record.body.backend}}));await fixture.open();await tab(page,'system');await select(page,'pf-storage-backend','file');await page.locator('#pf-storage-config-form button[type="submit"]').click();await expect.poll(()=>fixture.requests.find(r=>r.method==='POST')?.body).toEqual({backend:'file'});
  await page.locator('#pf-storage-restore-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await page.locator('#pf-storage-restore-form button[type="submit"]').click();await expect(page.locator('#pf-status')).toHaveClass(/error/);expect(fixture.requests.filter(r=>r.path==='/v1/platform/storage/restore')).toHaveLength(0);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

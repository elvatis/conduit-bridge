import { test, expect, type Page } from '@playwright/test';
import { installFixture, sections, modelId, stamp } from './fixture.mjs';

async function select(page: Page, id: string, value: string) {
  await page.locator('#'+id).selectOption(value,{force:true});
}
async function section(page: Page, name: string) {
  await page.evaluate(name => (window as any).showSection(name),name);
}
async function inViewport(page: Page, selector: string) {
  const rect=await page.locator(selector).boundingBox(), viewport=page.viewportSize()!;
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width+1);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y+rect!.height).toBeLessThanOrEqual(viewport.height+1);
}

for (const width of [390,768,1280,1920,3840]) for (const language of ['en','de']) {
  test(`all pages and workspace tabs fit ${width}px in ${language}`, async ({page},info) => {
    await page.setViewportSize({width,height:width===3840?2160:1080});
    const fixture=await installFixture(page,{language}); await fixture.open();
    for (const name of sections) {
      await section(page,name);
      if(name==='git-workspace') await expect(page.locator('.gw-commit').first()).toBeVisible();
      if(name==='repository-analytics') await expect(page.locator('#ra-content')).toBeVisible();
      const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      expect.soft(size.scroll,`${name}: horizontal overflow`).toBeLessThanOrEqual(size.width+1);
      const misplaced=await page.locator('button').evaluateAll(buttons=>buttons.flatMap(button=>{
        const svg=button.querySelector(':scope > svg');
        if(!svg||!button.checkVisibility()||!button.getClientRects().length||!svg.getClientRects().length||button.closest('[popover]:not(:popover-open)')||(button.closest('details:not([open])')&&!button.closest('summary')))return [];
        const rect=button.getBoundingClientRect(),icon=svg.getBoundingClientRect();
        if(getComputedStyle(button).visibility==='hidden'||icon.width===0||rect.right<=0)return [];
        const label=button.innerText.trim(),dx=Math.abs(rect.x+rect.width/2-icon.x-icon.width/2),dy=Math.abs(rect.y+rect.height/2-icon.y-icon.height/2);
        return dy>1.5||(!label&&!button.matches('.select-trigger')&&dx>1.5)?[{id:button.id,label,dx,dy}]:[];
      }));
      expect.soft(misplaced,`${name}: icon alignment`).toEqual([]);
      const labels=await page.locator('.select-trigger').evaluateAll(buttons=>buttons.flatMap(button=>{
        if(!button.checkVisibility()||button.closest('details:not([open])'))return [];
        const rect=button.getBoundingClientRect();if(rect.right<=0)return [];
        const label=button.querySelector('span')!,box=label.getBoundingClientRect();
        return Math.abs(box.x+box.width/2-rect.x-rect.width/2)>.6||Math.abs(box.y+box.height/2-rect.y-rect.height/2)>.6||getComputedStyle(label).textAlign!=='center'?[label.textContent]:[];
      }));
      expect.soft(labels,`${name}: visible select text centered`).toEqual([]);
      if(name==='execution') {
        await page.locator('#ex-demo').click();
        await page.locator('.ex-run-settings > summary').click();
        const stage=await page.locator('.ex-stage').boundingBox(), composer=await page.locator('#ex-composer').boundingBox();
        expect(composer!.y, 'Composer must not cover execution evidence').toBeGreaterThanOrEqual(stage!.y+stage!.height-1);
        await page.locator('#ex-composer').scrollIntoViewIfNeeded();
        await page.screenshot({path:info.outputPath(`execution-${width}-${language}.png`)});
        for(const id of ['ex-attach','ex-send','ex-auto']) {
          const rect=await page.locator('#'+id).boundingBox(); expect(rect!.height,id).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await section(page,'platform');
    for (const tab of ['chat','vault','memory','library','runs','system']) {
      await select(page,'pf-view-select',tab);
      await expect(page.locator('#pf-pane-'+tab)).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth),tab).toBeLessThanOrEqual(width+1);
      await page.screenshot({path:info.outputPath(`${tab}-${width}-${language}.png`)});
    }
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });
}

for(const width of [390,1920]) test(`model search and effort keyboard controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); const fixture=await installFixture(page);await fixture.open('execution');
  await page.locator('#ex-model + .select-trigger').click();
  await page.locator('.select-search').fill('gpt-5.6');
  await expect(page.locator('.select-option')).toHaveCount(1);
  await page.locator('.select-search').press('Enter');
  await expect(page.locator('#ex-model')).toHaveValue(modelId);
  const trigger=page.locator('#ex-effort').locator('..').locator('.effort-trigger');
  await trigger.click(); await inViewport(page,'#ex-effort-popover');
  const range=page.locator('#ex-effort-range'); await range.focus();await range.press('End');
  const effort=await page.locator('#ex-effort').inputValue(); expect(effort.length).toBeGreaterThan(0);
  const fast=page.locator('#ex-effort-popover .effort-fast-toggle');await fast.check();
  await expect(page.locator('#ex-effort')).toHaveValue(effort);
  await expect(page.locator('#ex-effort-fast')).toHaveValue('true');
  await page.keyboard.press('Escape');await expect(trigger).toHaveAttribute('aria-expanded','false');
  await select(page,'ex-model','lmstudio/local-model');await trigger.click();
  await expect(fast).toBeDisabled();await expect(page.locator('#ex-effort-fast')).toHaveValue('false');
  await page.locator('#ex-effort-popover .effort-close').click();await expect(trigger).toBeFocused();
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('execution attachments, limits, failed queue and sample isolation',async({page})=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/platform/runs',()=>({status:503,body:{error:{message:'Queue unavailable'}}}));await fixture.open('execution');
  await page.locator('#ex-prompt').fill('Review the workspace');await select(page,'ex-model',modelId);
  await page.locator('.ex-run-settings > summary').click();await select(page,'ex-workspace','workspace-demo');
  await page.locator('#ex-iterations').fill('11');await page.locator('#ex-send').click();
  expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(0);
  await page.locator('#ex-iterations').fill('3');await page.locator('#ex-duration').fill('180');await page.locator('#ex-cost').fill('1.25');
  await page.locator('#ex-files').setInputFiles({name:'context.md',mimeType:'text/markdown',buffer:Buffer.from('Preserve the active branch.')});
  await expect(page.locator('#ex-attachments')).toContainText('context.md');
  await page.locator('#ex-files').setInputFiles({name:'unsupported.exe',mimeType:'application/octet-stream',buffer:Buffer.from('not a document')});
  await expect(page.locator('#ex-error')).toBeVisible();await expect(page.locator('#ex-attachments button')).toHaveCount(1);
  await page.locator('#ex-send').click();await expect(page.locator('#ex-error')).toHaveText('Queue unavailable');
  const sent=fixture.requests.find(r=>r.path==='/v1/platform/runs'&&r.method==='POST');
  expect(sent!.body).toMatchObject({mode:'plan',model:modelId,workspaceId:'workspace-demo',workingDirectory:'/demo/conduit-bridge',requiresApproval:true,maxIterations:3,maxDurationMs:180000,maxCostUsd:1.25,fastMode:false});
  expect(sent!.body.prompt).toContain('Preserve the active branch.');await expect(page.locator('#ex-prompt')).toHaveValue('Review the workspace');
  await page.locator('#ex-auto').click();await expect(page.locator('#ex-auto')).toHaveAttribute('aria-checked','true');
  await page.locator('#ex-demo').click();await expect(page.locator('#ex-send')).toBeDisabled();
  await page.locator('.ex-command > summary').first().click();await expect(page.locator('.ex-command-body').first()).toContainText('stdout');
  await page.locator('#ex-live-pause').click();await expect(page.locator('#ex-live-pause')).toHaveAttribute('aria-pressed','true');
  expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(1);
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('execution refresh preserves failed actions until a successful retry or new task',async({page})=>{
  const fixture=await installFixture(page);let fail=true;
  const run={id:'retry-demo',prompt:'Review the workspace',status:'queued',model:modelId,mode:'plan',createdAt:stamp,steps:[]};
  fixture.on('POST','/v1/platform/runs',()=>fail?{status:503,body:{error:{message:'Queue unavailable'}}}:{run});
  await fixture.open('execution');await page.locator('#ex-prompt').fill(run.prompt);await select(page,'ex-model',modelId);
  await page.locator('#ex-send').click();await expect(page.locator('#ex-error')).toHaveText('Queue unavailable');
  // Await the same asynchronous refresh used by the background timer.
  await page.evaluate(async()=>{await (window as any).executionRefresh();});
  await expect(page.locator('#ex-error')).toHaveText('Queue unavailable');await expect(page.locator('#ex-prompt')).toHaveValue(run.prompt);
  fail=false;await page.locator('#ex-send').click();await expect(page.locator('#ex-error')).toBeHidden();await expect(page.locator('#ex-prompt')).toHaveValue('');
  fail=true;await page.locator('#ex-prompt').fill('Another task');await page.locator('#ex-send').click();await expect(page.locator('#ex-error')).toHaveText('Queue unavailable');
  await page.locator('#ex-create-task').click();await expect(page.locator('#ex-error')).toBeHidden();
  fixture.on('GET','/v1/platform/runs',()=>({status:503,body:{error:{message:'Read unavailable'}}}));
  await page.evaluate(async()=>{await (window as any).executionRefresh();});await expect(page.locator('#ex-error')).toHaveText('Read unavailable');
  fixture.on('GET','/v1/platform/runs',()=>({data:[]}));
  await page.evaluate(async()=>{await (window as any).executionRefresh();});await expect(page.locator('#ex-error')).toBeHidden();
  expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(3);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

for(const role of ['admin','reviewer','operator','viewer']) test(`execution approval actions respect ${role} role`,async({page})=>{
  const fixture=await installFixture(page,{role});
  const run={id:'approval-demo',prompt:'Inspect the workspace',status:'waiting_approval',model:modelId,mode:'agent',createdAt:stamp,maxIterations:2,steps:[]};
  fixture.payloads['/v1/platform/runs']={data:[run]};fixture.payloads['/v1/platform/runs/approval-demo']={run};
  fixture.on('POST','/v1/platform/runs/approval-demo/actions',record=>{run.status=record.body.action==='approve'?'running':'cancelled';return {run};});
  await fixture.open('execution');await expect(page.locator('#ex-review')).toBeVisible();
  if(['admin','reviewer'].includes(role)){await page.locator('#ex-feedback').fill('Proceed with the bounded plan.');await page.locator('#ex-approve').click();await expect(page.locator('#ex-review')).toBeHidden();expect(fixture.requests.find(r=>r.method==='POST')!.body).toEqual({action:'approve',feedback:'Proceed with the bounded plan.'});}
  else {await expect(page.locator('#ex-approve')).toBeDisabled();await expect(page.locator('#ex-reject')).toBeDisabled();expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(0);}
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('all budget fields save, dirty values survive refresh, invalid input is rejected',async({page})=>{
  const fixture=await installFixture(page);fixture.on('POST','/v1/budgets',record=>{fixture.payloads['/v1/budgets'].config=record.body;return fixture.payloads['/v1/budgets'];});await fixture.open('budgets');
  for(const [id,value] of Object.entries({'cfg-daily-budget':'25','cfg-monthly-budget':'200','cfg-max-cost-run':'1.5','cfg-max-tokens-run':'150000','cfg-warn-threshold':'75'}))await page.locator('#'+id).fill(value);
  await select(page,'cfg-hard-stop','false');await page.locator('#refresh').click();await expect(page.locator('#cfg-daily-budget')).toHaveValue('25');
  await page.locator('#budget-config-form button[type="submit"]').click();
  await expect.poll(()=>fixture.requests.filter(r=>r.method==='POST').length).toBe(1);
  expect(fixture.requests.find(r=>r.method==='POST')!.body).toEqual({dailyBudgetUsd:25,monthlyBudgetUsd:200,maxCostPerRunUsd:1.5,maxTokensPerRun:150000,warningThresholdPercent:75,hardStop:false});
  await expect(page.locator('#budget-save-note')).toHaveText(/saved/i);
  await page.locator('#cfg-warn-threshold').fill('100');await page.locator('#budget-config-form button[type="submit"]').click();expect(fixture.requests.filter(r=>r.method==='POST')).toHaveLength(1);
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('API credentials clear after save and retain the draft after a failed save',async({page})=>{
  const fixture=await installFixture(page);let fail=false;fixture.on('POST','/v1/settings/api-key',()=>fail?{status:500,body:{error:{message:'Credential storage unavailable'}}}:{saved:true});await fixture.open('settings');
  const form=page.locator('[data-key-provider="claude-api"]'),input=form.locator('input');
  await input.fill('demo-value-not-a-real-credential');await form.locator('button').click();await expect(input).toHaveValue('');
  fail=true;await input.fill('retry-demo-value');await form.locator('button').click();await expect(page.locator('#notice')).toContainText('Credential storage unavailable');await expect(input).toHaveValue('retry-demo-value');await expect(form.locator('button')).toBeEnabled();
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('Git views, branches, diff and branch dialog operate through registered fixtures',async({page})=>{
  const fixture=await installFixture(page);await fixture.open('git-workspace');await expect(page.locator('.gw-file').first()).toBeVisible();
  await expect(page.locator('#gw-diff')).toContainText('controlHeight');await page.locator('#gw-branches-toggle').click();await expect(page.locator('#gw-branches')).toBeVisible();
  await page.locator('[data-gw-view="changes"]').click();await expect(page.locator('[data-gw-view="changes"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-gw-action="create-branch"]').click();await inViewport(page,'#gw-action-dialog');
  await page.locator('#gw-action-name').fill('codex/demo');await page.locator('#gw-action-cancel').click();await expect(page.locator('#gw-action-dialog')).not.toBeVisible();
  expect(fixture.requests.filter(r=>r.method!=='GET')).toHaveLength(0);expect(fixture.errors).toEqual([]);
});

test('analytics ranges, metrics, series, keyboard pinning and CSV export work',async({page})=>{
  const fixture=await installFixture(page);await fixture.open('repository-analytics');await expect(page.locator('#ra-content')).toBeVisible();
  await page.locator('[data-ra-days="7"]').click();await expect(page.locator('[data-ra-days="7"]')).toHaveAttribute('aria-pressed','true');
  await select(page,'ra-metric','total');await expect(page.locator('#ra-chart-subtitle')).toContainText('Total');
  await page.locator('[data-ra-series="tests"]').click();await expect(page.locator('[data-ra-series="tests"]')).toHaveAttribute('aria-pressed','false');
  await page.locator('#ra-chart').focus();await page.keyboard.press('ArrowLeft');await page.locator('#ra-pin').click();await expect(page.locator('#ra-pin')).toHaveAttribute('aria-pressed','true');await page.locator('#ra-unpin').click();await expect(page.locator('#ra-pin')).toHaveAttribute('aria-pressed','false');
  const download=page.waitForEvent('download');await page.locator('#ra-export').click();expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

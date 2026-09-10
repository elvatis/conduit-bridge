import {test,expect} from '@playwright/test';
import {installFixture,modelId} from './fixture.mjs';
import {PRESET_PIPELINES} from '../../src/pipelines.js';
import {buildCodingPipelines} from '../../src/platform-presets.js';
import {KNOWN_TOOLS} from '../../src/cli-mode.js';
import {PIPELINE_COPY_DE} from '../../src/ui/pipeline-copy.js';
import {TOOL_COPY_DE} from '../../src/ui/tool-copy.js';

test('German presets and tool catalog translate after loading and preserve custom content on language change',async({page})=>{
  const fixture=await installFixture(page,{language:'de'});
  const custom={...PRESET_PIPELINES[0],id:'custom-english',name:'My English workflow',description:'Keep this user description.',isBuiltIn:false};
  fixture.payloads['/v1/tools']={data:KNOWN_TOOLS,system_tools:[{name:'Git Version Control',executable:'git',category:'Version Control',available:true}]};
  const coding=buildCodingPipelines({planner:modelId,implementer:modelId,reviewer:modelId,security:modelId});
  const installed=structuredClone(coding[2]);installed.steps[0].name='Keep my changed step';
  fixture.payloads['/v1/pipelines']={data:[...PRESET_PIPELINES,custom,installed]};
  fixture.on('GET','/v1/platform/presets',()=>({data:coding}));
  await fixture.open('pipelines');
  for(const preset of PRESET_PIPELINES) {
    const card=page.locator('[data-pipe-id="'+preset.id+'"]');await expect(card).toContainText(PIPELINE_COPY_DE[preset.id].name);
    await expect(card).toContainText(PIPELINE_COPY_DE[preset.id].description);
    for(const step of preset.steps)await expect(card).toContainText(PIPELINE_COPY_DE[preset.id].steps[step.id]);
  }
  await expect(page.locator('[data-pipe-id="custom-english"]')).toContainText(custom.name);
  const installedCard=page.locator('[data-pipe-id="'+installed.id+'"]');
  await expect(installedCard).toContainText(PIPELINE_COPY_DE[installed.id].name);await expect(installedCard).toContainText('Keep my changed step');
  await expect(installedCard).toContainText(PIPELINE_COPY_DE[installed.id].steps.accuracy);
  await page.locator('#pipe-run-select').selectOption('pr-review',{force:true});
  await page.locator('#lang-toggle').click();
  await expect(page.locator('#pipe-run-select')).toHaveValue('pr-review');
  await expect(page.locator('[data-pipe-id="pr-review"]')).toContainText(PRESET_PIPELINES.find(p=>p.id==='pr-review')!.description!);
  await page.locator('#lang-toggle').click();
  await page.evaluate(()=>(window as any).showSection('agent-controls'));
  for(const tool of KNOWN_TOOLS) {
    const card=page.locator('.tool-card').filter({has:page.locator('code').filter({hasText:new RegExp('^'+tool.name+'$')})});
    await expect(card).toContainText(TOOL_COPY_DE[tool.name][0]);await expect(card).toContainText(TOOL_COPY_DE[tool.name][1]);
  }
  await expect(page.locator('#system-tools-list')).toContainText('Git-Versionsverwaltung');
  await expect(page.locator('.tool-card').filter({has:page.locator('code').filter({hasText:/^Bash$/})}).locator('.setting-badge.bad')).toContainText('Kritisch');
  await page.evaluate(()=>(window as any).showSection('platform'));await page.locator('#pf-view-select').selectOption('library',{force:true});
  await page.locator('#pf-presets-panel > summary').click();
  for(const preset of coding)await expect(page.locator('#pf-presets-list')).toContainText(PIPELINE_COPY_DE[preset.id].description);
  await page.locator('#lang-toggle').click();
  for(const preset of coding)await expect(page.locator('#pf-presets-list')).toContainText(preset.name);
  expect(fixture.requests.filter(request=>request.method!=='GET')).toEqual([]);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('new pipeline effort controls and popovers are German and language switching preserves values and focus',async({page},info)=>{
  const fixture=await installFixture(page,{language:'de'});await fixture.open('pipelines');await page.locator('#btn-open-create-pipeline').click();
  await page.locator('#pipe-name-input').fill('Keep this English draft');await page.locator('.step-model-inp').selectOption(modelId,{force:true});
  const control=page.locator('#pipeline-modal .effort-control').first(),trigger=control.locator('.effort-trigger');await expect(trigger).toContainText('Aufwand');await expect(trigger).not.toContainText('Effort');await trigger.click();
  const range=control.locator('[type="range"]');await range.press('Home');await range.press('ArrowRight');
  await expect(range).toHaveAttribute('aria-valuetext','Keine');await range.press('ArrowRight');await expect(range).toHaveAttribute('aria-valuetext','Minimal');
  await range.press('ArrowRight');await expect(range).toHaveAttribute('aria-valuetext','Niedrig');
  await range.press('ArrowRight');await expect(range).toHaveAttribute('aria-valuetext','Mittel');
  await range.press('ArrowRight');await expect(range).toHaveAttribute('aria-valuetext','Hoch');await expect(control.locator('.effort-value')).toHaveValue('high');
  await expect(control.locator('.effort-close')).toHaveAccessibleName('Schließen');
  await page.evaluate(()=>(window as any).applyLang('en'));await expect(range).toHaveAttribute('aria-valuetext','High');await expect(range).toBeFocused();await expect(control.locator('.effort-value')).toHaveValue('high');
  await page.evaluate(()=>(window as any).applyLang('de'));await expect(range).toHaveAttribute('aria-valuetext','Hoch');
  await page.screenshot({path:info.outputPath('german-effort-popover.png')});
  await range.press('Escape');await page.locator('#pipe-add-step-btn').click();await expect(page.locator('#pipeline-modal .effort-trigger').nth(1)).toContainText('Aufwand');
  await expect(page.locator('#pipe-name-input')).toHaveValue('Keep this English draft');
  await expect(page.locator('.step-model-inp').first()).toHaveValue(modelId);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('empty result boxes translate while returned text survives language changes',async({page})=>{
  const fixture=await installFixture(page,{language:'de'});fixture.on('POST','/v1/chat/completions',()=>({choices:[{message:{content:'This is model output.'}}]}));
  await fixture.open('playground');await expect(page.locator('#play-output')).toHaveText('Noch kein Test ausgeführt.');
  await expect(page.locator('#orch-output')).toHaveText('Noch keine Orchestrierung ausgeführt.');
  await page.locator('#play-prompt').fill('A fixture request');await page.locator('#play-run').click();await expect(page.locator('#play-output')).toHaveText('This is model output.');
  await page.locator('#lang-toggle').click();await expect(page.locator('#orch-output')).toHaveText('No orchestration run yet.');await expect(page.locator('#play-output')).toHaveText('This is model output.');
  await page.locator('#lang-toggle').click();await expect(page.locator('#play-output')).toHaveText('This is model output.');expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

test('German repository actions, accessible labels and chart dates switch without losing selection',async({page})=>{
  const fixture=await installFixture(page,{language:'de'});await fixture.open('git-workspace');
  for(const [action,label] of [['fetch','Abrufen'],['pull','Übernehmen'],['push','Hochladen']])await expect(page.locator('[data-gw-action="'+action+'"]')).toHaveText(label);
  await expect(page.locator('#gw-diff')).toHaveAccessibleName('Zeilenvergleich');await expect(page.locator('#gw-files')).toHaveAccessibleName('Geänderte Dateien');
  await page.evaluate(()=>(window as any).showSection('repository-analytics'));await expect(page.locator('#ra-chart-subtitle')).toContainText('08.09.2026');
  await page.locator('#ra-chart').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');
  await page.locator('#lang-toggle').click();await expect(page.locator('#ra-chart-subtitle')).toContainText('09/08/2026');
  await expect(page.locator('#ra-pin')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#gw-workspace')).toHaveValue('workspace-demo');expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
});

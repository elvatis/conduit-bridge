import {test,expect} from '@playwright/test';
import {installFixture,modelId} from './fixture.mjs';

const dialogs=[
  {name:'navigation',id:'nav-modal',title:'nav-modal-title',opener:'open-nav-custom-btn',section:'platform'},
  {name:'pipeline',id:'pipeline-modal',title:'pipeline-modal-title',opener:'btn-open-create-pipeline',section:'pipelines'},
  {name:'repository',id:'repo-modal',title:'repo-modal-title',opener:'btn-open-add-repo',section:'governance'},
  {name:'Git branch',id:'gw-action-dialog',title:'gw-action-title',opener:'[data-gw-action="create-branch"]',section:'git-workspace'},
];

for(const viewport of [{width:320,height:480,language:'de'},{width:1280,height:720,language:'en'}])for(const item of dialogs) {
  test(`${item.name} dialog fits ${viewport.width}px, traps focus and closes with Escape`,async({page},info)=>{
    await page.setViewportSize(viewport);const fixture=await installFixture(page,{language:viewport.language});await fixture.open(item.section);
    if(item.name==='navigation') {
      if(viewport.width<=760)await page.locator('#menu-toggle').click();
      await page.locator('.nav-advanced > summary').click();
    }
    const opener=page.locator(item.opener.startsWith('[')?item.opener:'#'+item.opener);
    await opener.click();const modal=page.locator('#'+item.id),title=await page.locator('#'+item.title).innerText();
    await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible();
    await expect.poll(()=>modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    await page.locator('#refresh').focus();expect(await modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    const buttons=modal.locator('button:visible');await buttons.last().focus();
    // Native dialogs may visit browser chrome; underlying page controls stay inert.
    for(const key of ['Tab','Shift+Tab','Tab']) {await page.keyboard.press(key);expect(await modal.evaluate(node=>document.activeElement===document.body||node.contains(document.activeElement))).toBe(true);}
    if(await page.evaluate(()=>document.activeElement===document.body))await page.keyboard.press('Tab');
    expect(await modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);
    const bounds=await modal.evaluate(node=>{
      const panel=node.querySelector('.modal-dialog')||node,rect=panel.getBoundingClientRect();
      return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,overflow:panel.scrollWidth-panel.clientWidth};
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(viewport.width);expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);expect(bounds.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({path:info.outputPath(`${item.id}-${viewport.width}.png`)});
    if(item.name==='pipeline') {
      await modal.locator('.step-model-inp + .select-trigger').click();await page.locator('.select-search').fill('gpt-5.6');await page.locator('.select-search').press('Enter');await expect(modal.locator('.step-model-inp')).toHaveValue(modelId);
      const trigger=modal.locator('.effort-trigger').first();await trigger.click();const popover=modal.locator('.effort-popover').first();await expect(popover).toBeVisible();await popover.locator('input[type="range"]').press('End');await page.keyboard.press('Escape');await expect(popover).not.toBeVisible();await expect(modal).toBeVisible();await expect(trigger).toBeFocused();
    }
    if(item.name==='repository') {
      await modal.locator('#repo-pipeline-select + .select-trigger').click();await expect(page.locator('.select-search')).toBeFocused();await page.keyboard.press('Escape');await expect(modal).toBeVisible();await expect(page.locator('.select-popover')).toHaveCount(0);
    }
    await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(opener).toBeFocused();
    expect(fixture.requests.filter(request=>request.method!=='GET')).toEqual([]);expect(fixture.errors).toEqual([]);expect(fixture.unexpected).toEqual([]);
  });
}

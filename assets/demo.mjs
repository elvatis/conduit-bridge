#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installFixture, modelId, stamp } from '../test/browser/fixture.mjs';

const output=resolve('assets/demo.gif'), directory=resolve('.ai/logs/demo');
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:process.env.CONDUIT_TEST_BROWSER||undefined,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'en-US',reducedMotion:'reduce'});
const frames=[];
try {
  await page.clock.setFixedTime(new Date(stamp+86400000));
  const fixture=await installFixture(page,{language:'en'});await fixture.open();await page.evaluate(()=>document.fonts.ready);
  await page.addStyleTag({content:'.demo-caption{position:fixed;z-index:10000;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:12px 20px;border:1px solid #8fd5ec35;border-radius:12px;background:#0a1729f5;box-shadow:0 8px 30px #0005;color:#f5faff;font:500 16px Inter,system-ui;white-space:nowrap;pointer-events:none}.demo-caption small{border-left:1px solid #8fd5ec35;padding-left:12px;color:#8fa0bd;font-size:12px}*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.evaluate(()=>{const caption=document.createElement('div');caption.className='demo-caption';caption.innerHTML='<span></span><small>ILLUSTRATIVE DEMO</small>';document.body.appendChild(caption);});
  async function capture(label,duration=2) {
    await page.locator('.demo-caption > span').evaluate((node,text)=>node.textContent=text,label);
    const filename=`frame-${String(frames.length).padStart(3,'0')}.png`;
    await page.screenshot({path:resolve(directory,filename)});frames.push({filename,duration,label});
  }
  async function navigate(name) {
    await page.locator(`[data-section="${name}"]`).click();await page.evaluate(()=>window.scrollTo(0,0));
  }
  await page.locator('#pf-chat-model').selectOption(modelId,{force:true});
  await capture('Your models. One local workspace.',1.8);
  const prompt='Plan a focused workspace with clear controls and an inspectable history.';
  for(let length=7;length<prompt.length;length+=7){await page.locator('#pf-chat-input').fill(prompt.slice(0,length));await capture('Keep your ideas and context together.',.12);}
  await page.locator('#pf-chat-input').fill(prompt);await capture('Keep your ideas and context together.',1.8);
  const effort=page.locator('#pf-chat-effort').locator('..');await effort.locator('.effort-trigger').click();await page.locator('#pf-chat-effort-range').press('End');await capture('Choose the effort for each task.',2.4);
  await page.locator('#pf-chat-effort-popover .effort-close').click();
  await navigate('execution');await page.locator('#ex-demo').click();await capture('Follow the agents and their execution plan.',3.0);
  await page.locator('.ex-command > summary').first().click();await page.locator('.ex-command').first().scrollIntoViewIfNeeded();await capture('Inspect commands, output and exit status.',2.8);
  await navigate('git-workspace');await page.locator('.gw-file').first().waitFor();await capture('Review history and changes side by side.',3.0);
  await navigate('repository-analytics');await page.locator('#ra-content').waitFor();await capture('Explore production and test code over time.',2.8);
  await page.locator('#ra-pin').click();await capture('Pin a snapshot to inspect the details.',2.0);
  const insightExamples = [
    ['finding','The restart check retained every saved chat.'],
    ['decision','Use SQLite for retained conversations.'],
    ['lesson','Check field width after adding help icons.'],
    ['action','Test the encrypted backup restore.'],
  ];
  fixture.data.session.messages = insightExamples.map(([,content],index) => ({id:'insight-demo-'+index,role:'assistant',content,createdAt:stamp,status:'complete'}));
  fixture.payloads['/v1/platform/sessions'] = { data: [fixture.data.session] };
  await page.evaluate(() => window.platformRefresh());
  fixture.payloads['/v1/platform/insights'] = {ownerId:'demo',availableSessions:1,availableMessages:4,excludedMessages:0,busy:false,stale:false,job:{status:'complete',phase:'merging',completed:4,total:4},report:{language:'en',generatedAt:stamp,sessions:1,messages:4,excludedMessages:0,items:insightExamples.map(([kind,text],index)=>({id:'item-'+index,kind,text,sources:[{sessionId:fixture.data.session.id,messageId:'insight-demo-'+index,title:fixture.data.session.title,quote:text}]}))}};
  await navigate('insights');await page.locator('#ins-results').waitFor();await page.locator('#ins-finding summary').click();await capture('Gather insights with original source excerpts.',3.0);
  await navigate('help');await capture('Start with an example. Keep control of the draft.',2.8);
  await navigate('platform');const handle=(await page.locator('#sidebar-resizer').boundingBox());await page.mouse.move(handle.x+5,300);await page.mouse.down();
  for(let offset=10;offset<=90;offset+=10){await page.mouse.move(handle.x+5+offset,300);await capture('Drag the navigation to make room.',.08);}
  await page.mouse.up();await capture('A workspace that fits the way you work.',2.4);
  if(fixture.errors.length||fixture.unexpected.length)throw new Error(JSON.stringify({errors:fixture.errors,unexpected:fixture.unexpected}));
  if(fixture.requests.some(request=>request.method!=='GET'))throw new Error('The demo must not submit a provider or mutation request.');
  const last=frames.at(-1);
  await writeFile(resolve(directory,'frames.ffconcat'),'ffconcat version 1.0\n'+frames.map(frame=>`file '${frame.filename}'\nduration ${frame.duration}`).join('\n')+`\nfile '${last.filename}'\n`);
  await writeFile(resolve(directory,'storyboard.json'),JSON.stringify(frames,null,2));
} finally { await browser.close(); }
execFileSync(process.env.FFMPEG_BIN||'ffmpeg',['-y','-loglevel','warning','-f','concat','-safe','0','-i','frames.ffconcat','-filter_complex','fps=10,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0',output],{cwd:directory,windowsHide:true,stdio:'inherit'});
console.log(`Recorded ${output} (${((await stat(output)).size/1024/1024).toFixed(2)} MiB), English, illustrative data only.`);

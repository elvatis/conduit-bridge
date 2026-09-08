import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

export const origin = 'http://conduit.test';
export const stamp = Date.UTC(2026, 8, 8, 12);
export const modelId = 'cli-codex/gpt-5.6-sol';
export const sections = ['execution','git-workspace','repository-analytics','platform','models','workspaces','overview','playground','api-providers','cli-providers','local-providers','agent-controls','pipelines','governance','budgets','usage','orchestrator','integration','recommendations','activity','settings','help'];

let htmlPromise;
export function dashboardHtml() {
  return htmlPromise ||= build({ entryPoints: ['src/dashboard.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).then(async result => {
    const module = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
    return module.DASHBOARD_HTML;
  });
}

export function dataFixture() {
  const models = [modelId,'cli-claude/claude-opus-5','cli-gemini/gemini-3.8-flash','lmstudio/local-model'].map(id => ({ id, provider: id.split('/')[0], owned_by: id.split('/')[0], contextWindow: 128000, maxOutputTokens: 8192 }));
  const workspace = { id: 'workspace-demo', name: 'conduit-bridge', path: '/demo/conduit-bridge', isDefault: true };
  const session = { id:'session-demo', title:'A focused developer workspace', userId:'demo', workspaceId:workspace.id, revision:1, retention:'retained', model:modelId, createdAt:stamp, updatedAt:stamp, messages:[{id:'message-demo',role:'user',content:'Keep the execution controls clear and the repository context close at hand.',createdAt:stamp,status:'complete'}] };
  const commits = ['Align workspace controls','Add repository analytics','Keep project conversations together','Create execution workspace'].map((subject,index) => ({ sha: String(4-index).repeat(40), parents:index<3?[String(3-index).repeat(40)]:[], author:'Conduit Demo', date:new Date(stamp-index*86400000).toISOString(), subject, refs:index===0?['main']:[], head:index===0, graph:{lane:0,width:1,edges:index<3?[{from:0,to:0,color:0,kind:'parent'}]:[]} }));
  const git = { detected:true,root:workspace.path,name:workspace.name,branch:'main',head:commits[0].sha,worktree:'worktree-demo',branches:[{name:'main',ref:'refs/heads/main',sha:commits[0].sha,current:true,remote:false}],worktrees:[{id:'worktree-demo',path:workspace.path,name:'conduit-bridge',branch:'main',head:commits[0].sha,detached:false,locked:false,available:true,active:true}],commits,files:[{path:'src/ui/execution.ts',status:'M',unstaged:true}],truncated:false,historyLimit:160,updatedAt:new Date(stamp).toISOString() };
  const counts = (lines,files) => ({total:lines,nonblank:Math.round(lines*.83),files});
  const snapshots = Array.from({length:16},(_,index) => ({sha:index.toString(16).padStart(40,'0'),timestamp:stamp-(15-index)*86400000,production:counts(8000+index*850,35+index),tests:counts(2500+index*390,18+index),directories:[{name:'src',production:counts(8000+index*850,35+index),tests:counts(0,0)},{name:'test',production:counts(0,0),tests:counts(2500+index*390,18+index)}],excludedFiles:5,skippedFiles:0,complete:true}));
  const analytics = {object:'conduit.repository_analytics',repository:{id:workspace.id,name:workspace.name},branch:'main',branches:['main'],branchesTruncated:false,generatedAt:stamp,status:'ready',snapshots,coverage:{source:'committed-source',firstParent:true,historyTruncated:false,sampled:false,commits:16,candidates:16,omittedSnapshots:0,oldestAt:snapshots[0].timestamp,newestAt:stamp,historyDays:180,maxCommits:1200,maxSnapshots:32,excluded:['Generated and vendor files']}};
  return {models,workspace,session,git,analytics};
}

/** Every request is fulfilled locally; unregistered writes fail instead of reaching a provider. */
export async function installFixture(page, { language = 'en', role = 'admin', sessions = false } = {}) {
  const data = dataFixture(), requests = [], errors = [], unexpected = [], handlers = new Map();
  const payloads = {
    '/v1/platform/me': {operator:{operatorId:'demo',displayName:'Demo',role,source:'bridge-token'}},
    '/v1/status': {version:'0.10.0',port:31338,uptime:120,providers:data.models.map(model=>({name:model.provider,connected:true,loginType:model.provider==='lmstudio'?'local':'cli',models:[model.id]}))},
    '/v1/models': {data:data.models}, '/v1/platform/models': {data:data.models},
    '/v1/capabilities': {effort:{}}, '/v1/metrics': {models:{}},
    '/v1/settings': {apiKeys:{'claude-api':{configured:false},'codex-api':{configured:true,source:'vault'}}},
    '/v1/settings/agent-policy': {policies:{'cli-codex':{hasAgentCapability:true,agentEnabled:true,defaultMode:'plan',supportedModes:['chat','plan','agent'],disallowedTools:''}}},
    '/v1/activity': {data:[]}, '/v1/tools': {data:[],system_tools:[]},
    '/v1/orchestrator': {enabled:false,strategy:'sequential',roles:[{name:'Analyst',model:modelId},{name:'Reviewer',model:'cli-claude/claude-opus-5'},{name:'Synthesizer',model:modelId}],fallbackModels:[]},
    '/v1/budgets': {config:{dailyBudgetUsd:10,monthlyBudgetUsd:100,maxCostPerRunUsd:.5,maxTokensPerRun:100000,warningThresholdPercent:80,hardStop:true},usage:{currentDailyCostUsd:1.5,currentMonthlyCostUsd:12}},
    '/v1/workspaces': {data:[data.workspace]}, '/v1/platform/workspaces': {data:[data.workspace]},
    '/v1/analytics/repositories': {data:[data.workspace]}, '/v1/analytics/repository':data.analytics,
    '/api/git-workspace/snapshot': data.git,
    '/api/git-workspace/diff': {mode:'history',commit:data.git.commits[0],files:[{path:'src/ui/execution.ts',status:'M'}],path:'src/ui/execution.ts',patch:'diff --git a/src/ui/execution.ts b/src/ui/execution.ts\n--- a/src/ui/execution.ts\n+++ b/src/ui/execution.ts\n@@ -1 +1,2 @@\n-export const gap = 4;\n+export const gap = 8;\n+export const controlHeight = 44;\n',additions:2,deletions:1,binary:false,truncated:false},
    '/v1/platform/sessions': {data:sessions?[data.session]:[]}, '/v1/platform/sessions/session-demo':{session:data.session},
    '/v1/platform/vault': {messages:1,settings:{enabled:true,intervalMinutes:60,status:'idle'},suggestions:[]},
    '/v1/platform/vault/search': {data:[],total:0,scannedMessages:1,engine:'text'},
    '/v1/platform/storage': {storage:{backend:'file',ready:true,encrypted:true,availableBackends:[{id:'file',available:true}]}},
    '/v1/workspaces/browse': {path:'/demo',directories:[{name:'conduit-bridge',path:data.workspace.path}]},
  };
  const html = await dashboardHtml();
  page.on('pageerror', error=>errors.push(error.message));
  await page.routeWebSocket('**/*', () => {});
  await page.addInitScript(language=>{if(!localStorage.getItem('conduit_lang'))localStorage.setItem('conduit_lang',language);},language);
  await page.route('**/*',async route=>{
    const request=route.request(), url=new URL(request.url());
    if(url.origin!==origin) { unexpected.push(request.url()); await route.abort(); return; }
    if(url.pathname==='/') { await route.fulfill({contentType:'text/html',body:html}); return; }
    if(/^\/assets\/fonts\/[a-z0-9-]+\.woff2$/.test(url.pathname)) { await route.fulfill({contentType:'font/woff2',body:await readFile('src'+url.pathname)}); return; }
    if(url.pathname==='/favicon.ico') { await route.fulfill({status:204}); return; }
    // The directory browser uses POST for a read-only path lookup.
    if(url.pathname==='/v1/workspaces/browse'&&request.method()==='POST') { await route.fulfill({contentType:'application/json',body:JSON.stringify(payloads[url.pathname])}); return; }
    const record={path:url.pathname,query:url.search,method:request.method(),body:request.postData()?request.postDataJSON():undefined}; requests.push(record);
    const handler=handlers.get(record.method+' '+record.path);
    if(handler) { const response=await handler(record); await route.fulfill({contentType:'application/json',status:response?.status||200,body:JSON.stringify(response?.body??response??{})}); return; }
    if(record.method!=='GET') { unexpected.push(record.method+' '+record.path); await route.fulfill({status:405,contentType:'application/json',body:JSON.stringify({error:{message:'No mutation fixture registered'}})}); return; }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(payloads[url.pathname]||{data:[]})});
  });
  return {data,requests,errors,unexpected,payloads,on(method,path,handler){handlers.set(method+' '+path,handler);},async open(section='platform'){await page.goto(origin+'/#'+section);await page.locator('#side-runtime').filter({hasText:'31338'}).waitFor({state:'attached'});await page.locator('#pf-chat-model option[value="'+modelId+'"]').waitFor({state:'attached'});}};
}

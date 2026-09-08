#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Read the whole title and every label. A marker at the end still blocks.
const HOLD = /(?:NICHT[\s_-]+MERGEN|DO[\s_-]+NOT[\s_-]+MERGE|\bPROPOSAL\b|\bWIP\b|needs[\s_-]+human[\s_-]+evidence|\bblocked\b)/i;
export function mergeBlockers(pr) {
  const reasons=[];
  if(pr.state!=='OPEN')reasons.push('The pull request is not open.');
  if(pr.isDraft)reasons.push('The pull request is a draft.');
  for(const text of [pr.title,...(pr.labels||[]).map(label=>label.name)]){
    if(typeof text!=='string'){reasons.push('Incomplete title or label data.');continue;}
    if(HOLD.test(text))reasons.push('Human hold: '+text);
  }
  if(!/^[a-f0-9]{40}$/.test(pr.headRefOid||''))reasons.push('Missing head commit.');
  const checks=pr.statusCheckRollup;
  if(!Array.isArray(checks)||!checks.length)reasons.push('No status checks are available.');
  for(const check of checks||[]){
    const done=check.status==='COMPLETED'&&['SUCCESS','NEUTRAL','SKIPPED'].includes(check.conclusion);
    if(!done&&check.state!=='SUCCESS')reasons.push('Check is not successful: '+(check.name||check.context||'unknown'));
  }
  return reasons;
}

export function main(args=process.argv.slice(2)) {
  const number=args[0],repoIndex=args.indexOf('--repo'),repo=repoIndex>=0?args[repoIndex+1]:undefined;
  if(!/^\d+$/.test(number||'')||(repo&&!/^[\w.-]+\/[\w.-]+$/.test(repo)))throw Error('Usage: node scripts/check-pr-merge.mjs NUMBER [--repo OWNER/REPO] [--merge]');
  const scope=repo?['--repo',repo]:[];
  const pr=JSON.parse(execFileSync('gh',['pr','view',number,...scope,'--json','title,labels,isDraft,state,statusCheckRollup,headRefOid'],{encoding:'utf8',maxBuffer:1024*1024}));
  const blockers=mergeBlockers(pr);
  console.log(JSON.stringify({title:pr.title,labels:pr.labels,head:pr.headRefOid,blockers},null,2));
  if(blockers.length){process.exitCode=2;return;}
  if(args.includes('--merge'))execFileSync('gh',['pr','merge',number,...scope,'--squash','--match-head-commit',pr.headRefOid],{stdio:'inherit'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main();}catch(error){console.error(error.message);process.exitCode=2;}
}

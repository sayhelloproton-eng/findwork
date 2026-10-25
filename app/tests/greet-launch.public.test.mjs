import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildGreetPageUrl,openGreetPlaceholders,closeGreetPlaceholders,validBossExtensionId} from '../web/greet-launch.mjs';
const extId='a'.repeat(32);
const job=(n)=>({jobId:'job-00000000'+String(n).padStart(2,'0'),securityId:'sec id&'+n,actionId:'fw-test-'+n});
test('selected batch creates one user-gesture placeholder per job, no pre-claim needed',()=>{
 const calls=[],tabs=[];
 const open=(url,target)=>{
  calls.push([url,target]);
  const tab={closed:false,close(){this.closed=true;},url:null,location:{replace(next){tab.url=next;}}};
  tabs.push(tab);return tab;
 };
 const ids=Array.from({length:20},(_,i)=>job(i).jobId);
 const {opened,blocked}=openGreetPlaceholders(ids,open);
 assert.equal(calls.length,20);assert.equal(opened.length,20);assert.deepEqual(blocked,[]);
 assert.ok(calls.every(call=>call[0]==='about:blank'&&call[1]==='_blank'));
 for(let i=0;i<20;i++){
  const url=buildGreetPageUrl(extId,job(i),'http://127.0.0.1:4318');
  opened[i].tab.location.replace(url);
  const parsed=new URL(opened[i].tab.url);
  assert.equal(parsed.pathname,'/actions/greet/greet.html');
  assert.equal(parsed.searchParams.get('jobId'),job(i).jobId);
  assert.equal(parsed.searchParams.get('securityId'),job(i).securityId);
  assert.equal(parsed.searchParams.get('actionId'),job(i).actionId);
  assert.equal(parsed.searchParams.get('serverOrigin'),'http://127.0.0.1:4318');
 }
});
test('blocked Chrome popups are excluded rather than claimed or retried blindly',()=>{
 const ids=Array.from({length:20},(_,i)=>job(i).jobId);
 let attempts=0;
 const {opened,blocked}=openGreetPlaceholders(ids,()=>++attempts<=2?{closed:false,close(){this.closed=true;}}:null);
 assert.equal(opened.length,2);assert.equal(blocked.length,18);
 closeGreetPlaceholders(opened);assert.ok(opened.every(item=>item.tab.closed));
});
test('real encrypted BOSS IDs with tilde are supported',()=>{
 const actual=buildGreetPageUrl(extId,{jobId:'~job-000000001',securityId:'synthetic',actionId:'fw-tilde'},'http://127.0.0.1:4318');
 assert.equal(new URL(actual).searchParams.get('jobId'),'~job-000000001');
});
test('no invented extension id and no unsafe/partial action URL',()=>{
 assert.equal(validBossExtensionId('not-installed'),false);
 assert.throws(()=>buildGreetPageUrl('not-installed',job(1),'http://127.0.0.1:4318'),/BOSS_EXTENSION_NOT_DETECTED/);
 assert.throws(()=>buildGreetPageUrl(extId,{jobId:'',securityId:'s',actionId:'a'},'http://127.0.0.1:4318'),/INVALID_GREET_PAGE_PARAMETERS/);
 assert.throws(()=>buildGreetPageUrl(extId,job(1),'https://attacker.invalid'),/INVALID_FINDWORK_ORIGIN/);
});
test('communication UI only copies prompts; it never opens Greet pages',()=>{
 const root=resolve(import.meta.dirname,'../..');
 const ui=readFileSync(resolve(root,'app/web/communications.jsx'),'utf8');
 assert.match(ui,/复制 AI 执行提示词/);
 assert.match(ui,/makeCommunicationAiPrompt/);
 assert.doesNotMatch(ui,/openGreetPlaceholders|window\.open|\/api\/communications\/batch|FINDWORK_BOSS_GREET_BATCH/);
});

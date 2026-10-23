
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'actions/greet/greet-queue.js'),'utf8');
const ids=['job-0000000001','job-0000000002','job-0000000003'];
const KEY='boss-greet-queue-v1';
const DEFAULT='您好，我对该岗位很感兴趣，希望能和您聊一聊。';

function harness({failIds=[],initial=null,randomValues=[0,0.5,0.999999],
 bossTabs=1,deferDownload=false,denyDownload=false,domReady=true,initialNow=1792501200000}={}){
 let now=initialNow,uuid=0,randomDraws=0;
 const storage=new Map(initial?[[KEY,structuredClone(initial)]]:[]);
 const callbacks={messages:[],alarms:[]},listeners=new Set();
 const calls={http:[],downloads:[],records:[]},items=new Map(),timers=[];
 const fakeMath=Object.create(Math);
 fakeMath.random=()=>randomValues[Math.min(randomDraws++,randomValues.length-1)];
 class FakeDate extends Date{
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
 }
 const fakeFetch=async(url,opts)=>{
  assert.equal(url,'/wapi/zpgeek/friend/add.json');
  assert.equal(opts.method,'POST');
  assert.equal(opts.credentials,'include');
  const body=new URLSearchParams(opts.body);
  const id=body.get('jobId');
  calls.http.push({id,at:now,greeting:body.get('greeting')});
  return {status:failIds.includes(id)?403:200,json:async()=>({
   code:failIds.includes(id)?37:0,message:failIds.includes(id)?'mock-rejected':'mock-ok',
   zpData:{testJob:id,testNested:{ready:true}}
  })};
 };
 const chrome={
  runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,
   onMessage:{addListener:fn=>callbacks.messages.push(fn)}},
  storage:{local:{
   get:async key=>({[key]:structuredClone(storage.get(key))}),
   set:async values=>{for(const [key,value] of Object.entries(values))
    storage.set(key,structuredClone(value));}
  }},
  alarms:{create:async()=>{},clear:async()=>{},
   onAlarm:{addListener:fn=>callbacks.alarms.push(fn)}},
  tabs:{query:async()=>Array.from({length:bossTabs},(_,i)=>({
   id:10+i,url:'https://www.zhipin.com/web/geek/jobs'
  }))},
  scripting:{executeScript:async({func,args,world,target})=>{
   assert.equal(world,'MAIN');assert.equal(target.tabId,10);
   return [{result:await func(args[0])}];
  }},
  downloads:{
   onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
   download:async info=>{
    if(denyDownload)throw Error('MOCK_DOWNLOAD_DENIED');
    const id=calls.downloads.length+1;
    calls.downloads.push({...info,id,at:now});
    calls.records.push(JSON.parse(decodeURIComponent(info.url.split(',').slice(1).join(','))));
    items.set(id,{id,state:deferDownload?'in_progress':'complete',
     exists:!deferDownload,filename:'/tmp/test/Downloads/'+info.filename});
    return id;
   },
   search:async({id})=>items.has(id)?[{...items.get(id)}]:[]
  }
 };
 const context=vm.createContext({chrome,Date:FakeDate,Math:fakeMath,URL,
  URLSearchParams,location:{origin:'https://www.zhipin.com',pathname:'/web/geek/jobs'},
  fetch:fakeFetch,document:{readyState:'complete',querySelector:()=>domReady?{}:null},JSON,encodeURIComponent,
  crypto:{randomUUID:()=>String(++uuid).padStart(32,'0')},
  setTimeout:(fn,ms)=>{const t={fn,due:now+ms,active:true};timers.push(t);return t;},
  clearTimeout:t=>{if(t)t.active=false;}
 });
 vm.runInContext(source,context);context.BossGreetQueue.install();
 const sender={id:'ext',url:'chrome-extension://ext/actions/greet/greet.html?jobId=job-0000000001'};
 const send=(message,from=sender)=>new Promise(resolve=>{
  const fn=callbacks.messages[0];
  if(fn(message,from,resolve)!==true)resolve(null);
 });
 const enqueue=(id,more={})=>send({type:'GREET_QUEUE_ENQUEUE',jobId:id,
  securityId:'security-'+id,...more});
 const state=()=>structuredClone(storage.get(KEY)||{});
 const flush=async()=>{for(let i=0;i<45;i++)await new Promise(setImmediate);};
 const step=async()=>{
  await flush();
  const t=timers.filter(x=>x.active).sort((a,b)=>a.due-b.due)[0];
  if(!t)return false;
  now=t.due;t.active=false;t.fn();await flush();return true;
 };
 const complete=async id=>{
  assert(items.has(id));
  Object.assign(items.get(id),{state:'complete',exists:true});
  for(const fn of listeners)fn({id,state:{current:'complete'}});
  await flush();
 };
 return{ids,enqueue,send,state,flush,step,complete,calls,callbacks,
  drawCount:()=>randomDraws};
}

test('one Greet owner, isolated UI and unchanged Reload',()=>{
 const entry=fs.readFileSync(path.join(root,'auto-entry.js'),'utf8');
 const ui=fs.readFileSync(path.join(root,'actions/greet/greet.js'),'utf8');
 assert.equal((entry.match(/BossGreetQueue\.install\(\)/g)||[]).length,1);
 assert.doesNotMatch(ui,/DEFAULT_GREETING|chrome\.scripting|fetch\(/);
 assert.match(fs.readFileSync(path.join(root,'actions/greet/greet.html'),'utf8'),/随机等待 5～8 秒/);
 assert.equal(fs.readFileSync(path.join(root,'actions/reload/reload.js'),'utf8').trim(),
  'chrome.runtime.reload();');
});

test('control page delegates default to owner and closes only itself',async()=>{
 let sent=null;const removed=[];
 const chrome={runtime:{sendMessage:async m=>{sent=m;return{ok:true,reason:'ENQUEUED'};}},
  tabs:{getCurrent:async()=>({id:40}),remove:async id=>removed.push(id)}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'actions/greet/greet.js'),'utf8'),{
  chrome,document:{getElementById:()=>({textContent:'ready'})},
  location:{search:'?jobId=job-0000000001&securityId=safe-synthetic'},
  URLSearchParams
 });
 for(let i=0;i<4;i++)await new Promise(setImmediate);
 assert.equal(sent.type,'GREET_QUEUE_ENQUEUE');
 assert.equal(sent.greeting,null);
 assert.deepEqual(removed,[40]);
});

test('reject foreign sender and invalid id without BOSS side effects',async()=>{
 const h=harness();await h.flush();
 const denied=await h.send({type:'GREET_QUEUE_ENQUEUE',jobId:ids[0],
  securityId:'safe-synthetic'},{id:'foreign',url:'https://evil.example/'});
 const invalid=await h.enqueue('bad');
 assert.equal(denied.ok,false);assert.equal(invalid.ok,false);
 await h.flush();assert.equal(h.calls.http.length,0);
});

test('three concurrent jobs are serial; random 5, 6.5, 8s draws and raw JSON survive',async()=>{
 const h=harness({randomValues:[0,0.5,0.999999]});
 const accepted=await Promise.all(ids.map(id=>h.enqueue(id)));
 assert.ok(accepted.every(r=>r.ok&&r.reason==='ENQUEUED'));
 await h.flush();assert.equal(h.calls.http.length,1);
 assert.equal(h.state().nextEligibleAt-h.state().lastFinishedAt,5000);
 assert.equal(await h.step(),true);assert.equal(h.calls.http.length,2);
 assert.equal(h.calls.http[1].at-h.calls.http[0].at,5000);
 assert.equal(h.state().nextEligibleAt-h.state().lastFinishedAt,6500);
 assert.equal(await h.step(),true);await h.flush();
 assert.equal(h.calls.http.length,3);
 assert.equal(h.calls.http[2].at-h.calls.http[1].at,6500);
 assert.equal(h.state().nextEligibleAt-h.state().lastFinishedAt,8000);
 assert.equal(h.drawCount(),3);
 for(const [i,rec] of h.calls.records.entries()){
  assert.equal(rec.jobId,ids[i]);assert.equal(rec.result,'SUCCESS');
  assert.equal(rec.httpStatus,200);assert.equal(rec.response.code,0);
  assert.equal(rec.response.zpData.testNested.ready,true);
  assert.equal(h.calls.http[i].greeting,DEFAULT);
  assert.equal('securityId' in rec,false);
  assert.match(h.calls.downloads[i].filename,/^BOSS\/\d{4}-\d\d-\d\d\/greet\/greet-/);
 }
 assert.equal(h.state().queue.length,0);
});

test('failed BOSS reply stops queued outreach and preserves remaining jobs',async()=>{
 const h=harness({failIds:[ids[0]],randomValues:[0.2]});
 await Promise.all(ids.slice(0,2).map(id=>h.enqueue(id)));
 await h.flush();
 assert.equal(h.calls.records[0].result,'FAILED');
 assert.equal(h.calls.records[0].response.code,37);
 assert.equal(h.calls.records[0].httpStatus,403);
 assert.equal(h.state().paused.reason,'SECURITY_CODE_37_STOP');
 assert.equal(await h.step(),false);await h.flush();
 assert.equal(h.calls.records.length,1);
 assert.deepEqual(h.calls.http.map(x=>x.id),[ids[0]]);
 assert.equal(h.state().queue.length,1);
 assert.equal((await h.enqueue(ids[2])).reason,'QUEUE_PAUSED');
});

test('duplicate completed job is not resent',async()=>{
 const h=harness();await h.enqueue(ids[0]);await h.flush();
 assert.equal((await h.enqueue(ids[0])).reason,'DUPLICATE');
 await h.flush();assert.equal(h.calls.http.length,1);
 assert.equal(h.calls.downloads.length,1);
});

test('zero or ambiguous BOSS tabs fail safely with failed JSON',async()=>{
 for(const count of [0,2]){
  const h=harness({bossTabs:count});await h.enqueue(ids[0]);await h.flush();
  assert.equal(h.calls.http.length,0);
  assert.equal(h.calls.records[0].result,'FAILED');
  assert.match(h.calls.records[0].error,/BOSS_TAB_UNAVAILABLE/);
 }
});

test('downloading result must finish before the next task starts',async()=>{
 const h=harness({deferDownload:true,randomValues:[0]});
 await Promise.all(ids.slice(0,2).map(id=>h.enqueue(id)));
 await h.flush();assert.equal(h.calls.http.length,1);
 assert.equal(h.state().active.id,ids[0]);
 await h.complete(1);assert.equal(h.state().active,null);
 assert.equal(await h.step(),true);assert.equal(h.calls.http.length,2);
 await h.complete(2);assert.equal(h.state().queue.length,0);
});

test('worker restart does not replay unknown POST and writes marked failure',async()=>{
 const initial={queue:[{id:ids[0],securityId:'sec-1',greeting:DEFAULT},
   {id:ids[1],securityId:'sec-2',greeting:DEFAULT}],
  active:{id:ids[0],at:1792501199000},
  results:{[ids[0]]:{status:'RUNNING'},[ids[1]]:{status:'QUEUED'}},
  lastFinishedAt:0,nextEligibleAt:0};
 const h=harness({initial,randomValues:[0.25]});await h.flush();
 assert.equal(h.calls.http.length,0);
 assert.equal(h.calls.records[0].result,'FAILED');
 assert.equal(h.calls.records[0].sideEffectState,'UNKNOWN');
 assert.equal(h.state().results[ids[0]].sideEffectState,'UNKNOWN');
 assert.equal(h.state().paused.reason,'WORKER_RESTART_INTERRUPTED');
 assert.equal(await h.step(),false);
 assert.deepEqual(h.calls.http.map(x=>x.id),[]);
});

test('pre-existing cooldown survives restart without new draw',async()=>{
 const now=1792501200000,deadline=now+4000;
 const initial={queue:[{id:ids[1],securityId:'sec-2',greeting:DEFAULT}],
  active:null,results:{[ids[1]]:{status:'QUEUED'}},
  lastFinishedAt:now-2000,nextEligibleAt:deadline};
 const h=harness({initial,randomValues:[0],initialNow:now});
 await h.flush();assert.equal(h.calls.http.length,0);assert.equal(h.drawCount(),0);
 assert.equal(await h.step(),true);assert.equal(h.calls.http[0].at,deadline);
});

test('blank BOSS list does not send and pauses all queued outreach',async()=>{
 const h=harness({domReady:false});
 await Promise.all(ids.slice(0,2).map(id=>h.enqueue(id)));
 await h.flush();
 assert.equal(h.calls.http.length,0);
 assert.equal(h.calls.records[0].error,'BOSS_LIST_DOM_NOT_READY');
 assert.equal(h.state().paused.reason,'BOSS_LIST_DOM_NOT_READY');
 assert.equal(h.state().queue.length,1);
 assert.equal(await h.step(),false);
});
test('denied download does not replay POST, but is a residual log-durability risk',async()=>{
 const h=harness({denyDownload:true});await h.enqueue(ids[0]);await h.flush();
 assert.equal(h.calls.http.length,1);
 assert.equal(h.state().results[ids[0]].download.status,'FAILED');
 assert.equal(h.state().results[ids[0]].status,'UNKNOWN');
 assert.equal(h.state().paused.reason,'GREET_RECEIPT_NOT_DURABLE');
 assert.equal(h.calls.downloads.length,0);
});

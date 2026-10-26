
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'actions/greet/greet-state.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'actions/greet/greet-queue.js'),'utf8');
const ids=['job-0000000001','job-0000000002','job-0000000003'];
const KEY='boss-greet-queue-v1';
const DEFAULT='您好，我对该岗位很感兴趣，希望能和您聊一聊。';

function harness({failIds=[],responses={},downloadHistory={},initial=null,randomValues=[0,0.5,0.999999],
 bossTabs=1,deferDownload=false,denyDownload=false,domReady=true,resumeOwner=undefined,initialNow=1792501200000}={}){
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
  return {status:failIds.includes(id)?403:200,json:async()=>responses[id]||({
   code:failIds.includes(id)?37:0,message:failIds.includes(id)?'mock-rejected':'mock-ok',
   zpData:{testJob:id,testNested:{ready:true}}
  })};
 };
 const chrome={
  runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,
   onMessage:{addListener:fn=>callbacks.messages.push(fn)}},
  storage:{local:{
   get:async key=>key===null?Object.fromEntries([...storage].map(([k,v])=>[k,structuredClone(v)])):({[key]:structuredClone(storage.get(key))}),
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
   search:async({id})=>items.has(id)?[{...items.get(id)}]:downloadHistory[id]?[downloadHistory[id]]:[]
  }
 };
 const context=vm.createContext({BossResumeDelivery:resumeOwner,chrome,Date:FakeDate,Math:fakeMath,URL,
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

test('Greet control page forwards optional Findwork batch claim fields to existing queue',async()=>{
 let sent=null;
 const chrome={runtime:{sendMessage:async m=>{sent=m;return{ok:true,reason:'ENQUEUED'};}},
  tabs:{getCurrent:async()=>({id:40}),remove:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'actions/greet/greet.js'),'utf8'),{
  chrome,document:{getElementById:()=>({textContent:'ready'})},
  location:{search:'?jobId=job-0000000001&securityId=safe-synthetic&actionId=fw-123&serverOrigin=http%3A%2F%2F127.0.0.1%3A4318'},
  URLSearchParams
 });
 for(let i=0;i<4;i++)await new Promise(setImmediate);
 assert.equal(sent.jobId,'job-0000000001');
 assert.equal(sent.actionId,'fw-123');
 assert.equal(sent.serverOrigin,'http://127.0.0.1:4318');
});
test('real encrypted BOSS job IDs may contain tilde',async()=>{
 const h=harness();
 const realId='~job-000000001';
 const admitted=await h.enqueue(realId);
 assert.equal(admitted.ok,true);
 await h.flush();
 assert.equal(h.calls.http[0].id,realId);
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
 assert.equal(h.calls.records[0].result,'UNKNOWN');
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

test('zero or ambiguous BOSS tabs stop with unconfirmed JSON and no POST',async()=>{
 for(const count of [0,2]){
  const h=harness({bossTabs:count});await h.enqueue(ids[0]);await h.flush();
  assert.equal(h.calls.http.length,0);
  assert.equal(h.calls.records[0].result,'UNKNOWN');
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

function pausedQueue(kind='REMINDER'){
 return{queue:[{id:ids[1],securityId:'synthetic-second'}],active:null,
  paused:{jobId:ids[0],at:123,reason:'GREET_RESPONSE_NOT_SUCCESS'},
  results:{[ids[0]]:{status:'FAILED',failure:{kind,message:'synthetic'},download:{status:'COMPLETE'}},[ids[1]]:{status:'QUEUED'}},lastFinishedAt:0,nextEligibleAt:0};
}
test('human resume continues only remaining jobs; failed job is never replayed',async()=>{
 const h=harness({initial:pausedQueue()});await h.flush();
 const result=await h.send({type:'GREET_QUEUE_RESUME',jobId:ids[0],pausedAt:123});
 assert.equal(result.ok,true);await h.flush();
 assert.deepEqual(h.calls.http.map(r=>r.id),[ids[1]]);
 assert.equal(h.state().results[ids[0]].status,'FAILED');
 assert.equal(h.state().lastHumanResume.kind,'REMINDER');
});
test('resume rejects stale identities, foreign pages, daily caps, unknown side effects and missing receipts',async()=>{
 const cases=[{kind:'DAILY_LIMIT'},{kind:'SECURITY'},{kind:'UNKNOWN'},
  {kind:'REMINDER',unknown:true},{kind:'REMINDER',download:'FAILED'},
  {kind:'REMINDER',stale:true},{kind:'CLOSED',foreign:true}];
 for(const c of cases){
  const s=pausedQueue(c.kind);
  if(c.unknown)s.results.other={status:'UNKNOWN',sideEffectState:'UNKNOWN'};
  if(c.download)s.results[ids[0]].download.status=c.download;
  const h=harness({initial:s});await h.flush();
  const msg={type:'GREET_QUEUE_RESUME',jobId:ids[0],pausedAt:c.stale?124:123};
  const result=await h.send(msg,...(c.foreign?[{id:'ext',url:'chrome-extension://ext/diagnostics/foreign.html'}]:[]));
  assert.equal(result.ok,false,JSON.stringify(c));await h.flush();assert.equal(h.calls.http.length,0);
  assert.equal(h.state().paused.jobId,ids[0]);
 }
});
test('closed job, 120 reminder and daily cap are distinct failures with durable raw receipts',async()=>{
 const messages=[{code:1,message:'该职位已不存在'},
  {code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'温馨提示',content:'您今天已与120位BOSS沟通，还剩30次沟通机会哦'}}}},
  {code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'您已达到沟通上限',content:'明天再来'}}}}];
 for(const [i,response] of messages.entries()){
  const h=harness({responses:{[ids[0]]:response}});await h.enqueue(ids[0]);await h.flush();
  assert.equal(h.state().results[ids[0]].failure.kind,['CLOSED','REMINDER','DAILY_LIMIT'][i]);
  assert.equal(h.state().results[ids[0]].download.status,'COMPLETE');
  assert.deepEqual(h.calls.records[0].response,response);
  assert.equal(h.state().paused.jobId,ids[0]);
 }
});

test('old failure reasons restore from their exact completed Chrome JSON downloads without any BOSS request',async()=>{
 const s=pausedQueue('DAILY_LIMIT');s.queue=[];delete s.results[ids[1]];delete s.results[ids[0]].failure;
 s.results[ids[0]].download={status:'COMPLETE',downloadId:77,actualFilename:'/synthetic/greet.json'};
 const record={contract:'boss-greet-result.v1',jobId:ids[0],startedAt:new Date(1792501200000).toISOString(),finishedAt:new Date(1792501200000).toISOString(),method:'POST',endpoint:'/wapi/zpgeek/friend/add.json',result:'FAILED',httpStatus:200,response:{code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'已达到沟通上限',content:'您今天已与150位BOSS沟通，明天再来'}}}}};
 const history={state:'complete',exists:true,filename:'/synthetic/greet.json',url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(record))};
 const h=harness({initial:s,downloadHistory:{77:history}});await h.flush();
 assert.equal(h.state().results[ids[0]].failure.kind,'DAILY_LIMIT');
 assert.match(h.state().results[ids[0]].failure.message,/150位/);
 assert.equal(h.calls.http.length,0);assert.equal(h.state().paused.at,123);
 for(const override of [{filename:'/different/file.json'},{exists:false},{url:history.url.replace(encodeURIComponent(ids[0]),encodeURIComponent(ids[1]))}]){
  const rejected=harness({initial:s,downloadHistory:{77:{...history,...override}}});await rejected.flush();assert.equal(rejected.state().results[ids[0]].failure,undefined);assert.equal(rejected.calls.http.length,0);
 }
});

test('clear completed archives visible results and preserves duplicate protection without deleting downloads',async()=>{
 const s=pausedQueue('CLOSED');s.queue=[];delete s.results[ids[1]];s.archivedResults=Object.fromEntries(Array.from({length:150},(_,i)=>['prior-'+i,{status:'SUCCESS',at:1792501200000,download:{status:'COMPLETE'}}]));
 const h=harness({initial:s});await h.flush();
 const reply=await h.send({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:0,resultCount:1,pausedAt:123});
 assert.equal(reply.ok,true);assert.deepEqual(h.state().results,{});assert.equal(h.state().paused,null);
 assert.equal(h.state().archivedResults[ids[0]].status,'FAILED');
 assert.equal((await h.enqueue(ids[0])).reason,'DUPLICATE');assert.equal(h.calls.http.length,0);assert.equal(h.calls.downloads.length,0);
});
test('clear never removes pending, active, unknown, undownloaded or changed batch evidence',async()=>{
 for(const scenario of ['pending','active','unknown','download','stale']){
  const s=pausedQueue('CLOSED');s.archivedResults=Object.fromEntries(Array.from({length:150},(_,i)=>['prior-'+i,{status:'SUCCESS',at:1792501200000,download:{status:'COMPLETE'}}]));if(scenario!=='pending'){s.queue=[];delete s.results[ids[1]];}
  if(scenario==='active')s.active={id:ids[1],at:0};
  if(scenario==='unknown')s.results[ids[0]].sideEffectState='UNKNOWN';
  if(scenario==='download')s.results[ids[0]].download.status='FAILED';
  const h=harness({initial:s});await h.flush();
  const reply=await h.send({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:scenario==='stale'?99:0,resultCount:Object.keys(s.results).length,pausedAt:123});
  assert.equal(reply.ok,false,scenario);assert.ok(h.state().results[ids[0]]);assert.equal(h.calls.http.length,0);
 }
});
test('explicit retry only accepts reminder or restored later-day quota failure, never closed or unknown',async()=>{
 for(const kind of ['REMINDER','DAILY_LIMIT','CLOSED','UNKNOWN','BUSINESS']){
  const s=pausedQueue(kind);s.queue=[];delete s.results[ids[1]];
  const failed=s.results[ids[0]];failed.at=1792501200000-(kind==='DAILY_LIMIT'?86400000:0);failed.recordFinishedAt=new Date(failed.at).toISOString();failed.retryRequest={id:ids[0],securityId:'synthetic-retry',greeting:'hello'};
  const h=harness({initial:s});await h.flush();const reply=await h.send({type:'GREET_QUEUE_RETRY',jobId:ids[0],retryAt:failed.at});await h.flush();
  assert.equal(reply.ok,['REMINDER','DAILY_LIMIT'].includes(kind),kind);
  assert.equal(h.calls.http.length,['REMINDER','DAILY_LIMIT'].includes(kind)?1:0,kind);
  if(reply.ok)assert.equal(h.state().retryAttempts[ids[0]][0].status,'FAILED');
 }
});
test('past platform limit is an error message, not a local lock while successes are under150',async()=>{
 const s=pausedQueue('DAILY_LIMIT');s.queue=[];delete s.results[ids[1]];s.results[ids[0]].at=1792501200000;s.results[ids[0]].recordFinishedAt=new Date(1792501200000).toISOString();s.results[ids[0]].retryRequest={id:ids[0],securityId:'synthetic-retry'};
 const h=harness({initial:s});await h.flush();const reply=await h.send({type:'GREET_QUEUE_RETRY',jobId:ids[0],retryAt:1792501200000});assert.equal(reply.ok,true);await h.flush();assert.equal(h.calls.http.length,1);
});
test('clear requires150 successes today, not150 attempts or historical successes',async()=>{
 const s=pausedQueue('CLOSED');s.queue=[];delete s.results[ids[1]];s.archivedResults=Object.fromEntries(Array.from({length:149},(_,i)=>['success-'+i,{status:'SUCCESS',at:1792501200000,download:{status:'COMPLETE'}}]));
 s.archivedResults.yesterday={status:'SUCCESS',at:1792501200000-86400000,download:{status:'COMPLETE'}};
 const h=harness({initial:s});await h.flush();const reply=await h.send({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:0,resultCount:1,pausedAt:123});assert.equal(reply.reason,'TODAY_SUCCESS_QUOTA_NOT_REACHED');assert.ok(h.state().results[ids[0]]);
});
test('platform-capped completed batch clears below150 while preserving evidence and prior-day cleanup keeps today',async()=>{
 const stamp=1792501200000;
 const success=at=>({status:'SUCCESS',at,recordFinishedAt:new Date(at).toISOString(),download:{status:'COMPLETE'}});
 const s={queue:[],active:null,paused:{jobId:ids[1],at:123},lastFinishedAt:stamp,results:{[ids[0]]:success(stamp),[ids[1]]:{status:'FAILED',at:stamp,recordFinishedAt:new Date(stamp).toISOString(),failure:{kind:'DAILY_LIMIT'},download:{status:'COMPLETE'}}}};
 const h=harness({initial:s});await h.flush();assert.equal((await h.send({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:stamp,resultCount:2,pausedAt:123})).ok,true);assert.deepEqual(h.state().results,{});assert.equal(h.state().archivedResults[ids[0]].status,'SUCCESS');assert.equal(h.calls.http.length,0);assert.equal(h.calls.downloads.length,0);
 const mixed={queue:[],active:null,paused:null,lastFinishedAt:stamp,results:{[ids[0]]:success(stamp-86400000),[ids[1]]:success(stamp)}};
 const next=harness({initial:mixed});await next.flush();assert.equal((await next.send({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:stamp,resultCount:2,pausedAt:null})).ok,true);assert.equal(next.state().results[ids[1]].status,'SUCCESS');assert.equal(next.state().results[ids[0]],undefined);assert.ok(next.state().archivedResults[ids[0]]);
});

test('optional resume setting or executor failures never block, reclassify or resend greetings',async()=>{
 for(const resumeOwner of [
  {captureIntent:async()=>{throw Error('synthetic-storage-failure');},afterGreet:async()=>false},
  {captureIntent:async()=>({generation:1}),afterGreet:async()=>{throw Error('synthetic-resume-failure');}}
 ]){
  const h=harness({resumeOwner});await h.enqueue(ids[0]);await h.enqueue(ids[1]);await h.flush();await h.step();await h.flush();
  assert.equal(h.state().results[ids[0]].status,'SUCCESS');assert.equal(h.state().results[ids[1]].status,'SUCCESS');assert.equal(h.state().paused,null);
  assert.deepEqual(h.calls.http.map(x=>x.id),ids.slice(0,2));assert.equal(h.calls.records.length,2);
 }
});

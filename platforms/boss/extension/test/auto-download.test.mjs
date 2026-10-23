
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const code=fs.readFileSync(path.join(root,'core/capture/auto-download.js'),'utf8');
function harness(fail=false,seed={},tabs=[]){
 const storage=new Map(Object.entries(seed)),calls=[],listeners=[],changes=[],alarms=[],items=new Map();
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,
  onMessage:{addListener:f=>listeners.push(f)}},
  tabs:{query:async()=>tabs},
  storage:{local:{get:async key=>key===null?Object.fromEntries(storage):
    ({[key]:structuredClone(storage.get(key))}),
   set:async value=>{for(const [k,v] of Object.entries(value))storage.set(k,structuredClone(v));},
   remove:async key=>storage.delete(key)}},
  alarms:{create:async()=>{},onAlarm:{addListener:f=>alarms.push(f)}},
  downloads:{onChanged:{addListener:f=>changes.push(f)},
   download:async arg=>{
    calls.push(arg);if(fail)throw Error('DENIED');
    const id=calls.length;
    items.set(id,{id,state:'in_progress',exists:false,
     filename:'/tmp/test/Downloads/'+arg.filename});
    return id;
   },search:async({id})=>items.has(id)?[items.get(id)]:[]}};
 const ctx=vm.createContext({chrome,Date,URL,JSON,encodeURIComponent});
 vm.runInContext(code,ctx);ctx.BossRawDownloads.install();
 const sender={id:'ext',frameId:0,tab:{id:12,url:'https://www.zhipin.com/web/geek/jobs'}};
 const body={code:0,zpData:{jobList:[{encryptJobId:'one',salaryDesc:'30K',
  nested:{x:[1,2,null]}},{jobName:'id-less'}]},unknown:'preserved'};
 const msg=(requestId=1,docId='doc-12345678-abcd')=>({
  type:'BOSS_RAW_LIST_RESPONSE',docId,requestId,
  path:'/wapi/zpgeek/pc/recommend/job/list.json',httpStatus:200,
  receivedAt:Date.now(),responseBody:body});
 const accept=(m=msg(),s=sender)=>new Promise(resolve=>{
  for(const fn of listeners)if(fn(m,s,resolve)===true)return;
  resolve(null);
 });
 const act=(runId='run-one',docId='doc-12345678-abcd')=>({runId,tabId:12,hookDocId:docId});
 const begin=(kind='REFRESH',proof={})=>ctx.BossRawDownloads.begin({...act(),...proof},kind);
 const bottom=()=>ctx.BossRawDownloads.markBottom(act());
 const finish=(kind='REFRESH',docId='doc-12345678-abcd',aborted=false)=>
  ctx.BossRawDownloads.finish(act('run-one',docId),kind,aborted);
 async function complete(id,opts={}){
  Object.assign(items.get(id),{state:opts.state||'complete',exists:opts.exists??true});
  for(const fn of changes)fn({id,state:{current:items.get(id).state}});
  for(let j=0;j<3;j++)await new Promise(setImmediate);
 }
 return{storage,calls,accept,msg,sender,body,begin,bottom,finish,complete};
}
test('default CLOSED: unrelated natural list responses never download',async()=>{
 const h=harness();const r=await h.accept();
 assert.equal(r.status,'IGNORED_NO_GRANT');assert.equal(h.calls.length,0);
 assert.equal(h.storage.has('boss-raw-downloads-v2'),false);
});
test('Refresh: new main-hook document selected once, old response excluded',async()=>{
 const h=harness();await h.accept(h.msg(4,'doc-old-12345678'));
 await h.begin();await h.accept(h.msg(1,'doc-old-12345678'));
 await h.accept(h.msg(1));await h.accept(h.msg(2));
 assert.equal(h.calls.length,0);
 const grant=await h.finish();
 assert.equal(grant.status,'AUTHORIZED_ONCE');assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].filename.endsWith('-2.json'));
 assert.equal(h.calls[0].saveAs,false);
 assert.deepEqual(JSON.parse(decodeURIComponent(h.calls[0].url.split(',')[1])),h.body);
 await h.finish();await h.accept(h.msg(3));assert.equal(h.calls.length,1);
 assert.match(h.calls[0].filename,/^BOSS\/\d{4}-\d\d-\d\d\/list\/job-list-doc-12345678-abcd-2\.json$/);
 await h.complete(1);
 const complete=h.storage.get('boss-raw-downloads-v2').records.find(x=>x.status==='COMPLETE');
 assert.ok(complete);assert.equal(complete.raw,null);
});
test('Refresh missing new-document evidence downloads nothing',async()=>{
 const h=harness();await h.begin();await h.accept();
 assert.equal((await h.finish('REFRESH',null)).status,'NO_ELIGIBLE_RESPONSE');
 assert.equal(h.calls.length,0);
});
test('Scroll: only one candidate inside five-second window',async()=>{
 const h=harness();await h.begin('SCROLL');
 assert.equal((await h.accept(h.msg(1))).status,'IGNORED_NO_GRANT');
 await h.bottom();await h.accept(h.msg(2));
 const gate=h.storage.get('boss-raw-event-gate-v1');
 const stamp=Date.now();
 const data=h.storage.get('boss-raw-downloads-v2');
 data.records.forEach(r=>{r.receivedAt=stamp-1500;});
 h.storage.set('boss-raw-downloads-v2',data);
 h.storage.set('boss-raw-event-gate-v1',{...gate,
  openedAt:stamp-10000,bottomAt:stamp-5001,deadline:stamp-1});
 const grant=await h.finish('SCROLL');
 assert.equal(grant.status,'AUTHORIZED_ONCE');
 assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].filename.endsWith('-2.json'));
 await h.finish('SCROLL');assert.equal(h.calls.length,1);
});
test('Scroll excludes responses before bottom marker and after five seconds',async()=>{
 const h=harness();await h.begin('SCROLL');
 assert.equal((await h.accept(h.msg(1))).status,'IGNORED_NO_GRANT');
 await h.bottom();
 const gate=h.storage.get('boss-raw-event-gate-v1');
 assert.equal(gate.deadline-gate.bottomAt,5000);
 const early=h.msg(2);early.receivedAt=gate.bottomAt-1;
 assert.equal((await h.accept(early)).status,'IGNORED_NO_GRANT');
 const late=h.msg(3);late.receivedAt=gate.deadline+1;
 assert.equal((await h.accept(late)).status,'IGNORED_NO_GRANT');
 const inside=h.msg(4);inside.receivedAt=gate.bottomAt+1;
 assert.equal((await h.accept(inside)).status,'HELD');
 assert.equal(h.storage.get('boss-raw-downloads-v2').records.length,1);
 const now=Date.now();
 const data=h.storage.get('boss-raw-downloads-v2');
 data.records[0].receivedAt=now-1500;
 h.storage.set('boss-raw-downloads-v2',data);
 h.storage.set('boss-raw-event-gate-v1',{...gate,
  openedAt:now-10000,bottomAt:now-5001,deadline:now-1});
 assert.equal((await h.finish('SCROLL')).status,'AUTHORIZED_ONCE');
 assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].filename.endsWith('-4.json'));
});
test('aborted Scroll and missing bottom never download',async()=>{
 const h=harness();await h.begin('SCROLL');await h.accept();
 assert.equal((await h.finish('SCROLL','doc-12345678-abcd',true)).status,'ABORTED');
 assert.equal(h.calls.length,0);
});
test('untrusted sender and unrelated API never capture raw data',async()=>{
 const h=harness();await h.begin();
 const bad=structuredClone(h.sender);bad.tab.url='https://evil.example/';
 assert.equal((await h.accept(h.msg(),bad)).ok,false);
 const unrelated=h.msg();unrelated.path='/wapi/other.json';
 assert.equal((await h.accept(unrelated)).ok,false);
 assert.equal(h.calls.length,0);
});
test('failed, interrupted and unconfirmed downloads keep complete raw JSON',async()=>{
 for(const variant of ['DENIED','INTERRUPTED','NO_FILE']){
  const h=harness(variant==='DENIED');await h.begin();await h.accept();
  const result=await h.finish();
  if(variant==='DENIED')assert.equal(result.status,'DOWNLOAD_FAILED');
  if(variant==='INTERRUPTED')await h.complete(1,{state:'interrupted',exists:false});
  if(variant==='NO_FILE')await h.complete(1,{exists:false});
  const row=h.storage.get('boss-raw-downloads-v2').records[0];
  assert.deepEqual(row.raw.body,h.body);
  assert.ok(['FAILED','INTERRUPTED','VERIFY_PENDING'].includes(row.status));
 }
});
test('pre-upgrade unauthorised QUEUED is not replayed at worker boot',async()=>{
 const h=harness(false,{'boss-raw-downloads-v2':{
  records:[{key:'legacy',status:'QUEUED',filename:'BOSS/old.json',raw:{body:{x:1}}}]
 }});
 await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(h.calls.length,0);
});
test('MAIN hook does not clip raw JSON fields by size',()=>{
 const js=fs.readFileSync(path.join(root,'core/network/main-hook.js'),'utf8');
 assert.doesNotMatch(js,/800000|too-large/);
 assert.match(js,/JSON\.parse\(await r\.clone\(\)\.text\(\)\)/);
});

test('Refresh safely reclaims the orphaned 90-second Scroll gate',async()=>{
 const gate={kind:'SCROLL',runId:'old-scroll',tabId:12,status:'OPEN',
  openedAt:Date.now()-1000,expiresAt:Date.now()+80000};
 const h=harness(false,{'boss-raw-event-gate-v1':gate},[]);
 assert.equal((await h.begin()).status,'OPEN');
 assert.equal(h.storage.get('boss-raw-event-gate-v1').kind,'REFRESH');
 assert.equal(h.calls.length,0);
});
test('a genuinely live other action is never overridden',async()=>{
 const gate={kind:'SCROLL',runId:'running',tabId:12,status:'OPEN',
  openedAt:Date.now()-1000,expiresAt:Date.now()+80000};
 const h=harness(false,{'boss-raw-event-gate-v1':gate},
  [{id:77,url:'chrome-extension://ext/actions/scroll/scroll.html',title:'BOSS Observer · Scroll'}]);
 const grant=await h.begin();
 assert.equal(grant.ok,false);
 assert.equal(grant.status,'OTHER_ACTION_OPEN');
});

test('Refresh baseline excludes old documents and requests before Tab click',async()=>{
 const h=harness();
 const started=await h.begin('REFRESH',{
  hookDocId:'doc-12345678-abcd',minRequestId:4});
 assert.equal(started.status,'OPEN');
 assert.equal((await h.accept(h.msg(6,'doc-older-12345678'))).status,'IGNORED_NO_GRANT');
 assert.equal((await h.accept(h.msg(4))).status,'IGNORED_NO_GRANT');
 assert.equal((await h.accept(h.msg(5))).status,'HELD');
 const result=await h.finish();
 assert.equal(result.status,'AUTHORIZED_ONCE');
 assert.equal(result.download.downloadId,1);
 assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].filename.endsWith('-5.json'));
});

test('live prior Refresh page remains owner even with Refresh title',async()=>{
 const previous={kind:'REFRESH',runId:'active-refresh',tabId:12,
  controlTabId:77,status:'OPEN',openedAt:Date.now()-1000,
  expiresAt:Date.now()+60000};
 const h=harness(false,{'boss-raw-event-gate-v1':previous},
  [{id:77,url:'chrome-extension://ext/actions/refresh/refresh.html?expect=2',
   title:'Refresh · WAITING_NATURAL_LIST_RESPONSE'}]);
 const outcome=await h.begin('REFRESH',{controlTabId:78});
 assert.equal(outcome.status,'OTHER_ACTION_OPEN');
 assert.equal(h.storage.get('boss-raw-event-gate-v1').runId,'active-refresh');
 assert.equal(h.calls.length,0);
});
test('orphaned previous controller can be reclaimed after its tab is gone',async()=>{
 const previous={kind:'REFRESH',runId:'old',tabId:12,
  controlTabId:77,status:'OPEN',openedAt:Date.now()-1000,
  expiresAt:Date.now()+60000};
 const h=harness(false,{'boss-raw-event-gate-v1':previous},
  [{id:78,url:'chrome-extension://ext/actions/refresh/refresh.html?expect=2',
   title:'Refresh · ARMING_TAB_RESPONSE'}]);
 const result=await h.begin('REFRESH',{controlTabId:78});
 assert.equal(result.status,'OPEN');
 assert.equal(h.storage.get('boss-raw-event-gate-v1').runId,'run-one');
 assert.equal(h.calls.length,0);
});


test('Refresh and Scroll create separate response files in one date/list directory',async()=>{
 const refresh=harness();await refresh.begin();await refresh.accept(refresh.msg(1));
 assert.equal((await refresh.finish()).status,'AUTHORIZED_ONCE');
 const scroll=harness();await scroll.begin('SCROLL');await scroll.bottom();
 await scroll.accept(scroll.msg(2));
 const gate=scroll.storage.get('boss-raw-event-gate-v1'),now=Date.now();
 const data=scroll.storage.get('boss-raw-downloads-v2');
 data.records[0].receivedAt=now-1500;
 scroll.storage.set('boss-raw-downloads-v2',data);
 scroll.storage.set('boss-raw-event-gate-v1',{...gate,openedAt:now-10000,
  bottomAt:now-5001,deadline:now-1});
 assert.equal((await scroll.finish('SCROLL')).status,'AUTHORIZED_ONCE');
 const a=refresh.calls[0].filename.split('/'),b=scroll.calls[0].filename.split('/');
 assert.deepEqual(a.slice(0,3),b.slice(0,3));
 assert.deepEqual(a.slice(0,1),['BOSS']);
 assert.equal(a[2],'list');
 assert.equal(a.length,4);
 assert.equal(b.length,4);
 assert.notEqual(a[3],b[3]);
});


test('Scroll throttle: accept first, reject bursts without queuing or changing gate',async()=>{
 const h=harness(false,{},[{id:88,url:'chrome-extension://ext/actions/scroll/scroll.html'}]);
 const first=await h.begin('SCROLL',{runId:'first',controlTabId:88});
 assert.equal(first.status,'OPEN');
 const snapshot=structuredClone(h.storage.get('boss-raw-event-gate-v1'));
 assert.ok(Number.isSafeInteger(snapshot.lastScrollAt));
 const attempts=await Promise.all(Array.from({length:9},(_,i)=>
  h.begin('SCROLL',{runId:'burst-'+i,controlTabId:88+i})));
 assert.ok(attempts.every(x=>x.ok===false&&x.status==='OTHER_ACTION_OPEN'));
 assert.deepEqual(h.storage.get('boss-raw-event-gate-v1'),snapshot);
 assert.equal(h.calls.length,0);
});

test('Scroll throttle: enforce 5-second start interval after aborted action, no queue',async()=>{
 const h=harness();
 assert.equal((await h.begin('SCROLL')).status,'OPEN');
 const gate=h.storage.get('boss-raw-event-gate-v1');
 assert.equal((await h.finish('SCROLL','doc-12345678-abcd',true)).status,'ABORTED');
 const denied=await h.begin('SCROLL',{runId:'immediate'});
 assert.equal(denied.status,'SCROLL_THROTTLED');
 assert.equal(denied.ok,false);
 assert.ok(denied.retryAfterMs>0&&denied.retryAfterMs<=5000);
 assert.equal(h.storage.get('boss-raw-event-gate-v1').lastScrollAt,gate.lastScrollAt);
 assert.equal(h.calls.length,0);
 // At the exact boundary, another action is allowed without waiting in a queue.
 h.storage.set('boss-raw-event-gate-v1',{
  ...h.storage.get('boss-raw-event-gate-v1'),lastScrollAt:Date.now()-5000});
 assert.equal((await h.begin('SCROLL',{runId:'after-five-seconds'})).status,'OPEN');
 assert.equal(h.storage.get('boss-raw-event-gate-v1').runId,'after-five-seconds');
});

test('Scroll throttle timestamp survives Refresh and extension worker restart',async()=>{
 const h=harness();
 assert.equal((await h.begin('SCROLL')).status,'OPEN');
 assert.equal((await h.finish('SCROLL','doc-12345678-abcd',true)).status,'ABORTED');
 const last=h.storage.get('boss-raw-event-gate-v1').lastScrollAt;
 assert.equal((await h.begin('REFRESH',{runId:'refresh-after-scroll'})).status,'OPEN');
 assert.equal(h.storage.get('boss-raw-event-gate-v1').lastScrollAt,last);
 const restarted=harness(false,Object.fromEntries(h.storage));
 const denied=await restarted.begin('SCROLL',{runId:'new-worker-scroll'});
 assert.equal(denied.status,'SCROLL_THROTTLED');
 assert.equal(restarted.storage.get('boss-raw-event-gate-v1').lastScrollAt,last);
});

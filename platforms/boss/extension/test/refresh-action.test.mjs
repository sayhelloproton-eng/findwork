
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const base=path.resolve(import.meta.dirname,'..');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');
function mock({hasResponse=true,selected=true,allow=true,exists=true,settled=true,hookInitiallyReady=true,hookRemainsLost=false,initialList='ok',missingListPending=false,stabilityResult=true,alreadySelected=false}={}){
 const actions=[],events=[],commits=[],loads=[],storageListeners=[],expectationFunctions=[],stabilityFunctions=[];
 const doc='doc-12345678-abcd';let resolveQuiet,readCount=0,hookRecovered=false,clicked=false;
 const persisted=new Map();
 const initialEvidence=()=>initialList==='ok'||initialList==='late'&&readCount>=2?
  [{docId:doc,requestId:2,kind:'response',
    path:'/wapi/zpgeek/pc/recommend/job/list.json',
    httpStatus:200,inspection:'json'}]:
  initialList==='wrong-doc'?[{docId:'doc-incorrect1234',requestId:2,
   kind:'response',path:'/wapi/zpgeek/pc/recommend/job/list.json',
   httpStatus:200,inspection:'json'}]:
  initialList==='wrong-path'?[{docId:doc,requestId:2,kind:'response',
   path:'/wapi/other.json',httpStatus:200,inspection:'json'}]:
  initialList==='failure'?[{docId:doc,requestId:2,kind:'response',
   path:'/wapi/zpgeek/pc/recommend/job/list.json',
   httpStatus:500,inspection:'json'}]:[];
 const quiet=new Promise(resolve=>{resolveQuiet=resolve;});
 const chrome={
  tabs:{getCurrent:async()=>({id:5}),
   query:async()=>[{id:12,url:'https://www.zhipin.com/web/geek/jobs'}],
   reload:async id=>{
    actions.push('RELOAD:'+id);
    queueMicrotask(()=>{
     for(const f of commits)f({tabId:id,frameId:0,
      url:'https://www.zhipin.com/web/geek/jobs',documentId:'new-doc'});
     for(const f of loads)f({tabId:id,frameId:0,
      url:'https://www.zhipin.com/web/geek/jobs',documentId:'new-doc'});
    });
   },
   sendMessage:async(_id,msg)=>{
    actions.push('OBSERVER:'+msg.type);
    if(msg.type==='BOSS_OBSERVER_PROBE_HOOK'){
     hookRecovered=!hookRemainsLost;
     return{ok:true,hookReady:!hookRemainsLost,
      probeStatus:hookRemainsLost?'HOOK_OWNERSHIP_LOST':'READY',
      domReady:true,hookDocId:doc,...(missingListPending?{}:{listPending:0}),pending:0,cursor:2,
      events:initialEvidence()};
    }
    if(msg.type==='BOSS_OBSERVER_READ'){
     readCount++;
     return{ok:true,hookReady:hookInitiallyReady||hookRecovered,domReady:true,
      hookDocId:doc,pending:0,...(missingListPending?{}:{listPending:0}),cursor:2,
      events:initialEvidence()};
    }
    return{ok:true,settled,hookDocId:doc};
   },
   remove:async id=>actions.push('CLOSE:'+id)},
  webNavigation:{onCommitted:{addListener:f=>commits.push(f),
   removeListener:f=>commits.splice(commits.indexOf(f),1)},
   onCompleted:{addListener:f=>loads.push(f),
    removeListener:f=>loads.splice(loads.indexOf(f),1)}},
  storage:{onChanged:{addListener:f=>storageListeners.push(f),
    removeListener:f=>{const i=storageListeners.indexOf(f);
     if(i>=0)storageListeners.splice(i,1);}},
   local:{get:async key=>({[key]:persisted.get(key)||{records:[]}}),
    set:async rows=>{for(const [k,v] of Object.entries(rows))persisted.set(k,v);}}},
  scripting:{executeScript:async args=>{
   if(!args.args){stabilityFunctions.push(args.func);actions.push('QUIET');await quiet;return[{result:stabilityResult}];}
   expectationFunctions.push(args.func);
   if(args.args[1]==='VERIFY'){
    actions.push('VERIFY');const ok=selected&&(alreadySelected||clicked);
    return[{result:{ok,reason:ok?'SELECTED':'EXPECT_NOT_SELECTED'}}];
   }
   actions.push('CLICK:'+args.args[0]);clicked=true;
   if(hasResponse)queueMicrotask(()=>{
    for(const f of [...storageListeners])f({
     'boss-raw-downloads-v2':{newValue:{records:[{
      status:'HELD',gateRunId:'run-test',
      raw:{metadata:{docId:doc,tabId:12,requestId:3}}
     }]}}
    },'local');
   });
   return[{result:{ok:selected,reason:selected?'SELECTED':'EXPECT_NOT_SELECTED'}}];
  }},
  runtime:{sendMessage:async m=>{
   events.push(m);actions.push('WORKER:'+m.event);
   if(m.event==='BEFORE_REFRESH')return{ok:allow,gate:allow?'OPEN':'OTHER_ACTION_OPEN'};
   if(m.event==='REFRESH_WINDOW_ABORT')return{ok:true,status:'ABORTED'};
   return{ok:true,gate:'AUTHORIZED_ONCE',
    download:{downloadId:7,filename:'BOSS/demo.json'}};
  }},
  downloads:{onChanged:{addListener:()=>{},removeListener:()=>{}},
   search:async()=>[{id:7,state:'complete',exists,
    filename:'/tmp/test/Downloads/BOSS/demo.json'}]}
 };
 const state={title:'Refresh'};
 const vmCtx=vm.createContext({chrome,document:state,Date,URL,queueMicrotask,
  location:{href:'chrome-extension://ext/actions/refresh/refresh.html?expect=2'},
  crypto:{randomUUID:()=> 'run-test'},
  setTimeout:(fn,ms)=>ms===12000&&(!hasResponse||initialList==='none'||
   initialList==='wrong-doc'||initialList==='wrong-path'||initialList==='failure')?
   (queueMicrotask(fn),0):setTimeout(fn,ms),
  clearTimeout});
 async function start(){vm.runInContext(source('actions/refresh/refresh.js'),vmCtx);
  for(let i=0;i<6;i++)await new Promise(setImmediate);}
 async function finish(){resolveQuiet();
  for(let i=0;i<12;i++)await new Promise(setImmediate);}
 return{actions,events,state,expectationFunctions,stabilityFunctions,start,finish};
}
test('Refresh arms before reload, clicks after quiet and downloads once',async()=>{
 const h=mock();await h.start();
 assert.deepEqual(h.actions,['WORKER:BEFORE_REFRESH','RELOAD:12','OBSERVER:BOSS_OBSERVER_READ','QUIET']);
 await h.finish();
 const at=x=>h.actions.indexOf(x);
 assert.ok(at('WORKER:BEFORE_REFRESH')<at('RELOAD:12'));
 assert.ok(at('QUIET')<at('CLICK:2'));
 assert.ok(at('CLICK:2')<at('WORKER:REFRESH_SUCCESS'));
 assert.equal(h.actions.filter(x=>x==='RELOAD:12').length,1);
 assert.equal(h.actions.at(-1),'CLOSE:5');
 assert.equal(h.events[0].hookDocId,undefined);
 assert.equal(h.events[0].minRequestId,undefined);
});
test('Refresh gate refusal prevents clicking and download',async()=>{
 const h=mock({allow:false});await h.start();await h.finish();
 assert.equal(h.actions.some(x=>x.startsWith('CLICK:')),false);
 assert.match(h.state.title,/OTHER_ACTION_OPEN/);
});
test('a failed expectation click never approves downloaded data',async()=>{
 const h=mock({selected:false});await h.start();await h.finish();
 assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
 assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
});
test('missing natural response fails without extra Reload or download',async()=>{
 const h=mock({hasResponse:false});await h.start();await h.finish();
 assert.equal(h.state.title,'Refresh · TARGET_EXPECT_LIST_RESPONSE_NOT_OBSERVED');
 assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
 assert.equal(h.actions.filter(x=>x==='RELOAD:12').length,1);
});
test('unsettled response cannot finalize',async()=>{
 const h=mock({settled:false});await h.start();await h.finish();
 assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
 assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
});
test('downloaded file must exist before close',async()=>{
 const h=mock({exists:false});await h.start();await h.finish();
 assert.equal(h.state.title,'Refresh · FILE_NOT_CONFIRMED');
 assert.ok(!h.actions.some(x=>x.startsWith('CLOSE:')));
});
test('entry is non-invasive and preserves separate native Reload action',()=>{
 assert.equal(source('actions/reload/reload.js').trim(),'chrome.runtime.reload();');
 assert.doesNotMatch(source('actions/refresh/refresh.js'),/\bfetch\s*\(|XMLHttpRequest\s*\(/);
 assert.match(source('actions/refresh/refresh.js'),/BOSS_OBSERVER_WAIT_LIST/);
 assert.match(JSON.parse(source('manifest.json')).version,/^1\.1\.\d+$/);
});

test('missed initial hook handshake is recovered before arming Tab click',async()=>{
 const h=mock({hookInitiallyReady:false,initialList:'late'});
 await h.start();await h.finish();
 const at=x=>h.actions.indexOf(x);
 assert.ok(at('OBSERVER:BOSS_OBSERVER_READ')<at('OBSERVER:BOSS_OBSERVER_PROBE_HOOK'));
 assert.ok(at('OBSERVER:BOSS_OBSERVER_PROBE_HOOK')<at('CLICK:2'));
 assert.ok(at('WORKER:BEFORE_REFRESH')<at('RELOAD:12'));
 assert.equal(h.actions.at(-1),'CLOSE:5');
});

test('no initial list response aborts initial gate without clicks after page load',async()=>{
 const h=mock({initialList:'none'});await h.start();await h.finish();
 assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
 assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
 assert.equal(h.actions.includes('WORKER:REFRESH_SUCCESS'),false);
 assert.equal(h.actions.some(x=>x.startsWith('CLICK:')),false);
 assert.equal(h.actions.includes('QUIET'),false);
 assert.equal(h.state.title,'Refresh · INITIAL_LIST_RESPONSE_NOT_OBSERVED');
});
test('delayed initial response is observed before DOM stability and Tab click',async()=>{
 const h=mock({initialList:'late'});await h.start();
 assert.ok(h.actions.includes('QUIET'));
 assert.ok(!h.actions.some(x=>x.startsWith('CLICK:')));
 await h.finish();
 const at=x=>h.actions.indexOf(x);
 assert.ok(at('OBSERVER:BOSS_OBSERVER_READ')<at('QUIET'));
 assert.ok(at('WORKER:BEFORE_REFRESH')<at('RELOAD:12'));
 assert.ok(at('QUIET')<at('CLICK:2'));
 assert.equal(h.actions.at(-1),'CLOSE:5');
});
test('initial response from old document, wrong API or failed HTTP is not accepted',async()=>{
 for(const initialList of ['wrong-doc','wrong-path','failure']){
  const h=mock({initialList});await h.start();await h.finish();
  assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
  assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
  assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
  assert.equal(h.actions.some(x=>x.startsWith('CLICK:')),false);
  assert.equal(h.state.title,'Refresh · INITIAL_LIST_RESPONSE_NOT_OBSERVED');
 }
});

test('Hook ownership loss with proven new-document initial JSON does not block Refresh',async()=>{
 const h=mock({hookInitiallyReady:false,hookRemainsLost:true,initialList:'ok'});
 await h.start();await h.finish();
 const at=x=>h.actions.indexOf(x);
 assert.equal(h.actions.includes('OBSERVER:BOSS_OBSERVER_PROBE_HOOK'),false);
 assert.ok(at('WORKER:BEFORE_REFRESH')<at('RELOAD:12'));
 assert.ok(at('QUIET')<at('CLICK:2'));
 assert.equal(h.actions.at(-1),'CLOSE:5');
});
test('Hook ownership loss without observed initial JSON never clicks or downloads',async()=>{
 const h=mock({hookInitiallyReady:false,hookRemainsLost:true,initialList:'none'});
 await h.start();await h.finish();
 assert.ok(h.actions.includes('OBSERVER:BOSS_OBSERVER_PROBE_HOOK'));
 assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
 assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
 assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
 assert.ok(!h.actions.includes('CLICK:2'));
 assert.match(h.state.title,/INITIAL_LIST_RESPONSE_NOT_OBSERVED/);
});
test('Hook ownership loss after delayed real initial JSON is governed by evidence',async()=>{
 const h=mock({hookInitiallyReady:false,hookRemainsLost:true,initialList:'late'});
 await h.start();await h.finish();
 assert.ok(h.actions.includes('OBSERVER:BOSS_OBSERVER_PROBE_HOOK'));
 assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
 assert.equal(h.actions.at(-1),'CLOSE:5');
});

test('Tab selection and verification reuse one injected DOM contract; VERIFY cannot click',async()=>{
 const h=mock();await h.start();await h.finish();
 assert.equal(h.expectationFunctions.length,3);
 assert.ok(h.expectationFunctions.every(x=>x.toString()===h.expectationFunctions[0].toString()));
 let clicks=0;
 const recommended={click:()=>{clicks++;}};
 const wishes=[{classList:{contains:()=>false},click:()=>{clicks++;}},
  {classList:{contains:name=>name==='active'},click:()=>{clicks++;}}];
 const root={querySelector:()=>recommended,querySelectorAll:()=>wishes};
 const doc={querySelector:()=>root,querySelectorAll:()=>[root]};
 const fn=vm.runInNewContext('('+h.expectationFunctions[0].toString()+')',{
  location:{origin:'https://www.zhipin.com',pathname:'/web/geek/jobs'},
  document:doc,MutationObserver:class{}
 });
 assert.equal((await fn(2,'VERIFY')).ok,true);
 assert.equal(clicks,0);
 assert.equal((await fn(2,'UNKNOWN')).reason,'INVALID_EXPECT_ACTION');
 assert.equal(clicks,0);
 assert.equal((await fn(3,'VERIFY')).reason,'EXPECT_OPTION_MISSING');
 assert.equal(clicks,0);
});

test('generic pending=0 cannot stand in for missing listPending evidence',async()=>{
 const h=mock({missingListPending:true});
 await h.start();await h.finish();
 assert.equal(h.state.title,'Refresh · INITIAL_LIST_NOT_SETTLED');
 assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
  assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
  assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
 assert.equal(h.actions.some(x=>x.startsWith('CLICK:')),false);
});


test('page stability expiry aborts initial gate without clicking the Tab',async()=>{
 const h=mock({stabilityResult:false});
 await h.start();await h.finish();
 assert.equal(h.state.title,'Refresh · PAGE_NOT_STABLE');
 assert.ok(h.actions.includes('WORKER:BEFORE_REFRESH'));
  assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
  assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
 assert.equal(h.actions.some(x=>x.startsWith('CLICK:')),false);
});

test('injected page stability releases both observers and timers on success and expiry',async()=>{
 const h=mock();await h.start();
 assert.equal(h.stabilityFunctions.length,1);
 for(const mode of ['success','expiry']){
  let now=0,id=0,mutationDisconnected=0,performanceDisconnected=0;
  const intervals=new Map(),timeouts=new Map(),root={};
  const doc={body:root,readyState:'complete',
   querySelector:selector=>selector==='.job-list-container'?root:
    selector==='.c-expect-select'&&mode==='success'?{}:null,
   querySelectorAll:()=>({length:0})};
  const code=h.stabilityFunctions[0].toString();
  const injected=vm.runInNewContext('('+code+')',{
   Date:{now:()=>now},document:doc,URL,
   location:{href:'https://www.zhipin.com/web/geek/jobs'},
   MutationObserver:class{observe(){}disconnect(){mutationDisconnected++;}},
   PerformanceObserver:class{observe(){}disconnect(){performanceDisconnected++;}},
   setInterval:(fn,ms)=>{intervals.set(++id,{fn,ms});return id;},
   clearInterval:key=>intervals.delete(key),
   setTimeout:(fn,ms)=>{timeouts.set(++id,{fn,ms});return id;},
   clearTimeout:key=>timeouts.delete(key)
  });
  const waiting=injected();
  assert.equal(intervals.size,1);
  assert.equal(timeouts.size,1);
  if(mode==='success'){
   const tick=[...intervals.values()][0].fn;
   tick();now=1000;tick();
   assert.equal(await waiting,true);
  }else{
   const expiry=[...timeouts.values()][0];
   assert.equal(expiry.ms,14500);
   expiry.fn();
   assert.equal(await waiting,false);
  }
  assert.equal(mutationDisconnected,1);
  assert.equal(performanceDisconnected,1);
  assert.equal(intervals.size,0);
  assert.equal(timeouts.size,0);
 }
 await h.finish();
});

test('selected expectation reuses real first List and does not click again',async()=>{
 const h=mock({alreadySelected:true,hasResponse:false});
 await h.start();await h.finish();
 assert.ok(h.actions.includes('WORKER:REFRESH_SUCCESS'));
 assert.ok(!h.actions.some(x=>x.startsWith('CLICK:')));
 assert.equal(h.actions.at(-1),'CLOSE:5');
 const s=source('actions/refresh/refresh.js');
 assert.match(s,/INITIAL_GATE_OPEN/);
 assert.match(s,/EXPECT_ALREADY_SELECTED/);
 assert.doesNotMatch(s,/primeAlreadySelected/);
});
test('not selected expectation requires new response after click',async()=>{
 const h=mock({alreadySelected:false,hasResponse:false});
 await h.start();await h.finish();
 assert.ok(h.actions.includes('CLICK:2'));
 assert.ok(h.actions.includes('WORKER:REFRESH_WINDOW_ABORT'));
 assert.ok(!h.actions.includes('WORKER:REFRESH_SUCCESS'));
});

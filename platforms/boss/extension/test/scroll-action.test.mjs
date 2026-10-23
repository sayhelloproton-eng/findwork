
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const base=path.resolve(import.meta.dirname,'..');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');
const url='https://www.zhipin.com/web/geek/jobs';
function mock({already=false,refuse=false,throwInjection=false,workerNoReply=false,hookReady=true,noResponse=false,exists=true,bossActivationFails=false,foreignWindow=false,gateDeniedStatus=null}={}){
 const actions=[],events=[],title={title:'BOSS Observer · Scroll'};
 let position=already?3100:0;
 const scroller={scrollHeight:4000,clientHeight:900};
 Object.defineProperty(scroller,'scrollTop',{
  get:()=>position,set:value=>{if(!refuse)position=value;}
 });
 const frameContext={
  document:{scrollingElement:scroller},
  window:{scrollY:scroller.scrollTop,scrollTo:({top,behavior})=>{
   actions.push('SCROLL:'+top+':'+behavior);
   if(!refuse){scroller.scrollTop=top;frameContext.window.scrollY=top;}
  }},
  requestAnimationFrame:f=>f()
 };
 const scrollFn=vm.runInNewContext(source('actions/scroll/scroll-bottom.js')+';bossScrollToBottom',frameContext);
 const chrome={
  tabs:{getCurrent:async()=>({id:7,windowId:20}),
   query:async()=>[{id:12,url,windowId:foreignWindow?21:20}],
   update:async(id,opts)=>{
    actions.push('ACTIVATE:'+id);
    if(id===12&&bossActivationFails)throw Error('NOT_ACTIVATED');
    return{id,active:opts.active};
   },
   sendMessage:async()=>({ok:true,hookReady,hookDocId:'doc-12345678-abcd'}),
   remove:async id=>actions.push('CLOSE:'+id)},
  windows:{update:async id=>{actions.push('FOCUS:'+id);return{id,focused:true};}},
  scripting:{executeScript:async args=>{
   assert.equal(args.target.tabId,12);
   assert.equal(args.world,'ISOLATED');
   assert.equal(args.func.name,'bossScrollToBottom');
   if(throwInjection)throw Error('INJECTION_UNAVAILABLE');
   return [{frameId:0,result:await scrollFn()}];
  }},
  runtime:{sendMessage:x=>{events.push(x);
   return workerNoReply?Promise.resolve({ok:false}):
    x.event==='SCROLL_WINDOW_BEGIN'&&gateDeniedStatus?
    Promise.resolve({ok:false,status:gateDeniedStatus}):
    Promise.resolve({ok:true,status:x.event==='SCROLL_WINDOW_END'?
     noResponse?'NO_ELIGIBLE_RESPONSE':'AUTHORIZED_ONCE':'OPEN',
    download:x.event==='SCROLL_WINDOW_END'&&!noResponse?{
     downloadId:8,filename:'BOSS/2026-10-20/job-list-doc-12345678-abcd-2.json'
    }:null});}},
  downloads:{onChanged:{addListener:()=>{},removeListener:()=>{}},
   search:async()=>[{id:8,state:'complete',exists,filename:
    '/tmp/test/Downloads/BOSS/2026-10-20/job-list-doc-12345678-abcd-2.json'}]}
 };
 async function run(){
  vm.runInNewContext(source('actions/scroll/scroll.js'),{chrome,URL,Date,document:title,bossScrollToBottom:scrollFn,
   crypto:{randomUUID:()=> 'run-a'},setTimeout:(fn,ms)=>{if(ms===5000)queueMicrotask(fn);return 1;},clearTimeout:()=>{}});
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 }
 return{run,actions,events,title,scroller};
}
test('one scroll action opens and closes exactly one five-second window',async()=>{
 const m=mock();await m.run();
 assert.deepEqual(m.actions,['ACTIVATE:12','FOCUS:20',
  'SCROLL:3100:instant','ACTIVATE:7','CLOSE:7']);
 assert.equal(m.scroller.scrollTop,3100);
 assert.deepEqual(m.events.map(x=>x.event),
  ['SCROLL_WINDOW_BEGIN','SCROLL_BOTTOM_REACHED','SCROLL_WINDOW_END']);
 assert.deepEqual({...m.events[1].details},{before:0,after:3100,bottom:3100});
 assert.equal(m.events[2].hookDocId,'doc-12345678-abcd');
 assert.equal(new Set(m.events.map(x=>x.runId)).size,1);
});
test('already at bottom emits one event',async()=>{
 const m=mock({already:true});await m.run();
 assert.equal(m.events.length,3);
 assert.equal(m.events[1].details.after,3100);
});
test('cannot reach bottom: no event, control stays and shows actual positions',async()=>{
 const m=mock({refuse:true});await m.run();
 assert.deepEqual(m.events.map(x=>x.event),['SCROLL_WINDOW_BEGIN','SCROLL_WINDOW_ABORT']);
 assert.deepEqual(m.actions,['ACTIVATE:12','FOCUS:20',
  'SCROLL:3100:instant','ACTIVATE:7']);
 assert.equal(m.title.title,'Scroll · 0 / 3100');
});
test('injection error: never invent success; control page names the blocker',async()=>{
 const m=mock({throwInjection:true});await m.run();
 assert.deepEqual(m.events.map(x=>x.event),['SCROLL_WINDOW_BEGIN','SCROLL_WINDOW_ABORT']);
 assert.equal(m.title.title,'Scroll · INJECTION_UNAVAILABLE');
 assert.equal(m.actions.at(-1),'ACTIVATE:7');
});
test('worker recorder passively writes the scroll event',async()=>{
 const stored=new Map();
 const chrome={runtime:{id:'ext',getURL:x=>'chrome-extension://ext/'+x},
  storage:{local:{set:async rows=>{
   for(const[k,v] of Object.entries(rows))stored.set(k,structuredClone(v));}}}};
 const context=vm.createContext({chrome,Date});
 vm.runInContext(source('actions/scroll/scroll-event-recorder.js'),context);
 const result=await context.BossScrollEvents.record({
  type:'BOSS_SCROLL_EVENT',event:'SCROLL_BOTTOM_REACHED',
  runId:'run-a',tabId:12,details:{before:0,after:3100,bottom:3100}},
  {id:'ext',url:'chrome-extension://ext/actions/scroll/scroll.html'});
 assert.equal(result.ok,true);
 assert.equal(stored.get('boss-scroll-event-log-v1').status,'COMPLETED');
});
test('modular boundaries and Reload/Refresh kept intact',()=>{
 assert.match(source('actions/scroll/scroll.html'),/src="scroll-bottom.js"/);
 assert.match(source('auto-entry.js'),/scroll-event-recorder\.js/);
 assert.doesNotMatch(source('actions/scroll/scroll.js'),/fetch\(|XMLHttpRequest|PerformanceObserver|MutationObserver|BossFlowControl/);
 assert.equal(source('actions/reload/reload.js').trim(),'chrome.runtime.reload();');
 assert.match(JSON.parse(source('manifest.json')).version,/^1\.1\.\d+$/);
});

test('Scroll uses observed response document even if readiness self-check is false',async()=>{
 const h=mock({hookReady:false});await h.run();
 assert.equal(h.events.at(-1).hookDocId,'doc-12345678-abcd');
 assert.equal(h.actions.at(-1),'CLOSE:7');
});
test('Scroll without response keeps control page visible instead of silent close',async()=>{
 const h=mock({noResponse:true});await h.run();
 assert.equal(h.events.at(-1).event,'SCROLL_WINDOW_END');
 assert.ok(!h.actions.some(x=>x==='CLOSE:7'));
});

test('Scroll targets scrollable job-list ancestor, not inert document',async()=>{
 let innerPos=0,documentPos=0;
 const list={scrollHeight:3000,clientHeight:800,scrollTop:0};
 const inner={scrollHeight:4200,clientHeight:800,
  get scrollTop(){return innerPos;},set scrollTop(v){innerPos=v;},parentElement:null};
 list.parentElement=inner;
 const page={scrollHeight:900,clientHeight:900,
  get scrollTop(){return documentPos;},set scrollTop(v){documentPos=v;}};
 const scope={
  document:{scrollingElement:page,documentElement:page,body:{},
   querySelector:s=>s==='.rec-job-list'?list:null},
  window:{scrollTo:()=>{throw Error('DOCUMENT_MUST_NOT_SCROLL');}},
  getComputedStyle:el=>({overflowY:el===inner?'auto':'visible'}),
  requestAnimationFrame:f=>f()
 };
 const fn=vm.runInNewContext(source('actions/scroll/scroll-bottom.js')+';bossScrollToBottom',scope);
 const result=await fn();
 assert.equal(result.reached,true);
 assert.equal(result.owner,'JOB_LIST_ANCESTOR');
 assert.equal(innerPos,3400);
 assert.equal(documentPos,0);
});


test('Scroll cannot close its controller until the downloaded file exists',async()=>{
 const m=mock({exists:false});await m.run();
 assert.equal(m.title.title,'Scroll · FILE_NOT_CONFIRMED');
 assert.ok(!m.actions.includes('CLOSE:7'));
 assert.equal(m.events.at(-1).event,'SCROLL_WINDOW_END');
});
test('Scroll carries its controller identity and avoids background animation frames',async()=>{
 const m=mock();await m.run();
 assert.ok(m.events.every(event=>event.controlTabId===7));
 assert.doesNotMatch(source('actions/scroll/scroll-bottom.js'),/requestAnimationFrame\s*\(/);
});


test('Scroll never arms, scrolls, or downloads when BOSS tab cannot be activated',async()=>{
 const m=mock({bossActivationFails:true});await m.run();
 assert.deepEqual(m.actions,['ACTIVATE:12']);
 assert.deepEqual(m.events,[]);
 assert.equal(m.title.title,'Scroll · BOSS_TAB_ACTIVATION_FAILED');
});

test('Scroll keeps BOSS active until the 5-second window expires, then restores control',async()=>{
 const m=mock({noResponse:true,foreignWindow:true});await m.run();
 assert.deepEqual(m.actions,['ACTIVATE:12','FOCUS:21',
  'SCROLL:3100:instant','ACTIVATE:7','FOCUS:20']);
 assert.deepEqual(m.events.map(e=>e.event),[
  'SCROLL_WINDOW_BEGIN','SCROLL_BOTTOM_REACHED','SCROLL_WINDOW_END']);
 assert.equal(m.title.title,'Scroll · NO_JOB_LIST_RESPONSE_IN_5S');
});


test('throttled Scroll shows explicit status and never injects a scroll or opens a window',async()=>{
 const m=mock({gateDeniedStatus:'SCROLL_THROTTLED'});await m.run();
 assert.deepEqual(m.actions,['ACTIVATE:12','FOCUS:20','ACTIVATE:7']);
 assert.deepEqual(m.events.map(x=>x.event),['SCROLL_WINDOW_BEGIN']);
 assert.equal(m.title.title,'Scroll · SCROLL_THROTTLED');
});

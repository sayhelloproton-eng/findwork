import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync(new URL('../core/findwork/collection-launch.js',import.meta.url),'utf8');
const KEY='boss-findwork-collection-launch-v1',RUN='boss-dom-detail-sequence-v1';
const entry='chrome-extension://synthetic/actions/detail/dom.html';
function scene({initial={},tabs=[]}={}){
 const stored=structuredClone(initial),calls=[],handlers=[];let id=20,failAfterCreate=false;
 const chrome={runtime:{id:'synthetic',getURL:p=>'chrome-extension://synthetic/'+p,onMessage:{addListener:f=>handlers.push(f)}},storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(stored[k])])),set:async v=>Object.assign(stored,structuredClone(v))}},tabs:{query:async()=>structuredClone(tabs),create:async data=>{const tab={id:++id,...data};calls.push({operation:'create',...tab});tabs.push(tab);if(failAfterCreate)throw Error('SYNTHETIC_LOST_OPEN_ACK');return tab;},update:async(tabId,data)=>{const tab=tabs.find(t=>t.id===tabId);Object.assign(tab,data);calls.push({operation:'update',...tab});return tab;}}};
 const ctx=vm.createContext({chrome,URL,URLSearchParams,Date});vm.runInContext(src,ctx);ctx.BossCollectionLaunch.install();
 const sender={id:'synthetic',url:'http://127.0.0.1:4318/',tab:{id:4,url:'http://127.0.0.1:4318/'}};
 const send=(m,s=sender)=>new Promise(resolve=>handlers[0](m,s,resolve));
 return{send,stored,calls,tabs,loseAck:()=>{failAfterCreate=true;}};
}
const launch={type:'COLLECTION_LAUNCH',expect:2,pages:20,requestId:'synthetic-request-0001'};
test('new collection opens only the formal extension entry and repeated same request never opens again',async()=>{
 const h=scene();const first=await h.send(launch);assert.equal(first.ok,true);assert.equal(h.calls.length,1);const u=new URL(h.calls[0].url);assert.equal(u.pathname,'/actions/detail/dom.html');assert.equal(u.searchParams.get('pages'),'20');assert.equal(u.searchParams.get('expect'),'2');assert.equal(u.searchParams.get('fresh'),'1');assert.equal((await h.send(launch)).tabId,first.tabId);assert.equal(h.calls.length,1);
});
test('completed prior control is reused, with no second controller tab',async()=>{
 const h=scene({initial:{[RUN]:{status:'COMPLETED',startedAt:'2026-10-26T00:00:00Z'}},tabs:[{id:7,url:entry+'?auto=1&pages=20',title:'Detail · COMPLETE'}]});assert.equal((await h.send(launch)).ok,true);assert.equal(h.calls[0].operation,'update');assert.equal(h.calls[0].id,7);assert.equal(h.tabs.length,1);
});
test('active collection, unresolved downloads, communication queue and multiple control pages all block without navigation',async()=>{
 for(const opts of [{initial:{[RUN]:{status:'RUNNING'}}},{initial:{'boss-natural-detail-v1':{records:{x:{status:'IN_PROGRESS'}}}}},{initial:{'boss-greet-queue-v1':{queue:[{id:'synthetic'}]}}},{initial:{'boss-resume-delivery-v1':{active:{jobId:'synthetic'}}}},{tabs:[{id:7,url:entry},{id:8,url:entry+'?auto=1'}]}]){const h=scene(opts);assert.equal((await h.send(launch)).ok,false);assert.equal(h.calls.length,0);}
});
test('opening the next batch is blocked until the first controller actually reports its run',async()=>{
 const h=scene();await h.send(launch);const next={...launch,requestId:'synthetic-request-0002'};assert.equal((await h.send(next)).reason,'COLLECTION_START_PENDING');assert.equal(h.calls.length,1);
 h.stored[RUN]={status:'COMPLETED',requestId:launch.requestId,startedAt:h.stored[KEY].startedAt};assert.equal((await h.send(next)).ok,true);assert.equal(h.calls[1].operation,'update');assert.equal(h.tabs.length,1);
});
test('lost tabs.create acknowledgement reconciles exact request URL without creating another page',async()=>{
 const h=scene();h.loseAck();assert.equal((await h.send(launch)).ok,true);assert.equal((await h.send(launch)).ok,true);assert.equal(h.calls.length,1);
});
test('worker interrupted while OPENING does not blindly repeat an unconfirmed tab effect',async()=>{
 const h=scene({initial:{[KEY]:{...launch,status:'OPENING',startedAt:'2026-10-27T00:00:00Z'}}});assert.equal((await h.send(launch)).reason,'COLLECTION_OPEN_UNCONFIRMED');assert.equal((await h.send({...launch,requestId:'synthetic-other-0002'})).reason,'COLLECTION_OPEN_UNCONFIRMED');assert.equal(h.calls.length,0);
});
test('status is read-only, caller boundary and parameters cannot trigger BOSS navigation',async()=>{
 const h=scene();assert.equal((await h.send({type:'COLLECTION_LAUNCH_STATUS'})).canStart,true);assert.equal(h.calls.length,0);assert.equal((await h.send(launch,{id:'foreign',url:'https://example.invalid'})).reason,'INVALID_COLLECTION_CALLER');assert.equal((await h.send({...launch,pages:22})).reason,'INVALID_COLLECTION_PARAMETERS');assert.equal(h.calls.length,0);
});

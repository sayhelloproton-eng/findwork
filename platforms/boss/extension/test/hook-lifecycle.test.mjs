
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const DETAIL='/wapi/zpgeek/job/detail.json?x=1';
function harness(legacy=false){
 const logs=[],calls={fetch:0,open:0,send:0};
 class Xhr{
  constructor(){this.status=200;this.responseType='json';this.response={code:0};this.listeners=[];}
  addEventListener(type,fn){if(type==='loadend')this.listeners.push(fn);}
  open(){calls.open++;}
  send(){calls.send++;for(const fn of this.listeners)fn();}
 }
 const fetch=(...args)=>{calls.fetch++;return Promise.resolve({status:200,
  clone:()=>({text:async()=>JSON.stringify({code:0,details:'native'})})});};
 const s={URL,URLSearchParams,Date,Promise,XMLHttpRequest:Xhr,
  location:{origin:'https://www.zhipin.com',href:'https://www.zhipin.com/web/geek/jobs'},
  crypto:{randomUUID:()=> 'hook-test-unique'},fetch,
  addEventListener:()=>{},postMessage:m=>logs.push(m)};
 s.window=s;s.top=s;
 const ctx=vm.createContext(s);
 for(const name of ['core/network/normalizer.js','core/network/network-allowlist.js'])
  vm.runInContext(read(name),ctx);
 if(legacy){
  ctx.__bossDiagMainV1=Object.freeze({contract:'boss-observer-main.lifecycle.v1'});
  const old=ctx.fetch;
  ctx.fetch=(...args)=>{logs.push({type:'BOSS_DIAG_NET_V1',
   value:{docId:'doc-old',kind:'response'}});return old(...args);};
 }
 const inject=()=>vm.runInContext(read('core/network/main-hook.js'),ctx);
 return{ctx,Xhr,calls,logs,inject};
}
test('first install preserves native calls and captures two passive Detail responses',async()=>{
 const h=harness();h.inject();
 assert.equal(h.ctx.__bossDiagMainV3.status().hookOwnership,'OWNED');
 await h.ctx.fetch('/unrelated');
 assert.equal(h.logs.filter(x=>x.type==='BOSS_DIAG_NET_V1').length,0);
 await h.ctx.fetch(DETAIL);
 const x=new h.Xhr();x.open('GET',DETAIL);x.send();
 await new Promise(setImmediate);
 const v=h.logs.filter(x=>x.type==='BOSS_DIAG_NET_V1');
 assert.equal(v.filter(x=>x.value.kind==='request').length,2);
 assert.equal(v.filter(x=>x.value.kind==='response').length,2);
 assert.deepEqual(h.calls,{fetch:2,open:1,send:1});
});
test('repeat injection with valid ownership never wraps again',async()=>{
 const h=harness();h.inject();
 const functions=[h.ctx.fetch,h.Xhr.prototype.open,h.Xhr.prototype.send];
 h.inject();h.inject();
 assert.deepEqual([h.ctx.fetch,h.Xhr.prototype.open,h.Xhr.prototype.send],functions);
 await h.ctx.fetch(DETAIL);await new Promise(setImmediate);
 assert.equal(h.logs.filter(x=>x.value?.kind==='response').length,1);
});
test('old marker with overwritten all slots recovers and never double records v3 responses',async()=>{
 const h=harness(true);h.inject();
 const owner=h.ctx.__bossDiagMainV3;
 const f=h.ctx.fetch,o=h.Xhr.prototype.open,s=h.Xhr.prototype.send;
 h.ctx.fetch=function pageFetch(...args){return f(...args);};
 h.Xhr.prototype.open=function pageOpen(...args){return o.apply(this,args);};
 h.Xhr.prototype.send=function pageSend(...args){return s.apply(this,args);};
 assert.deepEqual(Object.values(owner.status().ownershipSlots),[false,false,false]);
 h.inject();assert.equal(owner.status().hookOwnership,'OWNED');
 await h.ctx.fetch(DETAIL);
 const x=new h.Xhr();x.open('GET',DETAIL);x.send();
 await new Promise(setImmediate);
 const rows=h.logs.filter(m=>m.value?.docId===owner.status().docId);
 assert.equal(rows.filter(m=>m.value.kind==='response').length,2);
 assert.deepEqual(h.calls,{fetch:1,open:1,send:1});
});
test('only the overwritten slot gets a new wrapper, other slots keep identity',()=>{
 const h=harness();h.inject();
 const [f,o,s]=[h.ctx.fetch,h.Xhr.prototype.open,h.Xhr.prototype.send];
 h.ctx.fetch=function pageFetch(...args){return f(...args);};
 h.inject();assert.equal(h.ctx.__bossDiagMainV3.status().hookOwnership,'OWNED');
 assert.notEqual(h.ctx.fetch,f);assert.equal(h.Xhr.prototype.open,o);
 assert.equal(h.Xhr.prototype.send,s);
});
test('recovery owner makes no BOSS network calls; observer gates to v3 document',()=>{
 const recovery=read('core/capture/hook-recovery.js');
 assert.doesNotMatch(recovery,/fetch\s*\(|\.click\(|\.reload\(/);
 assert.match(recovery,/BOSS_OBSERVER_PROBE_HOOK/);
 const bridge=read('core/capture/page-observer.js');
 assert.match(bridge,/m\.lifecycleV3===true/);
 assert.match(bridge,/v\.docId!==hookDocId/);
});

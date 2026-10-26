import test from 'node:test';import assert from 'node:assert/strict';import {requestCollection} from '../web/collection-launch.mjs';
function bridge(reply){
 const handlers=new Set(),calls=[];const target={location:{origin:'http://127.0.0.1:4318'},addEventListener:(_,f)=>handlers.add(f),removeEventListener:(_,f)=>handlers.delete(f),postMessage:m=>{calls.push(m);if(reply)queueMicrotask(()=>{for(const f of handlers)f({source:target,origin:target.location.origin,data:{type:'FINDWORK_COLLECTION_REPLY',requestId:m.requestId,extensionId:m.extensionId,result:reply}});});}};return{target,calls,handlers};
}
test('negative ACK and missing response are explicit, with listener cleanup and no automatic retry',async()=>{
 const denied=bridge({ok:false,reason:'COLLECTION_RUNNING'});await assert.rejects(requestCollection('FINDWORK_COLLECTION_LAUNCH',{requestId:'synthetic-request'},denied.target),e=>e.code==='COLLECTION_RUNNING');assert.equal(denied.calls.length,1);
 const lost=bridge();await assert.rejects(requestCollection('FINDWORK_COLLECTION_LAUNCH',{requestId:'synthetic-request'},lost.target,5),e=>e.code==='COLLECTION_BRIDGE_TIMEOUT');assert.equal(lost.calls.length,1);assert.equal(lost.handlers.size,0);
});
test('foreign origin, extension or request replies cannot confirm collection',async()=>{
 const h=bridge();const p=requestCollection('FINDWORK_COLLECTION_LAUNCH',{extensionId:'a'.repeat(32),requestId:'synthetic-request'},h.target,10);
 for(const f of h.handlers)for(const patch of [{origin:'https://foreign.invalid'},{data:{type:'FINDWORK_COLLECTION_REPLY',requestId:'another',extensionId:'a'.repeat(32),result:{ok:true}}},{data:{type:'FINDWORK_COLLECTION_REPLY',requestId:'synthetic-request',extensionId:'b'.repeat(32),result:{ok:true}}}])f({source:h.target,origin:h.target.location.origin,...patch});
 await assert.rejects(p,e=>e.code==='COLLECTION_BRIDGE_TIMEOUT');assert.equal(h.calls.length,1);
});

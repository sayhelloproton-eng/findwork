
/* MAIN world, passive Hook. Each document owns one v3 controller and one emitter. */
(()=>{
 'use strict';
 const C=BossCaptureCore;
 if(!C.target(location.href)||window!==window.top)return;
 const KEY='__bossDiagMainV3',contract='boss-observer-main.lifecycle.v3';
 const old=Object.getOwnPropertyDescriptor(globalThis,KEY);
 if(old){
  if(old.value?.contract===contract&&typeof old.value.recover==='function')old.value.recover();
  return;
 }
 const state={docId:'doc-'+crypto.randomUUID(),recoveries:0,slots:{fetch:null,open:null,send:null}};
 const meta=new WeakMap(),buffer=[];let seq=0;
 const watched=url=>C.target(location.href)&&BossNetworkAllowlist.shouldCapture(url);
 function emit(raw){
  const value=C.network({...raw,docId:state.docId});
  if(!value)return;
  if(buffer.length<200)buffer.push(value);
  window.postMessage({type:'BOSS_DIAG_NET_V1',version:C.VERSION,value},location.origin);
 }
 function base(url,method,body){return{url:String(url),method:String(method||'GET').toUpperCase(),
  body:C.parameters(body),requestId:++seq,ms:Date.now()};}
 function response(b,status,data,inspection){emit({...b,kind:'response',
  ms:Date.now(),httpStatus:status,durationMs:Date.now()-b.ms,...C.shape(data),
  inspection,responseBody:inspection==='json'?data:null});}
 async function inspect(b,r){
  if([403,429].includes(r.status)){response(b,r.status,null,'unreadable');return;}
  try{response(b,r.status,JSON.parse(await r.clone().text()),'json');}
  catch{response(b,r.status,null,'non-json');}
 }
 function status(){
  const slots={fetch:window.fetch===state.slots.fetch,
   open:XMLHttpRequest.prototype.open===state.slots.open,
   send:XMLHttpRequest.prototype.send===state.slots.send};
  const owned=Object.values(slots).every(Boolean);
  return{contract,version:C.VERSION,docId:state.docId,recoveries:state.recoveries,
   listenerReady:owned,hookOwnership:owned?'OWNED':'LOST',ownershipSlots:slots,
   legacyV1:!!Object.getOwnPropertyDescriptor(globalThis,'__bossDiagMainV1'),
   legacyV2:!!Object.getOwnPropertyDescriptor(globalThis,'__bossDiagMainV2')};
 }
 function recover(){
  // Do not touch owned slots. Delegates preserve pre-existing app wrappers.
  // Stale copies of our own wrappers become transparent if called downstream.
  if(window.fetch!==state.slots.fetch){
   const delegate=window.fetch;
   const wrapper=function(...args){
    if(state.slots.fetch!==wrapper)return delegate.apply(this,args);
    const input=args[0],url=typeof input==='string'||input instanceof URL?
     String(input):input?.url;
    if(!watched(url))return delegate.apply(this,args);
    const b=base(url,args[1]?.method||input?.method,args[1]?.body);
    emit({...b,kind:'request'});
    try{return delegate.apply(this,args).then(r=>{void inspect(b,r);return r;},
     e=>{emit({...b,kind:'failure',ms:Date.now(),inspection:'network-error'});throw e;});}
    catch(e){emit({...b,kind:'failure',ms:Date.now(),inspection:'network-error'});throw e;}
   };
   state.slots.fetch=wrapper;window.fetch=wrapper;
  }
  if(XMLHttpRequest.prototype.open!==state.slots.open){
   const delegate=XMLHttpRequest.prototype.open;
   const wrapper=function(method,url,...args){
    if(state.slots.open!==wrapper)return delegate.call(this,method,url,...args);
    const result=delegate.call(this,method,url,...args);
    meta.set(this,{url:String(url),method});return result;
   };
   state.slots.open=wrapper;XMLHttpRequest.prototype.open=wrapper;
  }
  if(XMLHttpRequest.prototype.send!==state.slots.send){
   const delegate=XMLHttpRequest.prototype.send;
   const wrapper=function(...args){
    if(state.slots.send!==wrapper)return delegate.apply(this,args);
    const info=meta.get(this);
    if(!info||!watched(info.url))return delegate.apply(this,args);
    const b=base(info.url,info.method,args[0]);emit({...b,kind:'request'});
    this.addEventListener('loadend',()=>{
     try{
      if(!this.status){emit({...b,kind:'failure',ms:Date.now(),inspection:'network-error'});return;}
      if(this.responseType==='json')response(b,this.status,this.response,'json');
      else if(this.responseType===''||this.responseType==='text'){
       let data;try{data=JSON.parse(this.responseText);}
       catch{response(b,this.status,null,'non-json');return;}
       response(b,this.status,data,'json');
      }else response(b,this.status,null,'unreadable');
     }catch{response(b,this.status,null,'unreadable');}
    },{once:true});
    try{return delegate.apply(this,args);}
    catch(e){emit({...b,kind:'failure',ms:Date.now(),inspection:'network-error'});throw e;}
   };
   state.slots.send=wrapper;XMLHttpRequest.prototype.send=wrapper;
  }
  state.recoveries++;return status();
 }
 Object.defineProperty(globalThis,KEY,{value:{contract,recover,status},writable:false,configurable:false});
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin)return;
  if(e.data?.type==='BOSS_FIRST_PAGE_BUFFER_REQUEST')
   window.postMessage({type:'BOSS_FIRST_PAGE_BUFFER',version:C.VERSION,
    events:buffer.splice(0)},location.origin);
  if(e.data?.type==='BOSS_DIAG_PING_V1')
   window.postMessage({type:'BOSS_DIAG_READY_V1',nonce:e.data.nonce,
    lifecycleV3:true,...status()},location.origin);
 });
 recover();
})();

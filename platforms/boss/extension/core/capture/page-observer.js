/* One document-scoped bridge: collect natural Hook records and DOM activity. */
(()=>{
 'use strict';
 // Data is sanitized by MAIN Hook. This bridge has no cross-world global dependency.
 const VERSION='1.1.18';
 const target=raw=>{try{
  const u=new URL(raw);return u.origin==='https://www.zhipin.com'&&
   u.pathname==='/web/geek/jobs';
 }catch{return false;}};
 const nonnegative=x=>Number.isSafeInteger(x)&&x>=0?Math.min(x,1000000):0;
 const valid=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(x);
 const paging=x=>Object.fromEntries(Object.entries(x||{}).slice(0,20).filter(
  ([k,v])=>/^[a-zA-Z0-9_.-]{1,60}$/.test(k)&&
   (typeof v==='boolean'||Number.isSafeInteger(v)&&v>=0)));
 function safeRecord(raw){
  if(!raw||!['request','response','failure'].includes(raw.kind)||
   !valid(raw.docId)||!Number.isInteger(raw.requestId)||
   typeof raw.path!=='string'||raw.path.length>200||
   !/^\/[a-zA-Z0-9_.\[\]\/-]*$/.test(raw.path))return null;
  const lists=(Array.isArray(raw.lists)?raw.lists:[]).slice(0,5).map(item=>({
   path:typeof item.path==='string'&&item.path.length<160?item.path:'redacted',
   count:nonnegative(item.count),
   jobIds:(Array.isArray(item.jobIds)?item.jobIds:[]).filter(valid).slice(0,30),
   itemKeys:(Array.isArray(item.itemKeys)?item.itemKeys:[])
    .filter(k=>typeof k==='string'&&/^[a-zA-Z0-9_.-]{1,48}$/.test(k)).slice(0,25)
  }));
  return {kind:raw.kind,docId:raw.docId,requestId:raw.requestId,
   path:raw.path,ms:nonnegative(raw.ms),httpStatus:nonnegative(raw.httpStatus),
   lists,paging:paging(raw.paging),
   query:{paging:paging(raw.query?.paging)},body:{paging:paging(raw.body?.paging)},
   apiCode:typeof raw.apiCode==='string'&&/^-?[0-9]{1,8}$/.test(raw.apiCode)?raw.apiCode:null,
   inspection:['json','non-json','too-large','unreadable','network-error'].includes(raw.inspection)?raw.inspection:null,
   responseBody:raw.kind==='response'&&raw.inspection==='json'&&raw.responseBody!==null&&typeof raw.responseBody==='object'?raw.responseBody:null};
 }
 if(!target(location.href)||window!==window.top||window.__bossPageObserverV1)return;
 window.__bossPageObserverV1=true;
 const LIMIT=300,nonce=crypto.randomUUID();
 const LIST='/wapi/zpgeek/pc/recommend/job/list.json';
 const DETAIL='/wapi/zpgeek/job/detail.json';
 let seq=0,dropped=0,lastDom=Date.now(),lastNetwork=Date.now();
 let requestedProofAfterNetwork=false;
 let hookReady=false,hookDocId=null,hookOwnership='UNSEEN',hookContract=null,domReady=document.readyState!=='loading';
 const events=[],seen=new Set(),pending=new Set(),listPending=new Set(),
  waiters=new Map(),hookWaiters=new Map();
 function finishWaits(){
  // Do not let unrelated long-lived API requests block list completion.
  if(listPending.size!==0)return;
  for(const [token,job] of waiters){
   waiters.delete(token);
   job.reply({...snapshot(job.cursor),settled:true,
    reason:'LIST_REQUESTS_COMPLETE'});
  }
 }
 const relevant=records=>records.some(record=>{
  const el=record.target;
  if(el?.nodeType===1&&el.closest?.('.rec-job-list,.job-list-container'))return true;
  return [...record.addedNodes].some(node=>node.nodeType===1&&
   (node.matches?.('.rec-job-list,.job-list-container,.job-card-box')||
    node.querySelector?.('.rec-job-list,.job-list-container,.job-card-box')));
 });
 const watch=new MutationObserver(rows=>{if(relevant(rows))lastDom=Date.now();});
 watch.observe(document,{childList:true,subtree:true});
 const ready=()=>{
  domReady=true;lastDom=Date.now();
  // MAIN Hook may install after an ISOLATED document_start ping.
  window.postMessage({type:'BOSS_DIAG_PING_V1',nonce},location.origin);
 };
 if(!domReady)document.addEventListener('DOMContentLoaded',ready,{once:true});
 function accept(raw){
  const v=safeRecord(raw);
  if(!v||!hookDocId||v.docId!==hookDocId)return;
  const key=v.docId+':'+v.requestId+':'+v.kind;
  if(seen.has(key))return;
  seen.add(key);
  const id=v.docId+':'+v.requestId;
  if(v.kind==='request')pending.add(id);else pending.delete(id);
  if(v.path===LIST){
   if(v.kind==='request')listPending.add(id);else listPending.delete(id);
  }
  hookDocId=v.docId;
  lastNetwork=Date.now();
  events.push({cursor:++seq,kind:v.kind,requestId:v.requestId,
   docId:v.docId,path:v.path,ms:v.ms,httpStatus:v.httpStatus,
   listCount:v.lists.reduce((total,item)=>total+(item.count||0),0),
   lists:v.lists.slice(0,5).map(x=>({path:x.path,count:x.count,
    jobIds:x.jobIds.slice(0,30),itemKeys:x.itemKeys})),
   paging:v.paging,queryPaging:v.query.paging,bodyPaging:v.body.paging,
   apiCode:v.apiCode,inspection:v.inspection});
  // One natural response produces one file, independently of DOM/Refresh/Scroll.
  if(v.kind==='response'&&v.inspection==='json'&&v.responseBody){
   const detail=v.path===DETAIL;
   if(v.path!==LIST&&!detail)return;
   const inboxKey=(detail?'boss-native-detail-inbox-v1:':'boss-raw-inbox-v1:')+v.docId+':'+v.requestId;
   const message={type:detail?'BOSS_RAW_DETAIL_RESPONSE':'BOSS_RAW_LIST_RESPONSE',
    docId:v.docId,requestId:v.requestId,path:v.path,
    httpStatus:v.httpStatus,receivedAt:Date.now(),
    sourceUrl:location.href,inboxKey,responseBody:v.responseBody};
   // Persist before messaging; a sleeping Worker can recover the same event.
   void(async()=>{
    try{await chrome.storage.local.set({[inboxKey]:message});}
    catch{console.warn('BOSS raw-list inbox persistence failed');}
    try{
     const ack=await chrome.runtime.sendMessage(message);
     if(ack?.saved)await chrome.storage.local.remove(inboxKey);
    }catch{console.warn('BOSS raw-list handoff not confirmed; inbox retained if saved');}
   })();
  }
  if(events.length>LIMIT){events.shift();dropped++;}
  if(v.kind!=='request')finishWaits();
 }
 function pageMessage(event){
  if(event.source!==window||event.origin!==location.origin)return;
  const m=event.data;
  if(m?.type==='BOSS_DIAG_READY_V1'&&m.nonce===nonce&&m.lifecycleV3===true){
   hookContract='v3';
   hookOwnership=typeof m.hookOwnership==='string'?m.hookOwnership:'UNKNOWN';
   hookReady=m.listenerReady===true&&hookOwnership==='OWNED';
   if(typeof m.docId==='string')hookDocId=m.docId;
   window.postMessage({type:'BOSS_FIRST_PAGE_BUFFER_REQUEST'},location.origin);
   const status=hookReady?'READY':m.legacy?'LEGACY_HOOK_PRESENT':
    hookOwnership==='LOST'?'HOOK_OWNERSHIP_LOST':'HOOK_NOT_OWNED';
   for(const [token,job] of hookWaiters){
    hookWaiters.delete(token);clearTimeout(job.timer);
    job.reply({...snapshot(0),probeStatus:status});
   }
  }else if(m?.type==='BOSS_DIAG_NET_V1'&&m.version===VERSION){
   if(m.value?.docId===hookDocId)accept(m.value);
   // The first real Hook event proves MAIN is installed: request readiness once.
   if(!hookReady&&!requestedProofAfterNetwork){
    requestedProofAfterNetwork=true;
    window.postMessage({type:'BOSS_DIAG_PING_V1',nonce},location.origin);
   }
  }else if(m?.type==='BOSS_FIRST_PAGE_BUFFER'&&m.version===VERSION){
   for(const raw of (Array.isArray(m.events)?m.events:[]).slice(0,200))accept(raw);
  }
 }
 window.addEventListener('message',pageMessage);
 const snapshot=cursor=>({
  ok:true,hookReady,hookDocId,hookOwnership,hookContract,domReady,
  cursor:seq,baseCursor:events[0]?.cursor||seq+1,
  dropped,events:events.filter(e=>e.cursor>cursor),
  pending:pending.size,listPending:listPending.size,lastDom,lastNetwork,
  cardCount:document.querySelectorAll('.rec-job-list .job-card-box,.job-list-container .job-card-box').length
 });
 chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
  if(message?.type==='BOSS_OBSERVER_READ'){
   reply(snapshot(Number.isInteger(message.cursor)?message.cursor:0));return false;
  }
  if(message?.type==='BOSS_OBSERVER_PROBE_HOOK'){
   const token=message.token;
   if(typeof token!=='string'||token.length>100||hookWaiters.has(token)){
    reply({ok:false,probeStatus:'INVALID_PROBE_TOKEN'});return false;
   }
   // Fresh handshake on the action boundary; never makes a BOSS request.
   const timer=setTimeout(()=>{
    const job=hookWaiters.get(token);
    if(!job)return;
    hookWaiters.delete(token);
    job.reply({...snapshot(0),probeStatus:'HOOK_NO_ACK'});
   },2200);
   hookWaiters.set(token,{reply,timer});
   window.postMessage({type:'BOSS_DIAG_PING_V1',nonce},location.origin);
   return true;
  }
  if(message?.type==='BOSS_OBSERVER_WAIT_LIST'){
   if(typeof message.token!=='string'||message.token.length>100){
    reply({ok:false,reason:'INVALID_WAIT_TOKEN'});return false;
   }
   const cursor=Number.isInteger(message.cursor)?message.cursor:0;
   if(listPending.size===0){
    reply({...snapshot(cursor),settled:true,
     reason:'LIST_REQUESTS_COMPLETE'});return false;
   }
   waiters.set(message.token,{reply,cursor});
   return true; // resolve on actual request terminal callback
  }
  if(message?.type==='BOSS_OBSERVER_CANCEL_WAIT'){
   const job=waiters.get(message.token);
   if(job){
    waiters.delete(message.token);
    job.reply({...snapshot(job.cursor),settled:false,reason:'CANCELLED'});
   }
   reply({ok:true});
   return false;
  }
  if(message?.type!=='BOSS_OBSERVER_QUIET')return false;
  // One immediate status read: background-tab timers must never block Capture.
  const now=Date.now();
  const settled=domReady&&hookReady&&pending.size===0&&
   now-lastDom>=800&&now-lastNetwork>=800;
  const reason=settled?'QUIET':!domReady?'DOM_NOT_READY':
   !hookReady?'HOOK_NOT_READY':pending.size?'REQUESTS_IN_FLIGHT':'STILL_ACTIVE';
  reply({...snapshot(Number.isInteger(message.cursor)?message.cursor:0),
   settled,reason});
  return false;
 });
 // Recover earliest page requests that arrived between MAIN/ISOLATED installs.
 window.postMessage({type:'BOSS_DIAG_PING_V1',nonce},location.origin);
 window.addEventListener('pagehide',()=>{
  for(const [token,job] of waiters){
   waiters.delete(token);
   job.reply({...snapshot(job.cursor),settled:false,reason:'DOCUMENT_UNLOADED'});
  }
  for(const [token,job] of hookWaiters){
   hookWaiters.delete(token);clearTimeout(job.timer);
   job.reply({...snapshot(0),probeStatus:'DOCUMENT_UNLOADED'});
  }
  watch.disconnect();
  window.removeEventListener('message',pageMessage);
 },{once:true});
})();

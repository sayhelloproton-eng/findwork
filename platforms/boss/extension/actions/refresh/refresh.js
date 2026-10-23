/* Refresh lifecycle: native reset -> stable page -> arm Worker -> click Tab -> real response -> download. */
(async()=>{
 'use strict';
 const JOBS='https://www.zhipin.com/web/geek/jobs';
 const RAW='boss-raw-downloads-v2',LIST='/wapi/zpgeek/pc/recommend/job/list.json';
 const title=label=>{document.title='Refresh · '+label;};
 const match=url=>{try{const u=new URL(url);return u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';}catch{return false;}};
 const bounded=(operation,ms,reason)=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error(reason)),ms);
  Promise.resolve(operation).then(x=>{clearTimeout(timeout);resolve(x);},
   error=>{clearTimeout(timeout);reject(error);});
 });
 const raw=new URL(location.href).searchParams.get('expect');
 if(raw!==null&&(!/^(0|[1-9]\d*)$/.test(raw)||!Number.isSafeInteger(Number(raw)))){
  title('INVALID_EXPECT_INDEX');return;
 }
 const index=raw===null?0:Number(raw);
 const tabs=(await chrome.tabs.query({url:JOBS+'*'})).filter(t=>
  Number.isInteger(t.id)&&match(t.url));
 if(tabs.length!==1){title(tabs.length?'BOSS_TAB_AMBIGUOUS':'BOSS_TAB_MISSING');return;}
 const tabId=tabs[0].id,own=await chrome.tabs.getCurrent(),runId=crypto.randomUUID();
 let seq=0,armed=false;
 const send=(event,fields={})=>chrome.runtime.sendMessage({
  type:'BOSS_REFRESH_EVENT',event,runId,seq:++seq,
  tabId,controlTabId:own?.id,timestamp:new Date().toISOString(),...fields
 }).catch(e=>({ok:false,status:'WORKER_UNAVAILABLE',reason:String(e?.message||e).slice(0,70)}));
 const TRACE='boss-refresh-stage-log-v1',events=[];
 const trace=async(phase,fields={})=>{
  const row={at:new Date().toISOString(),phase,...fields};
  events.push(row);
  await chrome.storage.local.set({[TRACE]:{
   contract:'boss-refresh-stage-log.v1',runId,expectIndex:index,tabId,
   status:phase==='FAILED'?'FAILED':phase==='LIST_DOWNLOAD_COMPLETE'?'COMPLETE':'RUNNING',
   last:row,events:events.slice(-130)}});
 };
 const abort=async reason=>{
  if(armed){await send('REFRESH_WINDOW_ABORT');armed=false;}
  title(reason);await trace('FAILED',{reason});
 };
 // The first List response occurs on BOSS reload: open its gate BEFORE reload.
 title('ARMING_INITIAL_LIST');
 const gate=await send('BEFORE_REFRESH');
 if(!gate?.ok){
  title('GATE_'+String(gate?.gate||gate?.status||'NO_ACK').slice(0,65));
  await trace('FAILED',{reason:'GATE_REFUSED',gate:gate?.gate||null});
  return;
 }
 armed=true;
 await trace('INITIAL_GATE_OPEN',{gate:gate.gate});
 // 1. Refresh the existing BOSS tab exactly once; no capture gate before reset settles.
 title('RELOADING');
 let nextDocument=null,resolveLoaded;
 const loaded=new Promise(resolve=>{resolveLoaded=resolve;});
 const commit=d=>{if(d.tabId===tabId&&d.frameId===0&&match(d.url))
  nextDocument=d.documentId;};
 const complete=d=>{if(d.tabId===tabId&&d.frameId===0&&match(d.url)&&
  nextDocument&&d.documentId===nextDocument)resolveLoaded(d.documentId);};
 chrome.webNavigation.onCommitted.addListener(commit);
 chrome.webNavigation.onCompleted.addListener(complete);
 let documentId;
 try{
  await chrome.tabs.reload(tabId);
  documentId=await bounded(loaded,15000,'LOAD_NOT_CONFIRMED');
 }catch(e){await abort(String(e?.message||'RELOAD_FAILED').slice(0,65));return;}
 finally{
  chrome.webNavigation.onCommitted.removeListener(commit);
  chrome.webNavigation.onCompleted.removeListener(complete);
 }
 // The main-frame load event is necessary, not sufficient: await a real
 // initial list response from this new Hook document before calling it stable.
 let initial,hookDocId;
 const read=()=>chrome.tabs.sendMessage(tabId,
  {type:'BOSS_OBSERVER_READ',cursor:0},{frameId:0});
 // A successful same-document natural list response is the single readiness proof.
 const hasListResponse=(state,docId=state?.hookDocId)=>
  Array.isArray(state?.events)&&state.events.some(e=>
   e.docId===docId&&e.path===LIST&&e.kind==='response'&&
   e.httpStatus>=200&&e.httpStatus<300&&e.inspection==='json');
 const goodInitial=state=>state?.hookDocId===hookDocId&&
  hasListResponse(state,hookDocId);
 const listRequestsSettled=state=>Number.isSafeInteger(state?.listPending)&&
  state.listPending===0;
 try{
  initial=await bounded(read(),4000,'OBSERVER_TIMEOUT');
  if(!initial?.ok)throw Error('OBSERVER_UNAVAILABLE');
  // Runtime wrappers may change function identity without losing this
  // observer's actual list responses. A real, same-document response is
  // stronger evidence than Hook ownership equality.
  if(!initial.hookReady&&!hasListResponse(initial)){
   const proof=await bounded(chrome.tabs.sendMessage(tabId,{
    type:'BOSS_OBSERVER_PROBE_HOOK',token:runId
   },{frameId:0}),4000,'HOOK_PROBE_TIMEOUT');
   if(!proof?.ok)throw Error(String(proof?.probeStatus||'HOOK_PROBE_FAILED'));
   initial=proof;
  }
  if(!initial.domReady)throw Error('DOM_NOT_READY');
  if(!/^doc-[a-zA-Z0-9-]{8,100}$/.test(initial.hookDocId||''))
   throw Error('HOOK_DOCUMENT_ID_MISSING');
  hookDocId=initial.hookDocId;
  if(!goodInitial(initial)){
   title('WAITING_INITIAL_LIST_RESPONSE');
   // The listener is installed BEFORE the second read to close the race
   // between observer snapshot and a delayed natural BOSS response.
   await new Promise((resolve,reject)=>{
    let done=false,timer;
    const stop=ok=>{
     if(done)return;done=true;
     chrome.storage.onChanged.removeListener(changed);
     clearTimeout(timer);
     if(ok)resolve();else reject(Error('INITIAL_LIST_RESPONSE_NOT_OBSERVED'));
    };
    const changed=(changes,area)=>{
     if(area!=='local')return;
     for(const [key,event] of Object.entries(changes)){
      const row=event?.newValue;
      if(key.startsWith('boss-raw-inbox-v1:')&&row?.docId===hookDocId&&
       row.path===LIST&&row.httpStatus>=200&&row.httpStatus<300&&
       row.responseBody&&typeof row.responseBody==='object'){
       stop(true);break;
      }
     }
    };
    chrome.storage.onChanged.addListener(changed);
    timer=setTimeout(()=>stop(false),12000);
    void read().then(snapshot=>{if(goodInitial(snapshot))stop(true);},()=>{});
   });
   initial=await bounded(read(),4000,'OBSERVER_TIMEOUT');
  }
  if(!goodInitial(initial))throw Error('INITIAL_LIST_RESPONSE_NOT_CONFIRMED');
  if(initial.listPending>0){
   const done=await bounded(chrome.tabs.sendMessage(tabId,
    {type:'BOSS_OBSERVER_WAIT_LIST',cursor:initial.cursor,token:runId},
    {frameId:0}),10000,'INITIAL_REQUEST_TIMEOUT');
   if(done?.settled!==true)throw Error('INITIAL_REQUEST_UNSETTLED');
   initial=await bounded(read(),4000,'OBSERVER_TIMEOUT');
  }
  if(!goodInitial(initial)||!listRequestsSettled(initial))
   throw Error('INITIAL_LIST_NOT_SETTLED');
 }catch(e){
  await abort(String(e?.message||'INITIAL_LIST_NOT_READY').slice(0,70));return;
 }
 await trace('INITIAL_LIST_OBSERVED',{hookDocId,
  requestIds:(initial.events||[]).filter(e=>e.path===LIST&&e.kind==='response')
   .map(e=>e.requestId).slice(-8),pending:initial.listPending});
 // A document-scoped, read-only DOM/resource quiet check; no synthetic API calls.
 const waitForPageStability=()=>new Promise(resolve=>{
    let lastDom=Date.now(),lastNetwork=Date.now(),previous=-1;
    const root=document.querySelector('.job-list-container')||document.body;
    const mutation=new MutationObserver(rows=>{
     if(rows.some(r=>r.addedNodes.length+r.removedNodes.length>=5||
      r.target?.nodeType===1&&r.target.closest?.('.job-list-container,.rec-job-list')))
      lastDom=Date.now();
    });
    mutation.observe(root,{childList:true,subtree:true});
    let performance;
    try{
     performance=new PerformanceObserver(records=>{
      if(records.getEntries().some(e=>{
       try{return new URL(e.name,location.href).pathname.startsWith('/wapi/');}
       catch{return false;}
      }))lastNetwork=Date.now();
     });
     performance.observe({type:'resource',buffered:true});
    }catch{}
    let finished=false;
    const settle=stable=>{
     if(finished)return;finished=true;
     clearInterval(interval);clearTimeout(expiry);
     mutation.disconnect();performance?.disconnect();
     resolve(stable);
    };
    const interval=setInterval(()=>{
     const count=document.querySelectorAll('.rec-job-list .job-card-box,.job-list-container .job-card-box').length;
     if(count!==previous){lastDom=Date.now();previous=count;}
     if(document.readyState==='complete'&&document.querySelector('.c-expect-select')&&
      Date.now()-lastDom>=900&&Date.now()-lastNetwork>=900)settle(true);
    },200);
    // Expire inside the injected page: outer Promise timeouts cannot clear its observers.
    const expiry=setTimeout(()=>settle(false),14500);
   });

 title('WAITING_INITIAL_STABILITY');
 try{
  const [stability]=await bounded(chrome.scripting.executeScript({
   target:{tabId,documentIds:[documentId]},world:'ISOLATED',
   func:waitForPageStability
  }),15000,'PAGE_NOT_STABLE');
  if(stability?.result!==true)throw Error('PAGE_NOT_STABLE');
 }catch(e){await abort(String(e?.message||'PAGE_NOT_STABLE').slice(0,65));return;}
 // DOM must settle AFTER the proven list response, not merely after load.
 try{
  const final=await bounded(read(),4000,'OBSERVER_TIMEOUT');
  if(!final?.ok||final.hookDocId!==hookDocId)
   throw Error('HOOK_CHANGED_AFTER_STABILITY');
  if(!goodInitial(final)||!listRequestsSettled(final))
   throw Error('INITIAL_LIST_NOT_STABLE');
  initial=final;
 }catch(e){
  await abort(String(e?.message||'INITIAL_LIST_NOT_STABLE').slice(0,70));return;
 }
 await trace('INITIAL_LIST_SETTLED',{hookDocId,pending:initial.listPending,
  cardCount:initial.cardCount});
 // First natural List has been observed and held by the existing gate.
 // Only click the expectation when its verified selection differs.
 title('VERIFYING_TARGET_EXPECTATION');
 const watchResponse=minRequestId=>{
  let resolve,timeout,stopped=false;
  const promise=new Promise(r=>{resolve=r;});
  const matches=records=>(records||[]).some(r=>
   r.status==='HELD'&&r.gateRunId===runId&&r.raw?.metadata?.tabId===tabId&&
   r.raw?.metadata?.docId===hookDocId&&r.raw?.metadata?.requestId>minRequestId);
  const stop=found=>{
   if(stopped)return;stopped=true;
   chrome.storage.onChanged.removeListener(onChange);
   clearTimeout(timeout);resolve(found);
  };
  const onChange=(events,area)=>{
   if(area==='local'&&matches(events[RAW]?.newValue?.records))stop(true);
  };
  chrome.storage.onChanged.addListener(onChange);
  timeout=setTimeout(()=>stop(false),12000);
  void chrome.storage.local.get(RAW).then(v=>{if(matches(v[RAW]?.records))stop(true);},()=>{});
  return{promise,cancel:()=>stop(false)};
 };
 const actOnExpectation=async(n,mode)=>{
   if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/geek/jobs')
    return{ok:false,reason:'DOCUMENT_MISMATCH'};
   const root=document.querySelector('.c-expect-select');
   if(!root||document.querySelectorAll('.c-expect-select').length!==1)
    return{ok:false,reason:'EXPECT_CONTAINER_MISSING'};
   const recommended=root.querySelector(':scope > a.synthesis');
   const wishes=[...root.querySelectorAll(':scope > .expect-list > a.expect-item')];
   if(!recommended||!wishes.length||n>wishes.length)
    return{ok:false,reason:'EXPECT_OPTION_MISSING'};
   const selected=()=>n===0?!wishes.some(e=>e.classList.contains('active')):
    wishes[n-1].classList.contains('active');
   if(mode==='VERIFY')return{ok:selected(),reason:selected()?'SELECTED':'EXPECT_NOT_SELECTED'};
   if(mode!=='CLICK')return{ok:false,reason:'INVALID_EXPECT_ACTION'};
   [recommended,...wishes][n].click();
   if(!selected())await new Promise(resolve=>{
    let done=false;
    const observer=new MutationObserver(()=>{
     if(selected()){done=true;observer.disconnect();resolve();}
    });
    observer.observe(root,{attributes:true,subtree:true,attributeFilter:['class']});
    setTimeout(()=>{if(!done){observer.disconnect();resolve();}},2000);
   });
   return{ok:selected(),reason:selected()?'SELECTED':'EXPECT_NOT_SELECTED'};
 };
 try{
  const [choice]=await bounded(chrome.scripting.executeScript({
   target:{tabId,documentIds:[documentId]},world:'ISOLATED',
   args:[index,'VERIFY'],func:actOnExpectation
  }),4000,'EXPECT_VERIFY_TIMEOUT');
  if(choice?.result?.ok===true){
   await trace('EXPECT_ALREADY_SELECTED',{expectIndex:index,reusedInitialList:true});
  }else if(choice?.result?.reason==='EXPECT_NOT_SELECTED'){
   const baseline=Math.max(0,...(initial.events||[])
    .filter(e=>e.docId===hookDocId&&Number.isSafeInteger(e.requestId))
    .map(e=>e.requestId));
   await trace('EXPECT_SWITCH_REQUIRED',{expectIndex:index,baseline});
   const response=watchResponse(baseline);
   try{
    title('SELECTING_EXPECT_'+index);
    const [clicked]=await bounded(chrome.scripting.executeScript({
     target:{tabId,documentIds:[documentId]},world:'ISOLATED',
     args:[index,'CLICK'],func:actOnExpectation
    }),4000,'TAB_CLICK_TIMEOUT');
    if(!clicked?.result?.ok)
     throw Error(String(clicked?.result?.reason||'TAB_SELECTION_FAILED'));
    title('WAITING_TARGET_LIST_RESPONSE');
    if(!(await response.promise))
     throw Error('TARGET_EXPECT_LIST_RESPONSE_NOT_OBSERVED');
    const end=await bounded(chrome.tabs.sendMessage(tabId,{
     type:'BOSS_OBSERVER_WAIT_LIST',token:runId,cursor:initial.cursor
    },{frameId:0}),10000,'LIST_COMPLETION_TIMEOUT');
    if(!end?.settled||end.hookDocId!==hookDocId)
     throw Error('TARGET_LIST_UNSETTLED_OR_CHANGED');
    const [confirmed]=await chrome.scripting.executeScript({
     target:{tabId,documentIds:[documentId]},world:'ISOLATED',
     args:[index,'VERIFY'],func:actOnExpectation
    });
    if(!confirmed?.result?.ok)throw Error('EXPECT_NOT_SELECTED_AFTER_RESPONSE');
    await trace('TARGET_LIST_OBSERVED',{expectIndex:index,afterRequestId:baseline});
   }finally{response.cancel();}
  }else throw Error(String(choice?.result?.reason||'EXPECT_VERIFY_FAILED'));
 }catch(e){await abort(String(e?.message||'REFRESH_ABORTED').slice(0,76));return;}
 // 3. The Worker selects one full response and dispatches exactly one Chrome download.
 title('DOWNLOADING_LIST_JSON');
 await trace('LIST_DOWNLOAD_AUTHORIZING',{hookDocId});
 const finished=await send('REFRESH_SUCCESS',{documentId,hookDocId});
 armed=false;
 if(!finished?.ok||finished.gate!=='AUTHORIZED_ONCE'){
  const reason=String(finished?.gate||finished?.status||'NO_ELIGIBLE_RESPONSE');
  title('DOWNLOAD_'+reason.slice(0,70));await trace('FAILED',{reason});return;
 }
 const receipt=finished.download;
 if(!Number.isInteger(receipt?.downloadId)||typeof receipt?.filename!=='string'){
  title('DOWNLOAD_RECEIPT_MISSING');await trace('FAILED',{reason:'DOWNLOAD_RECEIPT_MISSING'});return;
 }
 await trace('LIST_DOWNLOAD_STARTED',{filename:receipt.filename,downloadId:receipt.downloadId});
 title('VERIFYING_LOCAL_FILE');
 const status=await new Promise(resolve=>{
  let completed=false,timer;
  const finish=value=>{
   if(completed)return;completed=true;
   chrome.downloads.onChanged.removeListener(changed);
   clearTimeout(timer);resolve(value);
  };
  const check=async()=>{
   try{
    const [row]=await chrome.downloads.search({id:receipt.downloadId});
    if(row?.state==='interrupted')finish('DOWNLOAD_INTERRUPTED');
    else if(row?.state==='complete'){
     const path=String(row.filename||'').replaceAll('\\','/');
     finish(row.exists===true&&path.endsWith('/'+receipt.filename)?
      'COMPLETE':'FILE_NOT_CONFIRMED');
    }
   }catch{finish('DOWNLOAD_VERIFICATION_FAILED');}
  };
  const changed=d=>{if(d.id===receipt.downloadId&&d.state?.current)void check();};
  chrome.downloads.onChanged.addListener(changed);
  timer=setTimeout(()=>finish('DOWNLOAD_TIMEOUT'),30000);
  void check();
 });
 if(status!=='COMPLETE'){title(status);await trace('FAILED',{reason:status});return;}
 await trace('LIST_DOWNLOAD_COMPLETE',{filename:receipt.filename,downloadId:receipt.downloadId,hookDocId});
 await chrome.tabs.remove(own.id);
})();

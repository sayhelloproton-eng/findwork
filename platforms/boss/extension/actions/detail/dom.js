/* Sole production DOM natural Detail sequence: Refresh -> Detail -> Scroll.
   No direct BOSS requests and no SQLite dependency during capture. */
(async()=>{
 'use strict';
 const el=document.getElementById('state'),detail=document.getElementById('detail');
 const say=(msg,info)=>{el.textContent=msg;detail.textContent=JSON.stringify(info||{},null,2);};
 const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9_~-]{10,120}$/.test(id);
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const params=new URLSearchParams(location.search);
 const auto=params.get('auto')==='1';
 const resume=params.get('resume')==='1';
 const fresh=params.get('fresh')==='1';
 if(fresh&&(!auto||resume)){say('STOP：fresh=1 仅允许全新 auto 运行，禁止与 resume 混用');return;}
 const pagesValue=params.get('pages')||'2',expectValue=params.get('expect')||'0';
 if(auto&&(!/^(?:[1-9]|1[0-9]|2[01])$/.test(pagesValue)||
  !/^(0|[1-9]\d*)$/.test(expectValue)||!Number.isSafeInteger(Number(expectValue)))){
  say('STOP：非法的 pages / expect 参数');return;
 }
 const tabList=await chrome.tabs.query({});
 const own=await chrome.tabs.getCurrent();
 const boss=tabList.filter(tab=>{
  try{const u=new URL(tab.url);
   return u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';
  }catch{return false;}
 });
 const controlUrl=chrome.runtime.getURL('actions/detail/dom.html');
 const controls=tabList.filter(tab=>{
  try{const a=new URL(tab.url),b=new URL(controlUrl);
   return a.origin===b.origin&&a.pathname===b.pathname;
  }catch{return false;}
 });
 if(boss.length!==1||!Number.isInteger(boss[0].id)||
  !Number.isInteger(own?.id)||controls.length!==1||controls[0].id!==own.id){
  say('STOP：BOSS 列表或 DOM Detail 控制页不是唯一实例');return;
 }
 const tabId=boss[0].id;
 const maxPages=auto?Number(pagesValue):1;
 const targetDownloads=auto?maxPages*15:null;
 let session={contract:'boss-dom-detail-sequence.v1',
  runId:crypto.randomUUID(),fresh,mode:auto?'AUTO':'BATCH',
  targetPages:maxPages,targetDownloads,completed:0,status:'RUNNING',
  batches:[],failed:null,startedAt:new Date().toISOString()};
 const stopButton=document.getElementById('stop');
 let stopRequested=false;
 stopButton?.addEventListener('click',()=>{
  stopRequested=true;
  stopButton.disabled=true;
  say('已请求停止：当前动作或下载结束后退出，不再点击下一条',session);
 });
 const persist=()=>chrome.storage.local.set({'boss-dom-detail-sequence-v1':session});
 const traceRows=[];
 const trace=async(phase,fields={})=>{
  const row={at:new Date().toISOString(),phase,...fields};
  traceRows.push(row);
  await chrome.storage.local.set({'boss-dom-stage-log-v1':{
   contract:'boss-dom-stage-log.v1',startedAt:session.startedAt,
   status:session.status,completed:session.completed,target:session.targetDownloads,
   last:row,events:traceRows.slice(-750)}});
 };
 await trace('SESSION_STARTED',{mode:session.mode,pages:maxPages,
  expectIndex:Number(expectValue),runId:session.runId,fresh});
 // A fresh run must never count prior native Detail COMPLETE receipts as new.
 // Archive the prior extension state (without deleting downloads or SQLite),
 // then reset only the passive Detail store BEFORE the first BOSS Refresh.
 if(fresh){
  try{
   const old=await chrome.storage.local.get([
    'boss-dom-detail-sequence-v1','boss-natural-detail-v1']);
   const previous=old['boss-dom-detail-sequence-v1'];
   const oldStore=old['boss-natural-detail-v1'];
   if(previous?.status==='RUNNING')
    throw Error('PREVIOUS_COLLECTION_STILL_RUNNING');
   const records=oldStore?.records||{};
   const unsettled=Object.values(records).filter(row=>
    ['CAPTURED','DISPATCHING','IN_PROGRESS','VERIFY_PENDING'].includes(row?.status));
   if(unsettled.length)throw Error('PREVIOUS_DETAIL_DOWNLOAD_UNSETTLED');
   const archiveKey='boss-dom-fresh-last-v1';
   await chrome.storage.local.set({
    [archiveKey]:{contract:'boss-dom-fresh-last.v1',
     at:new Date().toISOString(),previousRunId:previous?.runId||null,
     previousStatus:previous?.status||null,previousCompleted:previous?.completed||0,
     archivedRecords:Object.keys(records).length},
    'boss-natural-detail-v1':{contract:'boss-natural-detail.v1',records:{}}
   });
   const proof=await chrome.storage.local.get([archiveKey,'boss-natural-detail-v1']);
   if(proof[archiveKey]?.contract==='boss-dom-fresh-last.v1'&&
    Object.keys(proof['boss-natural-detail-v1']?.records||{}).length===0){
    session.freshPreparedAt=new Date().toISOString();
    await persist(); // Run ID must exist before Refresh's first natural Detail.
    await trace('FRESH_DETAIL_STORE_READY',{runId:session.runId,
     archivedRecords:Object.keys(records).length,archiveKey});
   }else throw Error('FRESH_STORE_READBACK_FAILED');
  }catch(error){
   session.status='FAILED';
   session.failed={status:'FRESH_PREPARE_FAILED',
    reason:String(error?.message||error).slice(0,90)};
   await trace('SESSION_TERMINAL',{...session.failed});
   say('STOP：全新采集隔离失败，不启动 Refresh',session);return;
  }
 }
 const lookup=jobId=>chrome.runtime.sendMessage({type:'BOSS_NATIVE_DETAIL_LOOKUP',jobId,
  runId:fresh?session.runId:null});
 const latest=()=>chrome.runtime.sendMessage({type:'BOSS_NATIVE_LIST_LATEST'});
 const validate=jobs=>Array.isArray(jobs)&&jobs.length>0&&jobs.length<=30&&
  jobs.every(valid)&&new Set(jobs).size===jobs.length;
 // Extension self-reload invalidates ISOLATED content scripts in existing tabs.
 // Restore the bridge without navigating or generating a BOSS request.
 async function ensureObserverBridge(){
  let current;
  try{current=await chrome.tabs.sendMessage(tabId,{type:'BOSS_OBSERVER_READ',cursor:0});}
  catch{}
  if(current?.ok&&current.hookReady===true&&current.hookOwnership==='OWNED'&&
   current.hookContract==='v3')
   return{ok:true,mode:'EXISTING',cursor:current.cursor};
  const r=await chrome.runtime.sendMessage({type:'BOSS_HOOK_RECOVER',tabId});
  if(!r?.ok||r.hookOwnership!=='OWNED'||!r.observerReady)
   return{ok:false,reason:'ISOLATED_BRIDGE_REATTACH_UNVERIFIED',
    detail:r?.reason||'NO_RECOVERY_RECEIPT'};
  return{ok:true,mode:'REATTACHED',cursor:0};
 }
 let resumeIds=null,resumeSource=null;
 if(resume){
  if(!auto){say('STOP：恢复模式必须 auto=1');return;}
  try{
   resumeIds=JSON.parse(params.get('batch'));
   if(Array.isArray(resumeIds))
    resumeIds=resumeIds.map(x=>typeof x==='string'?x:x?.jobId);
  }catch{}
  resumeSource=params.get('source');
  const previous=(await chrome.storage.local.get('boss-dom-detail-sequence-v1'))
   ['boss-dom-detail-sequence-v1'];
  const pastBatches=Array.isArray(previous?.batches)?previous.batches:[];
  const finished=pastBatches.flatMap(b=>b.completed||[]);
  const last=pastBatches.at(-1);
  const failedAfterList=previous?.failed?.status==='NEW_LIST_DOWNLOAD_NOT_CONFIRMED'&&
   previous.failed.page===pastBatches.length+1&&
   pastBatches.every(b=>b.requested===15&&b.completed?.length===15&&!b.failed);
  const failedFirstDetail=previous?.failed?.status==='NO_NATIVE_RESPONSE_45S'&&
   previous.failed.page===pastBatches.length&&last?.requested===15&&
   last?.completed?.length===0&&last?.failed?.jobId===previous.failed.jobId&&
   last?.failed?.status==='NO_NATIVE_RESPONSE_45S'&&
   last?.source===resumeSource&&Array.isArray(resumeIds)&&
   resumeIds[0]===previous.failed.jobId&&
   pastBatches.slice(0,-1).every(b=>b.requested===15&&b.completed?.length===15&&!b.failed);
  const failures=[];
  const require=(good,reason)=>{if(!good)failures.push(reason);};
  require(previous?.status==='FAILED','STATUS_NOT_FAILED');
  require(failedAfterList||failedFirstDetail,'UNSUPPORTED_FAILURE_CHECKPOINT');
  require(previous?.targetPages===maxPages&&previous?.targetDownloads===targetDownloads,'TARGET_MISMATCH');
  require(previous?.completed===finished.length,'COMPLETED_COUNT_MISMATCH');
  require(previous?.completed===(failedFirstDetail?pastBatches.length-1:pastBatches.length)*15,
   'BATCH_TOTAL_MISMATCH');
  require(finished.every(x=>valid(x.jobId)&&x.download==='COMPLETE'&&x.downloadPath),'DOWNLOAD_RECEIPT_INVALID');
  require(new Set(finished.map(x=>x.jobId)).size===finished.length,'PREVIOUS_IDS_REPEAT');
  require(validate(resumeIds)&&resumeIds.length===15,'RESUME_IDS_INVALID');
  require(!resumeIds?.some?.(x=>finished.some(y=>x===y.jobId)),'RESUME_IDS_REPEAT');
  require(typeof resumeSource==='string'&&
   /^BOSS\/\d{4}-\d{2}-\d{2}\/list\/job-list-doc-[a-zA-Z0-9-]+-\d+\.json$/.test(resumeSource),'SOURCE_FILENAME_INVALID');
  if(failures.length){
   say('STOP：恢复断点校验未通过',{
    failures,storedStatus:previous?.status||null,
    storedFailedStatus:previous?.failed?.status||null,
    storedFailedPage:previous?.failed?.page||null,
    storedCompleted:previous?.completed||0,storedBatches:pastBatches.length,
    suppliedJobCount:Array.isArray(resumeIds)?resumeIds.length:0});
   return;
  }
  const state=(await chrome.storage.local.get('boss-raw-downloads-v2'))['boss-raw-downloads-v2'];
  if(!(state?.records||[]).some(x=>x.filename===resumeSource&&x.status==='COMPLETE')){
   say('STOP：恢复批次没有 Chrome COMPLETE 来源');return;
  }
  // Drop only the empty failed batch, never any completed item.
  session={...previous,batches:failedFirstDetail?pastBatches.slice(0,-1):pastBatches,
   status:'RUNNING',failed:null,finishedAt:null,
   resumedAt:new Date().toISOString(),resumeSource,
   recoveryFailure:previous.failed};
  let observer;
  try{observer=await ensureObserverBridge();}
  catch(e){observer={ok:false,reason:'BRIDGE_REATTACH_ERROR'};}
  if(!observer?.ok){
   say('STOP：监听桥未恢复，保留历史失败断点',observer);return;
  }
  session.bridgeRecovery=observer.mode;
  say('监听桥已确认，准备从已下载第六批接续，不刷新前五批',{
   completed:session.completed,source:resumeSource,bridge:observer.mode});
  if(params.get('bridgeOnly')==='1')return;
 }

 // Reuse the existing Refresh/Scroll extension actions, not external BOSS control.
 async function runAction(kind){
  const key='boss-native-list-latest-v1',rawKey='boss-raw-downloads-v2',
   gateKey='boss-raw-event-gate-v1';
  const before=(await chrome.storage.local.get(gateKey))[gateKey];
  const route=kind==='refresh'?'actions/refresh/refresh.html?expect='+
   encodeURIComponent(expectValue):'actions/scroll/scroll.html';
  say(kind==='refresh'?'正在刷新并下载 List':'当前批次完成，扩展滚动到底加载下一批',session);
  await trace('ACTION_STARTED',{kind,page:session.batches.length+1});
  const child=await chrome.tabs.create({url:chrome.runtime.getURL(route),active:false});
  if(!Number.isInteger(child?.id))return{ok:false,status:'ACTION_TAB_MISSING'};
  const outcome=await new Promise(resolve=>{
   let done=false,timer;
   const finish=status=>{
    if(done)return;done=true;clearTimeout(timer);
    chrome.tabs.onRemoved.removeListener(removed);resolve(status);
   };
   const removed=id=>{if(id===child.id)finish('CLOSED');};
   chrome.tabs.onRemoved.addListener(removed);
   timer=setTimeout(()=>finish('ACTION_TIMEOUT'),kind==='refresh'?110000:60000);
   void chrome.tabs.get(child.id).catch(()=>finish('CLOSED'));
  });
  if(outcome!=='CLOSED'){
   const active=await chrome.tabs.get(child.id).catch(()=>null);
   await trace('ACTION_FAILED',{kind,status:outcome,actionTitle:active?.title||null});
   return{ok:false,status:outcome,actionTitle:active?.title||null};
  }
  // The Scroll/Refresh gate selects exactly one native List response.
  // Bind that selectedKey to a verified COMPLETE file, never to a global
  // possibly stale 'latest' pointer from a different natural response.
  const batch=await new Promise(resolve=>{
   let done=false,busy=false,timer;
   const stop=value=>{
    if(done)return;done=true;clearTimeout(timer);
    chrome.storage.onChanged.removeListener(changed);resolve(value);
   };
   const inspect=async()=>{
    if(done||busy)return;busy=true;
    try{
     const state=await chrome.storage.local.get([key,rawKey,gateKey]);
     const gate=state[gateKey],latest=state[key];
     if(gate?.status==='CLOSED'&&gate.kind===kind.toUpperCase()&&
      gate.runId!==before?.runId&&typeof gate.selectedKey==='string'){
      const row=(state[rawKey]?.records||[]).find(r=>r.key===gate.selectedKey);
      if(row?.status==='COMPLETE'){
       const ids=validate(row.jobIds)?row.jobIds:
        latest?.sourceFilename===row.filename&&validate(latest.jobIds)?
         latest.jobIds:null;
       if(ids)stop({jobIds:ids,sourceFilename:row.filename,verifiedAt:Date.now()});
      }
     }
    }catch{stop(null);}
    finally{busy=false;}
   };
   const changed=(changes,area)=>{
    if(area==='local'&&(changes[key]||changes[rawKey]||changes[gateKey]))
     void inspect();
   };
   chrome.storage.onChanged.addListener(changed);
   timer=setTimeout(()=>stop(null),5000);
   void inspect();
  });
  if(!batch){await trace('ACTION_FAILED',{kind,status:'NEW_LIST_DOWNLOAD_NOT_CONFIRMED'});
   return{ok:false,status:'NEW_LIST_DOWNLOAD_NOT_CONFIRMED'};}
  await trace('LIST_DOWNLOAD_COMPLETE',{kind,filename:batch.sourceFilename,jobIds:batch.jobIds});
  return{ok:true,batch};
 }

 // The injected function checks the actual rendered job ID; CHECK never clicks.
 function clickCard(jobId,mode){
  if(window!==window.top||location.origin!=='https://www.zhipin.com'||
   location.pathname!=='/web/geek/jobs')
   return{ok:false,reason:'TARGET_DOCUMENT_CHANGED'};
  const cards=[...document.querySelectorAll(
   '.rec-job-list .job-card-box,.job-list-container .job-card-box')];
  const hit=cards.filter(card=>{
   const a=card.querySelector('a[href*="/job_detail/"]');
   if(!a)return false;
   try{return new URL(a.href,location.origin).pathname==='/job_detail/'+jobId+'.html';}
   catch{return false;}
  });
  if(hit.length!==1)return{ok:false,reason:'CARD_MATCH_COUNT_'+hit.length};
  if(mode==='CHECK')return{ok:true};
  if(mode!=='CLICK')return{ok:false,reason:'INVALID_CARD_ACTION'};
  hit[0].scrollIntoView({block:'nearest',behavior:'instant'});
  hit[0].click();return{ok:true};
 }
 async function cardAction(jobId,mode){
  try{
   const response=await chrome.scripting.executeScript({
    target:{tabId},world:'ISOLATED',func:clickCard,args:[jobId,mode]
   });
   return response?.[0]?.result||{ok:false,reason:'CARD_PROBE_UNAVAILABLE'};
  }catch(e){return{ok:false,reason:'CARD_PROBE_ERROR:'+String(e?.message||e)};}
 }
 async function waitForCard(jobId){
  // Render may lag the natural List response. Probe at 0s, 1s and 2s.
  for(let i=0;i<=2;i++){
   const check=await cardAction(jobId,'CHECK');
   if(check.ok)return check;
   if(check.reason!=='CARD_MATCH_COUNT_0'||i===2)return check;
   await pause(1000);
  }
  return{ok:false,reason:'CARD_RENDER_TIMEOUT'};
 }
 async function awaitReceipt(jobId){
  const initial=await lookup(jobId);
  if(!initial?.ok||['COMPLETE','UNKNOWN','FAILED'].includes(initial.status))return initial;
  return new Promise(resolve=>{
   let done=false,busy=false,timer;
   const end=r=>{
    if(done)return;done=true;clearTimeout(timer);
    chrome.storage.onChanged.removeListener(onChange);resolve(r);
   };
   const check=async()=>{
    if(done||busy)return;busy=true;
    try{
     const r=await lookup(jobId);
     if(!r?.ok||['COMPLETE','UNKNOWN','FAILED'].includes(r.status))
      end(r||{ok:false,status:'LOOKUP_UNAVAILABLE'});
    }catch{end({ok:false,status:'LOOKUP_ERROR'});}
    finally{busy=false;}
   };
   const onChange=(changes,area)=>{
    if(area==='local'&&changes['boss-natural-detail-v1'])void check();
   };
   chrome.storage.onChanged.addListener(onChange);
   timer=setTimeout(()=>end({ok:false,status:'NO_NATIVE_RESPONSE_45S'}),45000);
   void check();
  });
 }
 async function processBatch(jobs,source,firstNatural){
  const batch={source,requested:Array.isArray(jobs)?jobs.length:0,
   completed:[],failed:null,stopped:false};
  session.batches.push(batch);
  if(!validate(jobs)){
   batch.failed={status:'INVALID_LIST_BATCH'};return batch;
  }
  for(let index=0;index<jobs.length;index++){
   if(stopRequested){batch.stopped=true;break;}
   const jobId=jobs[index];
   say('第 '+session.batches.length+' 批，下载 '+(index+1)+' / '+jobs.length,
    {...session,current:batch});
   const before=await lookup(jobId).catch(()=>null);
   await trace('DETAIL_LOOKUP',{page:session.batches.length,index:index+1,jobId,
    status:before?.status||'LOOKUP_FAILED',firstNatural:Boolean(firstNatural&&index===0)});
   if(!before?.ok||
    !['MISSING','CAPTURED','DISPATCHING','IN_PROGRESS','COMPLETE'].includes(before.status)){
    batch.failed={jobId,status:before?.status||'LOOKUP_FAILED'};break;
   }
   if(before.status==='MISSING'&&!(firstNatural&&index===0)){
    const rendered=await waitForCard(jobId);
    if(!rendered.ok){
     batch.failed={jobId,status:rendered.reason||'CARD_NOT_RENDERED'};break;
    }
    if(stopRequested){batch.stopped=true;break;}
    const clicked=await cardAction(jobId,'CLICK');
    if(!clicked.ok){
     batch.failed={jobId,status:clicked.reason||'DOM_CLICK_FAILED'};break;
    }
    await trace('DOM_CARD_CLICK',{page:session.batches.length,index:index+1,jobId});
   }
   // Refresh auto-selects its first Detail: listen for its natural response,
   // rather than clicking that first card a second time.
   const downloaded=before.status==='COMPLETE'?before:await awaitReceipt(jobId);
   if(!downloaded?.ok||downloaded.status!=='COMPLETE'||!downloaded.downloadPath){
    batch.failed={jobId,status:downloaded?.status||'UNKNOWN',
     reason:'DETAIL_DOWNLOAD_NOT_CONFIRMED'};break;
   }
   batch.completed.push({jobId,source:before.status==='COMPLETE'?
    (fresh&&firstNatural&&index===0?'REFRESH_NATURAL_DETAIL':
     fresh?'NATIVE_DETAIL_SAME_RUN':'EXISTING_DOWNLOAD'):
    firstNatural&&index===0?'REFRESH_NATURAL_DETAIL':'DOM_CLICK',
    filename:downloaded.filename,downloadPath:downloaded.downloadPath,download:'COMPLETE'});
   session.completed++;
   await trace('DETAIL_DOWNLOAD_COMPLETE',{page:session.batches.length,index:index+1,
    jobId,filename:downloaded.filename,source:batch.completed.at(-1).source});
   await persist();
  }
  if(batch.failed)await trace('DETAIL_FAILED',{page:session.batches.length,...batch.failed});
  return batch;
 }

 try{
  if(auto){
   const seen=new Set(session.batches.flatMap(b=>b.completed.map(x=>x.jobId)));
   const startPage=resume?session.batches.length:0;
   if(resume)await persist();
   for(let page=startPage;page<maxPages;page++){
    if(stopRequested)break;
    const kind=page===0?'refresh':'scroll';
    const action=resume&&page===startPage?
     {ok:true,batch:{jobIds:resumeIds,sourceFilename:resumeSource}}:
     await runAction(kind);
    if(stopRequested)break;
    if(!action.ok){
     session.failed={page:page+1,action:kind,status:action.status,
      actionTitle:action.actionTitle||null};break;
    }
    const ids=action.batch.jobIds;
    if(ids.length!==15){
     session.failed={page:page+1,status:'LIST_SIZE_NOT_15',actual:ids.length};break;
    }
    const duplicate=ids.find(id=>seen.has(id));
    if(duplicate){
     session.failed={page:page+1,status:'DUPLICATE_BETWEEN_PAGES',jobId:duplicate};break;
    }
    ids.forEach(id=>seen.add(id));
    const batch=await processBatch(ids,action.batch.sourceFilename,page===0);
    if(stopRequested)break;
    if(batch.failed||batch.completed.length!==batch.requested){
     session.failed={page:page+1,...(batch.failed||{status:'BATCH_INCOMPLETE'})};break;
    }
    if(session.completed>=targetDownloads)break;
   }
  }else{
   let jobs=null,source=null;
   if(params.get('latest')==='1'){
    const data=await latest();
    if(data?.ok&&data.batch&&Date.now()-data.batch.verifiedAt<=1800000){
     jobs=data.batch.jobIds;source=data.batch.sourceFilename;
    }
   }else if(params.has('batch')){
    try{jobs=JSON.parse(params.get('batch')).map(x=>typeof x==='string'?x:x?.jobId);}
    catch{}
   }
   const batch=await processBatch(jobs,source,false);
   session.failed=batch.failed;
  }
 }catch(e){session.failed={status:'CONTROLLER_ERROR',reason:String(e?.message||e)};}
 if(!session.failed&&!stopRequested&&auto&&
  (session.batches.length!==maxPages||session.completed!==targetDownloads))
  session.failed={status:'TARGET_NOT_MET',actual:session.completed,
   target:targetDownloads,pages:session.batches.length};
 session.status=session.failed?'FAILED':stopRequested?'STOPPED':'COMPLETED';
 session.finishedAt=new Date().toISOString();
 if(stopButton)stopButton.disabled=true;
 try{await persist();}catch(e){
  session.status='FAILED';
  session.failed={status:'RECEIPT_PERSIST_FAILED',reason:String(e?.message||e)};
 }
 await trace('SESSION_TERMINAL',{status:session.status,completed:session.completed,failed:session.failed});
 say(session.status==='COMPLETED'?
  'COMPLETE：达到采集上限，自动终止，不再 Scroll':
  session.status==='STOPPED'?
  'STOPPED：已手动停止，保留已完成下载':
  'FAILED：已停止，不再点击或 Scroll，保留进度',session);
})();

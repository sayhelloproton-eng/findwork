/* Standalone Greet queue: enqueue -> one POST -> remove -> random 5–8s cooldown -> next. */
var BossGreetQueue=(()=>{
 'use strict';
 const KEY='boss-greet-queue-v1';
 const ALARM='boss-greet-queue-v1-watch';
 const GAP_MIN=5000,GAP_MAX=8000;
 const randomGap=()=>GAP_MIN+Math.floor(Math.random()*(GAP_MAX-GAP_MIN+1));
 const nextAllowedAt=s=>Math.max(s.lastFinishedAt+GAP_MIN,s.nextEligibleAt||0);
 const ENDPOINT='/wapi/zpgeek/friend/add.json';
 const DEFAULT_GREETING='您好，我对该岗位很感兴趣，希望能和您聊一聊。';
 let tail=Promise.resolve(),busy=false,timer=null;
 const fresh=()=>({queue:[],results:{},active:null,paused:null,lastFinishedAt:0,nextEligibleAt:0});
 const load=async()=> (await chrome.storage.local.get(KEY))[KEY]||fresh();
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_~\-]{10,120}$/.test(value);
 function tx(fn){
  const next=tail.then(async()=>{
   const state=await load(),result=await fn(state);
   await chrome.storage.local.set({[KEY]:state});
   return result;
  });
  tail=next.catch(()=>{});
  return next;
 }
 const successToday=s=>BossGreetState.successToday(s);
 async function restoreArchivedSuccesses(){
  const all=await chrome.storage.local.get(null),saved={};
  for(const value of Object.values(all)){
   if(value?.contract==='boss-greet-completed-archive.v1'&&value.original?.results)
    Object.assign(saved,value.original.results);
  }
  if(Object.keys(saved).length)await tx(s=>{s.archivedResults={...saved,...s.archivedResults};});
 }
 function control(sender,message){
  try{
   const actual=new URL(sender.url),
    canonical=new URL(chrome.runtime.getURL('actions/greet/greet.html'));
   if(sender.id!==chrome.runtime.id)return false;
   if(actual.origin===canonical.origin&&actual.pathname===canonical.pathname)return true;
   const local=actual.protocol==='http:'&&['127.0.0.1','localhost'].includes(actual.hostname)&&
     actual.pathname==='/communications'&&Number.isInteger(sender.tab?.id)&&sender.tab.url===sender.url;
   return local&&message?.serverOrigin===actual.origin&&typeof message?.actionId==='string';
  }catch{return false;}
 }
 async function enqueue(input){
  const jobId=input?.jobId,securityId=input?.securityId;
  const greeting=input?.greeting??DEFAULT_GREETING;
  if(!validId(jobId)||typeof securityId!=='string'||!securityId||
   securityId.length>4096||typeof greeting!=='string'||
   !greeting.trim()||greeting.length>500)
   return{ok:false,reason:'INVALID_PARAMETERS'};
  let resumeIntent=null;
  try{if(typeof BossResumeDelivery!=='undefined')resumeIntent=await BossResumeDelivery.captureIntent();}catch{/* Optional feature cannot block Greet. */}
  const reason=await tx(s=>{
   if(s.paused)return'QUEUE_PAUSED';
   if(Object.hasOwn(s.results,jobId)||Object.hasOwn(s.archivedResults||{},jobId)||s.active?.id===jobId||
    s.queue.some(j=>j.id===jobId))return'DUPLICATE';
   if(successToday(s)>=150)return'DAILY_COMMUNICATION_LIMIT';
   s.queue.push({id:jobId,securityId,greeting,...(resumeIntent?{resumeIntent}:{}),...(input?.actionId&&input?.serverOrigin?{actionId:input.actionId,serverOrigin:input.serverOrigin}:{})});
   s.results[jobId]={status:'QUEUED'};
   return'ENQUEUED';
  });
  if(reason==='ENQUEUED'){
   void pump();
   void maintainAlarm().catch(()=>{});
  }
  return{ok:reason==='ENQUEUED',reason};
 }
 function schedule(wait){
  if(timer!==null)clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void pump();},Math.max(0,wait));
 }
 async function maintainAlarm(){
  const s=await load();
  if(!s.paused&&(s.active||s.queue.length||Object.values(s.results).some(r=>r.resumeTask?.status==='PENDING')))
   await chrome.alarms.create(ALARM,{periodInMinutes:0.5});
  else await chrome.alarms.clear(ALARM);
 }
 async function existingBossTab(){
  const tabs=(await chrome.tabs.query({})).filter(t=>{
   if(!Number.isInteger(t.id))return false;
   try{
    const url=new URL(t.url);
    return url.origin==='https://www.zhipin.com'&&url.pathname==='/web/geek/jobs';
   }catch{return false;}
  });
  return tabs.length===1?tabs[0]:null;
 }
 function failureInfo(record){
  const response=record.response,dialog=response?.zpData?.bizData?.chatRemindDialog;
  const message=String(dialog?.content||response?.message||record.error||'未确认成功，请核验原始回执').slice(0,500);
  const rejected=!record.error&&record.httpStatus===200&&Number.isInteger(response?.code)&&response.code!==0;
  const kind=!rejected?'UNKNOWN':[35,37].includes(response.code)?'SECURITY':
   dialog&&/达到沟通上限|明天再来/.test(String(dialog.title||'')+message)?'DAILY_LIMIT':
   dialog&&response.message==='开聊提醒'&&dialog.blockLevel===0?'REMINDER':
   response.code===1&&response.message==='该职位已不存在'?'CLOSED':'BUSINESS';
  return{kind,message};
 }
 async function restoreReceiptMetadata(){
  // Older queue records kept only the download identity. Recover the business
  // reason from Chrome's original JSON data URL, without any BOSS request.
  const s=await load();
  for(const [jobId,r] of Object.entries({...s.archivedResults,...s.results})){
   if(!['SUCCESS','FAILED'].includes(r.status)||(r.recordFinishedAt&&(r.status==='SUCCESS'||r.failure))||r.download?.status!=='COMPLETE'||!Number.isInteger(r.download.downloadId))continue;
   try{
    const [item]=await chrome.downloads.search({id:r.download.downloadId});
    if(item?.state!=='complete'||item.exists!==true||item.filename!==r.download.actualFilename||!/^data:application\/json(?:;charset=utf-8)?,/i.test(item.url||''))continue;
    const record=JSON.parse(decodeURIComponent(item.url.slice(item.url.indexOf(',')+1)));
    if(record.contract!=='boss-greet-result.v1'||record.jobId!==jobId||record.result!==r.status||record.method!=='POST'||record.endpoint!==ENDPOINT||!BossGreetState.localDay(record.finishedAt))continue;
    await tx(latest=>{
     const current=latest.results?.[jobId]||latest.archivedResults?.[jobId];
     if(current?.status===r.status&&current.download?.downloadId===r.download.downloadId){
      if(r.status==='FAILED')current.failure??=failureInfo(record);
      current.recordFinishedAt=record.finishedAt;
     }
    });
   }catch{/* Missing evidence never authorizes replay. */}
  }
 }
 async function conclude(jobId,success,download=null,pauseReason=null,failure=null,record=null){
  return tx(s=>{
   if(s.active?.id!==jobId)return false;
   const classified=BossGreetState.classify(record),durable=classified==='SUCCESS'&&download?.status==='COMPLETE';
   const unknown=classified==='UNKNOWN'||(classified==='SUCCESS'&&!durable);
   const request=s.queue.find(j=>j.id===jobId);
   s.results[jobId]={status:durable?'SUCCESS':unknown?'UNKNOWN':'FAILED',
    ...(durable&&request?.resumeIntent?{resumeTask:{status:'PENDING'}}:{}),
    at:Date.now(),download:download||{status:'NOT_AVAILABLE'},recordFinishedAt:record?.finishedAt,retryRequest:s.queue.find(j=>j.id===jobId),...(failure?{failure}:{}),
    ...(!durable?{sideEffectState:unknown?'UNKNOWN':'NOT_CONFIRMED'}:{})};
   if(!durable)s.paused={reason:pauseReason||
     (success?'GREET_RECEIPT_NOT_DURABLE':'GREET_REQUEST_FAILED'),
     jobId,at:Date.now()};
   s.queue=s.queue.filter(j=>j.id!==jobId);
   s.active=null;
   s.lastFinishedAt=Date.now();
   s.nextEligibleAt=s.lastFinishedAt+randomGap();
   return true;
  });
 }
 async function resume(input){
  const reason=await tx(s=>{
   if(s.active||!s.paused||s.paused.jobId!==input.jobId||s.paused.at!==input.pausedAt)
    return'PAUSE_CHANGED';
   const failed=s.results[s.paused.jobId];
   if(failed?.status!=='FAILED'||failed.download?.status!=='COMPLETE'||
     !['CLOSED','REMINDER'].includes(failed.failure?.kind))return'HUMAN_REVIEW_REQUIRED';
   if(Object.values(s.results).some(r=>r.status==='UNKNOWN'||r.sideEffectState==='UNKNOWN'))return'UNKNOWN_STOP';
   if(!s.queue.length||s.queue.some(j=>j.id===s.paused.jobId||s.results[j.id]?.status!=='QUEUED'))return'QUEUE_CHANGED';
   s.lastHumanResume={jobId:s.paused.jobId,at:Date.now(),kind:failed.failure.kind};
   s.paused=null;
   return'RESUMED';
  });
  if(reason==='RESUMED'){void pump();void maintainAlarm().catch(()=>{});}
  return{ok:reason==='RESUMED',reason};
 }
 async function retryFailed(input){
  let added=false;
  const result=await tx(async s=>{
   const previous=s.results?.[input.jobId],kind=previous?.failure?.kind;
   if(s.active||previous?.status!=='FAILED'||previous.at!==input.retryAt||
    previous.sideEffectState==='UNKNOWN'||previous.download?.status!=='COMPLETE'||
    !['REMINDER','DAILY_LIMIT'].includes(kind)||!previous.recordFinishedAt)return{ok:false,reason:'RETRY_NOT_ALLOWED'};
   if(Object.values(s.results).some(r=>r.status==='UNKNOWN'||r.sideEffectState==='UNKNOWN'))return{ok:false,reason:'UNKNOWN_STOP'};
   if(s.paused&&s.paused.jobId!==input.jobId&&s.queue.length)return{ok:false,reason:'OTHER_TASK_PAUSED'};
   if(successToday(s)>=150)return{ok:false,reason:'DAILY_COMMUNICATION_LIMIT'};
   let request=previous.retryRequest;
   let origin=request?.serverOrigin;
   if(!origin){
    const tabs=await chrome.tabs.query({}),origins=new Set();
    for(const tab of tabs)try{const u=new URL(tab.url);if(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/communications')origins.add(u.origin);}catch{}
    if(origins.size===1)origin=[...origins][0];
   }
   if(origin){
    const u=new URL(origin);
    if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))return{ok:false,reason:'FINDWORK_ORIGIN_INVALID'};
    const tabs=await chrome.tabs.query({});
    const local=tabs.find(t=>{try{const url=new URL(t.url);return Number.isInteger(t.id)&&url.origin===u.origin&&url.pathname==='/communications';}catch{return false;}});
    if(!local)return{ok:false,reason:'FINDWORK_TAB_UNAVAILABLE'};
    // The extension calls the formal API in the local Findwork tab; no BOSS tab
    // is inspected here and no server origin protection is weakened.
    const scripts=await chrome.scripting.executeScript({target:{tabId:local.id},world:'MAIN',func:async input=>{
     if(location.origin!==input.origin||location.pathname!=='/communications')return null;
     const reply=await fetch('/api/communications/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:input.jobId,finishedAt:input.finishedAt})});
     return{ok:reply.ok,claim:await reply.json()};
    },args:[{origin:u.origin,jobId:input.jobId,finishedAt:previous.recordFinishedAt}]});
    const answer=scripts?.[0]?.result,claim=answer?.claim;
    if(!answer?.ok)return{ok:false,reason:claim?.error||'FINDWORK_RETRY_UNCONFIRMED'};
    if(claim.jobId!==input.jobId||!claim.securityId||!claim.actionId)return{ok:false,reason:'FINDWORK_RETRY_UNCONFIRMED'};
    request={id:claim.jobId,securityId:claim.securityId,actionId:claim.actionId,serverOrigin:u.origin,greeting:request?.greeting||DEFAULT_GREETING,...(request?.resumeIntent?{resumeIntent:{...request.resumeIntent}}:{})};
   }
   if(!request?.securityId)return{ok:false,reason:'RETRY_PARAMETERS_UNAVAILABLE'};
   s.retryAttempts??={};(s.retryAttempts[input.jobId]??=[]).push(previous);
   s.results[input.jobId]={status:'QUEUED'};s.queue.push({...request,id:input.jobId});s.paused=null;added=true;
   return{ok:true,reason:'ENQUEUED'};
  });
  if(added){void pump();void maintainAlarm().catch(()=>{});}
  return result;
 }
 async function clearCompleted(input){
  const reason=await tx(s=>{
   if(s.active||s.queue.length)return'QUEUE_NOT_FINISHED';
   const entries=Object.entries(s.results||{});
   if(s.lastFinishedAt!==input.lastFinishedAt||entries.length!==input.resultCount||
     (s.paused?.at??null)!==input.pausedAt)return'QUEUE_CHANGED';
   if(!entries.length)return'NOTHING_TO_CLEAR';
   if(entries.some(([,r])=>!['SUCCESS','FAILED'].includes(r.status)||
     r.sideEffectState==='UNKNOWN'||r.download?.status!=='COMPLETE'))return'UNSETTLED_RESULTS';
   const plan=BossGreetState.cleanupPlan(s);
   if(!plan.allowed)return'TODAY_SUCCESS_QUOTA_NOT_REACHED';
   // Keep durable duplicate protection and evidence. Only the visible batch is
   // cleared; Chrome downloads and the external Findwork store are untouched.
   s.archivedResults??={};
   for(const id of plan.ids){s.archivedResults[id]=s.results[id];delete s.results[id];}
   if(s.paused&&plan.ids.includes(s.paused.jobId))s.paused=null;
   return'CLEARED';
  });
  return{ok:reason==='CLEARED',reason};
 }
 function greetFile(record){
  const date=new Date(record.startedAt);
  const day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+
   '-'+String(date.getDate()).padStart(2,'0');
  return 'BOSS/'+day+'/greet/greet-'+record.jobId+'-'+
   Date.now()+'-'+crypto.randomUUID()+'.json';
 }
 async function downloadResult(record,applicationFilename=null){
  const filename=applicationFilename||greetFile(record);
  const url='data:application/json;charset=utf-8,'+
   encodeURIComponent(JSON.stringify(record,null,2));
  return new Promise(resolve=>{
   let id=null,done=false;
   const finish=result=>{
    if(done)return;
    done=true;
    clearTimeout(timer);
    chrome.downloads.onChanged.removeListener(onChange);
    resolve({...result,filename,downloadId:id});
   };
   const check=async()=>{
    if(!Number.isInteger(id)||done)return;
    try{
     const [item]=await chrome.downloads.search({id});
     if(item?.state==='interrupted')
      return finish({status:'FAILED',error:String(item.error||'DOWNLOAD_INTERRUPTED')});
     if(item?.state!=='complete')return;
     const path=typeof item.filename==='string'?
      item.filename.replaceAll('\\','/'):null;
     finish(item.exists===true&&path?.endsWith('/'+filename)?
      {status:'COMPLETE',actualFilename:item.filename}:
      {status:'FAILED',error:'DOWNLOAD_FILE_NOT_CONFIRMED'});
    }catch(error){
     finish({status:'FAILED',error:String(error?.message||error)});
    }
   };
   const onChange=delta=>{
    if(delta.id===id&&(delta.state?.current==='complete'||
     delta.state?.current==='interrupted'))void check();
   };
   chrome.downloads.onChanged.addListener(onChange);
   const timer=setTimeout(()=>finish({status:'FAILED',error:'DOWNLOAD_TIMEOUT'}),60000);
   void(async()=>{
    try{
     id=await chrome.downloads.download({
      url,filename,saveAs:false,conflictAction:'uniquify'
     });
     if(!Number.isInteger(id))throw Error('DOWNLOAD_ID_MISSING');
     await check();
    }catch(error){
     finish({status:'FAILED',error:String(error?.message||error)});
    }
   })();
  });
 }
 async function execute(job){
  // Persist intent before POST. A worker restart never replays a Greet.
  const requestStart=Date.now();
  await tx(s=>{
   if(s.active||s.queue[0]?.id!==job.id)throw Error('QUEUE_OWNER_CHANGED');
   s.active={id:job.id,at:requestStart};
   s.results[job.id]={status:'RUNNING'};
  });
  let response=null,error=null;
  try{
   if(job.serverOrigin&&job.actionId){
    const origin=new URL(job.serverOrigin);
    if(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname))
      throw Error('FINDWORK_ORIGIN_INVALID');
    const checkUrl=origin.origin+'/api/communications/check?jobId='+encodeURIComponent(job.id)+'&actionId='+encodeURIComponent(job.actionId);
    const checked=await fetch(checkUrl,{cache:'no-store'});
    const result=await checked.json();
    if(!checked.ok||result.allowed!==true)throw Error('FINDWORK_PRE_SEND_BLOCKED');
   }
   const tab=await existingBossTab();
   if(!tab)throw Error('BOSS_TAB_UNAVAILABLE');
   const scripts=await chrome.scripting.executeScript({
    target:{tabId:tab.id},world:'MAIN',
    func:async input=>{
     if(location.origin!=='https://www.zhipin.com'||
      location.pathname!=='/web/geek/jobs')
      return{error:'BOSS_PAGE_CHANGED'};
     if(document.readyState!=='complete'||!document.querySelector('.rec-job-list'))
      return{error:'BOSS_LIST_DOM_NOT_READY'};
     try{
      const body=new URLSearchParams();
      body.set('securityId',input.securityId);
      body.set('jobId',input.jobId);
      body.set('greeting',input.greeting);
      const result=await fetch('/wapi/zpgeek/friend/add.json',{
       method:'POST',credentials:'include',
       headers:{
        'Accept':'application/json, text/plain, */*',
        'Content-Type':'application/x-www-form-urlencoded',
        'X-Requested-With':'XMLHttpRequest'
       },
       body:body.toString()
      });
      try{
       return{httpStatus:result.status,response:await result.json()};
      }catch(e){
       return{httpStatus:result.status,
        error:'RESPONSE_JSON_ERROR: '+String(e?.message||e)};
      }
     }catch(e){return{error:String(e?.message||e)};}
    },args:[{jobId:job.id,securityId:job.securityId,greeting:job.greeting}]
   });
   response=scripts?.[0]?.result||null;
   if(response?.error)error=response.error;
   if(!response)error='EMPTY_SCRIPT_RESULT';
  }catch(e){error=String(e?.message||e);}
  const success=response?.httpStatus===200&&response?.response?.code===0;
  const record={
   contract:'boss-greet-result.v1',
   jobId:job.id,
   ...(job.actionId?{actionId:job.actionId}:{}),
   endpoint:ENDPOINT,
   method:'POST',
   startedAt:new Date(requestStart).toISOString(),
   finishedAt:new Date().toISOString(),
   result:success?'SUCCESS':'FAILED',
   httpStatus:Number.isInteger(response?.httpStatus)?response.httpStatus:null,
   response:response?.response??null,
   ...(error?{error:String(error).slice(0,500)}:{})
  };
  record.result=BossGreetState.classify(record);
  let download;
  try{download=await downloadResult(record);}
  catch(e){download={status:'FAILED',error:String(e?.message||e)};}
  const pauseReason=!success?
   response?.response?.code===37?'SECURITY_CODE_37_STOP':
   (error||'GREET_RESPONSE_NOT_SUCCESS'):null;
  // File COMPLETE is the handoff; the AI verifies original JSON and imports later.
  await conclude(job.id,success,download,pauseReason,success?null:failureInfo(record),record);
  // PENDING was committed with Greet SUCCESS, before removing the original job.
  if(success&&download?.status==='COMPLETE')await processResumeTask(job.id);
 }
 async function syncPlatformStop(){
  if(typeof BossResumeDelivery==='undefined'||typeof BossResumeDelivery.outcome!=='function')return false;
  const o=await BossResumeDelivery.outcome(null);
  if(!o.platformStop)return false;
  await tx(s=>{
   if(s.paused?.reason!=='RESUME_SECURITY_STOP')s.paused={reason:o.stopKind==='UNKNOWN'?'RESUME_UNKNOWN_STOP':'RESUME_SECURITY_STOP',kind:o.stopKind||'SECURITY',message:o.reason,jobId:o.jobId,at:Date.now()};
   if(o.status==='UNKNOWN'&&s.results[o.jobId]?.resumeTask?.status==='PENDING')s.results[o.jobId].resumeTask={status:'REVIEW_REQUIRED',result:'UNKNOWN',reason:o.reason};
  });
  return true;
 }
 async function processResumeTask(jobId){
  const current=await load(),entry=current.results[jobId],task=entry?.resumeTask,job=task?.job||entry?.retryRequest;
  if(task?.status!=='PENDING')return;
  let outcome=null,error=null;
  try{
   if(typeof BossResumeDelivery==='undefined')throw Error('RESUME_OWNER_UNAVAILABLE');
   if(!job?.resumeIntent)throw Error('RESUME_HANDOFF_IDENTITY_MISSING');
   await BossResumeDelivery.afterGreet(job,downloadResult);
   outcome=typeof BossResumeDelivery.outcome==='function'?await BossResumeDelivery.outcome(jobId):{status:'UNKNOWN'};
  }catch(e){error=String(e?.message||e).slice(0,160);}
  await tx(s=>{
   const r=s.results[jobId];if(r?.resumeTask?.status!=='PENDING')return;
   const terminal=['SUCCESS','FAILED','SKIPPED'].includes(outcome?.status);
   r.resumeTask={status:terminal?'DONE':'REVIEW_REQUIRED',result:outcome?.status||'UNKNOWN',reason:error||outcome?.reason||null};
   s.lastFinishedAt=Date.now();s.nextEligibleAt=s.lastFinishedAt+randomGap();
   if(outcome?.platformStop)s.paused={reason:outcome.stopKind==='UNKNOWN'?'RESUME_UNKNOWN_STOP':'RESUME_SECURITY_STOP',kind:outcome.stopKind||'SECURITY',message:outcome.reason,jobId,at:Date.now()};
  });
 }
 async function pump(){
  if(busy)return;
  busy=true;
  try{
   if(await syncPlatformStop())return;
   const candidate=await tx(s=>{
    if(s.paused||s.active)return null;
    const pending=Object.entries(s.results).find(([,r])=>r.resumeTask?.status==='PENDING');
    if(pending)return{resumeJobId:pending[0]};
    if(!s.queue.length)return null;
    const delay=nextAllowedAt(s)-Date.now();
    return delay>0?{delay}:{job:{...s.queue[0]}};
   });
   if(!candidate)return;
   if(candidate.resumeJobId){await processResumeTask(candidate.resumeJobId);return;}
   if(candidate.delay){schedule(candidate.delay);return;}
   await execute(candidate.job);
  }catch{
   const s=await load().catch(()=>null);
   if(s?.active)await conclude(s.active.id,false).catch(()=>{});
  }finally{
   busy=false;
   const s=await load().catch(()=>null);
   if(s&&!s.active&&!s.paused&&(s.queue.length||Object.values(s.results).some(r=>r.resumeTask?.status==='PENDING')))
    schedule(Math.max(0,nextAllowedAt(s)-Date.now()));
   void maintainAlarm().catch(()=>{});
  }
 }
 async function bootstrap(){
  await restoreArchivedSuccesses();
  await restoreReceiptMetadata();
  await tx(s=>{
   for(const r of Object.values({...s.archivedResults,...s.results}))if(BossGreetState.isUnknown(r)){r.status='UNKNOWN';r.sideEffectState='UNKNOWN';}
   const unresolved=Object.entries({...s.archivedResults,...s.results}).find(([,r])=>BossGreetState.isUnknown(r));
   if(unresolved&&!s.paused)s.paused={reason:'UNKNOWN_STOP',jobId:unresolved[0],at:Date.now()};
  });
  // No re-sending after an interrupted worker. Record the interruption as a failure.
  const interrupted=await tx(s=>{
   if(!s.active)return null;
   const {id,at}=s.active;
   s.results[id]={status:'UNKNOWN',at:Date.now(),
    error:'WORKER_RESTART_INTERRUPTED',sideEffectState:'UNKNOWN'};
   s.paused={reason:'WORKER_RESTART_INTERRUPTED',jobId:id,at:Date.now()};
   s.queue=s.queue.filter(j=>j.id!==id);
   s.active=null;
   s.lastFinishedAt=Date.now();
   s.nextEligibleAt=s.lastFinishedAt+randomGap();
   return{id,at};
  });
  if(interrupted){
   const record={
    contract:'boss-greet-result.v1',jobId:interrupted.id,
    endpoint:ENDPOINT,method:'POST',
    startedAt:new Date(interrupted.at).toISOString(),
    finishedAt:new Date().toISOString(),result:'FAILED',
    httpStatus:null,response:null,error:'WORKER_RESTART_INTERRUPTED',
    sideEffectState:'UNKNOWN'
   };
   // A restart never replays the BOSS request.
   const download=await downloadResult(record).catch(e=>({
    status:'FAILED',error:String(e?.message||e)
   }));
   await tx(s=>{if(s.results[interrupted.id])
    s.results[interrupted.id].download=download;});
  }
  void pump();
  void maintainAlarm().catch(()=>{});
 }
 function install(){
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
   if(message?.type==='GREET_QUEUE_CAPABILITIES'){
    let allowed=false;try{const u=new URL(sender.url);allowed=sender.id===chrome.runtime.id&&((u.protocol==='chrome-extension:'&&u.host===chrome.runtime.id&&u.pathname==='/actions/greet/greet.html')||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&['/','/communications'].includes(u.pathname)&&sender.tab?.url===sender.url));}catch{}
    reply(allowed?{ok:true,protocolVersion:BossGreetState.protocolVersion,capabilities:BossGreetState.capabilities}:{ok:false});return false;
   }
   if(!['GREET_QUEUE_ENQUEUE','GREET_QUEUE_RESUME','GREET_QUEUE_CLEAR_COMPLETED','GREET_QUEUE_RETRY'].includes(message?.type))return false;
   if(!control(sender,message)){
    reply({ok:false,reason:'INVALID_GREET_PAGE'});
    return false;
   }
   if(message.type!=='GREET_QUEUE_ENQUEUE'&&sender.url?.split('?')[0]!==chrome.runtime.getURL('actions/greet/greet.html')){
    reply({ok:false,reason:'INVALID_GREET_PAGE'});return false;
   }
   (message.type==='GREET_QUEUE_RETRY'?retryFailed(message):message.type==='GREET_QUEUE_CLEAR_COMPLETED'?clearCompleted(message):message.type==='GREET_QUEUE_RESUME'?resume(message):enqueue(message)).then(reply,error=>
    reply({ok:false,reason:String(error?.message||error).slice(0,160)}));
   return true;
  });
  chrome.alarms.onAlarm.addListener(alarm=>{
   if(alarm.name===ALARM)void pump();
  });
  void bootstrap().catch(()=>{});
 }
 return{install,KEY};
})();

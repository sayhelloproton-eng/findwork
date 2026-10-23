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
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{10,120}$/.test(value);
 function tx(fn){
  const next=tail.then(async()=>{
   const state=await load(),result=await fn(state);
   await chrome.storage.local.set({[KEY]:state});
   return result;
  });
  tail=next.catch(()=>{});
  return next;
 }
 function control(sender){
  try{
   const actual=new URL(sender.url),
    canonical=new URL(chrome.runtime.getURL('actions/greet/greet.html'));
   return sender.id===chrome.runtime.id&&actual.origin===canonical.origin&&
    actual.pathname===canonical.pathname;
  }catch{return false;}
 }
 async function enqueue(input){
  const jobId=input?.jobId,securityId=input?.securityId;
  const greeting=input?.greeting??DEFAULT_GREETING;
  if(!validId(jobId)||typeof securityId!=='string'||!securityId||
   securityId.length>4096||typeof greeting!=='string'||
   !greeting.trim()||greeting.length>500)
   return{ok:false,reason:'INVALID_PARAMETERS'};
  const reason=await tx(s=>{
   if(s.paused)return'QUEUE_PAUSED';
   if(Object.hasOwn(s.results,jobId)||s.active?.id===jobId||
    s.queue.some(j=>j.id===jobId))return'DUPLICATE';
   s.queue.push({id:jobId,securityId,greeting});
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
  if(!s.paused&&(s.active||s.queue.length))
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
 async function conclude(jobId,success,download=null,pauseReason=null){
  return tx(s=>{
   if(s.active?.id!==jobId)return false;
   const durable=success&&download?.status==='COMPLETE';
   s.results[jobId]={status:durable?'SUCCESS':success?'UNKNOWN':'FAILED',
    at:Date.now(),download:download||{status:'NOT_AVAILABLE'},
    ...(!durable?{sideEffectState:success?'UNKNOWN':'NOT_CONFIRMED'}:{})};
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
 function greetFile(record){
  const date=new Date(record.startedAt);
  const day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+
   '-'+String(date.getDate()).padStart(2,'0');
  return 'BOSS/'+day+'/greet/greet-'+record.jobId+'-'+
   Date.now()+'-'+crypto.randomUUID()+'.json';
 }
 async function downloadResult(record){
  const filename=greetFile(record);
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
   endpoint:ENDPOINT,
   method:'POST',
   startedAt:new Date(requestStart).toISOString(),
   finishedAt:new Date().toISOString(),
   result:success?'SUCCESS':'FAILED',
   httpStatus:Number.isInteger(response?.httpStatus)?response.httpStatus:null,
   response:response?.response??null,
   ...(error?{error:String(error).slice(0,500)}:{})
  };
  let download;
  try{download=await downloadResult(record);}
  catch(e){download={status:'FAILED',error:String(e?.message||e)};}
  const pauseReason=!success?
   response?.response?.code===37?'SECURITY_CODE_37_STOP':
   (error||'GREET_RESPONSE_NOT_SUCCESS'):null;
  await conclude(job.id,success,download,pauseReason);
 }
 async function pump(){
  if(busy)return;
  busy=true;
  try{
   const candidate=await tx(s=>{
    if(s.paused||s.active||!s.queue.length)return null;
    const delay=nextAllowedAt(s)-Date.now();
    return delay>0?{delay}:{job:{...s.queue[0]}};
   });
   if(!candidate)return;
   if(candidate.delay){schedule(candidate.delay);return;}
   await execute(candidate.job);
  }catch{
   const s=await load().catch(()=>null);
   if(s?.active)await conclude(s.active.id,false).catch(()=>{});
  }finally{
   busy=false;
   const s=await load().catch(()=>null);
   if(s?.queue.length&&!s.active&&!s.paused)
    schedule(Math.max(0,nextAllowedAt(s)-Date.now()));
   void maintainAlarm().catch(()=>{});
  }
 }
 async function bootstrap(){
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
   if(message?.type!=='GREET_QUEUE_ENQUEUE')return false;
   if(!control(sender)){
    reply({ok:false,reason:'INVALID_GREET_PAGE'});
    return false;
   }
   enqueue(message).then(reply,error=>
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

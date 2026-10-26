/* Optional attachment delivery within the Greet owner. Disabled by default.
 * No independent scheduler, no retries, no change to Greet receipts or quota. */
var BossResumeDelivery=(()=>{
 'use strict';
 const KEY='boss-resume-delivery-v1',ENDPOINT='/wapi/zpgeek/resume/onekeydeliver.json';
 let tail=Promise.resolve();
 const fresh=()=>({enabled:false,generation:0,resumeId:'',choices:[],results:{},active:null,halt:null});
 const load=async()=>({...fresh(),...(await chrome.storage.local.get(KEY))[KEY]});
 function tx(fn){const p=tail.then(async()=>{const s=await load(),r=await fn(s);await chrome.storage.local.set({[KEY]:s});return r;});tail=p.catch(()=>{});return p;}
 async function captureIntent(){await ready;const s=await load();return s.enabled?{generation:s.generation,resumeId:s.resumeId}:null;}
 async function bossCall(func,input){
  const tabs=(await chrome.tabs.query({})).filter(t=>{try{const u=new URL(t.url);return Number.isInteger(t.id)&&u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';}catch{return false;}});
  if(tabs.length!==1)throw Error('BOSS_TAB_UNAVAILABLE');
  const r=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'MAIN',func,args:[input]});
  if(!r?.[0]?.result)throw Error('EMPTY_SCRIPT_RESULT');return r[0].result;
 }
 // Runs only in the extension's existing native BOSS context. No mutation here.
 async function prepare(input){
  if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/geek/jobs'||document.readyState!=='complete'||!document.querySelector('.rec-job-list'))throw Error('BOSS_LIST_DOM_NOT_READY');
  async function read(url,options={}){
   const r=await fetch(url,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
   const p=await r.json();if([35,37].includes(p.code))throw Error('BOSS_SECURITY_VERIFICATION');if(r.status!==200||p.code!==0)throw Error(String(p.message||'RESUME_PREPARE_REJECTED').slice(0,300));return p.zpData;
  }
  let detail=null,securityId=input.securityId;
  if(input.jobId){
   detail=await read('/wapi/zpgeek/job/detail.json?'+new URLSearchParams({jobId:input.jobId,securityId:input.securityId}));
   if(detail?.jobInfo?.encryptId!==input.jobId)throw Error('DETAIL_ID_MISMATCH');
   if(detail.jobInfo.invalidStatus)throw Error('JOB_CLOSED');
   if(detail.oneKeyResumeInfo?.alreadySend===true)return{skip:'ALREADY_SENT'};
   if(detail.oneKeyResumeInfo?.canSendResume!==true)return{skip:'NOT_SUPPORTED'};
   securityId=typeof detail.securityId==='string'&&detail.securityId?detail.securityId:securityId;
   const check=await read('/wapi/zpgeek/exchange/precheck/query.json',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({type:'3',securityId}).toString()});
   if(!check||!Number.isInteger(check.status))throw Error('RESUME_PRECHECK_UNCONFIRMED');
   if(check.status!==0)return{blocked:'HUMAN_CONFIRMATION_REQUIRED'};
  }
  const attachments=await read('/wapi/zpgeek/resume/attachment/checkbox.json');
  const choices=(Array.isArray(attachments?.resumeList)?attachments.resumeList:[]).filter(r=>r.resumeId!=null&&String(r.resumeId)).map(r=>({id:String(r.resumeId),name:String(r.showName||r.resumeName||r.originalName||'附件简历').slice(0,120)}));
  if(!Number.isInteger(attachments?.resumeCount)||attachments.resumeCount!==choices.length)throw Error('RESUME_LIST_UNCONFIRMED');
  if(!input.jobId)return{choices};
  if(!choices.length)return{choices,blocked:'NO_ATTACHMENT_RESUME'};
  const selected=input.resumeId?choices.find(r=>r.id===input.resumeId):choices.length===1?choices[0]:null;
  if(!selected)return{choices,blocked:input.resumeId?'SELECTED_RESUME_UNAVAILABLE':'SELECT_ATTACHMENT_RESUME'};
  // Both values must come from this same detail response, never another job.
  if(typeof detail.lid!=='string'||!detail.lid)throw Error('DETAIL_LID_MISSING');
  return{choices,resumeId:selected.id,resumeName:selected.name,lid:detail.lid,securityId};
 }
 async function submit(input){
  if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/geek/jobs'||document.readyState!=='complete'||!document.querySelector('.rec-job-list'))return{notSent:true,error:'BOSS_LIST_DOM_NOT_READY'};
  try{
   const query=new URLSearchParams({jobId:input.jobId,securityId:input.securityId,lid:input.lid,resumeId:input.resumeId});
   const r=await fetch('/wapi/zpgeek/resume/onekeydeliver.json?'+query,{method:'POST',credentials:'include',signal:AbortSignal.timeout(20000),headers:{'Accept':'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'}});
   return{httpStatus:r.status,response:await r.json()};
  }catch{return{error:'RESUME_RESPONSE_UNCONFIRMED'};}
 }
 async function localCheck(job){
  if(!job.actionId&&!job.serverOrigin)return;
  if(!job.actionId||!job.serverOrigin)throw Error('FINDWORK_CONTEXT_INCOMPLETE');
  const u=new URL(job.serverOrigin);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))throw Error('FINDWORK_ORIGIN_INVALID');
  const r=await fetch(u.origin+'/api/resume-applications/check?'+new URLSearchParams({jobId:job.id,actionId:job.actionId}),{cache:'no-store',signal:AbortSignal.timeout(5000)});
  const p=await r.json();if(!r.ok||p.allowed!==true)throw Error('FINDWORK_RESUME_BLOCKED');
 }
 async function afterGreet(job,save){
  await ready;if(!job.resumeIntent)return false;
  const actionId='resume-'+crypto.randomUUID(),startedAt=new Date().toISOString();
  const accepted=await tx(s=>{
   if(s.results[job.id]||s.active)return false;
   if(!s.enabled||s.generation!==job.resumeIntent.generation||s.halt){s.results[job.id]={status:'SKIPPED',reason:s.halt?'RESUME_QUEUE_PAUSED':'RESUME_SWITCH_CHANGED'};return false;}
   s.active={jobId:job.id,actionId,stage:'PREPARING',startedAt};s.results[job.id]={status:'PREPARING'};return true;
  });
  if(!accepted)return false;
  let answer=null,error=null,sending=false,attachment=null;
  try{
   const prepared=await bossCall(prepare,{jobId:job.id,securityId:job.securityId,resumeId:job.resumeIntent.resumeId||''});
   if(prepared.choices)await tx(s=>{s.choices=prepared.choices;});
   if(prepared.skip){await tx(s=>{s.results[job.id]={status:'SKIPPED',reason:prepared.skip};s.active=null;});return true;}
   if(prepared.blocked)throw Error(prepared.blocked);
   attachment={resumeId:prepared.resumeId,resumeName:prepared.resumeName};
   await localCheck(job);
   const allowed=await tx(s=>{
    if(!s.enabled||s.generation!==job.resumeIntent.generation||s.halt) return false;
    Object.assign(s.active,attachment,{stage:'SENDING'});return true;
   });
   if(!allowed)throw Error('RESUME_SWITCH_CHANGED');
   sending=true;answer=await bossCall(submit,{jobId:job.id,securityId:prepared.securityId,resumeId:prepared.resumeId,lid:prepared.lid});
  }catch(e){error=String(e?.message||e).slice(0,300);}
  const success=answer?.httpStatus===200&&answer?.response?.code===0;
  const rejected=answer?.httpStatus===200&&Number.isInteger(answer?.response?.code)&&answer.response.code!==0;
  const unknown=sending&&!success&&!rejected&&!answer?.notSent;
  const result=success?'SUCCESS':unknown?'UNKNOWN':'FAILED';
  const reason=success?'简历投递成功':error||answer?.error||String(answer?.response?.message||'RESUME_REJECTED').slice(0,300);
  const record={contract:'job-application-result.v1',kind:'RESUME_SUBMISSION',platform:'BOSS',jobId:job.id,actionId,
   ...(job.actionId?{greetActionId:job.actionId}:{}),endpoint:ENDPOINT,method:'POST',startedAt,finishedAt:new Date().toISOString(),
   ...(attachment||{}),
   result,confirmed:success,receipt:{httpStatus:answer?.httpStatus??null,response:answer?.response??null},
   ...(!success?{error:reason}:{}),...(unknown?{sideEffectState:'UNKNOWN'}:{})};
  // Persist any platform stop before waiting for the independent file receipt.
  await tx(s=>{
   if(s.active?.jobId!==job.id)throw Error('RESUME_OWNER_CHANGED');
   s.active.stage='RECEIPT_PENDING';
   if(unknown||[35,37].includes(answer?.response?.code)||reason==='BOSS_SECURITY_VERIFICATION')s.halt={jobId:job.id,reason,unknown,requiresReview:true};
  });
  let download;try{
   const d=new Date(record.finishedAt),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
   download=await save(record,'BOSS/'+day+'/application/application-'+job.id+'-'+actionId+'.json');
  }catch{download={status:'FAILED'};}
  await tx(s=>{
   const durable=download?.status==='COMPLETE';
   s.results[job.id]={status:durable?result:'UNKNOWN',reason:durable?reason:'RESUME_RECEIPT_NOT_DURABLE',actionId,finishedAt:record.finishedAt,download,...(attachment||{})};
   if(!success||!durable)s.halt={jobId:job.id,reason:durable?reason:'RESUME_RECEIPT_NOT_DURABLE',unknown:unknown||!durable,requiresReview:unknown||!durable||[35,37].includes(answer?.response?.code)||reason==='BOSS_SECURITY_VERIFICATION'};
   s.active=null;
  });return true;
 }
 const ready=tx(s=>{
  if(!s.active)return;
  const unknown=s.active.stage!=='PREPARING';
  s.results[s.active.jobId]={status:unknown?'UNKNOWN':'FAILED',reason:'RESUME_WORKER_INTERRUPTED',actionId:s.active.actionId,...(s.active.resumeId?{resumeId:s.active.resumeId,resumeName:s.active.resumeName}: {})};
  s.halt={jobId:s.active.jobId,reason:'RESUME_WORKER_INTERRUPTED',unknown,requiresReview:unknown||s.halt?.requiresReview===true};s.active=null;
 });
 void ready.catch(()=>{});
 async function outcome(jobId){
  await ready;const s=await load(),id=jobId||s.halt?.jobId,r=s.results[id];
  return{jobId:id||null,status:r?.status||null,platformStop:s.halt?.requiresReview===true,stopKind:s.halt?.unknown?'UNKNOWN':'SECURITY',reason:s.halt?.reason||r?.reason||null};
 }
 async function settings(input){
  await ready;return tx(s=>{
   if(typeof input.enabled!=='boolean')return{ok:false,reason:'INVALID_RESUME_SETTINGS'};
   if(input.resumeId!=null&&(typeof input.resumeId!=='string'||(input.resumeId&&!s.choices.some(r=>r.id===input.resumeId))))return{ok:false,reason:'INVALID_RESUME_SELECTION'};
   if(input.continue===true&&(s.active||s.halt?.unknown||s.halt?.requiresReview))return{ok:false,reason:'RESUME_UNKNOWN_STOP'};
   if(input.enabled!==s.enabled){s.enabled=input.enabled;s.generation++;}
   if(input.resumeId!=null)s.resumeId=input.resumeId;
   if(input.continue===true)s.halt=null;
   return{ok:true};
  });
 }
 function install(){
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
   if(!['RESUME_DELIVERY_SETTINGS','RESUME_DELIVERY_OPTIONS'].includes(m?.type))return false;
   if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('actions/greet/greet.html')){reply({ok:false,reason:'INVALID_GREET_PAGE'});return false;}
   const action=m.type==='RESUME_DELIVERY_SETTINGS'?settings(m):(async()=>{await ready;const r=await bossCall(prepare,{});await tx(s=>{s.choices=r.choices;});return{ok:true};})();
   action.then(reply,e=>reply({ok:false,reason:String(e?.message||e).slice(0,160)}));return true;
  });
 }
 return{KEY,captureIntent,afterGreet,outcome,install};
})();

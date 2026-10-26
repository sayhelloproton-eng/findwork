/* Only opens/reuses the existing Detail entry. Never operates or requests BOSS. */
var BossCollectionLaunch=(()=>{
 'use strict';
 const KEY='boss-findwork-collection-launch-v1',RUN='boss-dom-detail-sequence-v1',DETAIL='boss-natural-detail-v1';
 let tail=Promise.resolve();
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 const path=()=>chrome.runtime.getURL('actions/detail/dom.html');
 const controls=tabs=>tabs.filter(t=>{try{const a=new URL(t.url),b=new URL(path());return a.origin===b.origin&&a.pathname===b.pathname;}catch{return false;}});
 const matches=(tab,id)=>{try{return new URL(tab.url).searchParams.get('requestId')===id;}catch{return false;}};
 async function snapshot(){
  const saved=await chrome.storage.local.get([KEY,RUN,DETAIL,'boss-greet-queue-v1','boss-resume-delivery-v1']);
  const tabs=controls(await chrome.tabs.query({})),last=saved[KEY],run=saved[RUN],greet=saved['boss-greet-queue-v1'];
  const unsettled=Object.values(saved[DETAIL]?.records||{}).some(r=>['CAPTURED','DISPATCHING','IN_PROGRESS','VERIFY_PENDING'].includes(r.status));
  const starting=last&&tabs.some(t=>matches(t,last.requestId)&&!/^Detail · (?:STOP|FAILED)/.test(t.title||''))&&
    run?.requestId!==last.requestId;
  const reason=tabs.length>1?'MULTIPLE_COLLECTION_PAGES':run?.status==='RUNNING'?'COLLECTION_RUNNING':unsettled?'COLLECTION_DOWNLOAD_PENDING':
   greet?.active||greet?.queue?.length||saved['boss-resume-delivery-v1']?.active||Object.values(greet?.results||{}).some(r=>r.resumeTask?.status==='PENDING')?'GREET_RUNNING':starting?'COLLECTION_START_PENDING':['UNKNOWN','OPENING'].includes(last?.status)&&!tabs.some(t=>matches(t,last.requestId))?'COLLECTION_OPEN_UNCONFIRMED':null;
  return{tabs,last,run,reason,canStart:!reason};
 }
 function ack(saved,tab){return{ok:true,requestId:saved.requestId,expect:saved.expect,pages:saved.pages,startedAt:saved.startedAt,tabId:tab.id};}
 async function launch(m){
  if(!Number.isInteger(m.expect)||m.expect<1||m.expect>99||!Number.isInteger(m.pages)||m.pages<1||m.pages>21||typeof m.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,120}$/.test(m.requestId))return{ok:false,reason:'INVALID_COLLECTION_PARAMETERS'};
  const s=await snapshot();
  if(s.last?.requestId===m.requestId){
   if(s.last.expect!==m.expect||s.last.pages!==m.pages)return{ok:false,reason:'COLLECTION_PARAMETERS_CHANGED'};
   const same=s.tabs.find(t=>matches(t,m.requestId));
   if(same)return ack(s.last,same); // Lost ACK: reconcile the same tab, never navigate twice.
   return{ok:false,reason:'COLLECTION_OPEN_UNCONFIRMED'};
  }
  if(!s.canStart)return{ok:false,reason:s.reason};
  const record={requestId:m.requestId,expect:m.expect,pages:m.pages,startedAt:new Date().toISOString(),status:'OPENING'};
  const url=new URL(path());url.search=new URLSearchParams({auto:'1',expect:String(m.expect),pages:String(m.pages),fresh:'1',requestId:m.requestId}).toString();
  await chrome.storage.local.set({[KEY]:record});
  try{
   const tab=s.tabs.length?await chrome.tabs.update(s.tabs[0].id,{url:url.href,active:true}):await chrome.tabs.create({url:url.href,active:true});
   if(!Number.isInteger(tab?.id))throw Error('COLLECTION_TAB_MISSING');
   await chrome.storage.local.set({[KEY]:{...record,status:'OPENED',tabId:tab.id}});return ack(record,tab);
  }catch{
   await chrome.storage.local.set({[KEY]:{...record,status:'UNKNOWN'}});
   const existing=controls(await chrome.tabs.query({})).find(t=>matches(t,m.requestId));
   return existing?ack(record,existing):{ok:false,reason:'COLLECTION_OPEN_UNCONFIRMED'};
  }
 }
 function install(){
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
   if(!['COLLECTION_LAUNCH','COLLECTION_LAUNCH_STATUS'].includes(m?.type))return false;
   let allowed=false;try{const u=new URL(sender.url);allowed=sender.id===chrome.runtime.id&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/'&&Number.isInteger(sender.tab?.id)&&sender.tab.url===sender.url;}catch{}
   if(!allowed){reply({ok:false,reason:'INVALID_COLLECTION_CALLER'});return false;}
   serial(async()=>m.type==='COLLECTION_LAUNCH'?launch(m):((s)=>({ok:true,canStart:s.canStart,reason:s.reason,runStatus:s.run?.status||null}))(await snapshot())).then(reply,()=>reply({ok:false,reason:'COLLECTION_STATE_UNAVAILABLE'}));return true;
  });
 }
 return{install};
})();

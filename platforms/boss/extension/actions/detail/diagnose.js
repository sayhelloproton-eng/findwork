/* One-shot, read-only extension diagnostics for the current BOSS list tab. */
(async()=>{
'use strict';
const out=document.getElementById('result');
const show=x=>{out.textContent=JSON.stringify(x,null,2);};
const id=new URLSearchParams(location.search).get('jobId')||'';
const tabs=(await chrome.tabs.query({})).filter(x=>{
 try{const u=new URL(x.url);return u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';}catch{return false;}
});
if(tabs.length!==1||!Number.isInteger(tabs[0].id)){show({ok:false,reason:'BOSS_TAB_NOT_UNIQUE',count:tabs.length});return;}
const tabId=tabs[0].id;
const report={contract:'boss-detail-readonly-diagnosis.v1',ok:true,tabIdentity:'BOSS_JOBS',checks:{}};
async function step(name,run){
 try{report.checks[name]=await run();}
 catch(e){report.checks[name]={error:String(e?.message||e).slice(0,180)};}
}
await step('observer',async()=>{
 const s=await chrome.tabs.sendMessage(tabId,{type:'BOSS_OBSERVER_READ',cursor:0});
 return{ok:s?.ok===true,hookReady:s?.hookReady,hookOwnership:s?.hookOwnership,
  hookContract:s?.hookContract,
  docKnown:Boolean(s?.hookDocId),eventsReturned:s?.events?.length,dropped:s?.dropped,
  pending:s?.pending,cardCount:s?.cardCount,
  detailEvents:(s?.events||[]).filter(x=>x.path==='/wapi/zpgeek/job/detail.json')
   .slice(-18).map(x=>({kind:x.kind,http:x.httpStatus,api:x.apiCode,
    inspection:x.inspection,requestId:x.requestId}))};
});
await step('isolatedDom',async()=>{
 const res=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',
  func:wanted=>{
   const cards=[...document.querySelectorAll('.rec-job-list .job-card-box,.job-list-container .job-card-box')];
   const selected=cards.filter(e=>/active|selected|current/i.test(e.className)||e.getAttribute('aria-selected')==='true');
   const targets=cards.map((card,index)=>{
    const a=card.querySelector('a[href*="/job_detail/"]');
    let match=false;
    try{match=Boolean(a&&new URL(a.href,location.origin).pathname==='/job_detail/'+wanted+'.html');}catch{}
    return{index,match,active:/active|selected|current/i.test(card.className),
     ariaSelected:card.getAttribute('aria-selected')||null};
   }).filter(x=>x.match);
   return{observerMarker:Boolean(window.__bossPageObserverV1),cards:cards.length,
    selectedCount:selected.length,selectedIndices:selected.slice(0,5).map(x=>cards.indexOf(x)),
    targetCards:targets,readyState:document.readyState};
  },args:[id]});
 return res?.[0]?.result||{error:'NO_ISOLATED_RESULT'};
});
await step('pageStructure',async()=>{
 const result=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>{
  const selectors=['.rec-job-list','.job-list-container','.job-card-box',
   '.job-card-wrapper','.job-list-box','.job-item'];
  const counts=Object.fromEntries(selectors.map(s=>[s,document.querySelectorAll(s).length]));
  const body=(document.body?.innerText||'').slice(0,4000);
  return{readyState:document.readyState,jobLinkCount:
   document.querySelectorAll('a[href*="/job_detail/"]').length,selectorCounts:counts,
   elementCount:document.body?.querySelectorAll('*').length||0,
   flags:{challenge:/安全验证|拖动滑块|验证码|访问受限|人机验证/.test(body),
    login:/登录后|手机号登录|扫码登录|请先登录/.test(body),
    empty:/暂无职位|暂无数据|暂无相关职位/.test(body),
    loading:/加载中|正在加载|loading/i.test(body)}};
 }});
 return result?.[0]?.result||{error:'NO_STRUCTURE_RESULT'};
});
await step('scrollGeometry',async()=>{
 const result=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:()=>{
  const safe=x=>String(x?.className||'').split(/\s+/).filter(v=>
   /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(v)).slice(0,6);
  const shape=e=>{
   if(!e)return null;
   const rect=e.getBoundingClientRect(),style=getComputedStyle(e);
   return{tag:e.tagName,classes:safe(e),clientHeight:e.clientHeight,
    scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,overflowY:style.overflowY,
    rect:{top:Math.round(rect.top),height:Math.round(rect.height)},
    jobCardDescendants:e.querySelectorAll('.job-card-box').length};
  };
  const list=document.querySelector('.rec-job-list')||
   document.querySelector('.job-list-container');
  if(!list)return{error:'JOB_LIST_NOT_FOUND'};
  const ancestors=[];
  for(let e=list;e&&ancestors.length<12;e=e.parentElement)ancestors.push(shape(e));
  return{ancestors,page:shape(document.scrollingElement||document.documentElement)};
 }});
 return result?.[0]?.result||{error:'NO_GEOMETRY_RESULT'};
});
await step('resourceSummary',async()=>{
 const result=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:()=>{
  const all=performance.getEntriesByType('resource');
  const owned=all.filter(r=>{try{return new URL(r.name).origin===location.origin;}catch{return false;}});
  const count=pathname=>owned.filter(r=>{try{return new URL(r.name).pathname===pathname;}catch{return false;}}).length;
  return{totalResources:all.length,sameOriginResources:owned.length,
   naturalListResources:count('/wapi/zpgeek/pc/recommend/job/list.json'),
   naturalDetailResources:count('/wapi/zpgeek/job/detail.json')};
 }});
 return result?.[0]?.result||{error:'NO_RESOURCE_RESULT'};
});
await step('mainHook',async()=>{
 const res=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',
  func:()=>({
   mainV1Marker:Boolean(Object.getOwnPropertyDescriptor(globalThis,'__bossDiagMainV1')),
   mainV2Marker:Boolean(Object.getOwnPropertyDescriptor(globalThis,'__bossDiagMainV2')),
   mainV3Marker:Boolean(Object.getOwnPropertyDescriptor(globalThis,'__bossDiagMainV3')),
   v3Status:globalThis.__bossDiagMainV3?.status?.()||null,
   legacyNames:{fetch:window.fetch?.name||null,
    open:XMLHttpRequest.prototype.open?.name||null,
    send:XMLHttpRequest.prototype.send?.name||null},
   pathname:location.pathname,
   readyState:document.readyState
  })});
 return res?.[0]?.result||{error:'NO_MAIN_RESULT'};
});
await step('freshHandshake',async()=>{
 const r=await chrome.tabs.sendMessage(tabId,{
  type:'BOSS_OBSERVER_PROBE_HOOK',token:crypto.randomUUID()});
 return{ok:r?.ok===true,probeStatus:r?.probeStatus,hookReady:r?.hookReady,
  hookOwnership:r?.hookOwnership,hookContract:r?.hookContract};
});
await step('bootRecovery',async()=>{
 const r=await chrome.storage.local.get('boss-hook-recovery-v3');
 return r['boss-hook-recovery-v3']||null;
});
await step('captureTimeline',async()=>{
 const keys=['boss-refresh-stage-log-v1','boss-dom-stage-log-v1',
  'boss-raw-event-gate-v1','boss-raw-downloads-v2','boss-dom-detail-sequence-v1'];
 const state=await chrome.storage.local.get(keys);
 const refresh=state[keys[0]],dom=state[keys[1]],gate=state[keys[2]],
  raw=state[keys[3]],session=state[keys[4]];
 return{
  refresh:refresh?{runId:refresh.runId,status:refresh.status,events:(refresh.events||[]).slice(-35)}:null,
  dom:dom?{status:dom.status,completed:dom.completed,target:dom.target,
   events:(dom.events||[]).slice(-50)}:null,
  gate:gate?{kind:gate.kind,status:gate.status,runId:gate.runId,
   selectedKey:gate.selectedKey||null}:null,
  lastListReceipts:(raw?.records||[]).slice(-10).map(r=>({status:r.status,
   filename:r.filename,jobCount:r.jobIds?.length||0,downloadId:r.downloadId||null})),
  session:session?{status:session.status,completed:session.completed,
   target:session.targetDownloads,failed:session.failed}:null};
});
if(/^[a-zA-Z0-9_~-]{10,120}$/.test(id))await step('detailStore',async()=>{
 const r=await chrome.runtime.sendMessage({type:'BOSS_NATIVE_DETAIL_LOOKUP',jobId:id});
 return{ok:r?.ok,status:r?.status,hasDownloadPath:Boolean(r?.downloadPath)};
});
show(report);
})().catch(e=>document.getElementById('result').textContent='DIAG_FAILED: '+String(e?.message||e));

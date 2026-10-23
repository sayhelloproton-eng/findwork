/* Passive original Detail response capture. No BOSS HTTP is generated here. */
var BossNaturalDetail=(()=>{
 'use strict';
 const KEY='boss-natural-detail-v1',INBOX='boss-native-detail-inbox-v1:',API='/wapi/zpgeek/job/detail.json';
 const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_~-]{10,120}$/.test(v);
 const initial=()=>({contract:'boss-natural-detail.v1',records:{}});
 let tail=Promise.resolve();
 const load=async()=> (await chrome.storage.local.get(KEY))[KEY]||initial();
 function tx(fn){
  const task=tail.then(async()=>{
   const state=await load(),result=fn(state);
   await chrome.storage.local.set({[KEY]:state});return result;
  });
  tail=task.catch(()=>{});return task;
 }
 const update=(id,patch)=>tx(s=>{
  if(!s.records[id])return false;
  Object.assign(s.records[id],patch,{updatedAt:Date.now()});return true;
 });
 function trusted(m,s){
  if(m?.type!=='BOSS_RAW_DETAIL_RESPONSE'||s?.id!==chrome.runtime.id||
   s.frameId!==0||m.path!==API||!/^doc-[\w-]{8,100}$/.test(m.docId||'')||
   !Number.isSafeInteger(m.requestId)||m.requestId<1||
   !Number.isInteger(m.httpStatus)||m.httpStatus<200||m.httpStatus>=300)return null;
  try{
   const u=new URL(s.recovered===true?m.sourceUrl:s.tab?.url);
   if(u.origin!=='https://www.zhipin.com'||u.pathname!=='/web/geek/jobs')return null;
  }catch{return null;}
  const info=m.responseBody?.zpData?.jobInfo;
  if(m.responseBody?.code!==0||!valid(info?.encryptId)||
   typeof info.postDescription!=='string'||!info.postDescription.trim()||
   typeof info.jobName!=='string'||!info.jobName.trim())return null;
  return info.encryptId;
 }
 function filepath(jobId){
  const d=new Date(),day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+
   '-'+String(d.getDate()).padStart(2,'0');
  return 'BOSS/'+day+'/detail/native-'+jobId+'-'+Date.now()+'-'+crypto.randomUUID()+'.json';
 }
 async function reconcile(id,downloadId){
  const r=(await load()).records[id];
  if(r?.downloadId!==downloadId)return;
  let item;try{[item]=await chrome.downloads.search({id:downloadId});}
  catch{await update(id,{status:'UNKNOWN',error:'DOWNLOAD_LOOKUP_ERROR'});return;}
  if(item?.state==='interrupted'){
   await update(id,{status:'FAILED',error:'DOWNLOAD_INTERRUPTED'});return;
  }
  if(item?.state==='complete'){
   const name=typeof item.filename==='string'?item.filename.replaceAll('\\','/'):null;
   await update(id,item.exists===true&&name?.endsWith('/'+r.filename)?
    {status:'COMPLETE',raw:null,actualFilename:item.filename,error:null}:
    {status:'UNKNOWN',error:'DOWNLOAD_FILE_NOT_CONFIRMED'});
  }
 }
 async function download(id){
  const r=(await load()).records[id];
  if(r?.status!=='CAPTURED')return;
  await update(id,{status:'DISPATCHING'});
  try{
   const data='data:application/json;charset=utf-8,'+
    encodeURIComponent(JSON.stringify(r.raw));
   const downloadId=await chrome.downloads.download({
    url:data,filename:r.filename,saveAs:false,conflictAction:'uniquify'});
   if(!Number.isInteger(downloadId))throw Error('DOWNLOAD_ID_MISSING');
   await update(id,{status:'IN_PROGRESS',downloadId,raw:null});
   await reconcile(id,downloadId);
  }catch{await update(id,{status:'UNKNOWN',error:'DOWNLOAD_DISPATCH_UNCERTAIN'});}
 }
 async function accept(m,s){
  const id=trusted(m,s);
  if(!id)return{ok:false,saved:false,status:'INVALID_DETAIL'};
  const active=(await chrome.storage.local.get('boss-dom-detail-sequence-v1'))
   ['boss-dom-detail-sequence-v1'];
  const runId=active?.fresh===true&&active?.status==='RUNNING'&&
   typeof active.runId==='string'?active.runId:null;
  const record=await tx(state=>{
   if(state.records[id])return{saved:true,status:state.records[id].status};
   const keys=Object.keys(state.records);
   if(keys.length>=600){
    const finished=keys.filter(k=>state.records[k].status==='COMPLETE')
     .sort((a,b)=>state.records[a].startedAt-state.records[b].startedAt);
    for(const k of finished.slice(0,keys.length-599))delete state.records[k];
   }
   state.records[id]={jobId:id,runId,status:'CAPTURED',startedAt:Date.now(),filename:filepath(id),
    downloadId:null,raw:{contract:'boss-natural-detail.v1',jobId:id,apiCode:0,
     capturedAt:new Date().toISOString(),rawResponse:m.responseBody}};
   return{saved:true,status:'CAPTURED'};
  });
  if(record.status==='CAPTURED')void download(id);
  return{ok:true,...record,jobId:id};
 }
 async function recover(){
  const all=await chrome.storage.local.get(null);
  for(const [key,m] of Object.entries(all)){
   if(!key.startsWith(INBOX)||m?.inboxKey!==key||
    key!==INBOX+m?.docId+':'+m?.requestId)continue;
   const r=await accept(m,{id:chrome.runtime.id,frameId:0,recovered:true});
   if(r.saved)await chrome.storage.local.remove(key);
  }
  const s=await load();
  for(const row of Object.values(s.records)){
   if(row.status==='CAPTURED')void download(row.jobId);
   if(row.status==='IN_PROGRESS'&&Number.isInteger(row.downloadId))
    await reconcile(row.jobId,row.downloadId);
   if(row.status==='DISPATCHING')
    await update(row.jobId,{status:'UNKNOWN',error:'WORKER_RESTART_UNKNOWN'});
  }
 }
 function install(){
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
   if(m?.type==='BOSS_NATIVE_DETAIL_LOOKUP'){
    if(s.id!==chrome.runtime.id||!valid(m.jobId)){reply({ok:false});return false;}
    load().then(data=>{
     const r=data.records[m.jobId];
     const wrongRun=typeof m.runId==='string'&&r&&r.runId!==m.runId;
     reply({ok:true,status:wrongRun?'STALE_RUN':r?.status||'MISSING',
      filename:!wrongRun&&r?.status==='COMPLETE'?r.filename:null,
      downloadPath:!wrongRun&&r?.status==='COMPLETE'?r.actualFilename:null});
    },()=>reply({ok:false}));return true;
   }
   if(m?.type==='BOSS_NATIVE_LIST_LATEST'){
    if(s.id!==chrome.runtime.id){reply({ok:false});return false;}
    chrome.storage.local.get('boss-native-list-latest-v1').then(x=>
     reply({ok:true,batch:x['boss-native-list-latest-v1']||null}),
     ()=>reply({ok:false}));return true;
   }
   if(m?.type!=='BOSS_RAW_DETAIL_RESPONSE')return false;
   accept(m,s).then(reply,()=>reply({ok:false,saved:false}));return true;
  });
  chrome.downloads.onChanged.addListener(change=>{
   if(!['complete','interrupted'].includes(change.state?.current))return;
   void(async()=>{
    const s=await load();
    for(const r of Object.values(s.records))
     if(r.downloadId===change.id)await reconcile(r.jobId,change.id);
   })();
  });
  void recover().catch(()=>{});
 }
 return {install,KEY,accept};
})();

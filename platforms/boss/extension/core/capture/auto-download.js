/* Action-gated raw capture: no autonomous downloads outside Refresh/Scroll. */
var BossRawDownloads=(()=>{
 'use strict';
 const KEY='boss-raw-downloads-v2',INBOX='boss-raw-inbox-v1:',LIST='/wapi/zpgeek/pc/recommend/job/list.json',VERIFY_ALARM='boss-raw-file-verify',GATE='boss-raw-event-gate-v1',SCROLL_INTERVAL_MS=5000;
 let sequence=Promise.resolve();
 const active=new Set();
 function serial(job){const p=sequence.then(job,job);sequence=p.catch(()=>{});return p;}
 async function modify(fn){
  return serial(async()=>{
   const value=(await chrome.storage.local.get(KEY))[KEY]||{records:[]};
   const out=fn(value);
   await chrome.storage.local.set({[KEY]:{contract:'boss-raw-downloads.v2',records:value.records}});
   return out;
  });
 }
 async function find(key){
  const value=(await chrome.storage.local.get(KEY))[KEY];
  return (value?.records||[]).find(r=>r.key===key)||null;
 }
 const update=(key,fields)=>modify(value=>{
  const row=value.records.find(r=>r.key===key);
  if(row)Object.assign(row,fields,{updatedAt:new Date().toISOString()});
  return Boolean(row);
 });
 function allow(m,s){
  if(m?.type!=='BOSS_RAW_LIST_RESPONSE'||s?.id!==chrome.runtime.id||
   !(Number.isInteger(s?.tab?.id)&&s.tab.id>0||s?.recovered===true)||s.frameId!==0||
   !/^doc-[a-zA-Z0-9-]{8,100}$/.test(m.docId||'')||
   !Number.isSafeInteger(m.requestId)||m.requestId<1||
   m.path!==LIST||!Number.isInteger(m.httpStatus)||m.httpStatus<100||m.httpStatus>599||
   !m.responseBody||typeof m.responseBody!=='object'||Array.isArray(m.responseBody))return false;
  try{
   const u=new URL(s.tab.url);
   return u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';
  }catch{return false;}
 }
 async function begin(m,kind){
  if(!['REFRESH','SCROLL'].includes(kind)||typeof m?.runId!=='string'||
   !/^[a-zA-Z0-9_.:-]{1,100}$/.test(m.runId)||
   !Number.isInteger(m.tabId)||m.tabId<1)return{ok:false,status:'BAD_ACTION'};
  return serial(async()=>{
   const now=Date.now();
   const previous=(await chrome.storage.local.get(GATE))[GATE];
   if(previous?.status==='OPEN'&&previous.expiresAt>now){
    if(previous.kind===kind&&previous.runId===m.runId&&previous.tabId===m.tabId)
     return{ok:true,status:'OPEN',reused:true};
    // Never override a live action. Retire only a provably orphaned old controller.
    let tabs;
    try{tabs=await chrome.tabs.query({});}
    catch{return{ok:false,status:'OWNER_PROOF_UNAVAILABLE'};}
    if(!Array.isArray(tabs))return{ok:false,status:'OWNER_PROOF_UNAVAILABLE'};
    const oldOwner=previous.controlTabId;
    // Keep a live control tab as owner regardless of its temporary title.
    if(Number.isInteger(oldOwner)&&oldOwner>0){
     if(tabs.some(tab=>tab.id===oldOwner))
      return{ok:false,status:'OTHER_ACTION_OPEN'};
    }else{
     // Legacy gates lack tab identity; any other same-kind control tab is a live candidate.
     const route=previous.kind==='SCROLL'?
       'actions/scroll/scroll.html':'actions/refresh/refresh.html';
      const canonical=chrome.runtime.getURL(route);
      const active=tabs.some(tab=>{
       if(tab.id===m.controlTabId||!tab.url)return false;
       try{
        const a=new URL(tab.url),b=new URL(canonical);
        return a.origin===b.origin&&a.pathname===b.pathname;
       }catch{return false;}
      });
      if(active)return{ok:false,status:'OTHER_ACTION_OPEN'};
    }
    // Previous controller was closed/failed: its held raw data is discarded below.
   }
   // The existing durable action gate also owns Scroll's minimum start interval.
   // Refresh never resets this timestamp, and rejected actions never update it.
   const lastScrollAt=Number.isSafeInteger(previous?.lastScrollAt)?
    previous.lastScrollAt:previous?.kind==='SCROLL'&&
    Number.isSafeInteger(previous.openedAt)?previous.openedAt:null;
   if(kind==='SCROLL'&&lastScrollAt!==null&&
    now>=lastScrollAt&&now-lastScrollAt<SCROLL_INTERVAL_MS)
    return{ok:false,status:'SCROLL_THROTTLED',
     retryAfterMs:SCROLL_INTERVAL_MS-(now-lastScrollAt)};
   const data=(await chrome.storage.local.get(KEY))[KEY]||{records:[]};
   data.records=data.records.filter(row=>row.status!=='HELD');
   await chrome.storage.local.set({
    [KEY]:{contract:'boss-raw-downloads.v2',records:data.records},
    [GATE]:{contract:'boss-raw-event-gate.v1',kind,runId:m.runId,
     tabId:m.tabId,controlTabId:m.controlTabId||null,status:'OPEN',openedAt:now,
     lastScrollAt:kind==='SCROLL'?now:lastScrollAt,
     hookDocId:kind==='REFRESH'?m.hookDocId||null:null,
     minRequestId:kind==='REFRESH'&&Number.isSafeInteger(m.minRequestId)?
      m.minRequestId:0,expiresAt:now+90000,
     bottomAt:null,deadline:null}
   });
   return{ok:true,status:'OPEN'};
  });
 }
 async function markBottom(m){
  return serial(async()=>{
   const gate=(await chrome.storage.local.get(GATE))[GATE];
   if(gate?.status!=='OPEN'||gate.kind!=='SCROLL'||gate.runId!==m.runId||
    gate.tabId!==m.tabId||gate.expiresAt<Date.now())
    return{ok:false,status:'SCROLL_GATE_CLOSED'};
   if(gate.bottomAt)return{ok:true,status:'BOTTOM_RECORDED'};
   const bottomAt=Date.now();
   await chrome.storage.local.set({[GATE]:{...gate,bottomAt,
    deadline:bottomAt+5000}});
   return{ok:true,status:'SCROLL_WINDOW_STARTED'};
  });
 }
 async function accept(m,s){
  if(!allow(m,s))return{ok:false,reason:'INVALID_SENDER_OR_RESPONSE'};
  return serial(async()=>{
   const gate=(await chrome.storage.local.get(GATE))[GATE];
   const now=Date.now();
   const receivedAt=Number.isFinite(m.receivedAt)?m.receivedAt:now;
   const tabId=s.recovered===true?gate?.tabId:s.tab.id;
   if(gate?.status!=='OPEN'||gate.expiresAt<now||
    gate.tabId!==tabId||receivedAt<gate.openedAt||
    gate.kind==='REFRESH'&&gate.hookDocId&&
     (gate.hookDocId!==m.docId||m.requestId<=gate.minRequestId)||
    gate.kind==='SCROLL'&&(gate.bottomAt===null||
     receivedAt<gate.bottomAt||receivedAt>gate.deadline)||
    m.httpStatus<200||m.httpStatus>=300)
    return{ok:true,saved:true,status:'IGNORED_NO_GRANT'};
   const key=m.docId+'/'+m.requestId;
   const value=(await chrome.storage.local.get(KEY))[KEY]||{records:[]};
   const existing=value.records.find(row=>row.key===key);
   if(existing)return{ok:true,saved:true,deduplicated:true,status:existing.status};
   if(value.records.length>=100){
    const pos=value.records.findIndex(row=>
     ['COMPLETE','FAILED','INTERRUPTED'].includes(row.status));
    if(pos<0)return{ok:false,saved:false,status:'FULL'};
    value.records.splice(pos,1);
   }
   const date=new Date(),stamp=date.toISOString();
   const day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+
    '-'+String(date.getDate()).padStart(2,'0');
   const filename='BOSS/'+day+'/list/job-list-'+m.docId+'-'+m.requestId+'.json';
   const rows=m.responseBody?.zpData?.jobList;
   const ids=Array.isArray(rows)?rows.map(row=>row?.encryptJobId):null;
   const jobIds=ids?.length>0&&ids.length<=30&&
    ids.every(id=>typeof id==='string'&&/^[a-zA-Z0-9_~-]{10,120}$/.test(id))&&
    new Set(ids).size===ids.length?ids:null;
   value.records.push({key,filename,jobIds,status:'HELD',gateRunId:gate.runId,
    receivedAt,updatedAt:stamp,raw:{schemaVersion:1,source:LIST,
     metadata:{tabId,docId:m.docId,requestId:m.requestId,
      capturedAt:stamp,httpStatus:m.httpStatus},
     body:m.responseBody}});
   await chrome.storage.local.set({[KEY]:{
    contract:'boss-raw-downloads.v2',records:value.records}});
   return{ok:true,saved:true,status:'HELD'};
  });
 }
 async function finish(m,kind,aborted=false){
  if(!aborted)await recoverInbox();
  const result=await serial(async()=>{
   const gate=(await chrome.storage.local.get(GATE))[GATE];
   if(gate?.status!=='OPEN'||gate.kind!==kind||
    gate.runId!==m?.runId||gate.tabId!==m?.tabId)
    return{ok:false,status:'GATE_MISMATCH'};
   const now=Date.now();
   const documentKnown=typeof m.hookDocId==='string'&&
    /^doc-[a-zA-Z0-9-]{8,100}$/.test(m.hookDocId);
   const allowed=kind==='REFRESH'?
    now<=gate.expiresAt:
    gate.bottomAt!==null&&now>=gate.deadline&&now<=gate.deadline+15000;
   const data=(await chrome.storage.local.get(KEY))[KEY]||{records:[]};
   const possible=!aborted&&documentKnown&&allowed?data.records.filter(r=>
    r.status==='HELD'&&r.gateRunId===m.runId&&
    r.raw?.metadata?.tabId===m.tabId&&
    r.raw?.metadata?.docId===m.hookDocId&&
    r.receivedAt>=gate.openedAt&&
    (kind==='REFRESH'||r.receivedAt>=gate.bottomAt&&r.receivedAt<=gate.deadline)):[];
   possible.sort((a,b)=>a.receivedAt-b.receivedAt||a.key.localeCompare(b.key));
   const chosen=possible.at(-1)||null;
   data.records=data.records.filter(r=>
    r.status!=='HELD'||r.gateRunId!==m.runId||r.key===chosen?.key);
   if(chosen){chosen.status='QUEUED';chosen.grantRunId=m.runId;}
   await chrome.storage.local.set({
    [KEY]:{contract:'boss-raw-downloads.v2',records:data.records},
    [GATE]:{...gate,status:'CLOSED',closedAt:now,
     selectedKey:chosen?.key||null}
   });
   return{ok:true,status:aborted?'ABORTED':
    chosen?'AUTHORIZED_ONCE':'NO_ELIGIBLE_RESPONSE',key:chosen?.key||null};
  });
  if(!result.key)return result;
  const outcome=await download(result.key);
  return{...result,ok:outcome.ok===true,
   status:outcome.ok?result.status:'DOWNLOAD_FAILED',download:outcome};
 }
 async function settled(downloadId,state,error){
  const stored=(await chrome.storage.local.get(KEY))[KEY];
  const row=(stored?.records||[]).find(r=>r.downloadId===downloadId);
  if(!row||row.status==='COMPLETE'||row.status==='FAILED')return;
  let item;
  try{[item]=await chrome.downloads.search({id:downloadId});}
  catch(e){
   await update(row.key,{status:'VERIFY_PENDING',error:String(e?.message||e).slice(0,160)});
   await chrome.alarms.create(VERIFY_ALARM,{delayInMinutes:1});
   return;
  }
  if(state==='interrupted'||item?.state==='interrupted'){
   await update(row.key,{status:'INTERRUPTED',
    error:String(error||item?.error||'DOWNLOAD_INTERRUPTED').slice(0,160)});
   return;
  }
  if(item?.state!=='complete')return;
  const actual=typeof item.filename==='string'?item.filename.replaceAll('\\','/'):null;
  if(item.exists===true&&actual?.endsWith('/'+row.filename)){
   const jobs=row.raw?.body?.zpData?.jobList;
   if(Array.isArray(jobs)&&jobs.length&&jobs.length<=30){
    const ids=jobs.map(j=>j?.encryptJobId);
    if(ids.every(id=>typeof id==='string'&&/^[a-zA-Z0-9_~-]{10,120}$/.test(id))&&
      new Set(ids).size===ids.length)
     await chrome.storage.local.set({'boss-native-list-latest-v1':{
      contract:'boss-native-list-latest.v1',
      jobIds:ids,sourceFilename:row.filename,verifiedAt:Date.now()}});
   }
   await update(row.key,{status:'COMPLETE',raw:null,actualFilename:item.filename,error:null});
   return;
  }
  const attempts=(row.verificationAttempts||0)+1;
  if(attempts>=3){
   await update(row.key,{status:'FAILED',verificationAttempts:attempts,error:'DOWNLOAD_FILE_NOT_CONFIRMED'});
  }else{
   await update(row.key,{status:'VERIFY_PENDING',verificationAttempts:attempts,error:'DOWNLOAD_FILE_NOT_CONFIRMED'});
   await chrome.alarms.create(VERIFY_ALARM,{delayInMinutes:1});
  }
 }
 async function download(key){
  if(active.has(key))return{ok:true,status:'ALREADY_RUNNING'};
  active.add(key);
  try{
   const row=await find(key);
   if(!row||row.status!=='QUEUED')return{ok:Boolean(row),status:row?.status||'MISSING'};
   if(!row.raw)return{ok:false,status:'RAW_MISSING'};
   // Preserve uncertainty after a crash in the Chrome dispatch boundary.
   await update(key,{status:'DISPATCHING'});
   const url='data:application/json;charset=utf-8,'+
    encodeURIComponent(JSON.stringify(row.raw.body));
   const id=await chrome.downloads.download({
    url,filename:row.filename,saveAs:false,conflictAction:'overwrite'});
   if(!Number.isInteger(id))throw Error('DOWNLOAD_ID_MISSING');
   await update(key,{status:'IN_PROGRESS',downloadId:id});
   const [item]=await chrome.downloads.search({id});
   if(item?.state==='complete'||item?.state==='interrupted')
    await settled(id,item.state,item.error);
   return{ok:true,status:'STARTED',filename:row.filename,downloadId:id};
  }catch(e){await update(key,{status:'FAILED',
   error:String(e?.message||e).slice(0,160)}).catch(()=>{});
   return{ok:false,status:'FAILED'};
  }finally{active.delete(key);}
 }
 async function recoverInbox(){
  const saved=await chrome.storage.local.get(null);
  for(const [storageKey,message] of Object.entries(saved)){
   if(!storageKey.startsWith(INBOX))continue;
   if(storageKey!==INBOX+message?.docId+':'+message?.requestId||message.inboxKey!==storageKey)continue;
   // Inbox is written by the trusted isolated extension context before handoff.
   const sender={id:chrome.runtime.id,frameId:0,recovered:true,
    tab:{url:message.sourceUrl}};
   if(!allow(message,sender))continue;
   const result=await accept(message,sender);
   if(result.saved)await chrome.storage.local.remove(storageKey);
  }
 }
 function install(){
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
   if(msg?.type!=='BOSS_RAW_LIST_RESPONSE')return false;
   accept(msg,sender).then(reply,e=>reply({ok:false,
    reason:String(e?.message||e).slice(0,160)}));
   return true;
  });
  chrome.downloads.onChanged.addListener(d=>{
   if(d.state?.current==='complete'||d.state?.current==='interrupted')
    void settled(d.id,d.state.current,d.error?.current).catch(()=>{});
  });
  chrome.alarms.onAlarm.addListener(a=>{
   if(a.name!==VERIFY_ALARM)return;
   void(async()=>{
    const stored=(await chrome.storage.local.get(KEY))[KEY];
    for(const row of stored?.records||[])
     if(row.status==='VERIFY_PENDING'&&Number.isInteger(row.downloadId))
      await settled(row.downloadId,'complete');
   })().catch(()=>{});
  });
  void(async()=>{
   await recoverInbox();
   const value=(await chrome.storage.local.get(KEY))[KEY];
   for(const row of value?.records||[]){
    if(row.status==='QUEUED'&&row.grantRunId)await download(row.key);
    if(['IN_PROGRESS','VERIFY_PENDING'].includes(row.status)&&Number.isInteger(row.downloadId)){
     const [item]=await chrome.downloads.search({id:row.downloadId});
     if(item?.state==='complete'||item?.state==='interrupted')
      await settled(row.downloadId,item.state,item.error);
    }
   }
  })().catch(()=>{});
 }
 return{KEY,GATE,install,accept,begin,markBottom,finish,download};
})();

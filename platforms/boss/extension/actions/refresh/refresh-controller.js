/* Refresh journal owner: passive, no browser action or event listener. */
var BossRefreshCoordinator=(()=>{
 'use strict';
 const KEY='boss-refresh-event-log-v2';
 const allowed=new Set(['BEFORE_REFRESH','REFRESH_SUCCESS']);
 const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
 let queue=Promise.resolve();
 function record(m,sender){
  const task=queue.then(async()=>{
   if(sender?.id!==chrome.runtime.id||
    !(()=>{try{
     const url=new URL(sender.url),
       canonical=new URL(chrome.runtime.getURL('actions/refresh/refresh.html'));
      return url.origin===canonical.origin&&url.pathname===canonical.pathname;
     }catch{return false;}})()||
    !valid(m.runId)||!allowed.has(m.event)||
    !Number.isInteger(m.seq)||m.seq<1||m.seq>2)return{ok:false};
   const current=(await chrome.storage.local.get(KEY))[KEY];
   const journal=current?.runId===m.runId?current:{
    contract:'boss-refresh-event-log.v2',runId:m.runId,events:[],
    tabId:Number.isInteger(m.tabId)?m.tabId:null,
    status:'RUNNING',startedAt:new Date().toISOString()
   };
   if(!journal.events.some(x=>x.seq===m.seq)){
    journal.events.push({seq:m.seq,event:m.event,
     tabId:Number.isInteger(m.tabId)?m.tabId:null,
     at:new Date().toISOString()});
    journal.events.sort((x,y)=>x.seq-y.seq);
   }
   if(journal.events.some(x=>x.event==='REFRESH_SUCCESS'))journal.status='COMPLETED';
   journal.updatedAt=new Date().toISOString();
   await chrome.storage.local.set({[KEY]:journal});
   return{ok:true};
  });
  queue=task.catch(()=>{});
  return task;
 }
 return {KEY,record};
})();

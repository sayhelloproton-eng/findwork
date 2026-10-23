/* Scroll journal owner: passive, no browser action or event listener. */
var BossScrollEvents=(()=>{
 'use strict';
 const KEY='boss-scroll-event-log-v1';
 const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
 let queue=Promise.resolve();
 function record(m,sender){
  const task=queue.then(async()=>{
   if(sender?.id!==chrome.runtime.id||
    sender.url!==chrome.runtime.getURL('actions/scroll/scroll.html')||
    m.event!=='SCROLL_BOTTOM_REACHED'||!valid(m.runId)||
    !Number.isInteger(m.tabId))return{ok:false};
   const details={};
   for(const name of ['before','after','bottom']){
    if(!Number.isFinite(m.details?.[name])||m.details[name]<0)return{ok:false};
    details[name]=m.details[name];
   }
   await chrome.storage.local.set({[KEY]:{
    contract:'boss-scroll-event-log.v1',runId:m.runId,tabId:m.tabId,
    event:'SCROLL_BOTTOM_REACHED',status:'COMPLETED',
    details,receivedAt:new Date().toISOString()
   }});
   return{ok:true};
  });
  queue=task.catch(()=>{});
  return task;
 }
 return {KEY,record};
})();

/* No API calls, mutations, or sensitive job tokens: extension queue read only. */
(async()=>{
 'use strict';
 const view=document.getElementById('state');
 try{
  const store=await chrome.storage.local.get('boss-greet-queue-v1');
  const state=store['boss-greet-queue-v1']||{};
  const results=Object.values(state.results||{});
  const counts={};
  for(const result of results){
   const status=result?.status||'UNKNOWN';
   counts[status]=(counts[status]||0)+1;
  }
  const summary={
   contract:'boss-greet-status-readonly.v1',
   active:Boolean(state.active),
   queued:Array.isArray(state.queue)?state.queue.length:0,
   paused:Boolean(state.paused),
   pauseReason:state.paused?.reason||null,
   resultCounts:counts,
   unknownSideEffects:results.filter(r=>r?.sideEffectState==='UNKNOWN').length
  };
  view.textContent='GREET_QUEUE_STATUS='+JSON.stringify(summary,null,2);
 }catch(error){
  view.textContent='GREET_QUEUE_STATUS_ERROR='+String(error?.message||error);
 }
})();

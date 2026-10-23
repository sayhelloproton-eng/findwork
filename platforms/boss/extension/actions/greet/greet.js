/* Greet control page: enqueue ACK closes only this extension page. */
(()=>{
 'use strict';
 const state=document.getElementById('state');
 const query=new URLSearchParams(location.search);
 const jobId=query.get('jobId'),securityId=query.get('securityId');
 const greeting=query.get('greeting');
 if(!jobId||!securityId){
  state.textContent='缺少 jobId 或 securityId，未入队';
  return;
 }
 void chrome.runtime.sendMessage({
  type:'GREET_QUEUE_ENQUEUE',securityId,jobId,greeting
 }).then(async reply=>{
  if(!reply?.ok){
   state.textContent='入队失败：'+(reply?.reason||'UNKNOWN');
   return;
  }
  // ACK confirms durable enqueuing, not completion of the BOSS request.
  const tab=await chrome.tabs.getCurrent();
  if(!Number.isInteger(tab?.id))throw Error('CONTROL_TAB_MISSING');
  await chrome.tabs.remove(tab.id);
 }).catch(error=>{
  state.textContent='入队/关闭扩展页失败：'+String(error?.message||error);
 });
})();

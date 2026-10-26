/* Passive installed-extension identity for Findwork to open the existing Greet pages.
 * No business enqueue, no backend writes, and no extra connection workflow here.
 */
(()=>{
 'use strict';
 if(!['127.0.0.1','localhost'].includes(location.hostname)||!['/','/communications'].includes(location.pathname))return;
 const ready=async()=>{
  try{const info=await chrome.runtime.sendMessage({type:'GREET_QUEUE_CAPABILITIES'});
   window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO',extensionId:chrome.runtime.id,version:chrome.runtime.getManifest().version,...(info?.ok?{protocolVersion:info.protocolVersion,capabilities:info.capabilities}:{})},location.origin);
  }catch{window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO',extensionId:chrome.runtime.id,compatible:false},location.origin);}
 };
 window.addEventListener('message',event=>{
  if(event.source===window&&event.origin===location.origin&&event.data?.type==='FINDWORK_BOSS_EXTENSION_INFO_PING')ready();
  if(event.source!==window||event.origin!==location.origin||location.pathname!=='/'||!['FINDWORK_COLLECTION_LAUNCH','FINDWORK_COLLECTION_STATUS'].includes(event.data?.type))return;
  const m=event.data;
  chrome.runtime.sendMessage({type:m.type==='FINDWORK_COLLECTION_LAUNCH'?'COLLECTION_LAUNCH':'COLLECTION_LAUNCH_STATUS',requestId:m.requestId,expect:m.expect,pages:m.pages})
   .then(result=>window.postMessage({type:'FINDWORK_COLLECTION_REPLY',requestId:m.requestId,extensionId:chrome.runtime.id,result},location.origin))
   .catch(()=>window.postMessage({type:'FINDWORK_COLLECTION_REPLY',requestId:m.requestId,extensionId:chrome.runtime.id,result:{ok:false,reason:'COLLECTION_OPEN_UNCONFIRMED'}},location.origin));
 });
 ready();
})();

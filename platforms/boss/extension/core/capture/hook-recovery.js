
/* Worker-owned, passive MAIN+ISOLATED reconciliation of the existing tab. */
const BossHookRecovery=(()=>{
 'use strict';
 const target=raw=>{try{const u=new URL(raw);return u.origin==='https://www.zhipin.com'&&
  u.pathname==='/web/geek/jobs';}catch{return false;}};
 async function recover(tabId,trigger='CONTROL'){
  try{
   const tab=await chrome.tabs.get(tabId);
   if(!target(tab.url))return{ok:false,reason:'TARGET_DOCUMENT_CHANGED'};
   await chrome.scripting.executeScript({target:{tabId},world:'MAIN',
    files:['core/network/normalizer.js','core/network/network-allowlist.js',
     'core/network/main-hook.js']});
   await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',
    files:['core/capture/page-observer.js']});
   const r=await chrome.tabs.sendMessage(tabId,{
    type:'BOSS_OBSERVER_PROBE_HOOK',token:crypto.randomUUID()});
   if(!r?.ok||r.probeStatus!=='READY'||r.hookReady!==true||
    r.hookOwnership!=='OWNED'||r.hookContract!=='v3')
    return{ok:false,reason:'HANDSHAKE_NOT_READY',ownership:r?.hookOwnership,
     probe:r?.probeStatus};
   return{ok:true,trigger,hookContract:'v3',hookOwnership:'OWNED',
    observerReady:true,docId:r.hookDocId};
  }catch(e){return{ok:false,reason:'RECOVERY_ERROR',message:String(e?.message||e).slice(0,140)};}
 }
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.type!=='BOSS_HOOK_RECOVER')return false;
  if(!sender.url?.startsWith(chrome.runtime.getURL('actions/detail/'))||
   !Number.isInteger(m.tabId)){reply({ok:false,reason:'UNTRUSTED_CONTROL'});return false;}
  void recover(m.tabId).then(reply);return true;
 });
 // Extension self-reload starts a fresh worker while BOSS document remains open.
 void(async()=>{
  try{
   if(typeof chrome.tabs.query!=='function')return;
   const tabs=(await chrome.tabs.query({})).filter(t=>Number.isInteger(t.id)&&target(t.url));
   if(tabs.length!==1)return;
   const r=await recover(tabs[0].id,'BOOT');
   await chrome.storage.local.set({'boss-hook-recovery-v3':{
    trigger:'BOOT',at:new Date().toISOString(),status:r.ok?'READY':'NOT_READY',
    reason:r.ok?null:r.reason}});
  }catch{}
 })();
 return Object.freeze({recover});
})();

/* Opt-in, expiring, path-only network evidence. Does not trigger application. */
(()=>{
 'use strict';
 if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/geek/jobs'||window!==window.top)return;
 const KEY='boss-direct-apply-probe-v1';
 let tail=Promise.resolve();
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||
   event.data?.type!=='BOSS_DIRECT_APPLY_PROBE_CANDIDATE_V1')return;
  const e=event.data.item;
  if(!e||e.method!=='POST'||typeof e.path!=='string'||
    !/^\/(?:wapi|api)\/[a-zA-Z0-9/_.-]{1,145}$/.test(e.path)||
    !Number.isInteger(e.httpStatus)||e.httpStatus<0||e.httpStatus>599||
    !Number.isSafeInteger(e.observedAt))return;
  tail=tail.then(async()=>{
   const previous=(await chrome.storage.local.get(KEY))[KEY];
   if(!previous||!Number.isSafeInteger(previous.until)||Date.now()>previous.until)return;
   const records=Array.isArray(previous.records)?previous.records:[];
   const item={path:e.path,method:'POST',httpStatus:e.httpStatus,observedAt:e.observedAt};
   await chrome.storage.local.set({[KEY]:{until:previous.until,records:[...records,item].slice(-40)}});
  }).catch(()=>{});
 });
})();

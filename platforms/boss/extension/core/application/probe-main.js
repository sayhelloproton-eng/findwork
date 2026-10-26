/* Passive candidate-request discovery for BOSS's native application UI.
 * No API calls are initiated. Capture only method, pathname, HTTP status and time.
 * No query, request body, cookies, response body, or user identifiers ever leave this world.
 */
(()=>{
 'use strict';
 if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/geek/jobs'||window!==window.top)return;
 const path=url=>{
  try{
   const u=new URL(String(url),location.href);
   if(u.origin!==location.origin||!/^\/(?:wapi|api)\//.test(u.pathname)||u.pathname.length>150||
     u.pathname==='/wapi/zpgeek/friend/add.json')return null;
   return u.pathname;
  }catch{return null;}
 };
 const emit=(url,method,status)=>{
  if(String(method).toUpperCase()!=='POST')return;
  const pathname=path(url);
  if(pathname===null)return;
  window.postMessage({type:'BOSS_DIRECT_APPLY_PROBE_CANDIDATE_V1',
   item:{path:pathname,method:'POST',httpStatus:Number.isInteger(status)?status:0,observedAt:Date.now()}},location.origin);
 };
 const fetchOriginal=window.fetch;
 window.fetch=function(input,init){
  const url=typeof input==='string'||input instanceof URL?String(input):input?.url;
  const method=init?.method||input?.method||'GET';
  const promise=fetchOriginal.apply(this,arguments);
  if(String(method).toUpperCase()!=='POST'||!path(url))return promise;
  return Promise.resolve(promise).then(res=>{emit(url,method,res.status);return res;});
 };
 const xhrOpen=XMLHttpRequest.prototype.open,xhrSend=XMLHttpRequest.prototype.send,meta=new WeakMap();
 XMLHttpRequest.prototype.open=function(method,url){
  meta.set(this,{method,url});
  return xhrOpen.apply(this,arguments);
 };
 XMLHttpRequest.prototype.send=function(){
  const info=meta.get(this);
  if(info&&String(info.method).toUpperCase()==='POST'&&path(info.url))
   this.addEventListener('loadend',()=>emit(info.url,info.method,this.status),{once:true});
  return xhrSend.apply(this,arguments);
 };
})();

/* Allowlist the two natural BOSS endpoints: job List and job Detail. */
var BossNetworkAllowlist=(()=>{
 'use strict';
 const LIST='/wapi/zpgeek/pc/recommend/job/list.json';
 const DETAIL='/wapi/zpgeek/job/detail.json';
 const allowed=new Set([LIST,DETAIL]);
 function shouldCapture(raw){
  try{
   const url=new URL(String(raw),'https://www.zhipin.com');
   return url.origin==='https://www.zhipin.com'&&allowed.has(url.pathname);
  }catch{return false;}
 }
 return Object.freeze({shouldCapture,LIST,DETAIL});
})();

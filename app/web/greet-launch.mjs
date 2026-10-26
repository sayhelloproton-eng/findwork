// Browser user-gesture launcher: allocate one tab per selected job before any awaits.
// A blocked popup is not claimed/sent. The existing BOSS Greet page owns enqueue.
const extensionIdPattern=/^[a-p]{32}$/;
const jobIdPattern=/^[a-zA-Z0-9_~\-]{10,120}$/;
export const validBossExtensionId=value=>typeof value==='string'&&extensionIdPattern.test(value);
export function compatibleBossExtension(info){
 return validBossExtensionId(info?.extensionId)&&info.protocolVersion===2&&Array.isArray(info.capabilities)&&
  ['greet-enqueue','queue-observation','pre-send-check','manual-retry','clear-completed'].every(c=>info.capabilities?.includes(c));
}
export function buildGreetPageUrl(extensionId,item,serverOrigin){
 if(!validBossExtensionId(extensionId))throw Error('BOSS_EXTENSION_NOT_DETECTED');
 if(!item||!jobIdPattern.test(item.jobId)||typeof item.securityId!=='string'||!item.securityId||
   typeof item.actionId!=='string'||!item.actionId.trim())throw Error('INVALID_GREET_PAGE_PARAMETERS');
 const local=new URL(serverOrigin);
 if(local.protocol!=='http:'||!['127.0.0.1','localhost'].includes(local.hostname))throw Error('INVALID_FINDWORK_ORIGIN');
 const address=new URL('chrome-extension://'+extensionId+'/actions/greet/greet.html');
 address.searchParams.set('jobId',item.jobId);
 address.searchParams.set('securityId',item.securityId);
 address.searchParams.set('actionId',item.actionId);
 address.searchParams.set('serverOrigin',local.origin);
 return address.href;
}
export function openGreetPlaceholders(jobIds,open){
 const opened=[];const blocked=[];
 for(const jobId of jobIds){
  let tab=null;
  try{tab=open('about:blank','_blank');}catch{}
  if(tab)opened.push({jobId,tab});
  else blocked.push(jobId);
 }
 return{opened,blocked};
}
export function closeGreetPlaceholders(opened){
 for(const entry of opened){try{if(!entry.tab.closed)entry.tab.close();}catch{}}
}

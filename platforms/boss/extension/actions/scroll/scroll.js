/* Scroll action only: invoke the imported page capability; emit on confirmed bottom. */
(async()=>{
 const boss='https://www.zhipin.com/web/geek/jobs';
 const isBoss=url=>{try{
  const u=new URL(url);return u.origin==='https://www.zhipin.com'&&u.pathname==='/web/geek/jobs';
 }catch{return false;}};
 const own=await chrome.tabs.getCurrent();
 const tab=(await chrome.tabs.query({url:boss+'*'}))
  .find(t=>Number.isInteger(t.id)&&isBoss(t.url));
 if(!tab?.id){document.title='Scroll · BOSS_TAB_MISSING';return;}
 const tabId=tab.id,runId=crypto.randomUUID();
 // Activation belongs to the Scroll controller, not to the page-side scroll function.
 // Keep BOSS in the foreground for the complete five-second response window.
 try{
  const activated=await chrome.tabs.update(tabId,{active:true});
  if(activated?.id!==tabId||activated.active!==true)
   throw Error('BOSS_TAB_NOT_ACTIVE');
  if(Number.isInteger(tab.windowId))
   await chrome.windows.update(tab.windowId,{focused:true});
 }catch{
  document.title='Scroll · BOSS_TAB_ACTIVATION_FAILED';
  return;
 }
 const restoreController=async()=>{
  if(!Number.isInteger(own?.id))return;
  try{
   await chrome.tabs.update(own.id,{active:true});
   if(Number.isInteger(own.windowId)&&own.windowId!==tab.windowId)
    await chrome.windows.update(own.windowId,{focused:true});
  }catch{} // The control page may have been closed by the user.
 };
 const emit=(event,other={})=>chrome.runtime.sendMessage({
  type:'BOSS_SCROLL_EVENT',event,runId,tabId,controlTabId:own?.id,
  timestamp:new Date().toISOString(),...other
 }).catch(()=>({ok:false}));
 try{
  const armed=await emit('SCROLL_WINDOW_BEGIN');
  if(!armed?.ok){
   document.title=armed?.status==='SCROLL_THROTTLED'?
    'Scroll · SCROLL_THROTTLED':'Scroll · DOWNLOAD_GATE_NOT_READY';
   return;
  }
  let reply;
  try{
   [reply]=await chrome.scripting.executeScript({
    target:{tabId},world:'ISOLATED',func:bossScrollToBottom
   });
  }catch(error){
   await emit('SCROLL_WINDOW_ABORT');
   document.title='Scroll · '+String(error?.message||error).slice(0,100);
   return;
  }
  if(!reply?.result?.reached){
   await emit('SCROLL_WINDOW_ABORT');
   document.title='Scroll · '+String(reply?.result?.after??'?')+
    ' / '+String(reply?.result?.bottom??'?');
   return;
  }
  const {before,after,bottom}=reply.result;
  const marked=await emit('SCROLL_BOTTOM_REACHED',{details:{before,after,bottom}});
  if(!marked?.ok){
   await emit('SCROLL_WINDOW_ABORT');
   document.title='Scroll · BOTTOM_GATE_NOT_READY';return;
  }
  await new Promise(resolve=>setTimeout(resolve,5000));
 }finally{
  await restoreController();
 }

 let hookDocId=null;
 try{
  const proof=await chrome.tabs.sendMessage(tabId,
   {type:'BOSS_OBSERVER_READ',cursor:0},{frameId:0});
  if(proof?.ok===true&&typeof proof.hookDocId==='string')
   hookDocId=proof.hookDocId;
 }catch{}
 const done=await emit('SCROLL_WINDOW_END',{hookDocId});
 if(done?.status==='NO_ELIGIBLE_RESPONSE'){
  document.title='Scroll · NO_JOB_LIST_RESPONSE_IN_5S';return;
 }
 if(!done?.ok||done.status!=='AUTHORIZED_ONCE'){
  document.title='Scroll · '+String(done?.status||'GATE_UNKNOWN');return;
 }
 const receipt=done.download;
 if(!Number.isInteger(receipt?.downloadId)||typeof receipt?.filename!=='string'){
  document.title='Scroll · DOWNLOAD_RECEIPT_MISSING';return;
 }
 document.title='Scroll · VERIFYING_LOCAL_FILE';
 const status=await new Promise(resolve=>{
  let completed=false,timer;
  const finish=value=>{
   if(completed)return;completed=true;
   chrome.downloads.onChanged.removeListener(changed);
   clearTimeout(timer);resolve(value);
  };
  const check=async()=>{
   try{
    const [item]=await chrome.downloads.search({id:receipt.downloadId});
    if(item?.state==='interrupted')finish('DOWNLOAD_INTERRUPTED');
    else if(item?.state==='complete'){
     const actual=String(item.filename||'').replaceAll('\\','/');
     finish(item.exists===true&&actual.endsWith('/'+receipt.filename)?
      'COMPLETE':'FILE_NOT_CONFIRMED');
    }
   }catch{finish('DOWNLOAD_VERIFICATION_FAILED');}
  };
  const changed=item=>{
   if(item.id===receipt.downloadId&&item.state?.current)void check();
  };
  chrome.downloads.onChanged.addListener(changed);
  timer=setTimeout(()=>finish('DOWNLOAD_TIMEOUT'),30000);
  void check();
 });
 if(status!=='COMPLETE'){document.title='Scroll · '+status;return;}
 await chrome.tabs.remove(own.id);
})();

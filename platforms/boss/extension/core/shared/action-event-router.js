/* Refresh/Scroll action messages and List gate, no parallel batch scheduler. */
var BossActionRouter=(()=>{
 'use strict';
 function install(){
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
   if(m?.type!=='BOSS_REFRESH_EVENT'&&m?.type!=='BOSS_SCROLL_EVENT')return false;
   const task=(async()=>{
    const refresh=m.type==='BOSS_REFRESH_EVENT';
    if(refresh&&m.event==='REFRESH_WINDOW_ABORT'){
     let authorized=false;
     try{
      const a=new URL(sender?.url),b=new URL(chrome.runtime.getURL('actions/refresh/refresh.html'));
      authorized=sender?.id===chrome.runtime.id&&a.origin===b.origin&&a.pathname===b.pathname;
     }catch{}
     if(!authorized)return{ok:false,status:'INVALID_REFRESH_SENDER'};
     return BossRawDownloads.finish(m,'REFRESH',true);
    }
    if(!refresh&&['SCROLL_WINDOW_BEGIN','SCROLL_WINDOW_END','SCROLL_WINDOW_ABORT'].includes(m.event)){
     if(sender?.id!==chrome.runtime.id||
      sender.url!==chrome.runtime.getURL('actions/scroll/scroll.html'))
      return{ok:false,status:'INVALID_SCROLL_SENDER'};
     if(m.event==='SCROLL_WINDOW_BEGIN')return BossRawDownloads.begin(m,'SCROLL');
     return BossRawDownloads.finish(m,'SCROLL',m.event==='SCROLL_WINDOW_ABORT');
    }
    const recorded=await (refresh?BossRefreshCoordinator:BossScrollEvents).record(m,sender);
    if(!recorded.ok)return recorded;
    if(refresh&&m.event==='BEFORE_REFRESH'){
     const result=await BossRawDownloads.begin({...m,
      controlTabId:sender.tab?.id||m.controlTabId},'REFRESH');
     return{ok:result.ok,recorded:true,gate:result.status};
    }
    if(refresh&&m.event==='REFRESH_SUCCESS'){
     const result=await BossRawDownloads.finish(m,'REFRESH');
     return{ok:result.ok,recorded:true,gate:result.status,download:result.download||null};
    }
    if(m.event==='SCROLL_BOTTOM_REACHED'){
     const result=await BossRawDownloads.markBottom(m);
     return{ok:result.ok,recorded:true,gate:result.status};
    }
    return{ok:true,recorded:true};
   })();
   task.then(reply,e=>reply({ok:false,status:'ACTION_ROUTER_ERROR',
    reason:String(e?.message||e).slice(0,90)}));
   return true;
  });
 }
 return{install};
})();

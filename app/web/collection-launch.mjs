const reasons={COLLECTION_RUNNING:'已有采集正在运行，请等待或在扩展页正常停止。',COLLECTION_START_PENDING:'扩展页已打开，正在确认启动；请核查原页面，不要重复启动。',COLLECTION_DOWNLOAD_PENDING:'上一批还有下载未结算，请先等待核实。',MULTIPLE_COLLECTION_PAGES:'存在多个采集控制页，请先核对并保留唯一页面。',GREET_RUNNING:'沟通队列尚未结束，请先完成当前任务。',COLLECTION_OPEN_UNCONFIRMED:'本次启动结果尚未确认。再次核查会复用相同请求，不会重复创建采集。',COLLECTION_BRIDGE_TIMEOUT:'尚未收到扩展回执，请核查本次启动，不要重复新建任务。'};
export function requestCollection(type,input,target=window,timeoutMs=10000){
 return new Promise((resolve,reject)=>{
  let timer;const fail=code=>{const e=new Error(reasons[code]||code);e.code=code;reject(e);};
  const cleanup=()=>{clearTimeout(timer);target.removeEventListener('message',receive);};
  const receive=e=>{
   if(e.source!==target||e.origin!==target.location.origin||e.data?.type!=='FINDWORK_COLLECTION_REPLY'||e.data.requestId!==input.requestId||e.data.extensionId!==input.extensionId)return;
   cleanup();const r=e.data.result;if(r?.ok!==true)return fail(r?.reason||'COLLECTION_OPEN_UNCONFIRMED');resolve(r);
  };
  target.addEventListener('message',receive);timer=setTimeout(()=>{cleanup();fail('COLLECTION_BRIDGE_TIMEOUT');},timeoutMs);
  try{target.postMessage({type,...input},target.location.origin);}catch{cleanup();fail('COLLECTION_OPEN_UNCONFIRMED');}
 });
}

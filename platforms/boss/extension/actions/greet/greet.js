/* One Greet page: parameter mode enqueues; default mode observes and handles human resume. */
(()=>{
 'use strict';
 const state=document.getElementById('state');
 const query=new URLSearchParams(location.search);
 const jobId=query.get('jobId'),securityId=query.get('securityId');
 const greeting=query.get('greeting');
 const actionId=query.get('actionId'),serverOrigin=query.get('serverOrigin');
 if(query.get('retry')==='1'){
  state.textContent='正在重新领取并提交这条失败岗位…';
  void chrome.runtime.sendMessage({type:'GREET_QUEUE_RETRY',jobId,retryAt:Number(query.get('retryAt'))}).then(async reply=>{
   if(!reply?.ok){state.textContent='没有重新发送：'+({DAILY_COMMUNICATION_LIMIT:'今日成功已达150条',RETRY_NOT_ALLOWED:'该失败类型不能重发',RETRY_PARAMETERS_UNAVAILABLE:'缺少岗位参数，请由 AI 补齐',GREET_BLOCKED:'当前岗位不满足沟通条件'}[reply?.reason]||reply?.reason||'请由 AI 检查');return;}
   const tab=await chrome.tabs.getCurrent();if(Number.isInteger(tab?.id))await chrome.tabs.remove(tab.id);
  }).catch(()=>{state.textContent='重发尚未确认，已停止；请由 AI 检查，不要重复打开。';});return;
 }
 if(jobId||securityId||actionId||serverOrigin||query.has('greeting')){
  if(!jobId||!securityId||Boolean(actionId)!==Boolean(serverOrigin)){
   state.textContent='参数不完整，未入队；查看队列请打开不带参数的本页面。';return;
  }
  void chrome.runtime.sendMessage({type:'GREET_QUEUE_ENQUEUE',securityId,jobId,greeting,
   ...(actionId&&serverOrigin?{actionId,serverOrigin}:{})
  }).then(async reply=>{
   if(!reply?.ok){state.textContent='入队失败：'+(reply?.reason||'UNKNOWN')+'；请打开不带参数的本页面查看队列。';return;}
   state.textContent='已入队，尚不代表发送成功。';
   const tab=await chrome.tabs.getCurrent();
   if(!Number.isInteger(tab?.id))throw Error('CONTROL_TAB_MISSING');
   await chrome.tabs.remove(tab.id);
  }).catch(error=>{state.textContent='入队/关闭扩展页失败：'+String(error?.message||error);});
  return;
 }
 const key='boss-greet-queue-v1',dashboard=document.getElementById('dashboard'),
  summary=document.getElementById('summary'),notice=document.getElementById('notice'),
  title=document.getElementById('pause-title'),detail=document.getElementById('pause-detail'),
  button=document.getElementById('resume'),clear=document.getElementById('clear'),help=document.getElementById('action-help'),jobs=document.getElementById('jobs');
 const labels={QUEUED:'排队中',RUNNING:'执行中',SUCCESS:'成功',FAILED:'失败',UNKNOWN:'结果未知'};
 let current=null,tail=Promise.resolve(),resuming=false,clearing=false;
 function render(s){
  current=s;dashboard.hidden=false;
  const results=Object.fromEntries(Object.entries({...Object.fromEntries(Object.entries(s.archivedResults||{}).filter(([,r])=>BossGreetState.isUnknown(r))),...s.results}).map(([id,r])=>[id,BossGreetState.isUnknown(r)?{...r,status:'UNKNOWN'}:r])),queue=s.queue||[],values=Object.values(results),counts={};
  for(const r of values)counts[r.status]=(counts[r.status]||0)+1;
  const unknown=values.some(r=>BossGreetState.isUnknown(r));
  const finished=!s.active&&!queue.length&&values.length>0&&!unknown&&!values.some(r=>BossGreetState.resumePending(r))&&values.every(r=>['SUCCESS','FAILED'].includes(r.status)&&r.download?.status==='COMPLETE');
  const securityStop=s.paused?.kind==='SECURITY'||/^(?:SECURITY_|RESUME_SECURITY_)/.test(s.paused?.reason||'');
  const phase=securityStop?'平台安全验证，已停止':s.paused?.kind==='UNKNOWN'?'结果待核查，已停止':s.active?'队列执行中':queue.length?(s.paused?'队列已暂停':'等待执行间隔'):unknown?'结果待确认':values.some(r=>BossGreetState.resumePending(r))?'简历任务待处理或核查':finished?'已完成':'队列空闲';
  state.textContent=phase;
  const todaySuccess=BossGreetState.successToday(s);
  const quotaReached=todaySuccess>=150;
  const cleanup=BossGreetState.cleanupPlan(s);
  clear.hidden=!cleanup.visible;
  clear.disabled=clearing||resuming||!cleanup.allowed;
  clear.textContent=cleanup.olderOnly?'清理往日记录':'一键清理';
  button.textContent=resuming?'正在继续…':'继续执行';
  help.textContent=finished?(cleanup.allowed?(cleanup.olderOnly?'只清理往日已完成记录，今天的记录保留。':'今日任务已结束，可以清理本页记录。'):'任务已结束；当天成功满150或平台明确报上限后可清理。'):!queue.length&&!s.active&&!unknown?'打开带参数的 Greet 页面即可加入岗位。':unknown?'有结果尚未确认，暂不能清理。':'任务尚未完成，暂不能清理。';
  summary.textContent='今日成功 '+todaySuccess+' / 150 · 排队 '+queue.length+' · 执行中 '+(s.active?1:0)+' · 成功 '+(counts.SUCCESS||0)+' · 失败 '+(counts.FAILED||0)+' · 未知 '+(counts.UNKNOWN||0)+'（扩展保留记录）';
  notice.hidden=!s.paused;button.disabled=true;
  if(s.paused){
   const failed=results[s.paused.jobId],kind=s.paused.kind||failed?.failure?.kind;
   title.textContent=({CLOSED:'岗位已关闭，发送失败',REMINDER:'请确认 BOSS 开聊提醒',DAILY_LIMIT:quotaReached?'今日沟通额度已用完':'BOSS 已限制今天继续沟通',SECURITY:'BOSS 需要安全验证',UNKNOWN:'发送结果暂未确认'})[kind]||'失败原因正在检查';
   const descriptions={
    CLOSED:'这个岗位已不存在，已跳过。点击“继续执行”处理剩余岗位。',
    REMINDER:'BOSS 弹出了开聊提醒。请在 BOSS 页面确认提醒，然后点击“继续执行”。',
    DAILY_LIMIT:'BOSS 返回了达到上限的提示。本地当天成功 '+todaySuccess+' 条，失败不计入成功；平台限制与本地统计分别展示。',
    SECURITY:'请到 BOSS 正常页面完成安全验证。队列已停止，AI 会检查恢复条件。',
    UNKNOWN:'为避免重复发送，队列已停止。AI 会检查记录，你不需要查看原始文件。'
   };
   detail.textContent=descriptions[kind]||'AI 需要检查这条失败记录。你不需要查看 JSON 或文件路径。';
   button.disabled=resuming||!['CLOSED','REMINDER'].includes(kind)||failed?.status!=='FAILED'||failed?.download?.status!=='COMPLETE'||!queue.length||values.some(r=>BossGreetState.isUnknown(r));
   if(button.disabled&&queue.length)help.textContent=kind==='DAILY_LIMIT'?'今日额度已用完，无法继续。':'请先处理上方提示。';
   if(!queue.length&&kind!=='DAILY_LIMIT')detail.textContent+=' 当前没有等待发送的岗位。';
   if(s.paused.reason==='RESUME_UNKNOWN_STOP')detail.textContent='简历投递结果或回执尚未确认，已停止后续发送。由 AI 核查，不能直接重发。';
  }
  if(securityStop)help.textContent='请先在 BOSS 正常页面处理安全验证，由 AI 核对恢复条件；清理记录不能解除平台阻断。';
  jobs.replaceChildren();
  const history=Object.keys(results).sort((a,b)=>(results[b].at||0)-(results[a].at||0));
  const ids=[...new Set([...(s.active?[s.active.id]:[]),...queue.map(j=>j.id),...history])];
  for(const id of ids){
   const r=results[id]||{},tr=document.createElement('tr');
   const reason=r.status==='SUCCESS'?(BossGreetState.resumePending(r)?'沟通成功；简历任务待处理或核查':'沟通成功'):r.status==='QUEUED'?'等待发送':r.status==='RUNNING'?'正在发送':r.failure?.message||'AI 正在检查失败原因';
   const text=['岗位 '+id.slice(-8),labels[r.status]||'未知',reason];
   for(const value of text){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   if(['FAILED','UNKNOWN'].includes(r.status)){
    const td=document.createElement('td'),retry=document.createElement('button');retry.textContent='重新发送';
    const kind=r.failure?.kind;
    retry.disabled=resuming||clearing||quotaReached||unknown||Boolean(s.active)||!['REMINDER','DAILY_LIMIT'].includes(kind)||!r.recordFinishedAt||r.download?.status!=='COMPLETE'||Boolean(s.paused&&s.paused.jobId!==id&&queue.length);
    retry.title=kind==='CLOSED'?'岗位已关闭，不可重发':!['REMINDER','DAILY_LIMIT'].includes(kind)?'仅次数提醒或额度限制导致的明确失败可重发':'手动重发这一条，是否接受由 BOSS 决定';
    retry.addEventListener('click',()=>{if(retry.disabled)return;const q=new URLSearchParams({jobId:id,retry:'1',retryAt:String(r.at)});window.open(chrome.runtime.getURL('actions/greet/greet.html')+'?'+q.toString(),'_blank');});
    td.append(retry);tr.append(td);
   }else tr.append(document.createElement('td'));
   jobs.append(tr);
  }
  const aiStatus=document.getElementById('ai-status');
  if(aiStatus)aiStatus.textContent=JSON.stringify({contract:'boss-greet-status.v2',protocolVersion:BossGreetState.protocolVersion,date:BossGreetState.localDay(Date.now()),phase,todaySuccess,limit:150,cleanup:{available:cleanup.allowed,olderOnly:cleanup.olderOnly,count:cleanup.ids.length},activeJobId:s.active?.id||null,queuedJobIds:queue.map(j=>j.id),paused:s.paused?{jobId:s.paused.jobId,at:s.paused.at,reason:s.paused.reason,kind:s.paused.kind||results[s.paused.jobId]?.failure?.kind||'UNCONFIRMED'}:null,results:Object.fromEntries(Object.entries(results).map(([id,r])=>[id,{status:r.status,failure:r.failure||null,finishedAt:r.recordFinishedAt||null,resumeTask:r.resumeTask?{status:r.resumeTask.status,result:r.resumeTask.result||null,reason:r.resumeTask.reason||null}:null,downloadComplete:r.download?.status==='COMPLETE'}]))},null,2);
  document.title='Greet 队列 · 成功 '+(counts.SUCCESS||0)+' · 排队 '+queue.length+' · 执行中 '+(s.active?1:0)+' · 未知 '+(counts.UNKNOWN||0)+' · 今日成功 '+todaySuccess+' / 150 · '+phase+(cleanup.allowed?' · 可清理':'');
 }
 function refresh(){
  tail=tail.then(async()=>render((await chrome.storage.local.get(key))[key]||{}))
   .catch(e=>{state.textContent='读取队列失败：'+String(e?.message||e);button.disabled=true;clear.disabled=true;});
 }
 button.addEventListener('click',async()=>{
  if(button.disabled||!current?.paused)return;
  const paused={...current.paused};resuming=true;button.disabled=true;
  try{
   const reply=await chrome.runtime.sendMessage({type:'GREET_QUEUE_RESUME',jobId:paused.jobId,pausedAt:paused.at});
   if(!reply?.ok)state.textContent='未恢复：'+(reply?.reason||'UNKNOWN')+'；已停止，由 AI 检查原因。';
  }catch(e){state.textContent='恢复未确认：'+String(e?.message||e)+'；已停止，由 AI 检查原因。';}
  finally{resuming=false;refresh();}
 });
 clear.addEventListener('click',async()=>{
  if(clear.disabled||!current)return;
  clearing=true;clear.disabled=true;button.disabled=true;
  try{
   const reply=await chrome.runtime.sendMessage({type:'GREET_QUEUE_CLEAR_COMPLETED',lastFinishedAt:current.lastFinishedAt,resultCount:Object.keys(current.results||{}).length,pausedAt:current.paused?.at??null});
   if(!reply?.ok)help.textContent='未清理：队列状态已变化，请稍后查看。';
  }catch{help.textContent='清理结果尚未确认，请稍后查看。';}
  finally{clearing=false;refresh();}
 });
 if(typeof setInterval==='function')setInterval(refresh,60000);
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[key])refresh();});
 refresh();
})();

/* Optional controls on the same default Greet page. Never sends a BOSS request. */
(()=>{
 'use strict';
 if(location.search)return;
 const enabled=document.getElementById('resume-enabled'),select=document.getElementById('resume-file'),
  refresh=document.getElementById('resume-options'),resume=document.getElementById('resume-continue'),
  status=document.getElementById('resume-status'),rows=document.getElementById('resume-records');
 if(!enabled||!select||!refresh||!resume||!status||!rows)return;
 const KEY='boss-resume-delivery-v1';let current={},busy=false,errorMessage='';
 const reasons={BOSS_SECURITY_VERIFICATION:'BOSS 需要安全验证，请人工处理；简历部分不能自动继续。',RESUME_QUEUE_PAUSED:'简历部分已暂停，本岗位没有发送简历。',SELECT_ATTACHMENT_RESUME:'有多份附件简历，请先选择要投递的一份。',SELECTED_RESUME_UNAVAILABLE:'所选简历已不可用，请重新读取并选择。',NO_ATTACHMENT_RESUME:'BOSS 尚无附件简历，请先上传。',HUMAN_CONFIRMATION_REQUIRED:'BOSS 要求人工确认，请在正常 BOSS 页面处理。',RESUME_PRECHECK_UNCONFIRMED:'发送前校验未确认，简历没有发送。',RESUME_WORKER_INTERRUPTED:'简历任务中断，AI 需核查记录。',RESUME_RECEIPT_NOT_DURABLE:'简历回执尚未完整落盘，AI 需核查。',FINDWORK_RESUME_BLOCKED:'岗位当前不再满足投递条件。',RESUME_SWITCH_CHANGED:'开关已改变，简历没有发送。',ALREADY_SENT:'已经发送过简历，跳过。',NOT_SUPPORTED:'当前岗位不支持直接投简历，跳过。',RESUME_UNKNOWN_STOP:'存在未知投递结果，不能继续或重发。'};
 const label=x=>reasons[x]||x||'';
 async function render(){
  current=(await chrome.storage.local.get(KEY))[KEY]||{};
  enabled.checked=current.enabled===true;enabled.disabled=busy;
  select.replaceChildren();const auto=document.createElement('option');auto.value='';auto.textContent='仅一份附件时自动选择';select.append(auto);
  for(const r of current.choices||[]){const o=document.createElement('option');o.value=r.id;o.textContent=r.name;select.append(o);}
  select.value=current.resumeId||'';select.disabled=busy||!current.enabled||Boolean(current.active);
  refresh.disabled=busy||!current.enabled||Boolean(current.active);
  resume.disabled=busy||!current.enabled||Boolean(current.active)||!current.halt||(current.halt.unknown===true||current.halt.requiresReview===true);
  status.textContent=errorMessage|| (current.active?'正在处理简历；打招呼结果独立保留。':current.halt?(current.halt.requiresReview?(current.halt.unknown?'简历结果或回执尚未确认，后续打招呼与简历投递均已停止，请由 AI 核查。':'平台要求安全验证，后续打招呼与简历投递均已停止，请人工处理。'):label(current.halt.reason)+' 简历投递已暂停，打招呼照常执行。'):current.enabled?'已开启；只对之后新入队的岗位生效。':'已关闭；只执行原有打招呼。');
  rows.replaceChildren();
  for(const [id,r] of Object.entries(current.results||{})){
   const tr=document.createElement('tr');for(const text of ['岗位 '+id.slice(-8),({SUCCESS:'简历已投递',FAILED:'简历未投递',UNKNOWN:'投递结果未知',PREPARING:'准备中',SKIPPED:'跳过'})[r.status]||r.status,label(r.reason)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}rows.append(tr);
  }
 }
 async function send(m){busy=true;errorMessage='';await render();try{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)errorMessage=label(r?.reason)||'设置未确认，请检查。';}catch{errorMessage='设置未确认，请检查。';}finally{busy=false;await render();}}
 enabled.addEventListener('change',()=>send({type:'RESUME_DELIVERY_SETTINGS',enabled:enabled.checked}));
 select.addEventListener('change',()=>send({type:'RESUME_DELIVERY_SETTINGS',enabled:current.enabled===true,resumeId:select.value}));
 refresh.addEventListener('click',()=>send({type:'RESUME_DELIVERY_OPTIONS'}));
 resume.addEventListener('click',()=>send({type:'RESUME_DELIVERY_SETTINGS',enabled:current.enabled===true,continue:true}));
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY])void render();});
 void render();
})();

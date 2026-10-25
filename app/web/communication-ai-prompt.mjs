// Only generates an explicit-authorization prompt for the selected jobs.
// No HTTP, Chrome actions, queue operations, or private BOSS security parameters.
const clean=value=>String(value??'').replace(/[\r\n\t]/g,' ').trim().slice(0,160);
export function makeCommunicationAiPrompt(items,selectedIds){
 if(!Array.isArray(items)||!Array.isArray(selectedIds)||!selectedIds.length||
  new Set(selectedIds).size!==selectedIds.length)throw Error('NO_VALID_SELECTED_JOBS');
 if(selectedIds.some(id=>typeof id!=='string'||!id.trim()||id.length>256||/[\s/\\\x00-\x1f]/.test(id)))throw Error('INVALID_SELECTED_JOB_ID');
 const selected=new Set(selectedIds);
 const jobs=items.filter(j=>selected.has(j.job_id));
 if(jobs.length!==selectedIds.length||jobs.some(j=>j.eligible!==true))throw Error('SELECTION_STALE');
 const lines=jobs.map((j,i)=>(i+1)+'. jobId='+j.job_id+'｜'+clean(j.facts?.job_name||j.job_name)+'｜'+clean(j.facts?.brand_name||j.brand_name));
 return '请接管本机 Findwork 求职系统，在当前对话中执行以下 '+jobs.length+' 个岗位的沟通任务。这是我明确授权的岗位清单，不允许替换、扩充或重复投递。\n\n'+
  '项目：Findwork（在已连接的本机工作区中定位 repos/findwork，不要新建仓库或猜测远程路径）\n'+
  '岗位来源：沟通工作台「值得投递·未沟通」当前人工勾选的岗位。以 jobId 为唯一业务标识，不要按名称、公司或排序猜测岗位。\n'+
  lines.join('\n')+'\n\n'+
  '执行与验收要求：\n'+
  '1. 先读取当前本机工程和真实浏览器验收协议；在数据库逐条核对每个 jobId 仍为 WORTH、未沟通、未投递、未关闭、无历史阻断。核实 BOSS 登录和常驻扩展。失效、重复或状态不明的岗位不得执行。\n'+
  '2. 仅对上述明确授权的岗位执行 Greet，通过原有扩展动作页面及持久串行队列处理，保留 5～8 秒节流、身份和领取校验，不直接并发调用 BOSS 接口。扩展受限、业务码 37、登录异常或副作用 UNKNOWN 时暂停核对，不盲目重试。\n'+
  '3. 沟通真正成功后，独立判断岗位是否有已查明且经过真实验收的直接简历投递能力。只有确认具备真实投递接口、明确成功判据时才按“先沟通、后投简历”执行；否则仅沟通。不可将“急聘”或 canSendResume=true 猜作 ATS 直投，也不得用打招呼请求冒充正式投递。\n'+
  '4. 扩展执行结果先下载 JSON 到 BOSS/YYYY-MM-DD/greet/；如进行独立简历投递，也应保存独立回执。逐条核验已完成下载的文件、jobId、业务返回码、成功/失败/UNKNOWN 及时间。由 AI 检查后使用 Findwork 正式 CLI（jobs import-greet / import-application）导入数据库；扩展不自动入库。不能以页面打开或队列 ACK 代替成功。\n'+
  '5. 入库后查询「今日已沟通」核对新增记录；逐条汇报沟通、简历投递、回执文件和入库情况，分别统计成功/失败/未知/未执行。不得擅自扩大任务、重试 UNKNOWN、提交或推送 Git。\n'+
  '请执行这些已授权岗位。如真实环境或权限不满足，明确报告阻断，不得虚构执行结果。';
}

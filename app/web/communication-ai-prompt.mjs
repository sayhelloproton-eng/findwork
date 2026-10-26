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
  '1. 读取 skills/job-search/SKILL.md 与 skills/boss-extension/SKILL.md。复用已安装的普通 Chrome 扩展，先打开不带参数的 actions/greet/greet.html 核对队列。禁止通过 Playwright/CDP 访问、监听或操作 BOSS，不建立页面组，不创建临时发送脚本。\n'+
  '2. 核对授权岗位仍可沟通，通过正式领取与发送前校验，再打开同一个带参数 Greet 页面入队。只有扩展发送，保留5～8秒串行间隔；参数页关闭和入队确认不代表成功。\n'+
  '3. 本提示词仅授权 Greet 沟通，不授权简历提交。可选附件直投必须另有明确授权及已加载的扩展能力，不因功能存在而扩大任务；不启动接口调研。失败原因由 AI 核对；人工只处理平台验证和明确确认。\n'+
  '4. 扩展执行结果先下载 JSON 到 BOSS/YYYY-MM-DD/greet/；如进行独立简历投递，也应保存独立回执。逐条核验已完成下载的文件、jobId、业务返回码、成功/失败/UNKNOWN 及时间。由 AI 检查后使用 Findwork 正式 CLI（jobs import-greet / import-application）导入数据库；扩展不自动入库。不能以页面打开或队列 ACK 代替成功。\n'+
  '5. 入库后查询「今日已沟通」核对新增记录；逐条汇报沟通、简历投递、回执文件和入库情况，分别统计成功/失败/未知/未执行。不得擅自扩大任务、重试 UNKNOWN、提交或推送 Git。\n'+
  '请执行这些已授权岗位。如真实环境或权限不满足，明确报告阻断，不得虚构执行结果。';
}

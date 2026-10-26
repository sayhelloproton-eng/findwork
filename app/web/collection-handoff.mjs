import {validBossExtensionId} from './greet-launch.mjs';
import {todayInShanghai} from './collection-date-filter.mjs';
export function collectionParameters(expect,pages){
 if(!Number.isInteger(expect)||expect<1||expect>99)throw Error('求职期望序号请输入 1～99 的整数');
 if(!Number.isInteger(pages)||pages<1||pages>21)throw Error('采集页数请输入 1～21 的整数');
 return{expect,pages,expectedCount:pages*15};
}
export function buildCollectionUrl(extensionId,expect,pages){
 if(!validBossExtensionId(extensionId))throw Error('未连接支持采集入口的扩展，请检查当前 Chrome 中的扩展版本');
 const p=collectionParameters(expect,pages),url=new URL('chrome-extension://'+extensionId+'/actions/detail/dom.html');
 url.search=new URLSearchParams({auto:'1',expect:String(p.expect),pages:String(p.pages),fresh:'1'}).toString();return url.href;
}
export function collectionHandoff({repoRoot,expect,pages,startedAt=null,requestId=null},now=new Date()){
 const p=collectionParameters(expect,pages);
 if(typeof repoRoot!=='string'||!repoRoot.startsWith('/')||/[\r\n]/.test(repoRoot))throw Error('正在读取本机项目路径，请稍后');
 const root=repoRoot.replace(/\/$/,''),day=todayInShanghai(startedAt?new Date(startedAt):now);
 return `请接手 Findwork 的岗位采集后处理任务。项目仓库：${root}。
本次参数：求职期望序号 ${p.expect}（账号当前第 ${p.expect} 个求职期望，不固定对应职位名称）；${p.pages} 页，每页15条，预计${p.expectedCount}条。${startedAt?'用户打开扩展入口的时间：'+startedAt+'。入口已打开不证明采集成功。':'这是交接提示词预览，尚未确认启动采集；先核实本批实际开始时间。'}
${requestId?'本次启动请求ID：'+requestId+'。请核对同一请求对应的扩展控制页和实际采集runId。':''}
请在扩展采集与文件下载完成后执行以下任务：
1. 先读取 ${root}/AGENTS.md、${root}/GETTING_STARTED.md，再读取 ${root}/skills/job-search/SKILL.md 和 ${root}/skills/boss-extension/SKILL.md；按需读取 references。复用已有环境，不重新设计采集流程。
2. 核实当前 Chrome 的真实下载根目录，通常为 ~/Downloads，但不能假定。查找 BOSS/${day}/list/ 和 detail/；跨天则一并核查随后日期目录。以实际批次时间、求职期望、职位ID及Chrome下载COMPLETE区分本批与历史文件，不能把同一天所有旧文件都当本批，也不能把页面打开或预计数量当成功。若未完成先核实进度，不能盲目重开入口。
3. 按现有 Skill 使用正式 import-list、import-detail 入库去重，保留原始JSON、hash、已有判断及所有沟通/投递记录。逐项核验有效文件与实际入库数量；不足${p.expectedCount}条如实报告，不伪造或重复凑数。
4. 评估前必读本机三项已确认私有策略：${root}/.private/job-search/candidate-profile.md、target-roles.md、exclusions.md。按照 references/evaluation.md 的学历语气及作用范围规则逐岗位评估；只处理新增、待评估、过期需复核或明确授权复评的岗位，不因重复采集覆盖已有WORTH/PASS。使用最新revision/source hash通过正式decide-ai保存判断、具体理由及必要的AI提炼；原文摘录不能冒充AI评估。
5. 读取数据库核验，刷新岗位列表与统计，汇报下载有效数、新增/重复/更新/缺失、评估结果及剩余可沟通数量。下载完成、入库和评估完成分别举证。
本次只授权采集后入库与岗位评估，不授权打招呼、发简历或自动领取发送任务。禁止通过Playwright、CDP、Puppeteer、调试协议或独立HTTP访问、监听或操作BOSS；平台动作只能通过普通Chrome中的既有扩展正式入口。不得删除下载文件、改写成功记录或直接SQL修改业务状态。`;
}

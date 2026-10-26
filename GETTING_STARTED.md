# Findwork｜AI 接管与首次使用

本文件给用户的 AI 助手执行。先确认用户要做什么，再复用已有环境；不要把“继续求职任务”理解成重新安装、重新开发或重新采集。

## 先选任务范围

| 用户目标 | 先读 | 执行边界 |
|---|---|---|
| 了解项目 / 审计 | README、docs/DESIGN.md、AGENTS.md | 只读；不采集、不发送、不改数据 |
| 首次使用 | 本指南，再读两份 Skill | 缺什么补什么，已有步骤跳过 |
| 收集 / 入库 / 评估 | skills/job-search/SKILL.md，再读其所指平台 Skill | 依次核验原始文件、入库去重、三项私有策略、决策写回 |
| 沟通已授权岗位 | 两份 Skill 的沟通步骤及 references/database.md | 复用扩展 Greet 页；领取、入队、回执、入库分别核验 |
| 中断 / 失败恢复 | 平台 recovery.md、主控 database.md | 先确认真实状态，不自动重放 |
| 修改源码 | AGENTS.md、CONTRIBUTING.md、当前模块合同 | 合成测试；真实发送不属于工程测试 |

**浏览器硬边界：禁止 AI 通过 Playwright、CDP、Puppeteer、调试协议或独立 HTTP 访问、监听、采集和操作 BOSS 页面。** 不建立 BOSS 受控页面组，不把修复浏览器工具作为扩展发送的前置。只用普通 Chrome 打开正式扩展页面，BOSS 动作由扩展执行。平台登录、验证码、开聊提醒由用户正常处理；AI 可从扩展控制/诊断页、原始下载、数据库和本地 API 取得对应证据，不直接检查 BOSS DOM。

唯一沟通入口是 `chrome-extension://<实际扩展ID>/actions/greet/greet.html`：**不带参数看队列，带参数入队**。不创建额外观察页、临时发送或恢复脚本。不强制安装 Playwright、MCP 或其他浏览器框架。

## 先让用户理解：这是做什么的？

Findwork 使用用户招聘账号里的岗位期望取得职位列表和详情，再按个人画像、求职偏好、排除条件评估，保存本地记录并减少重复沟通。WORTH 不等于发送授权；Greet 是沟通，不等于正式简历提交；附件简历可在Greet同页通过独立开关选择发送（默认关闭，须核验实际扩展能力与真实回执），不负责投递后的聊天和面试跟进。

用户自己的 AI 主执行，用户最少操作：AI 负责准备环境、整理文件、入库、评估、核对回执；用户只负责账号身份、个人事实确认及对外动作授权。用户不需要阅读 JSON 或技术日志。先看现状，再决定动作；没有真实回执不宣称成功。个人资料说明见 [PRIVACY.md](./PRIVACY.md)，使用边界见 [DISCLAIMER.md](./DISCLAIMER.md)。

## 执行流程：按进度跳过已完成阶段

### 第 1 步：找到项目并只读检查

确认用户已有仓库的身份；没有才从用户提供的真实 GitHub 链接获取，不猜路径、不覆盖旧库。先读 `skills/job-search/SKILL.md` 和 `references/database.md`、`references/private-policy.md`（references 均相对该 Skill）。

从仓库根运行 `npm run jobs -- help`、`npm run jobs -- status`。这两条不创建、初始化或迁移数据库；status 中 ready=false 不代表应当直接重建。数据库默认 `app/db/runtime/jobs.sqlite`，可由 FINDWORK_DB_PATH 指定。浏览器和扩展的就绪状态不能由数据库 status 冒充。

需要首次安装时再检查 Node.js 24+、npm、Git、Google Chrome 与系统架构，运行 `npm ci`、`npm run verify`。这不是用户每轮求职任务的前置。`npm run demo` 仅为内存合成演示，不能当真实数据；不得占用现有正式服务端口。依赖失败不链接旧项目的 node_modules 充当安装成功。

### 第 2 步：用户登录并确认岗位期望

只使用用户电脑端（Windows/macOS）的 Chrome 网页版；不能用手机 App 登录状态代替。登录与职位列表地址从 `platforms/boss/extension/README.md` 取得。复用同一已登录 Chrome Profile，保留一个当前目标的职位列表 Tab。

AI 可用操作系统打开普通 Chrome URL；用户在网页完成扫码、密码、验证码和岗位期望设置。AI 不索取凭证、不绑定 BOSS 到自动化调试工具。登录是否可用由用户确认，并通过扩展正式诊断/控制页取得辅助证据；缺工具就给用户当前一步最短提示，不伪造观察结果。

expect=0 是推荐，expect=1/2/... 是该账号自定义求职期望的顺序，不固定对应某种职业。必须依据用户当前配置确认，不能猜。

### 第 3 步：准备扩展，用户仅完成必要的一次加载

已有正确扩展先复用，核对实际加载目录、真实扩展 ID 与运行能力，不能只比版本号。读取平台 Skill。若未安装，构建产物是 `platforms/boss/extension/dist/boss-list-observer/`，必须含 manifest.json 和 actions/detail/dom.html；不加载 ZIP，不猜开发者电脑路径。

AI 准备真实绝对目录并用普通 Chrome 打开 chrome://extensions/。需要用户操作时，只请用户开启开发者模式、点击“加载已解压的扩展程序”；macOS 在文件夹对话框按 **⌘ Command + ⇧ Shift + G**，粘贴绝对路径、Return、再打开；Windows 使用对话框地址栏。不能要求用户逐层找目录。

Findwork 沟通页须取得实际后台返回的协议版本和能力。只有扩展 ID、磁盘源码或“页面能打开”不能证明已加载实例支持发送前校验/手动重发。若不兼容，由 AI 核对实际目录与构建；有执行中、排队或未知任务时禁止随意 Reload。

### 第 4 步：确认三项私有策略

按主 Skill 的私有策略合同检查以下三个文件，确认有用户认可的实际内容：

- `.private/job-search/candidate-profile.md`：个人画像与可证明的职业能力。
- `.private/job-search/target-roles.md`：求职偏好、目标与优先级。
- `.private/job-search/exclusions.md`：用户明确确认的排除条件。

AI 可从用户授权的本机简历提炼，但不得虚构；用户确认后写本机私有文件。缺失/空白/未确认时允许先入库，但不写正式 WORTH/PASS、不对外联系。三份私有资料不随公开仓库分发，禁止放进公开文档、测试和日志。

### 第 5 步：只打开正式扩展采集页

先用 `pages=1` 验证一批；例如：

`chrome-extension://<EXTENSION_ID>/actions/detail/dom.html?auto=1&expect=<N>&pages=1`

AI 替换实际 ID 和期望索引，在同一个已登录的 Chrome 实例打开 URL。不要重新编写点击器、监听器，不让用户逐条点岗位，不为了这个动作安装浏览器驱动。可用普通 Chrome 的原生 URL 打开能力；必须确认目标 Profile，不使用另一个无登录态环境。仅在无法打开时，请用户粘贴完整 URL 并回车。

扩展执行 Refresh → List/首条自然 Detail → 唯一职位卡片 → 下载完成 → 15/15 才 Scroll。需要20批300条时按用户目标执行，首次已完成验证后不反复验证。fresh=1 只在用户要全新重采时使用。

AI 根据实际 Chrome 下载根目录和平台 results.md 核对 Chrome Downloads 为 complete、exists=true、本批文件身份及 JD；页数、ACK、历史文件都不能当作当前采集成功。安全验证、业务码37、UNKNOWN停止，先保留进度再说明原因。

### 第 6 步：入库去重，再评估

从根目录按本轮已核验文件调用：

- `npm run jobs -- init`（仅数据库需准备/显式迁移时；不会清空旧库）。
- `npm run jobs -- import-list ABSOLUTE_LIST_JSON`
- `npm run jobs -- import-detail ABSOLUTE_DETAIL_JSON JOB_ID`
- `npm run jobs -- query '{"status":"PENDING","limit":500}'`

核对 added/existing/updated/invalid。已有 WORTH/PASS 和沟通历史不因重复采集自动重评、覆盖；只评估确实 PENDING/NEED_DETAIL 的岗位。缺 JD 先补真实详情。

先用 get JOB_ID 取得 revision 与 decision_basis.hash，按 database.md 调用 decide-ai，包含 jobId/status/reason/strategyVersion/expectedRevision/expectedSourceHash。冲突重读；写入后 get 验证。已有决策过期需明确复核授权。WORTH/PASS/PENDING要有实际证据，AI 摘录不能冒充模型评估。

### 第 7 步：交付工作台；沟通另需授权

已有本项目服务复用；首次才 `npm start`。默认 http://127.0.0.1:4317/，PORT 可改变，以实际监听为准，不停止无关服务。AI 检查 `/api/jobs`、`/api/dashboard` 和可见界面；HTTP正常不等于视觉验收。没有访问用户电脑或浏览器的能力，要说明缺什么，不冒称已完成。

未经用户授权不发送。授权后按两份 Skill 执行：核对候选 → 正式 claim-batch/claim → 扩展带参数 Greet 入队 → 默认 Greet 观察 → 逐条核对本轮回执 → import-greet → get。领取失败/响应丢失要先读回状态，不能直接说未领取或重领。

今日成功按业务回执 finishedAt 的北京时间日期计，失败不占成功。平台返回上限只是独立的错误信息；用户允许的次数/额度类手动重发依平台 Skill 处理，不自动循环。岗位关闭和 UNKNOWN 不重发。队列已结束且本地成功满150，或BOSS明确报当日上限时，可清理本页记录。跨天只重新统计当天成功，不自动删记录；往日记录可手动清理，混合批次只清理往日部分。下载和数据库不动。

没有授权沟通时，真实数据入库、评估与工作台可用已经构成首次交付，不以发消息作为安装验收。

## 怎样报告和恢复

每次只说明“已完成的证据 → 当前动作/阻塞 → 用户唯一需要做的事（若有）”。账号确认由人完成，数据和错误分析由 AI 完成。不把工程检查、扩展入队、真实成功、数据库入库混为一谈。

恢复优先查两份 Skill 与 `references/database.md` 的动作表。UNKNOWN、不确定领取、回执不完整先读回；不得重建账号环境、绕过平台验证或以临时页面/脚本替代正式入口。真实岗位、策略、认证、原始文件都不能上传公共仓库。

交付时提供真实可访问的本地链接、实际数量与未验证边界。不能访问用户电脑，或只读得到本 GitHub 文件时，应明确说明所缺能力，仅请求用户完成当前唯一必要动作，不能冒称执行完成。

### 工作台采集与 AI 交接

岗位工作台标题右侧「采集岗位」打开表单：求职期望用账号当前序号1、2、3表示，采集页数1～21，每页15条。确认前先登录BOSS并保留唯一职位列表页，等待当前其他采集结束。确认由扩展核对后打开或复用唯一已结束的正式Detail采集入口（fresh=1），不代表成功；保持弹窗可复制含本次参数、开始时间、本机Skill及后处理步骤的提示词，下载完成后交给AI核验、入库、去重、评估和刷新统计。提示词不授权沟通或发简历。已打开的本次任务不重复启动；开始下一批使用弹窗「核查并准备下一批」，扩展只读核查结束/下载结算后才解锁。丢失回执时核对同一请求ID，不盲目新建。真实平台验收按 [验收检查表](./docs/ACCEPTANCE.md) 执行。

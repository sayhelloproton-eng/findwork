---
name: job-search
description: Findwork 岗位数据管理与投递决策总控 Skill。引导 AI 调用已接入的平台能力取得 List/Detail 文件、通过公共 Ingestion 入库去重、读取三项私有策略评估岗位、持久化 WORTH/PASS、经授权沟通并导入真实回执。当前支持 BOSS，未来平台遵循同一业务流程。
---

# Findwork｜岗位管理与投递决策 Skill

## 任务边界和 Owner

本 Skill 是**给 AI 使用的业务操作说明**，不是执行引擎。管理的闭环是：发现岗位 → 采集原始文件 → 公共 Ingestion 入库与去重 → 根据三项已确认的个人策略评估 → 更新岗位决策 → 用户授权后调用平台沟通/投递 → 原始回执入库 → 工作台查看及数据大盘。**不负责投递后的招聘者聊天、回复跟进、面试安排。**

- `skills/job-search/`：本业务总控；负责选择步骤、读写业务状态、操作指引和跨层核验。
- `skills/boss-extension/SKILL.md`：当前 BOSS 平台的采集、Chrome 下载和授权 Greet 方法；其他平台以后按自己的 Skill/工具接入。平台 Skill 可脱离 Findwork 单独使用。
- `app/db/ingestion/job-store.ts` + `app/db/schema/jobs.sql`：共享 v7 DB Schema、导入、去重、历史、决策与回执的事实 Owner。**Ingestion 归 DB，不归 BOSS。**
- `app/server/job-cli.ts`：统一 CLI；`app/server/server.ts` / `app/web/`：API、筛选、岗位列表和统计大盘。
- `references/database.md`：当前 CLI、状态与持久化契约；`references/boss-workflow.md`：BOSS 平台和本系统的接口边界。

## 每次进行岗位评估前：必读三项私有策略

**这是必要输入，不是可选建议。** 在仓库根目录读取：

| 必需策略 | 本机私有路径 | AI 要回答的问题 |
|---|---|---|
| 个人画像 | `.private/job-search/candidate-profile.md` | 我有哪些可证实的经历、能力和可迁移经验？能不能胜任？ |
| 求职偏好 | `.private/job-search/target-roles.md` | 我想投什么类型的岗位、行业和工作内容？优先顺序是什么？ |
| 排除条件 | `.private/job-search/exclusions.md` | 哪些已经明确确认不投？什么条件构成真正的硬排除？ |

三文件必须存在、可读，且包含**用户已经确认的实际信息**。空模板、过期信息、不存在的个人事实，都不能视作已配置。求职偏好或排除条件确实没有限制，也要由用户明确写明“无特别限制”，不能由 AI 默认推断。读取后按照 `references/evaluation.md` 评估，尤其先读其中「学历要求」的语气与作用范围规则：普通学历描述不自动等于硬门槛，原文明确不可放宽且用户不能满足时才按已确认规则排除；详见 `references/private-policy.md`。若任何一项缺失、未确认或互相冲突：**不写 WORTH/PASS，不计划对外发送**，先说明缺什么，再帮助用户在本机补齐，禁止自行生成履历和偏好。

以上文件已通过根 `.gitignore` 排除，**公开 Skill、references、README、Git 提交、日志和对外消息都不得复制用户实际内容**。公开的 `references/candidate-profile.md`、`target-roles.md`、`exclusions.md` 仅描述信息合同，不是个人资料。遗留的第 4 份私有 evaluation.md 已停用，只作迁移说明，不得据此新增筛选规则。

## 工作流（完整岗位管理任务时按顺序执行）

### 1. 确定平台与采集边界

已有环境先 `npm run jobs -- help` 和 `npm run jobs -- status`。前者不开库，后者只读、不自动创建/迁移数据库。按任务复用当前服务与扩展，不默认运行安装/初始化。

- 识别已安装的平台工具/Skill 和用户本轮采集范围；目前只有 BOSS。平台不可用则报告，不冒称已采集。BOSS 的 `expect` 是账号当前求职期望索引，`pages` 是批次数；按 `skills/boss-extension/` 指导打开正式采集页。
- 由平台 Skill 执行真实浏览器动作，取得真实 **List、Detail 原始 JSON**。先核对本轮下载 Chrome COMPLETE、本地实际存在的绝对路径、批次时间、职位 ID、Detail 与 List ID 一致及 JD 是否真实有效；勿用历史文件冒充本轮。
- BOSS 当前文件位于 Chrome 下载根目录下 `BOSS/YYYY-MM-DD/list/` 与 `detail/`；下载根目录由当前 Chrome 设置决定，**不要假设固定的 Downloads 绝对路径**。具体见平台 Skill 的 `references/results.md`。
- **独立平台 Skill** 的完成边界仅为下载/动作回执；用户只要求原始文件时可以在平台边界结束，不强迫运行 Findwork。**用户委托 Findwork 管理、评估或沟通时，下一步必须入库，不得把入库称作可选。**

### 2. 文件导入公共 DB，先去重再决策

从 Findwork 仓库根目录执行（具体输入参数与回执见 `references/database.md`）：

1. `npm run jobs -- init`：确认可用 v7 数据库；**不得清空、覆盖或重建已有用户库**。
2. 逐个已验证 List 文件执行 `npm run jobs -- import-list ABSOLUTE_LIST_JSON`；每份自然响应是一个批次，保存完整原始 JSON 与 source hash。检查结果 `read/added/existing/updated/invalid`。
3. 逐个已验证 Detail 文件执行 `npm run jobs -- import-detail ABSOLUTE_DETAIL_JSON JOB_ID`；只为匹配的职位补真实 JD 和原始回执，拒绝无效、失败、身份不一致的 Detail。读取 `get JOB_ID` 确认确实入库。
4. **去重按当前 v7 的平台内 `encryptJobId`**：同一 ID 已存在，就保留该条岗位的历史判断、关系信号和沟通回执；新 List 可能更新采集事实和最新时间，但不代表新岗位，也不授权再次评估、再次沟通。`updated` 属于已有岗位中的来源变化，不属于 `added`。
5. 持久化成功再按数据库状态选择待评估集合；**不能把本轮所有下载的 ID 直接当作待评估岗位列表**。跨平台统一 ID 的映射待第二个平台接入时由公共 Ingestion 设计，不得假定其他平台也有 BOSS 的 encryptJobId。

### 3. 数据库状态驱动评估：只处理真正需要处理的岗位

使用 `query '{"status":"PENDING","limit":500}'` 分页查询，并按单条 `get JOB_ID` 核验当前状态与证据；查询的 `PENDING` 集合包含内部 `NEED_DETAIL`，需要再分流。

- `PENDING` 且三项策略有效、事实足够 → 按个人画像、求职偏好、排除条件评估。无法形成可靠结论时仍为 PENDING，不勉强选 PASS/WORTH。
- **面向用户只有 WORTH、PENDING、PASS 三种判断，不新增“待确认”状态。**
  - **PENDING（待评估）**：未评估、缺 Detail 或策略/关键事实，均在待评估；AI 自主调研后仍缺会改变最终判断的决定性事实才保持 PENDING；普通疑问不构成独立阻断；已知有可匹配研发方向时，混招、客户身份和用工性质未知不单独阻塞。此时 AI 必须通过 `decide-ai` 将 `PENDING` 和明确 `reason` 持久化：**已确认的证据与匹配点、尚未确认的具体问题、判断倾向或建议、AI 继续自主调查的必要事实**。已有规则内的日常判断和核实由 AI 主动完成；PENDING 不联系招聘者。未启动评估的默认 PENDING 可以没有理由。
  - **PASS**：只有根据个人画像、已确认的硬性排除和岗位事实，能够有把握判定不适合或不可满足核心要求时才 PASS，必须写充分理由。缺详情、模糊要求或普通偏好不足不直接 PASS；PASS 默认不进入人工复核和后续沟通清单。
  - **WORTH（值得投）**：岗位事实支持个人画像胜任或合理迁移，符合已确认的求职偏好、未命中排除条件，且缺失信息不足以改变结论，记录匹配证据；WORTH 不自动触发沟通或投递。
  - 内部 `NEED_DETAIL` 只是缺详情的待评估子情形，在 UI 中仍归入 PENDING，不是第四种判断。

- `NEED_DETAIL` 且无有效 JD → 只补 Detail，不直接猜 PASS/WORTH；完整 Detail 导入后会重新变成 PENDING。
- 已经 `WORTH` 或 `PASS` → **重复采集默认跳过评估**，保留历史决策和原因；若 `decision_stale=true`，禁止自动联系，标记待明确复核；仅在用户要求复核或明确规则授权复核时，用最新证据重新判断。
- 已沟通、已有投递、`history_blocked` 或状态 `FAILED/UNKNOWN/IN_FLIGHT` → 不再安排重复对外动作；失败和未知不能自动重试；用户在 Greet 页明确点击手动重发时，仅次数提醒或额度限制导致的明确失败可按平台 Skill 重新领取，岗位关闭和 UNKNOWN 不允许。
- 新职位也可能因 List 不全而待补详情；不能把没有证据的职位直接 PASS。

完成评估后用 `npm run jobs -- decide-ai` 持久化 `WORTH/PASS/PENDING`，**必须**把 `get` 返回的最新 `revision`、`decision_basis.hash` 分别填入 `expectedRevision`、`expectedSourceHash`，并包含可核查的 `reason` 和 `strategyVersion`；冲突时重新读取，不覆盖用户已有判断。需要补 Detail 可使用 `decide` 写内部 `NEED_DETAIL`（不能向不接受该状态的 `decide-ai` 发送它）。持久化后再次 `get` 对照状态、依据和版本，不能仅凭 AI 的口头结论当作入库成功。

### 4. WORTH 岗位排序、授权沟通、回执入库

BOSS 访问方式与禁止直接自动化的原因统一由 `skills/boss-extension/SKILL.md` 的“BOSS 访问边界与原因”维护。Findwork 只能调度已安装扩展的正式入口，不得使用 Playwright/CDP/Puppeteer、调试协议或独立 BOSS HTTP 请求替代；先打开不带参数的扩展 `actions/greet/greet.html` 核对旧队列和未结算项，再领取新岗位。沟通只有这一个扩展入口：带参数入队、不带参数显示队列与人工处理提示。不得另建观察页、临时发送/恢复脚本；不得先寻找或修复 Playwright 页面组，更不得因此转去操作 BOSS。

- 从 DB 查询尚可联系的候选（`query '{"candidates":true,"sort":"recommended"}'`），结合实时 `get` 的 `eligible`、`decision_stale`、历史联系/投递信号进行阻断；按能力与职责匹配、招聘者活跃证据、行业偏好和可核查现实条件排序。**不引入未经确认的百分制评分或每日额度常数**。
- 给用户展示每个拟沟通岗位的身份、判断理由、来源及计划动作，取得具体岗位的明确授权；WORTH 并不等于同意发送。即使用户请求批量，也要明确授权岗位 ID 范围，保持平台节流和串行约束。
- 批量优先通过 `claim-batch` 原子领取并取得参数；单条也可 `claim`，两者与 HTTP 复用发送资格和成功额度规则。领取响应丢失先按 jobId 读回，不能宣称“未领取”或自动重领。每条授权岗位执行 `claim` 锁定唯一 actionId → **平台真正发出 Greet 前立即执行 `check-greet`，核验同一岗位/actionId 仍为 WORTH、未过期；PASS 不能凭旧 claim 重发** → 按平台 Skill 执行真实 Greet → 找到 `BOSS/YYYY-MM-DD/greet/` 中对应**真实**结果文件 → `import-greet ABSOLUTE_GREET_RESULT_JSON JOB_ID` → `get JOB_ID` 读回 `communication_state` 和回执。只有真实成功才是 `SUCCEEDED`；失败/UNKNOWN 必须如实记录，不自动重试。
- Greet 是沟通，不是正式简历投递。BOSS 扩展现有默认关闭的附件简历直投开关，开启后仅对新入队的岗位生效，执行与结果独立于 Greet；只有独立可核查的投递回执才可 `import-application`。真实平台发送尚须核验实际加载能力与现场回执。**本系统不接管投递后的持续跟进**。

### 5. 查询和报告

使用 `app/server/server.ts` / `app/web/` 的岗位工作台查看去重后的列表、详情、评估状态、沟通状态和 `/api/dashboard`。区分**已采集、已入库、新增、已有、待补详情、WORTH、PASS、已确认沟通、正式已投递**。统计来源以 DB 为准，真实外部执行以平台文件回执为准，不推断对方回复率或面试进度。

## 失败与恢复

任一关键步骤失败/来源 UNKNOWN/平台安全验证/业务码 37/下载身份不一致/策略缺失/乐观锁冲突：停在第一处真实失败，核对事实 Owner；可安全重读，不得重放未知的外部发送。原始 JSON 必须保留以便重验；禁止直接更新 SQLite 状态列绕过 CLI。优先参考 `references/database.md`、`references/evaluation.md` 和对应平台 Skill。

**本 Skill 只定义通用工作方式及隐私输入契约，不存用户个人资料，不负责整个仓库的 AI 初始化/bootstrap。**


## 策略真源、数据质量与展示边界

求职倾向和排除规则只从本机私有三策略中读取；公开 Skill 不复述或扩张用户个人规则。岗位适配判断、WORTH 相对优先级、岗位有效性以及沟通/申请历史必须分离，非决定性信息不允许扩大 PENDING。JD 原文摘录不能冒充 AI 提炼或 AI 决策；清理历史数据须保留备份与沟通回执。工作台统计使用真实数据库。

## 本机今日批次的结构化摘录与模型决策须分开

已采集原文可用 scripts/jd-extract.mjs preview/ apply 仅做**源文段落提取**；其摘要标题有“原文摘录｜”前缀，工作台显示“原文摘录”，并明确**没有模型理解、没有 AI 评估、没有更新 WORTH/PASS**。只有实际经 AI 逐份分析 JD、真实私有策略、最新 hash 和乐观版本校验的结果，才能作为正式 AI 筛选结论写回。不要将规则提取器结果描述为 AI 已完成提炼。

岗位工作台「采集岗位」弹窗提供采集参数和可复制的AI交接提示词：确认仅打开现有平台扩展入口，下载完成后仍需AI按本Skill正式核验文件、入库去重及评估。交接提示词记录开始时间但不能代替完成回执，也不提供沟通/发简历授权。

# Findwork 当前架构与能力范围

Findwork 是用户本机的岗位管理和AI辅助决策系统，不接管持续聊天或面试管理。当前支持BOSS平台；平台扩展可独立使用，Findwork负责后续统一数据管理。

## 唯一事实来源

| 范围 | Owner | 操作合同 |
|---|---|---|
| AI业务流程与私有策略 | skills/job-search | SKILL.md及references/database.md |
| 平台动作与回执 | platforms/boss/extension | skills/boss-extension/SKILL.md |
| 原始导入、去重、决策、发送资格 | app/db/ingestion | v7 schema、job-store.ts |
| 本地接口与批量领取 | app/server | CLI和HTTP复用资格规则 |
| 用户列表与统计 | app/web/antd-entry.jsx、communications.jsx | React当前工作台 |

AI首次接管从GETTING_STARTED按任务路由，不重复安装已有环境。工程修改读AGENTS/CONTRIBUTING。平台操作前必须读平台Skill；AI禁止通过Playwright/CDP等直接控制或监听BOSS，只调度普通Chrome的扩展正式入口。

## 数据模型与口径

v7六表：jobs、job_details、list_responses、job_events、job_daily_observations、job_daily_batches。岗位以平台内encryptJobId去重，原始文件/hash/事件保留。未来第二个平台通过Mapper接入，不伪装成BOSS。

私有SQLite位于app/db/runtime/，三项用户策略位于.private/job-search/，全部Git忽略。采集去重不覆盖已有判断和成功历史；模型评估用revision/source hash防止旧结论覆盖新事实。WORTH/PASS/PENDING为用户三态；NEED_DETAIL内部仍归待评估。

工作台保留四张图：最近14天按首次入库日期的新增收录折线、每日去重收录与成功沟通分组柱、学历分布、判断占比。新增收录不等于平台新发布；缺采集记录为null。现存newComparedYesterday字段仅在相邻日期有真实相同范围证据时可计算，不是现行首图。

列表日期按last_seen_at筛选，默认最近三天；采集时间/更新时间是排序选择，不改变全局大盘。值得投且未成功与可安全沟通候选数量不同，后者额外排除关闭、过期、同人已联系、历史关系和异常动作。

## 沟通与恢复

唯一平台入口actions/greet/greet.html：带参数入队后关闭，不带参数看队列、失败原因及人工操作。队列由扩展后台持久化、串行执行，5～8秒间隔；页面不承担后台发送生命周期。

Findwork领取 → 参数页入队 → 发送前check → 扩展发送 → 下载原始JSON → AI核验并import-greet → 数据库读回。领取、入队、业务成功和入库是四个不同证据。领取响应丢失须逐jobId读回，不以网络错误认定未领取。

当前日上限150个真实成功；CLI/HTTP共用判断。扩展与DB均按业务finishedAt的北京时间日期统计，下载时间不改成功所属日；失败不计成功。平台上限提示单独保留为错误，未达本地150时用户可明确手动重发次数/额度类失败；岗位关闭、其他失败、风控和UNKNOWN不重发。没有自动循环重试。

本地当天成功满150或平台明确报当日上限、且没有排队/执行中/未知/未落盘记录时可清理扩展显示；次日不自动删除历史，往日已结算记录可手动清理，混合记录只清理往日部分；内部防重保留，原始下载与数据库不变。用户不负责核对JSON，AI负责分析证据与正式入库。安全验证与平台确认由用户正常处理。

运行扩展通过现有身份桥向Findwork返回后台协议版本与能力；ID/版本号/源码/构建/已加载实例/真实发送验收不能互相冒充。

## 正式、兼容与研究能力

正式：扩展List/Detail/Greet及结果下载，Findwork入库、决策、筛选、领取、受限手动重发、统计。新增可选附件简历直投执行器，Greet同页开关默认关闭，后台能力名resume-delivery-opt-in；只处理开启后新入队且Greet成功落盘的岗位。简历结果独立、失败不改变Greet，UNKNOWN不重发；原始application回执经正式import-application入库。工程离线通过不等于真实平台验收通过。

兼容：旧greet-status地址只跳转Greet默认页；旧DOM前端仅保留兼容测试，不从正式服务提供；旧复制提示词辅助函数不参与当前UI执行，其内容不得指引另一路流程。

研究：docs/research及扩展application/probe源码仅用于明确授权的研究，不打进正式扩展包，不随生产manifest自动注入。研究观察记录不是投递能力证明。

## 验证边界

数据库建库定义为 `app/db/schema/jobs.sql`（v7）；现有库升级由 `job-store.ts` 管理。队列展示清理、待简历交接和平台暂停属于扩展持久化状态，不等同于删除或修改数据库结果。当前改动没有新增表或提升 schema 版本，禁止为加载新扩展而重建数据库。

npm run verify构建UI、运行全部离线应用/Skill测试、扩展测试和构建、文档及公开内容审计。npm run test:browser仅访问隔离的本地合成数据，核验当前工作台；不接触BOSS、不发真实沟通。

工程通过不等于真实平台通过。真实采集/发送需另行明确授权、正式入口和原始回执证据。具体平台技术演进见platforms/boss/extension/docs/DESIGN.md；历史设计不再作为当前操作合同。

## 1.1.25 修复后的交接边界

Greet成功与可选简历PENDING标记在同一次队列状态写入中完成；任务参数复用原retryRequest，避免复制凭据膨胀。后台优先核对PENDING，已进入SENDING/RECEIPT_PENDING的中断只标UNKNOWN，不重放。普通简历拒绝保留Greet成功并允许下一条Greet；安全验证、未知副作用及回执不完整传播平台停止标记。失败重发保留原授权附件快照，成功附件身份写入独立application回执。扩展/显示/入库的未知语义统一，UNKNOWN不能清理。

采集启动由现有本地身份桥交给扩展的collection launcher，仅负责核查/打开/复用Detail入口，不负责采集或BOSS请求。当前已有采集、未结算下载、正在执行的沟通/简历任务或多控制页时拒绝新开；同一requestId丢失ACK只核对原页。Detail session保留requestId用于与runId对应，表单可只读核查并准备下一批。真实平台验收见ACCEPTANCE.md，工程PASS与现场PASS分别记录。

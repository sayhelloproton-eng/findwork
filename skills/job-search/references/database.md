# Findwork v6｜岗位导入与状态管理合同

唯一业务事实库 app/db/runtime/jobs.sqlite；schema v6（jobs、job_details、list_responses、job_events）。原始 BOSS List 每个接口响应保存一份完整 JSON；每个 encryptJobId 对应一条 jobs，原始对象在 list_json，原始 Detail 顶层回执在 job_details.raw_envelope_json、完整 zpData 在 detail_json，Greet 原始回执在 greet_raw_json。未知新字段仍保留。结构化字段只是从原始事实抽取的可查询索引，不覆盖原始值。

公司从 encryptBrandId 提取到 jobs.brand_id，无 ID 且为猎头岗的公司筛选标签为“匿名”；城市/公司下拉选项由数据库查询产生，不硬编码公司名单。学历及薪资等原生字段仍保留文本；未证实的 proxyType 编码不得推断派遣。

## CLI：全部从仓库根目录执行

    npm run jobs -- init
    npm run jobs -- import-list ABSOLUTE_LIST_JSON
    npm run jobs -- restore-sources
    npm run jobs -- query '{"status":"PENDING","limit":500}'
    npm run jobs -- import-detail ABSOLUTE_DETAIL_JSON JOB_ID
    npm run jobs -- get JOB_ID
    npm run jobs -- decide-ai '{"jobId":"JOB_ID","status":"WORTH","reason":"基于JD的证据","strategyVersion":"personal-v1","expectedRevision":0,"expectedSourceHash":"CURRENT_SOURCE_HASH"}'
    npm run jobs -- import-ai-summaries ABSOLUTE_AI_DIGEST_JSON
    npm run jobs -- claim '{"jobId":"JOB_ID","actionId":"UNIQUE_ACTION_ID"}'
    npm run jobs -- import-greet ABSOLUTE_GREET_RESULT_JSON JOB_ID
    npm run jobs -- import-application ABSOLUTE_VERIFIED_APPLICATION_RECEIPT_JSON JOB_ID
    npm run jobs -- events '{"jobId":"JOB_ID"}'
    npm run jobs -- query '{"sort":"updated","limit":500}'

成功为 {ok:true,result}，失败 {ok:false,error} 和非零退出码。init 返回 version=6。import-list 的 read=added+existing+invalid，单次处理最多 500 条；同文件重入时新增为 0，updated 为 0，ID 去重。对 300 条可跨多个下载批次滚动增量导入，每批记录新增和重复数。缺详情用 Detail 文件补，不用手动填假 JD。get 的 job.decision_basis.hash 为最新 List 哈希或完整 JD SHA256，revision 是乐观版本。decide-ai 强制两者，拒绝冲突，并保存 AI 判断依据。内部 NEED_DETAIL 在 UI 的待评估中，不是第四种判断。AI 已分析但仍有疑问或异常时使用 `decide-ai` 写 `PENDING`，同时给出具体 `reason`：证据、疑点、倾向性建议及用户需要核实的事项。AI 未开始评估的默认 PENDING 可没有理由；AI 写入 PENDING 时与 WORTH/PASS 一样必须提供最新 revision 和 source hash。

## 正式沟通与投递严格区分

claim 仅针对已逐职位授权的 eligible 职位锁定 actionId，并不发消息。只有已 claim 的真实 Greet 回执可通过正式 CLI import-greet；BOSS HTTP 200 且业务 code 0 才记已沟通，否则 FAILED 或 UNKNOWN，不自动重发。原始完整 Greet 结果不裁剪，保存在 jobs.greet_raw_json。旧演示程序有兼容性路径，不能作为正式操作入口。

当前扩展没有正式简历投递动作。未来确有外部真实投递回执后，才允许 import-application。回执字段 contract=job-application-result.v1、kind=RESUME_SUBMISSION、jobId、actionId、finishedAt、result=SUCCESS|FAILED|UNKNOWN；SUCCESS 必须 confirmed=true。入库记录 application_state 独立于 Greet，不能根据聊天/打招呼标记“已投递”。

## 当前接口

- GET /api/jobs（支持 status、education、brandId、location、communicated、limit 1-500、offset，默认更新时间倒序）
- GET /api/jobs/:id：完整事实、AI 版本锚、原始 Detail
- GET /api/dashboard：最近 13 周累计及每周新增的既有展示统计
- GET /api/jobs/:id/events：v6 后新记录事件（旧历史不凭空倒填）
- POST /api/jobs/:id/decision：与 decide-ai 相同输入合同，AI 判断状态更新
- POST /api/jobs/:id/application：只有具备可核验投递回执的应用记录入库，不触发实际发送

300 条验收先用独立内存库的 500 行合成测试验证吞吐、去重、回滚、字段完整；再对用户指定的真实下载执行逐批导入。所有原始文件应保留，用户要求的工作台 UI 不再调整。

历史回执完整性补齐：npm run jobs -- restore-receipts 。该命令仅读取已有数据库 source_ref/greet_source 指向的原始文件，核实文件 SHA256、职位身份及 Detail 内容哈希后补齐缺失的 raw_envelope_json / greet_raw_json；不修改旧判断、沟通结果或更新时间，第二次执行应全部 restored=0。缺文件或哈希不符会整体失败，不猜测历史数据。

事件与回执：v6 新岗位保存 COLLECTED，List 内容变化保存 LIST_UPDATED，同源重复导入不产生重复事件。正式投递 SUCCESS 除 confirmed:true 外必须携带非空 receipt 对象；application_action_id 跨岗位唯一。历史 v5 及以前事件不虚构补齐。


## 增量操作合同（2026-10-24）

默认 query sort=collected，按 jobs.last_seen_at 最新 List 采集倒序；可 sort=updated 按 updated_at 倒序。最近 13 周累积收录与成功沟通的双折线图、最近 14 个北京时间自然日新增收录与沟通的堆叠柱图，以及学历/判断环形图均由 ECharts 实现；日堆叠高度是两种生命周期事件的和，不是去重岗位总数。
claim 后发实际 Greet 前再次调用 npm run jobs -- check-greet JSON（jobId/actionId）并确认 allowed=true。业务状态 PASS 或证据过期不准发新消息。
清理使用 node scripts/cleanup-undetailed.mjs preview 读取 count、fingerprint、protectedCount；备份确认后用 apply FINGERPRINT，自动把一致性 SQLite 备份及包含候选岗位 ID 的审计清单写到被 Git 忽略的 app/db/runtime/backups。仅删除无真实 JD 且无成功沟通或正式投递的 jobs，关联表按 FK 清理，原始 list_responses 批次归档保留。

补充：当前 v6 job_events 引用 jobs 的外键为限制删除，清理器在同一 SQLite 事务内先删除候选岗位对应 job_events，再删除 jobs；备份仍包含所有原始事件，成功沟通和正式投递的岗位及事件不触碰。


当本机无法提供真实 AI 模型处理全部 JD 时，可明确采用 node scripts/jd-extract.mjs preview / apply DAY SIGNATURE 对最新采集日执行可重复、基于全文真实小节的纯摘录，工具只对同时明确具备职责/要求章节的职位保存“原文摘录｜”标记并保存 source hash；无章节的职位跳过，不制造内容。这不是 AI 推理，也不更改任何判断状态，完整 AI 决策仍为单独待处理工作。


### UI 展示口径：PENDING 内部证据区别、图表高度

列表面向用户仍只用 WORTH/PENDING/PASS 三态；筛选 PENDING 且无决策来源和理由时显示“尚未进行岗位评估”，缺 JD 时显示“尚未评估（待补详情）”；有正式决策来源及理由时显示“已评估，仍有疑问：具体理由”，Tooltip 完整展示依据；仅有来源无理由的旧记录显示“评估记录缺少理由，需复核”。原文摘录或 AI JD 摘要不是岗位决策记录，不得自动视为已评估。四张 ECharts 卡片仍为四等分，桌面高度统一 230px，底部图例保持可见。


### 列表采集日期筛选（2026-10-24）

query 可带 collectedFrom、collectedTo 两个 YYYY-MM-DD 参数，按 date(jobs.last_seen_at,'+8 hours') 作闭区间筛选。页面默认今天；自定义日期以日为单位；快捷“最近一天”等于今天，“最近三天”包含今天及前两天。与 sort=collected/updated 完全独立，仅影响列表，不影响全局图表。

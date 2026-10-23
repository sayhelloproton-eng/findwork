# Job Search System v6｜300 条采集及业务操作合同

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

成功为 {ok:true,result}，失败 {ok:false,error} 和非零退出码。init 返回 version=6。import-list 的 read=added+existing+invalid，单次处理最多 500 条；同文件重入时新增为 0，updated 为 0，ID 去重。对 300 条可跨多个下载批次滚动增量导入，每批记录新增和重复数。缺详情用 Detail 文件补，不用手动填假 JD。get 的 job.decision_basis.hash 为最新 List 哈希或完整 JD SHA256，revision 是乐观版本。decide-ai 强制两者，拒绝冲突，并保存 AI 判断依据。内部 NEED_DETAIL 在 UI 的待评估中，不是第四种判断。

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

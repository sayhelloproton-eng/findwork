# Findwork v7｜数据库、CLI 与动作合同

数据库默认 `app/db/runtime/jobs.sqlite`；FINDWORK_DB_PATH 可指定路径，兼容 BOSS_JOBS_DB_PATH。v7包含 jobs、job_details、list_responses、job_events、job_daily_observations、job_daily_batches 六表。数据库及原始文件属于用户；禁止清空、覆盖和直接 SQL 改业务状态。

建库定义见 `app/db/schema/jobs.sql`，已有库迁移由 `app/db/ingestion/job-store.ts` 的正式 `init` 流程负责。不要把建库 SQL 整份重放到已有库。当前扩展的队列、暂停原因、附件开关和待交接任务保存在扩展自己的持久化存储中，不新增到岗位表；下载后经正式导入才更新数据库业务结果。修改 SQL 注释或项目文档不需要迁移用户库。

## 从仓库根执行

成功输出 `{ok:true,result}`，失败输出 `{ok:false,error}` 并返回非零。以实际输出为证据，不靠文字猜状态。

| 动作 | 输入 | 是否写数据 / 完成证据 |
|---|---|---|
| `npm run jobs -- help` | 无 | 不开库，输出支持动作与合同位置 |
| `npm run jobs -- status` | 无 | 只读，不创建/迁移数据库；返回schema、状态数量、成功/已领取数量；浏览器未检查明确为NOT_CHECKED |
| `npm run jobs -- init` | 无 | 显式准备/迁移已有库，当前返回version=7；不删库 |
| `import-list ABSOLUTE_LIST_JSON` | 已核验的原始文件 | 写原始批次、按encryptJobId去重；检查read/added/existing/updated/invalid |
| `import-detail ABSOLUTE_DETAIL_JSON JOB_ID` | 同岗位有效JD | 写详情；get读回岗位身份、JD、source hash |
| `query JSON` / `get JOB_ID` / `events JSON` | 筛选或jobId | 只读；query最多500条，分页不能漏项 |
| `decide-ai JSON` | 见下文 | 乐观校验后保存三态与理由，get读回 |
| `claim-batch '{"jobIds":["JOB_ID"]}'` | 明确授权岗位ID清单 | 原子领取，返回items中的jobId/securityId/actionId；遵守资格、招聘者去重和额度 |
| `claim '{"jobId":"JOB_ID","actionId":"UNIQUE_ACTION_ID"}'` | 单条明确授权岗位 | 领取同一资格和额度规则，不发送；不能代替批内招聘者去重 |
| `check-greet '{"jobId":"JOB_ID","actionId":"ACTION_ID"}'` | 同一领取身份 | 只读，与HTTP发送前检查复用规则；allowed=true才可继续 |
| `import-greet ABSOLUTE_GREET_RESULT_JSON JOB_ID` | 已领取任务的真实回执 | 真实HTTP200、业务code=0、SUCCESS才SUCCEEDED；其他FAILED或UNKNOWN，如实保存 |
| `retry-greet '{"jobId":"JOB_ID","finishedAt":"EXACT_OLD_RECEIPT_FINISHED_AT"}'` | 用户明确手动重发次数/额度类失败 | 正式重新领取，保留旧事件；返回新actionId。不允许岗位关闭、其他失败或UNKNOWN。通常由Greet页的重新发送按钮调用同一后端规则 |
| `import-application ABSOLUTE_VERIFIED_APPLICATION_RECEIPT_JSON JOB_ID` | 独立可信简历提交回执 | 登记独立真实简历投递回执；扩展的可选直投使用此流程，不冒充Greet成功 |
| `restore-receipts` / `restore-sources` | 已有路径和hash | 仅修复可核验原始文件缺口；整体失败不伪造；不是日常采集前置 |
| `import-ai-summaries ABSOLUTE_AI_DIGEST_JSON` | 模型实际提炼结果 | 写摘要，不能代替decide-ai |

## 决策输入与来源

`decide-ai` JSON必须包含 jobId、status=WORTH/PASS/PENDING、reason、strategyVersion、expectedRevision、expectedSourceHash。当前锚点来自 get 返回的 job.revision、job.decision_basis.hash。先读取三份已确认私有策略；不可因普通疑问随意PASS，PENDING需写具体缺口和下一步，NEED_DETAIL是内部缺详情状态。

已有WORTH/PASS默认保留，重复采集不授权复评；decision_stale阻止发送。原文段落摘录不是模型评估。`scripts/jd-extract.mjs`只产生带“原文摘录”标记的摘要，不改变决策。

原始List在list_responses.response_json和jobs.list_json；Detail顶层回执在job_details.raw_envelope_json、业务正文在detail_json；Greet完整回执在jobs.greet_raw_json。文件hash及事件用于追溯，不用历史contact/beFriend/alreadySend/alreadyApply当新成功。

## 沟通的唯一执行链

1. query candidates/get核对授权岗位仍可联系。WORTH不等于eligible；同人已沟通、关闭、历史关系、决策过期、FAILED/UNKNOWN/IN_FLIGHT均不能自动领取。
2. claim-batch优先用于批量，单条claim用于明确单条任务。保留返回参数，不猜securityId，不重复领取。
3. 普通Chrome打开扩展 `actions/greet/greet.html?jobId=...&securityId=...&actionId=...&serverOrigin=...`；参数URL编码。真正发送前扩展即时调用HTTP check，CLI check-greet遵守相同规则。
4. 不带参数的同一Greet页查看队列。参数页ACK关闭只证明入队；成功由原始业务回执证明。
5. 仅导入本次已核验回执，jobId、领取时间和尝试身份一致（新回执含actionId；旧回执按领取时间和文件hash核对）；get读回。重发后的新尝试不要混入旧文件；历史已导入回执重读不能覆盖新结果，冲突交AI核对。

Greet是沟通，application_state是正式简历提交，两者分别存储。正式SUCCESS需要独立job-application-result.v1、confirmed=true、非空receipt及唯一actionId。禁止浏览器直接登记伪造SUCCESS。

## 额度与统计口径

- 当前本地日上限150条成功；日期是业务回执finishedAt对应的北京时间自然日。失败不计成功，UNKNOWN不计成功。
- 批量领取中的reserved用于防止并发重复占用容量，是保留名额，不是成功数量；status的remaining表示距离成功目标的差额，availableForClaim表示扣除已保留名额后的可新领数量；明确手动重发只比较真实成功上限，真正发送前仍再校验。
- “今日成功”来自SUCCEEDED/greet_confirmed_at；“可沟通候选”来自eligible，不等于“WORTH且未成功”的简单筛选。
- “每日新增收录”按当前库first_seen_at计首次入库，不代表平台发布日期；每日收录按观测表当日岗位ID去重。历史/缺采集基线不冒充0或可靠的两日差集。
- 列表默认最近三天，日期筛选针对last_seen_at，和全局大盘、采集/更新时间排序不同。

## 领取后没有入队：先读回，不直接重领

HTTP请求失败不证明事务未提交。按授权jobId逐条get：IN_FLIGHT表示已领取；NONE仅表示当前读回尚无领取，不可直接断言原请求永远不会执行；无法读取就是结果待确认。扩展空队列也不能单独证明未发送。

只有AI已核实“队列空闲、未知副作用0、原始回执匹配0、领取身份完全一致且未开始发送”才允许通过正式CLI恢复：

`npm run jobs -- reconcile-unlaunched-greet ABSOLUTE_RECONCILIATION_JSON`

JSON：contract=`findwork.unlaunched-greet-reconciliation.v1`，apply=false先预览；items每项jobId/actionId/claimedAt；evidence含queueIdle=true、unknownSideEffects=0、receiptMatches=0、operatorVerified=true、真实checkedAt。证据有效期1小时；仅确认全部事实后才apply=true。不得伪造这份证据以强制重置。原回执、已成功及UNKNOWN任务不适用。

## HTTP映射

GET `/api/jobs`、`/api/jobs/:id`、`/api/jobs/:id/events`、`/api/dashboard`；POST `/api/jobs/:id/decision`。

GET `/api/communications/candidates`、`/api/communications/today`、`/api/communications/check`；POST `/api/communications/batch` 对应claim-batch，POST `/api/communications/retry`对应retry-greet。POST仅在本地同源调用；默认页重发由扩展通过现有Findwork标签调用，不放宽来源校验。浏览器展示DTO不暴露原始凭据；CLI读取本机完整事实。

清理无详情数据另用 `node scripts/cleanup-undetailed.mjs preview`，核对fingerprint和保护记录后按明确清理授权apply；不作为求职任务的默认步骤。Greet页“一键清理”只整理扩展展示，不改本数据库或下载文件。

附件简历可选直投：实际扩展后台需报告 `resume-delivery-opt-in` 能力，默认开关关闭。仅在用户开启后，对随后新入队且打招呼成功并落盘的岗位尝试。执行前扩展调用只读 `/api/resume-applications/check?jobId=...&actionId=...`；核验同一领取动作、当前WORTH/未过期/未关闭、无已登记申请。成功文件为 `job-application-result.v1`，kind=`RESUME_SUBMISSION`，使用独立actionId及可选greetActionId关联；BOSS one-key回执必须method=POST、HTTP200、response.code=0且confirmed=true。通过正式 `import-application ABSOLUTE_JSON JOB_ID` 入库后get读回，不能改communication_state或混算沟通额度。FAILED/UNKNOWN真实记录，未知不重发。

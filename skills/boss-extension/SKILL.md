---
name: boss-extension
description: BOSS 采集与授权沟通。仅通过普通 Chrome 打开扩展内置页面；Greet 同一页面带参数入队、不带参数查看队列。禁止用 Playwright/CDP 或独立 HTTP 操作 BOSS。
---

# BOSS 职位助手

本 Skill 只提供操作方法，不自动提供浏览器权限。扩展并非 BOSS 官方产品。需要同一个 Chrome Profile 已登录 BOSS、唯一职位列表 Tab、实际安装实例 Extension ID 与有权限的文件查看能力。

## BOSS 访问边界与原因

BOSS 对浏览器自动化和调试协议有严格检测，可能触发安全验证、限流或会话异常；出现这些状态后继续发送，还会使实际副作用与回执无法可靠对账。因此，**禁止 AI 通过 Playwright、CDP、Puppeteer、调试协议或自行构造 HTTP 请求访问、采集或操作 BOSS，也不得创建 BOSS 受控页面组**。不得因为工具连接异常改走上述路径，或据此认定扩展不可用。

只复用普通 Chrome 的现有 Profile 和实际安装扩展；允许打开扩展内置动作入口，BOSS 的实际请求仅由扩展既有实现执行。Findwork 沟通链路为：数据库选岗 → claim → 打开 `actions/greet/greet.html?jobId=...&securityId=...&actionId=...&serverOrigin=...` → 扩展发送前以同一 jobId/actionId 调用 `/api/communications/check`（check-greet）并确认 allowed → 后台队列串行发送、间隔 5～8 秒 → 下载原始 JSON → Findwork 正式 import-greet。先通过运行后台返回的协议版本2和能力确认实际实例支持该校验、队列观察、手动重发与清理，不能仅凭扩展ID、版本号或另一源码目录推定已安装能力。

## 沟通任务：严格按以下步骤操作

**唯一入口是 `chrome-extension://<EXTENSION_ID>/actions/greet/greet.html`，不要另建观察页、执行页或临时发送/恢复脚本。** 扩展已有发送能力，AI 不重新实现发送逻辑。

1. **先看队列**：用普通 Chrome 打开上述**不带参数**的地址。它显示排队、执行中、成功、失败、未知和暂停原因；展开同页“AI 操作说明”可读到 boss-greet-status.v2 结构化状态，不含凭据。打开默认页只观察，不新增发送，不自动恢复。不要先去打开、监听、提取或调试 BOSS 标签页，也不要先建立、寻找或修复 Playwright 页面组。
2. **核对已有任务**：有执行中、暂停或未知任务时，先在同一个 Greet 页面核实。已成功、已失败、UNKNOWN 和未结算岗位都不自动重新入队。不能因为浏览器工具故障就判断扩展坏了。
3. **准备已授权岗位**：使用同一岗位的合法 jobId、securityId。用户已明确授权的具体批次无需反复确认；Findwork 调度时先从正式入口领取，保留 actionId，扩展真正发送前必须即时校验。不得直接改数据库状态。
4. **一条岗位打开一次带参数地址**：`chrome-extension://<EXTENSION_ID>/actions/greet/greet.html?jobId=<JOB_ID>&securityId=<SECURITY_ID>`。Findwork 领取的任务还必须附加 `actionId=<ACTION_ID>&serverOrigin=<FINDWORK_ORIGIN>`。每个参数必须 URL 编码。使用普通 Chrome 或已获授权的原生打开方式；只打开这个扩展入口，**不打开岗位详情页，不点击 BOSS 沟通按钮，不通过 Playwright/CDP/独立 HTTP 代发**。
5. **由扩展执行**：带参数页只负责入队，收到入队确认后关闭自身。后台队列独立串行执行、随机间隔 5～8 秒、下载 JSON。不要保持 75 个岗位页面，不要由 AI 编排发送间隔。
6. **仍在同一个页面观察**：查看进度、错误和人工处理提示，就打开第 1 步的不带参数地址。入队 ACK、参数页关闭、HTTP 200 都不等于业务成功。只有业务成功的原始 JSON 才能计成功。
7. **交付或入库**：核验 `BOSS/YYYY-MM-DD/greet/` 的本批原始回执、岗位身份与实际落盘。Findwork 管理任务必须通过正式 import-greet 导入并读回；扩展自身不写数据库，不把下载完成说成已经入库。

默认页固定显示“继续执行”，不适用时禁用；当天成功回执达到150条，或BOSS明确报当日上限时，显示“一键清理”；两者不混算成功。跨天只重新统计当天成功，不自动删记录；有往日已完成记录时提供“清理往日记录”，混合批次只清理往日部分。失败、UNKNOWN 和排队不计成功；清理后保留的成功记录也按业务回执finishedAt日期去重计入当天，跨天重新统计；下载完成时间不决定所属日。BOSS 返回上限提示单独显示，不据此把本地成功数补成 150。没有排队和执行中任务、结果均已落盘时显示“已完成”，即使最后一条失败也不继续显示队列暂停；失败原因仍保留。发送记录持久保存在扩展本地，关闭页面不会丢失。符合上述条件且任务完成后点击清理只清空本页批次展示，内部保留防重记录；不删除或修改下载目录中的 JSON，不修改 Findwork 数据库，不解除平台限额。尚有排队、执行中、UNKNOWN 或未落盘记录时不能清理。

### 出错后仍在 Greet 页面处理

- **岗位关闭/不存在**：该条失败并保留回执；页面暂停并提示人工。核验后可在同页点继续剩余队列，失败岗位不会重发。
- **120 次等开聊确认提醒**：该请求没有成功，保留失败回执；通知人工到 BOSS 正常页面确认。**AI 不代操作 BOSS，不自动绕过提醒，也不能仅清掉暂停就声称人工已确认。** 人工明确确认后，在默认 Greet 页点“继续执行”。
- **平台上限错误**：先暂停，单独显示 BOSS 原话，不把失败计入当天成功。当天成功未满150条时可由用户明确点击失败行的“重新发送”，BOSS 再次拒绝则继续保留失败并暂停，不自动循环。满150条则禁止新发送。
- **验证码、code=35/37、未知结果或回执下载不完整**：停止并通知人工；默认页不给自动恢复入口。UNKNOWN 不重发，不借工具连接修复、Reload 或换 Profile 绕过。
- **参数不完整或入队失败**：参数页显示错误，不能当成功；回到不带参数的同页核对任务身份和队列，不盲目重复打开。

未确认队列与副作用前不得 Reload、重装、并行启动另一个扩展实例。旧 Greet Status 地址仅兼容跳转到默认 Greet 页，不是第二套操作流程。

## 唯一 Detail 采集

打开 actions/detail/dom.html?auto=1&expect=N&pages=P。页面 Refresh 后自动出现的首条自然 Detail 不重复点击，其余按 List 职位 ID 唯一匹配真实卡片，点击后必须收到 Detail JSON 下载 COMPLETE，再处理下一条；15条全部完成才 Scroll。P 为 1～21，20批目标300条。想重新采集全部加 fresh=1，不能使用旧下载回执冒充本轮成功；单批可用 latest=1。

expect=0 代表推荐；N≥1 是当前用户配置的第 N 个求职期望，不固定映射职业。列表没有足够真实数据时停止并报告缺口，不伪造岗位。

## 动作索引

- Reload：actions/reload/reload.html，只有版本更新且未结算任务结束时。
- Refresh：actions/refresh/refresh.html?expect=N。
- Scroll：actions/scroll/scroll.html。
- Detail：actions/detail/dom.html，当前唯一正式方式；只读诊断 actions/detail/diagnose.html。
- Greet：actions/greet/greet.html。不带参数查看队列；带 jobId/securityId 入队。用户针对具体职位**明确授权**后才发真实消息，不代表正式投递或对方回复。
- Detail Diagnose：actions/detail/diagnose.html，统一只读检查结构、几何、Hook、回执；Greet Status：diagnostics/greet-status.html，旧链接兼容跳转到 Greet 默认页，不再独立观察。均无需高级网络权限。

必须核对 List、Detail 两个 JSON 的职位 ID、JD、真实文件与 Chrome 下载完成，不把控制页 ACK 当成功；文件下载就是扩展的完成边界。扩展无需数据库，也不会自动入库；只有用户另行要求后处理时，才交给独立的外部应用完成。本 Skill 不调用作者的求职系统 Web、后端或 SQLite，也不要求安装主项目。招聘状态、猎头等字段按已确认/强候选/推测/未知分层，缺失证据不可编造。页面要求验证码、站点限制、FAILED 或 UNKNOWN 时停止，Greet UNKNOWN 不重新发送。

详情见 references/actions.md、references/workflows.md、references/results.md、references/recovery.md，岗位字段见 references/fields.md。用户真实下载、SQLite、Cookie、登录状态及私人信息不得上传公共环境。


独立 BOSS 扩展仍然无需安装 Findwork；如果 Greet 由 Findwork 主控调度，调用方必须完成逐职位授权、claim，以及在真正发出请求前即时 check-greet 的同 ID 校验。当前 PASS/PENDING 岗位不得使用旧队列、旧 claim 继续发送。扩展无数据库，不得冒称自己已经验证了岗位状态。

### 失败记录的手动重发

失败行固定提供“重新发送”按钮。只有“开聊次数提醒”或“额度限制”导致的明确失败可用：本地当天成功未满150条时，用户明确点击按钮才打开同一个 Greet 带重发参数页，由扩展重新领取并入队。岗位关闭、其他业务失败、安全验证、UNKNOWN 和回执不完整均禁用，不得自动重发。BOSS 之前返回的额度限制只作为错误信息，不作为本地禁止手动重发的条件；不足150条可手动尝试，是否接受由 BOSS 决定。达到150条则禁用。不得自动循环重发或绕过安全验证。Findwork 会校验原失败回执、岗位当前决策和时间，保存旧回执事件，重新生成领取动作并发送前校验。重发后仍须核验新下载回执并正式入库。

### 可选附件简历直投（默认关闭）

仍只用同一个不带参数的 Greet 页面。勾选「支持直接投递时，同时发送附件简历」才开启；可点「读取附件简历」读取原生附件选择项，多份时明确选择一份。只对开启后新入队的岗位生效，旧任务不补投；关闭后尚未发出的简历不再提交，已经发出的请求不能撤回。先确认Greet业务成功和回执落盘，再由同一后台任务尝试附件投递；没有Greet成功不发简历。核对实际后台能力包含 `resume-delivery-opt-in`，源码存在不代表已安装或现场通过。

后台重取同一岗位Detail的 `oneKeyResumeInfo.canSendResume` 和 `alreadySend`，不支持或已发则跳过；检查原生exchange precheck（type=3），需平台人工确认则停简历部分；读取attachment/checkbox列表，零份需上传、多份需选择。使用原生岗位附件简历直投接口（onekeydeliver），以业务code=0为成功并单独下载 `BOSS/YYYY-MM-DD/application/` 回执。不调用聊天exchange/request替代此岗位直投。没有真实回执不能说已投递。

简历明确业务失败只暂停简历部分；平台安全验证、未知副作用或回执未落盘会阻断后续平台发送，不能用清理或继续按钮绕过。已确认的原打招呼成功记录及150条沟通计数不回退；在同页查看原因。「继续后续简历任务」仅对已明确失败可用，不重发失败/未知/已跳过的岗位；未知须AI核对，不给自动恢复。Findwork任务发送前还会调用独立resume check，回执由AI通过import-application入库；扩展不直接写数据库。当前工程仅有离线合成验证，未经真实单条验收不能宣称平台可用。

### 1.1.25 恢复与工作台启动合同

Greet成功结算时会同时持久化简历待处理标记。后台重启后，只处理有明确未发送阶段的任务；已经进入发送或等待回执的中断标为UNKNOWN，不重新投递。正式手动重发保留原简历开关与附件选择快照，仍受当前关闭/世代和发送前校验约束。简历回执保存实际resumeId及resumeName，不复制securityId等凭据。

岗位工作台采集按钮要求实际后台报告 `detail-collection-launch-v2`。由扩展核对运行/下载状态，复用唯一已结束的Detail控制页；执行中拒绝新批次。启动请求ID保持幂等，回执丢失只能核对同一请求，不能另开一页。弹窗「核查并准备下一批」先只读检查，确认可新建才解除表单锁定。请求ID会映射到本次采集runId，AI仍需核验原始文件和下载完成。真实验收检查表由主项目docs/ACCEPTANCE.md提供，不能用工程测试代替平台实发证据。

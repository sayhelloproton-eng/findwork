---
name: boss-extension
description: 操作已安装的 BOSS 职位助手 Chrome 扩展，获取自然职位列表、逐职位卡片采集详情并核验文件；逐职位明确授权后可发起招聘沟通。
---

# BOSS 职位助手

本 Skill 只提供操作方法，不自动提供浏览器权限。扩展并非 BOSS 官方产品。需要同一个 Chrome Profile 已登录 BOSS、唯一职位列表 Tab、实际安装实例 Extension ID 与有权限的文件查看能力。

## 唯一 Detail 采集

打开 actions/detail/dom.html?auto=1&expect=N&pages=P。页面 Refresh 后自动出现的首条自然 Detail 不重复点击，其余按 List 职位 ID 唯一匹配真实卡片，点击后必须收到 Detail JSON 下载 COMPLETE，再处理下一条；15条全部完成才 Scroll。P 为 1～21，20批目标300条。想重新采集全部加 fresh=1，不能使用旧下载回执冒充本轮成功；单批可用 latest=1。

expect=0 代表推荐；N≥1 是当前用户配置的第 N 个求职期望，不固定映射职业。列表没有足够真实数据时停止并报告缺口，不伪造岗位。

## 动作索引

- Reload：actions/reload/reload.html，只有版本更新且未结算任务结束时。
- Refresh：actions/refresh/refresh.html?expect=N。
- Scroll：actions/scroll/scroll.html。
- Detail：actions/detail/dom.html，当前唯一正式方式；只读诊断 actions/detail/diagnose.html。
- Greet：actions/greet/greet.html?jobId=...&securityId=...，用户针对具体职位**明确授权**后才发真实消息，不代表正式投递或对方回复。
- Detail Diagnose：actions/detail/diagnose.html，统一只读检查结构、几何、Hook、回执；Greet Status：diagnostics/greet-status.html，只读队列状态。均无需高级网络权限。

必须核对 List、Detail 两个 JSON 的职位 ID、JD、真实文件与 Chrome 下载完成，不把控制页 ACK 当成功；文件下载就是扩展的完成边界。扩展无需数据库，也不会自动入库；只有用户另行要求后处理时，才交给独立的外部应用完成。本 Skill 不调用作者的求职系统 Web、后端或 SQLite，也不要求安装主项目。招聘状态、猎头等字段按已确认/强候选/推测/未知分层，缺失证据不可编造。页面要求验证码、站点限制、FAILED 或 UNKNOWN 时停止，Greet UNKNOWN 不重新发送。

详情见 references/actions.md、references/workflows.md、references/results.md、references/recovery.md，岗位字段见 references/fields.md。用户真实下载、SQLite、Cookie、登录状态及私人信息不得上传公共环境。


独立 BOSS 扩展仍然无需安装 Findwork；如果 Greet 由 Findwork 主控调度，调用方必须完成逐职位授权、claim，以及在真正发出请求前即时 check-greet 的同 ID 校验。当前 PASS/PENDING 岗位不得使用旧队列、旧 claim 继续发送。扩展无数据库，不得冒称自己已经验证了岗位状态。

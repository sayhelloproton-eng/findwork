# 真实下载与验收

Chrome 下载根目录通常为 BOSS/YYYY-MM-DD/：
- list/job-list-<文档请求标识>.json
- detail/native-<职位 ID>-<时间戳>-<唯一标识>.json
- greet/greet-<职位 ID>-<时间戳>-<唯一标识>.json
- diagnostics/：按需导出的敏感诊断

List 必须是当次自然请求响应，JSON 可解析，含目标有效职位 ID。Detail 必须业务 code=0、JD 非空、List encryptJobId 和 Detail jobInfo.encryptId 一致。Chrome 下载状态 complete、exists=true 且文件路径和内容匹配。目标批次中不能混入重复职位、无关自然详情或上一轮旧文件。

Greet 是一条独立真实沟通记录，可能成功、失败或 UNKNOWN；下载文件不代表对方回复。扩展到 JSON 下载即结束，不要求 SQLite。只有用户明确提出可选的外部入库时，才另外验证源文件与数据库读回。不能把已创建下载任务或控制页关闭视为成功。用户私有文件不得上传公共环境。

可选附件简历直投另存 `BOSS/YYYY-MM-DD/application/application-*.json`，contract=`job-application-result.v1`、kind=`RESUME_SUBMISSION`，包含独立actionId、jobId、endpoint、method、startedAt/finishedAt、result、confirmed、原生receipt。真实业务成功与下载COMPLETE均确认后才算扩展完成，交给Findwork的import-application；不能用greet/回执替代。UNKNOWN不重发，下载缺失不当作已入库。

1.1.25 起，附件直投原始回执同时保留实际resumeId、resumeName（可用时为原生显示名），供AI核实实际投递附件；不把securityId或lid复制为日志凭据。未知Greet与简历结果不能当普通失败结算/清理。Greet成功但简历待处理/待核查时，默认页同条记录会说明，不能据Greet成功推断简历成功。

# BOSS 扩展工程入口

人类使用者读 [README](README.md)；维护者与 AI 通过 [DESIGN](docs/DESIGN.md) 理解当前架构、技术演进路线、成功与受限方案；历史原始材料仅从 Git 历史追溯；AI 实际操作已安装的扩展读 `../../../skills/boss-extension/SKILL.md`。

`actions/detail/dom.html` 是唯一正式采集控制页；MAIN 只观察、ISOLATED 只桥接、Worker 只下载与恢复；Greet 独立并需逐职位授权。扩展只保存 JSON，无数据库依赖；完整求职系统的 Web、后端与 SQLite 则由主仓库 `skills/job-search/SKILL.md` 负责。

工程变更须遵守本机工程协议。禁止删除真实下载、Chrome Storage、数据库或真实 Greet；不得擅自 Git 提交、推送或发布。

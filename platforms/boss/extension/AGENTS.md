# BOSS 扩展工程入口

人类使用者读 [README](README.md)；维护者与 AI 通过 [DESIGN](docs/DESIGN.md) 理解当前架构、技术演进路线、成功与受限方案；历史原始材料仅从 Git 历史追溯；AI 实际操作已安装的扩展读 `../../../skills/boss-extension/SKILL.md`。

`actions/detail/dom.html` 是唯一正式采集控制页；采集链路 MAIN 只观察、ISOLATED 只桥接、Worker 管下载与恢复；Greet 独立后台串行发送并需逐职位授权。扩展只保存 JSON，无数据库依赖；完整求职系统的 Web、后端与 SQLite 则由主仓库 `skills/job-search/SKILL.md` 负责。

参与开发请遵守仓库根目录的 [AGENTS.md](../../../AGENTS.md) 和 [CONTRIBUTING.md](../../../CONTRIBUTING.md)；仅用合成数据运行测试，不删除用户真实下载、Chrome Storage、数据库或沟通记录。提交前验证扩展与数据边界，不随意更改本目录原有 MIT 版权声明。

Greet 状态与业务成功日的纯规则在 actions/greet/greet-state.js，由默认页和后台共用；不可复制第二套计数逻辑。运行协议为2，身份桥必须读取实际后台能力后报告。新增动作同时更新平台 Skill、动作合同、默认验证与合成测试；研究功能不进入正式manifest或构建。不要用源码/版本号代替运行实例证据。

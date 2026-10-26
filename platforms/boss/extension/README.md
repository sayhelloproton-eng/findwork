# BOSS 职位助手｜Chrome 扩展

独立 Chrome MV3 工具：捕获 BOSS 网页自然产生的职位 List / Detail 响应并保存完整 JSON；另提供**逐职位授权**的招聘沟通（Greet）。非 BOSS 官方产品。

**扩展可独立运行，不依赖 Findwork Web、SQLite、Node 后台或数据库配置。采集的终点是 Chrome 下载 COMPLETE 和本轮文件身份校验，不会自动入库或投递简历。**

## 一眼看懂

    BOSS 自然 List → Refresh → 原始 List JSON
    BOSS 自然 Detail → DOM 按职位 ID 点击 → 原始 Detail JSON
    全部保存至 Chrome 下载目录 / BOSS / 日期 / {list,detail}
    （扩展完成）
    可选：由使用者的任意外部程序分析、筛选或导入数据库

| 入口 | 职责 | 成功标准 |
|---|---|---|
| Refresh | 获取第一批自然 List | Chrome List 文件下载完成 |
| Detail | 当前唯一正式方案：真实 DOM 卡片触发自然 Detail | 逐职位 Detail 文件下载完成 |
| Scroll | 本批结束后获取下一批自然 List | 新 List 文件下载完成 |
| Greet | 已逐职位授权才真实联系招聘者 | 独立成功/失败/UNKNOWN 回执 |
| Reload / Diagnostics | 更新、统一只读采集诊断与 Greet 队列状态 | 不替代采集或 Greet 成功证明 |

## 安装与启动

1. Chrome 使用已登录 BOSS 的同一 Profile，保留一个 `https://www.zhipin.com/web/geek/jobs` 标签页。
2. 从源码安装时，在本目录运行 `npm run verify`，通过 Chrome 开发者模式加载 `dist/boss-list-observer/`。**只有构建/测试需要 Node 20+**，正常使用不需要 Node。
3. Extension ID 以用户当前安装实例为准，打开：

       chrome-extension://<EXTENSION_ID>/actions/detail/dom.html?auto=1&expect=0&pages=2

4. `pages` 为 1～21，每批需要 15 个不同职位；`pages=20` 目标为 300 条。`expect=0` 为推荐，其他值按账号当前的自定义期望顺序，**不代表固定岗位类别**。需要全新重采时附加 `&fresh=1`，不计历史完成回执；单批可用 `latest=1`。
5. 扩展自行执行 Refresh → 首批 List 与首条自然 Detail → 按 jobId 点击剩余卡片 → Detail COMPLETE → 15/15 后 Scroll → 下一批。不应并发启动第二个控制页；验证码、风控、UNKNOWN 必须停止。

## 下载目录

Chrome 当前下载根目录下生成：

    BOSS/YYYY-MM-DD/
      list/          自然 List 原始 JSON
      detail/        自然 Detail 原始信封（含 rawResponse）
      greet/         独立授权的真实沟通结果
      diagnostics/   手动诊断

List 的 encryptJobId 必须与 Detail 的 jobInfo.encryptId 对应，JD 非空，且是**本轮**文件。下载之后的数据去重、AI 判断、导入 SQLite、其他数据库和 Web 工作台，全是**外部消费者**的事情。Greet 是实际发送消息，不是正式简历投递，更不等于获得回复。Detail 只读诊断入口为 `actions/detail/diagnose.html`。沟通只有 `actions/greet/greet.html` 一个入口：带参数入队，不带参数查看队列、失败原因和人工处理提示；旧 `diagnostics/greet-status.html` 只跳转到该页。不提供完整页面 DOM 导出。

## 阅读与贡献

- [现行设计和后续建议](docs/DESIGN.md)：现在运行的架构、职责与选型。
- [技术演进路线图与取舍](docs/DESIGN.md#4-技术演进路线图与取舍)：可行、失败、受限与正式方案集中在一张图和一张表里；原始历史材料可从 Git 历史追溯。
- [扩展 AI Skill](../../../skills/boss-extension/SKILL.md)：独立安装和操作 Chrome 扩展，不依赖作者的主求职系统。
- `test/fixtures/`：真实结构、合成数据的 List、Detail、DOM 卡片样例，供测试而不是个人职位数据。

`npm test` 验证离线功能，`npm run verify` 增加工程/Skill/正式构建。真实 Chrome 成功需要另验下载文件。所有私人 JSON、账号凭证、数据库与 Greet 记录都不得提交公共仓库。

运行能力由扩展后台通过现有身份桥报告，不能只比较版本号。正式包不包含简历投递研究观察页；application研究源码不代表投递能力，须另有明确研究授权。今日成功以业务回执完成日期统计，下载延迟不改变所属日。

Greet 同一页面还有可选的「同时发送附件简历」开关，默认关闭，开启后仅影响新入队的岗位；先确认打招呼成功，再尝试支持直投的附件简历。简历失败不改变打招呼结果；多份附件需选择，安全确认交人工，未知不重发。结果单独下载到 application 目录。此功能目前完成离线验证，真实平台效果需另行验收。

1.1.25 修复了跨模块安全停止、简历交接中断恢复、正式重发附件快照、未知结果清理和附件身份回执。工作台采集入口可核查并复用旧的已完成控制页，丢失启动回执不会重复开页。真实平台验收仍需按主项目docs/ACCEPTANCE.md记录，不能据源码版本宣布成功。

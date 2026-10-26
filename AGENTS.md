# Findwork AI 入口与工程约定

先按用户任务分流：使用/继续采集/评估/沟通读 [GETTING_STARTED.md](./GETTING_STARTED.md) 的任务表及两份业务 Skill；修改源码才按本文件和 CONTRIBUTING；审计只读，不触发业务动作。不要把已有环境的继续使用变成安装、开发或浏览器工具修复。

BOSS 操作硬边界：AI 禁止通过 Playwright、CDP、Puppeteer、调试协议或独立 HTTP 访问、监听或操作 BOSS。只通过普通 Chrome 打开扩展正式入口；沟通同一 Greet 页带参数入队、不带参数观察。验证/开聊确认由用户处理，回执和状态核验由 AI 完成。没有真实发送授权的工程测试只能使用合成数据。

首次工程接管先读取 `docs/DESIGN.md` 与实际模块合同；`npm run jobs -- help/status` 是不开库/只读检查入口。旧目录、源码、构建和已安装扩展能力分别核实，不凭版本号猜运行状态。

- `app/db/` 拥有公共 Ingestion、Schema 和去重，平台代码只处理自己的采集与经授权的动作。
- `app/server/` 与 `app/web/` 拥有统一查询、决策接口和岗位工作台；两份业务 Skill 均在仓库根 `skills/` 下维护。
- 岗位评估仅使用用户本机确认的**个人画像、求职偏好、排除条件**，其实际内容存于被 Git 忽略的 `.private/job-search/`。
- 不提交任何真实账号状态、个人策略、凭据、原始下载、岗位数据库或沟通记录；真实发送前须有具体授权和实际回执。
- 不在本仓库实现投递后招聘者聊天、面试/学习或招聘跟进功能。
- 贡献代码请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)；修改/发布前执行现有测试和公开敏感数据检查，保留 [LICENSE](./LICENSE) 及扩展已有的版权声明。

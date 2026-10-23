# Findwork 工程 AI 约定

本文件用于**修改源码的工程 AI**；给普通用户的 AI 操作引导请先读 [GETTING_STARTED.md](./GETTING_STARTED.md)。不要把“项目开发”当作用户第一次使用项目的默认任务。

- `app/db/` 拥有公共 Ingestion、Schema 和去重，平台代码只处理自己的采集与经授权的动作。
- `app/server/` 与 `app/web/` 拥有统一查询、决策接口和岗位工作台；两份业务 Skill 均在仓库根 `skills/` 下维护。
- 岗位评估仅使用用户本机确认的**个人画像、求职偏好、排除条件**，其实际内容存于被 Git 忽略的 `.private/job-search/`。
- 不提交任何真实账号状态、个人策略、凭据、原始下载、岗位数据库或沟通记录；真实发送前须有具体授权和实际回执。
- 不在本仓库实现投递后招聘者聊天、面试/学习或招聘跟进功能。
- 贡献代码请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)；修改/发布前执行现有测试和公开敏感数据检查，保留 [LICENSE](./LICENSE) 及扩展已有的版权声明。

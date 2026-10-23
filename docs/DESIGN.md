# Findwork 架构与迁移边界

目标：多平台职位统一采集、入库、去重、可解释 AI 评估、有限投递机会的决策与动作结果、统计大盘。后续招聘者沟通和面试跟进不属于本产品。

platforms/{platform}/ 只负责平台动作和可验证原始文件，首个实现为 BOSS；扩展本身不需要后端和 DB。app/db/ingestion 是公用导入适配层的唯一 Owner，app/db/schema 是共享 DB 合同；BOSS 仅是当前 v6 数据格式的历史基线，其他平台未来将通过 Mapper 接入 DB 而不是伪装成 BOSS。app/server、app/web 统一负责查询、评估、筛选、投递决策与大盘。

两份 Skill 并列维护在 skills/job-search 与 skills/boss-extension。前者引导整个 AI 求职工作流，后者指导扩展使用、下载、真实回执核验。所有平台真实沟通/投递都需要明确逐职位授权；Greet 与正式简历提交必须分开记录。

v6 保留 jobs、job_details、list_responses、job_events 四表、原始 JSON、去重和乐观版本。未来有第二个平台时再设计跨平台唯一性及来源映射，不改写既有记录。私有 SQLite 在 app/db/runtime/，个人岗位策略在 .private/job-search/，全部 Git 忽略。迁移时旧 job-search-system 不删除，以便回退。独立 Chrome 现场测试必须另验，不冒充离线 PASS。

BOSS 技术演进及成功/失败方案详见 platforms/boss/extension/docs/DESIGN.md。

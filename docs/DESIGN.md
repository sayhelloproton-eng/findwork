# Findwork 架构与职责边界

目标：多平台职位统一采集、入库、去重、可解释 AI 评估、有限投递机会的决策与动作结果、统计大盘。后续招聘者沟通和面试跟进不属于本产品。

platforms/{platform}/ 只负责平台动作和可验证原始文件，首个实现为 BOSS；扩展本身不需要后端和 DB。app/db/ingestion 是公用导入适配层的唯一 Owner，app/db/schema 是共享 DB 合同；BOSS 仅是当前 v6 数据格式的历史基线，其他平台未来将通过 Mapper 接入 DB 而不是伪装成 BOSS。app/server、app/web 统一负责查询、评估、筛选、投递决策与大盘。

两份 Skill 并列维护在 skills/job-search 与 skills/boss-extension。前者引导整个 AI 求职工作流，后者指导扩展使用、下载、真实回执核验。所有平台真实沟通/投递都需要明确逐职位授权；Greet 与正式简历提交必须分开记录。

v6 保留 jobs、job_details、list_responses、job_events 四表、原始 JSON、去重和乐观版本。未来有第二个平台时再设计跨平台唯一性及来源映射，不改写既有记录。私有 SQLite 在 app/db/runtime/，个人岗位策略在 .private/job-search/，全部 Git 忽略。仓库仅公开源码与合成测试数据，不包含用户私有历史数据。独立 Chrome 现场测试必须另验，不冒充离线 PASS。

BOSS 技术演进及成功/失败方案详见 platforms/boss/extension/docs/DESIGN.md。


2026-10-24：工作台保留四等分，使用 ECharts 最近 13 周累计收录/累计已沟通双折线、最近 14 天新增/已沟通事件堆叠柱、学历环图、判断三态环图；水平图例和 Tooltip 统一。日堆叠的两类业务事件可能涉及同一岗位，不是去重岗位合计。列表以 last_seen_at（最近采集）为缺省排序、支持 updated_at 单选。
主控 Job Search 在逐岗位用户授权后 claim，实际发出平台 Greet 前 check-greet 再检；BOSS 独立扩展本身不掌握 DB 状态。PASS 后不新发，历史先沟通再 PASS 的回执保留。管理岗/应届岗/大厂直招与外包例外属于私有确认策略。无 JD 且未沟通清理前备份、保存审计清单，受保护历史记录及原始批次保留。


2026-10-24：列表增加以采集日期为口径的独立筛选。按 jobs.last_seen_at 的北京时间自然日筛选，支持指定日期、最近一天（今天）、最近三天（今天及前两天）；默认为今天，重置回到今天。该筛选与原有采集时间/更新时间排序相互独立，不改变四张整体大盘的数据范围。

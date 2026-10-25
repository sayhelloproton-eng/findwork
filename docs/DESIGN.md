# Findwork 架构与职责边界

目标：多平台职位统一采集、入库、去重、可解释 AI 评估、有限投递机会的决策与动作结果、统计大盘。后续招聘者沟通和面试跟进不属于本产品。

platforms/{platform}/ 只负责平台动作和可验证原始文件，首个实现为 BOSS；扩展本身不需要后端和 DB。app/db/ingestion 是公用导入适配层的唯一 Owner，app/db/schema 是共享 DB 合同；BOSS 仅是当前 v6 数据格式的历史基线，其他平台未来将通过 Mapper 接入 DB 而不是伪装成 BOSS。app/server、app/web 统一负责查询、评估、筛选、投递决策与大盘。

两份 Skill 并列维护在 skills/job-search 与 skills/boss-extension。前者引导整个 AI 求职工作流，后者指导扩展使用、下载、真实回执核验。所有平台真实沟通/投递都需要明确逐职位授权；Greet 与正式简历提交必须分开记录。

v6 保留 jobs、job_details、list_responses、job_events 四表、原始 JSON、去重和乐观版本。未来有第二个平台时再设计跨平台唯一性及来源映射，不改写既有记录。私有 SQLite 在 app/db/runtime/，个人岗位策略在 .private/job-search/，全部 Git 忽略。仓库仅公开源码与合成测试数据，不包含用户私有历史数据。独立 Chrome 现场测试必须另验，不冒充离线 PASS。

BOSS 技术演进及成功/失败方案详见 platforms/boss/extension/docs/DESIGN.md。


2026-10-24：工作台保留四等分，使用 ECharts 最近 13 周累计收录/累计已沟通双折线、最近 14 天新增/已沟通事件堆叠柱、学历环图、判断三态环图；水平图例和 Tooltip 统一。日堆叠的两类业务事件可能涉及同一岗位，不是去重岗位合计。列表以 last_seen_at（最近采集）为缺省排序、支持 updated_at 单选。
主控 Job Search 在逐岗位用户授权后 claim，实际发出平台 Greet 前 check-greet 再检；BOSS 独立扩展本身不掌握 DB 状态。PASS 后不新发，历史先沟通再 PASS 的回执保留。管理岗/应届岗/大厂直招与外包例外属于私有确认策略。无 JD 且未沟通清理前备份、保存审计清单，受保护历史记录及原始批次保留。


2026-10-24：列表增加以采集日期为口径的独立筛选。按 jobs.last_seen_at 的北京时间自然日筛选，支持指定日期、最近一天（今天）、最近三天（今天及前两天）；默认为今天，重置回到今天。该筛选与原有采集时间/更新时间排序相互独立，不改变四张整体大盘的数据范围。


2026-10-25：v7 引入每日岗位观测表 job_daily_observations(local_day,scope,job_id) 与归档批次表 job_daily_batches。每次成功 List 导入记录北京时间当天按 jobId 去重的岗位，重复接口响应当天只算一次，跨天仍算各天收录。BOSS 响应只有 zpData.type 可验证作为稳定的范围维度；前后日期该类型集合不匹配不计算差集。旧 list_responses 的 imported_at 只能证明首度归档，回填值明确标记 historical-partial，不能冒充完整每日采集记录；无记录日为 null 不是 0。折线图按两个相邻的、非历史的、同范围日期计算今天集合减昨天集合；另一张分组柱状图分别表示每日去重收录量和真实沟通成功（greet_confirmed_at 的北京时间日期）；不堆叠、互不代表包含关系。学历与决策图不变。

2026-10-25 审计修复：UI DTO 仅提供展示字段，不再直接暴露 BOSS action credentials、原始 JSON、私有来源路径；跨页选择复制前重新验证候选。简历正式 SUCCESS 禁止浏览器直接 POST，只能由本地 CLI 根据下载原文件和哈希证据导入。每日观测缺 hash-verified 捕获时间及明确求职期望/查询指纹则标记 historical-partial、不参与两日新增差集；已核对原始文件且范围明确时按捕获自然日归档。图表前端每30秒重新获取一次（页面可见时）。

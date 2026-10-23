# BOSS 直聘｜职位字段字典（操作级）

供 AI 在读取用户已有 List JSON 与 Detail JSON 时，准确识别字段、分析职位、标注不确定性。本文件只说明**数据如何理解和使用**，不涉及扩展的工作原理、请求恢复、函数或源码。**仅适用于 BOSS 直聘**，其他招聘网站的字段不能套用。

## 0. 先确定证据等级

| 级别 | 判定 | AI 应怎么说 |
|---|---|---|
| A：已确认 | BOSS 本地原始值明确，或与 PC 页面字段显示相互验证 | 可以描述已获取的值，但不是永远有效 |
| B：强候选 | 字段及取值存在，有独立 BOSS 代码/页面佐证，但完整业务枚举未得到官方确认 | 描述为“高可信候选”，不把全部编码写死 |
| C：推测 | 字段名称暗示某种含义，尚无足够映射 | 仅供后续核验，不自动作为过滤规则 |
| D：缺失/未知 | 样本没有对应字段或全部空值 | 显示“暂无可靠数据”，不编造 |

基线：2026-10-20 的 PC List 原始响应 1 份，15 条职位，每条 48 个字段；2026-10-22 的 Detail 完整成功响应按职位去重后 11 条；当日 PC DOM 共 135 个卡片，其中猎头角标 35 个、派遣角标 3 个、在线图标 75 个。该样本只能证明本轮观察，不代表 BOSS 的固定全集。社区佐证为第三方实现，不是官方字段承诺。

## 1. List JSON：48 个原始职位字段

读取位置：zpData.jobList[]，外层还包含 code、message、zpData.hasMore、zpData.lid、zpData.type。

| 分组 | 全部字段（字段名精确保留） | 主要用途、特别边界 |
|---|---|---|
| 识别与关联（7） | encryptJobId、securityId、lid、itemId、expectId、encryptBossId、encryptBrandId | encryptJobId 是职位标识；securityId、lid 是当前记录的动作参数，不要分享；expectId 不等于 Refresh 的 expect 选项序号；itemId 不等于稳定职位 ID |
| 职位内容与展示（16） | jobName、salaryDesc、jobExperience、jobDegree、jobLabels、skills、welfareList、jobType、jobValidStatus、daysPerWeekDesc、leastMonthDesc、atsDirectPost、isShield、optimal、showTopPosition、outland | 名称、薪资、经验、学历、技能、福利可直接使用；jobValidStatus=1 未经跨值验证，不能宣称真实仍在招；其他编码不要猜；daysPerWeekDesc 和 leastMonthDesc 在当前样本为空 |
| 招聘者（6） | bossName、bossTitle、bossAvatar、bossOnline、bossCert、contact | 姓名、职务、头像与在线布尔值明确；bossCert 是待解释的认证编码；contact 可能涉及本人是否已联系过 |
| 特殊标签（8） | goldHunter、proxyJob、proxyType、iconFlagList、beforeNameIcons、afterNameIcons、iconWord、anonymous | 猎头、派遣、代理招聘、图标；见第 3 节，不要将它们混为一种工作性质 |
| 公司信息（6） | brandName、brandLogo、brandIndustry、brandScaleName、brandStageName、industry | 品牌名、logo、行业、规模、融资阶段可读取；industry 数值枚举未证实，行业为“人力资源服务”也不足以单独判断某条职位是外包 |
| 地址（5） | city、cityName、areaDistrict、businessDistrict、gps | 城市、行政区、商圈等直接使用；gps 在本轮为 null；city 数值编码可参考文字城市，不以它推断驻场 |

**A：可以直接使用的 List 字段**：encryptJobId、jobName、salaryDesc、jobExperience、jobDegree、jobLabels、skills、welfareList、bossName、bossTitle、bossOnline、brandName、brandIndustry、brandScaleName、brandStageName、cityName、areaDistrict、businessDistrict、iconWord。含标识符、图片资源等字段只用于对应记录，不额外解释业务意义。

### 列表字段特殊取值（本地样本）

| 字段 | 真实取值 | 证据级别、含义 |
|---|---|---|
| goldHunter | 0（10 条）、1（5 条） | B 高可信：1 为猎头；与 PC 猎头角标及两份独立 BOSS 社区代码一致；不能据此定义未知其他取值 |
| proxyJob | 0（9）、1（6） | B：代理招聘标记候选；本地 6 条中 5 条同时 goldHunter=1，仍有 1 条不是猎头 |
| proxyType | 0（9）、1（5）、4（1） | B：代理类型编码候选；1 与本地猎头重合，4 的具体含义**不能确认是派遣** |
| iconFlagList | 空数组（9）、[8]（5）、[1]（1） | B：[8] 在本地与猎头图片一致；[1] 未确认 |
| beforeNameIcons | 空（9）、非空（6） | A：职位名称前的图标图片；已知一款图标对应 DOM 的“猎头” |
| afterNameIcons | 全部为空 | D：无法判定其他取值 |
| iconWord | 空（14）、“急聘”（1） | A：文字角标，不代表准确发布时间 |
| bossOnline | true（11）、false（4） | A：当次在线状态，不能等于“1 分钟前回复” |
| contact | 全 false | B：公开的 BOSS 职位列表另有 true 实例；有第三方代码将其作为“已沟通”候选，尚不足以等于收到回复 |
| jobValidStatus | 全部 1 | B：状态数值，未得到全枚举定义 |
| anonymous | 0、4、20、101 | C：匿名/展示方式候选枚举，未证实 |
| jobType | 本轮全部 0 | C：岗位类型编码，完整枚举未知 |
| atsDirectPost | 全部 false | C：可能与直接申请有关，缺少 true 样本 |

## 2. Detail JSON：14 个顶层字段及关键子字段

若下载文件外有结果包装，先取 rawResponse.zpData；若直接读取完整的 BOSS 接口响应，取 zpData。下面子字段均相对于 zpData，**不要混用不同职位记录中的值**。

| 顶层字段（14 个，全部） | 已观察子字段 | 已确认使用与限制 |
|---|---|---|
| jobInfo | encryptId、jobName、postDescription、salaryDesc、experienceName、degreeName、showSkills、jobStatusDesc、invalidStatus | A：职位身份、完整 JD、薪资、条件和状态。职位关闭以状态及失效位为准，“最新”只是标记，不是发布时间 |
| jobInfo（其他） | address、locationName、location、latitude、longitude、position、positionName、jobType、proxyJob、proxyType、anonymous | 地址和职位分类有明确文字；代理类型与匿名数值只作为 B/C 候选 |
| jobInfo（补充） | recruitmentCountDesc、encryptUserId、encryptAddressId、locationUrl、staticMapUrl、pcStaticMapUrl、baiduStaticMapUrl、baiduPcStaticMapUrl、overseasAddressList、overseasInfo、payTypeDesc | recruitmentCountDesc 在 11 条中全部为空；**不是沟通人数**；地图链接/内部标识仅用于展示或对齐，后面三项样本为空或 null |
| bossInfo | name、title、brandName、bossOnline、activeTimeDesc、certificated、bossSource、tiny、large、avatarStickerUrl、tagIconUrl | A：在线/活跃描述，出现“刚刚活跃”“今日活跃”；bossSource 数值及为空的图标字段尚未明确 |
| brandComInfo | brandName、customerBrandName、industryName、industry、scaleName、scale、stageName、customerBrandStageName、stage、introduce、labels、logo、encryptBrandId、focusBrand、visibleBrandInfo、activeTime | 公司行业/规模/阶段可读；labels 是企业标签，不等于 List 福利；activeTime 虽是时间戳，但事件类型仍为 C，**不能当职位发布日期或最近回复时间** |
| relationInfo | beFriend、interestJob | B：已建立关系、兴趣候选。beFriend=true 不一定代表已互发消息；本轮 5/11 为 true |
| oneKeyResumeInfo | alreadySend、canSendResume、canSendPhone、canSendWechat、inviteType | B：简历等发送条件及状态候选；“可以发送”不等于“已经发送” |
| atsOnlineApplyInfo | alreadyApply、inviteType | B/C：某种在线申请状态及邀请类型；不等于所有形式的正式投递 |
| appendixInfo | canFeedback、chatBubble | B/D：反馈条件；chatBubble 样本为 null，不能推算沟通人数 |
| certMaterials | certName、certDeclare（在非空项中） | B：认证材料信息；不是职位招聘标记 |
| handicappedInfo | 本轮全部 null | D：缺乏有效样本 |
| lid | 字符串 | A：详情请求关联上下文 |
| securityId | 字符串 | A：后续动作参数，保存原值并保护 |
| pageType | 本轮全 0 | C：页面类型候选 |
| selfAccess | 本轮全 false | C：访问状态候选，不能当失效标记 |
| sessionId | 本轮全 null | D：无法推断会话是否存在 |

**关键拼接关系**：List encryptJobId ↔ Detail jobInfo.encryptId。先核对职位 ID，再汇总技能、JD、招聘状态、在线及关系字段。对于手机端的“1 分钟前回复”，不得直接用 Detail bossInfo.activeTimeDesc 或 brandComInfo.activeTime 替代。

## 3. 特别关心的指标：已确认与未知

| 用户想知道 | 最可靠来源 | 本轮结论 |
|---|---|---|
| 还在招聘吗 | Detail jobInfo.jobStatusDesc + invalidStatus | A：本地有“招聘中”“最新”“职位已关闭”；在线状态不能证明岗位仍招 |
| 招聘者是否在线 | List bossOnline / Detail bossInfo.bossOnline | A：只代表本次采集状态 |
| 最近活跃吗 | Detail bossInfo.activeTimeDesc | A：平台显示文案，不能推出具体回复频次 |
| 是否猎头 | List goldHunter=1 + iconFlagList=[8] + 已知猎头图片 | B 高可信：社区同样按 goldHunter=1 过滤猎头 |
| 是否派遣 | PC 页面图标 alt=派遣 | 页面 A：已看到 3 个；**仍没有被可靠证明的 List 数值编码** |
| 是否代理招聘 | List proxyJob / proxyType，Detail 同名字段 | B：有明显相关性，但未证明所有代理类型 |
| 已经沟通过吗 | List contact、Detail relationInfo.beFriend | B：是不同的关系信号，不能当对方已回复 |
| 是否发送过简历 | Detail oneKeyResumeInfo.alreadySend、atsOnlineApplyInfo.alreadyApply | B：发送和申请维度需要区分 |
| 是不是驻场/外包 | Detail postDescription、企业行业/职位背景 | C：可以提取明确文本线索，但**不能**直接从猎头/派遣推断驻场 |
| 发布时间 | 当前 List/Detail 都没有可靠字段 | D：不可用抓取日期或 brandComInfo.activeTime 代替 |
| 最近刷新时间 | 当前 List/Detail 没有可靠字段 | D |
| 招聘者“x 分钟前回复” | 手机端展示过；PC 原始 List/Detail 未见对应字段 | D（PC 接口）；不能凭 UI 文案编造字段名 |
| 招聘者“今日回复 N 次” | 手机端展示过；PC 原始 List/Detail 未见对应字段 | D（PC 接口）；**是回复频次，不是沟通人数** |
| 正在沟通人数 | 当前 List/Detail 未找到 | D；不能用 beFriend、contact 或 recruitmentCountDesc 充当人数 |

## 4. AI 使用字段的准则

1. **优先直接字段**：名称、薪资、经验、学历、技能、公司/行业、地址、福利、招聘状态、在线/活跃描述。
2. **按职位 ID 合并**：List encryptJobId 与 Detail jobInfo.encryptId 一致才拼接，保留来源日期与是否真实获取详情。
3. **显式呈现不确定性**：猎头可以给出“高可信猎头”提示；派遣以有证据的实际页面标签为准；代理、外包、驻场分开列出。
4. **不把状态混淆**：招聘者在线、最近活跃、最近回复、今日回复次数、是否已建立沟通、是否仍在招聘是不同指标。
5. **绝不补造**：没有发布时间/刷新时间/回复次数/沟通人数时标为“未知”，不从采集时间推算，也不为补指标自动请求其他接口。
6. **遵守隐私**：公共示例只放字段名及匿名统计，不包含用户原始 JSON、职位 ID、securityId、个人资料或招聘沟通记录。

## 5. BOSS 专项公开交叉证据（非官方字段定义）

- Greasy Fork《Boss直聘助手》：源码使用 goldHunter === 1 作为猎头过滤：https://greasyfork.org/zh-CN/scripts/491340-boss%E7%9B%B4%E8%81%98%E5%8A%A9%E6%89%8B/code
- Greasy Fork《Boss Batch Push》：独立判断 goldHunter === 1 为猎头：https://greasyfork.org/zh-CN/scripts/468125-boss-batch-push-boss%E7%9B%B4%E8%81%98%E6%89%B9%E9%87%8F%E6%8A%95%E7%AE%80%E5%8E%86/code
- Greasy Fork《Boss直聘自动投递助手》：将 contact 作为“已沟通”候选信号之一，仍属于第三方启发式：https://greasyfork.org/en/scripts/585275-boss%E7%9B%B4%E8%81%98%E8%87%AA%E5%8A%A8%E6%8A%95%E9%80%92%E5%8A%A9%E6%89%8B/code
- 影刀开发者社区《结合关键词定向抓取BOSS直聘全国岗位信息》：罗列 goldHunter、proxyJob、proxyType、iconFlagList、contact 等 BOSS 字段及样例：https://www.yingdao.com/community/detaildiscuss?id=853527117374013440
- GitHub BOSS 职位原始 JSON 样例：contact 同时有 true 与 false；但样例没解释“是否回复”：https://github.com/a951273629/boss/blob/master/companyList.json
- 站酷《UI/UX 产品体验笔记》BOSS 段落：手机端页面状态包含“x 分钟前回复”“今日回复 x 次”等文案；并未公开 2026 年当前 PC 字段名：https://www.zcool.com.cn/article/ZMTU3MzUxMg%3D%3D.html
- V2EX 关于 BOSS 职位发布日期/更新时间的讨论，仅说明公开页面不易查明，**不是字段不存在的证明**：https://www.v2ex.com/t/902015

这些链接仅用于字段语义交叉验证；其代码、自动化方式、外部平台以及未验证结论不属于本扩展的调用方法。

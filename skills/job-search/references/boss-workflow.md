# BOSS 平台与 Findwork 业务流程衔接

BOSS 只是**当前唯一已接入平台**。BOSS 扩展的动作、下载回执、恢复条件由 `skills/boss-extension/SKILL.md` 管理；Findwork 的通用入库与评估由根 `skills/job-search/SKILL.md` 及 `app/db/ingestion/` 管理。扩展独立使用时不需要数据库；Findwork 用户明确要求岗位管理和评估时，采集后必须执行公共导入。

## 采集、文件发现和对账

1. 真实 Chrome 中 BOSS 已登录、确认唯一职位列表 Tab 与当前扩展 ID，再按扩展 Skill 运行 `actions/detail/dom.html?auto=1&expect=N&pages=P`。P 为 1～21，expect=0 是推荐，其他值取决于该账号期望索引。
2. 扩展按照自然 List → DOM 真实卡片详情 → Chrome 下载 COMPLETE → 当前批次 Scroll。禁止主动拼装 Detail HTTP 或并发运行其他控制页。是否 `fresh=1` 或 `latest=1` 取决于用户本轮任务。
3. 从**实际 Chrome 下载根目录**查找 `BOSS/YYYY-MM-DD/list/`、`detail/`（及授权沟通后的 `greet/`）。必须确认当前批次的文件确实落盘、List `encryptJobId` 对应 Detail `jobInfo.encryptId`、Detail JD 可信；旧回执不可冒充本轮结果。
4. 不用数据库状态冒充扩展成功；扩展成功只证明外部文件/动作回执。Finder/下载目录位置并非固定，须从当前 Chrome 配置或工具实际可读目录确定。

## 公共导入与判断

从 Findwork 根目录执行 `npm run jobs -- import-list ABSOLUTE_LIST_JSON` 与 `npm run jobs -- import-detail ABSOLUTE_DETAIL_JSON JOB_ID`，并按 `references/database.md` 通过 `query` 和 `get` 验证。**同 jobId 已存在时保留旧判断和已沟通状态，不再按本轮下载列表对其自动评估**。只处理 DB 真正待评估的岗位，读取 `.private/job-search/` 中三项用户策略后保存 WORTH/PASS。公共 DB 不归 BOSS。

## 已授权沟通与回执

逐职位确认候选与用户授权后，批量用 `claim-batch`、单条可用 `claim` 取得唯一 actionId，再用普通 Chrome 打开 BOSS Skill 的带参数 Greet 入口（串行/节流由扩展执行）。观察与人工恢复只使用同一个不带参数的 Greet 页面；岗位关闭保留失败，120 次提醒人工确认后继续剩余队列，平台次数/额度类明确失败先暂停；当天成功未满150时仅用户明确手动重发，原平台错误不作为本地硬锁；UNKNOWN、关闭和其他失败不重发。不得用 Playwright/CDP 访问或监听 BOSS，不寻找受控页面组、不创建额外观察页。以本轮 `BOSS/YYYY-MM-DD/greet/` 文件导入 `import-greet`，再读取 DB 证明已沟通或其他真实状态。UNKNOWN 不重复发送；Greet 不代表正式简历投递。

验证码、风控、业务码 37、源文件无效、岗位 ID 不符或下载 UNKNOWN 时立即停在第一失败点。不要凭旧采集日志或 UI 显示生成“成功”结论。投递后招聘者回复和跟进属于平台自身。

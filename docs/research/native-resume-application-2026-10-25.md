# BOSS 原生简历投递接口调研（2026-10-25）

状态：研究归档，不是当前可执行任务指南。probe源码不进入正式manifest或生产包；未经明确研究授权不得启动。本文历史统计不是当前数据库状态。

## 2026-10-26：接口源码证据已补齐

后续通过只读本机 Chrome 已有缓存，解析并解压 BOSS 自身前端静态脚本，确认「投递简历」按钮调用 `POST /wapi/zpgeek/resume/onekeydeliver.json`，URL 参数为 `securityId`、`jobId`、`lid`、`resumeId`，可选 `cid`。SPA v6783/v6772/v6763 的职位卡片与 SEO v5481/v5447/v5376 的 `Detail.deliveResume` 实现相互印证。原生回调以 `response.code===0` 为业务成功，不能只看 HTTP200。

普通详情的原生顺序是 `handleSendResume` → `exchange/precheck/query.json`（POST，type=3及securityId，可能要求人工确认）→ `resume/attachment/checkbox.json`（GET，0份上传、1份取ID、多份选择）→ `Detail.deliveResume`。`onekeydeliver/precheck.json` 虽存在，但所查调用者为 `getIntersetStatus`，不能误当这条发送链的通用前置检查。

证据等级：**缓存前端调用契约已确认；当前服务端实发、实际会话配置和业务成功回执未验证**。未发起任何 BOSS 请求、未真实投递、未改生产发送逻辑；研究 probe 仍未启动。接入仍应由现有 Greet 后台队列处理，不新增第二套页面或在入队参数页并发POST。简历结果与Greet结果各自留回执，安全确认交人工，UNKNOWN不自动重发。下文为先前调研的历史记录，其中“endpoint UNKNOWN”已由本节的源码证据更新，不能继续解释成接口不存在。

## 社区 CLI 交叉核对（2026-10-26）

只读源码，未安装或执行CLI，未访问BOSS。核对结果不能冒充真实发送回执。

| 项目及核对版本 | 源码事实 | 对本任务的意义 |
|---|---|---|
| [jackwener/boss-cli](https://github.com/jackwener/boss-cli/tree/9d38ed1a3a5f6c5c2f37b865b0748454234e7c70) | `commands/social.py` 的 greet 调用 `client.add_friend`，后者使用 `/wapi/zpgeek/friend/add.json`；虽文案称打招呼/投递简历，但没有找到独立 `onekeydeliver` 执行器。另有只读 `/wapi/zprelation/resume/geekDeliverList`。 | 不能拿其greet命令印证附件简历已发送；已投递查询可作为后续回读候选，尚未调用验证。 |
| [DuanXiaoWen/zhipin-geek](https://github.com/DuanXiaoWen/zhipin-geek/tree/ebd8594db023033f98e4e0572b017a29f0c36d91) | `send-resume <friendId>` 先查询 `/wapi/zpchat/geek/getBossData` 获取securityId，再 `POST /wapi/zpchat/exchange/request`，表单为 `type=3`、`bossId`、`securityId`。输出区分 `status==0` 和仅发送请求。 | 社区实现确有独立发送附件简历入口，但这是聊天会话交换路径，不能当作职位详情的onekeydeliver调用。 |

因此保留两条路径的区别：职位详情直投由BOSS原生按钮/`Detail.deliveResume`的缓存源码印证；社区聊天发简历由zhipin-geek源码印证。不能因为都有“发简历”文案就互换参数、跳过前置校验或混算成功。当前用户需求对应的是前者：canSendResume控制的职位详情直接投递。

## 原调研结论与证据等级（历史）

- 已确认：/wapi/zpgeek/friend/add.json 属于 Greet 打招呼，不是简历直投。
- 本地 476 条 List 中 atsDirectPost 均为 false；475 条 Detail 中 oneKeyResumeInfo.canSendResume=true 仅 5 条，且均为「急聘」；不能据此证明支持绕过聊天直接申请。
- Detail 的 atsOnlineApplyInfo.alreadyApply 和 oneKeyResumeInfo.alreadySend 是独立业务事实，不能根据另一字段推断为成功。
- 仍然 UNKNOWN：原生直投业务按钮是否出现、实际请求 endpoint、method、payload 字段、鉴权方式、成功响应与失败语义。
- 公开文章大量混用「打招呼 / 发送附件简历 / ATS 在线申请」，没有找到有 BOSS 原始证据的具体直接申请 POST。

## 已实现的、不会发起真实投递的工程能力

1. Findwork 后端 GET /api/resume-applications/signals?mode=all|worth|ats|send-resume&limit=30&offset=0
   只读输出独立的 atsDirectPost、canSendResume、alreadyApplied、alreadySentResume，且
   directApplyEndpointVerified=false。不改变 Greet 或 application 状态。
2. Chrome 扩展 actions/application/probe.html 为独立原生请求观察页。
   观察有效期 3 分钟，后台由用户原生 BOSS 操作驱动。最多记录 40 条同源 POST 的路径、方法、HTTP 状态和观察时间；
   不读取、不下载请求参数、简历、Cookie、响应正文；不发起任何 POST。
   已明确排除原 Greet 请求。观察结果仍只是候选，绝不直接当作 ATS 投递。
3. 数据库此前已有 application_state、application_action_id、独立 job-application-result.v1 回执，
   与 communication_state 分离。尚未实现 native direct-apply dispatcher（不使用 Greet 兜底）。

## 下一阶段必须具备的真实证据

需要在已登录 BOSS 页确认实际存在的直投按钮，以及当用户确实授权一次原生投递时，
原生请求的 path/method、字段名（不留原始私密值）、响应含义和正式投递记录变化。
在这之前，不能构造猜测的 endpoint 或伪造成功；不得自动对任意 WORTH 或「急聘」发简历。

# BOSS 扩展动作

每个地址以 chrome-extension://<EXTENSION_ID>/ 开始，ID 从当前 Chrome 安装实例取得；确认 BOSS 已登录、职位列表标签唯一。

- Reload：actions/reload/reload.html；更新扩展、没有正在执行或 UNKNOWN 副作用时才用。
- Refresh：actions/refresh/refresh.html?expect=N；expect=0 推荐，N≥1 按自定义求职期望配置顺序。
- Scroll：actions/scroll/scroll.html；5秒窗口等待自然下一批 List。
- Detail：actions/detail/dom.html?auto=1&expect=N&pages=P；按真实职位 ID 点击卡片，捕获自然 Detail。P=1～21，每批15条；全新重采加 fresh=1，单批 latest=1。
- Greet：actions/greet/greet.html；不带参数仅查看队列和人工处理提示，不发送。带 jobId/securityId 入队后关闭自身；Findwork 调度还带 actionId/serverOrigin。必须**逐职位明确授权**，后台会发真实消息。
- Detail Diagnose：actions/detail/diagnose.html；只读检查 Hook、页面结构、滚动容器和采集回执，可传 jobId。
- Greet Status：diagnostics/greet-status.html；仅作旧链接兼容，自动转到不带参数的 Greet 页面。不要另开观察页。

自动采集期间不可并发开启另一个相同动作；不根据虚拟列表的节点索引猜岗位；首条自然 Detail 不重复点击。每条只有 Chrome COMPLETE 与身份一致才可推进；UNKNOWN 与安全验证不得盲重试，不拼装独立详情 HTTP。

沟通只打开扩展 Greet 入口。不要通过 Playwright/CDP 控制或监听 BOSS，不为打开入口先建立页面组。工具不能开扩展页时，核实普通 Chrome 打开方式；不能转向 BOSS 页面或自行构造 HTTP 请求。

Greet 默认页另有默认关闭的附件简历开关及附件选择，只有实际后台具备 `resume-delivery-opt-in` 才支持。开关开启后仅影响之后新入队岗位；不另开投递页面。成功Greet之后可选执行原生岗位直投，简历失败不改变Greet结果；投递回执在 `application/` 独立保存，详见SKILL。

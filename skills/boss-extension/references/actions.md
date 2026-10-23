# BOSS 扩展动作

每个地址以 chrome-extension://<EXTENSION_ID>/ 开始，ID 从当前 Chrome 安装实例取得；确认 BOSS 已登录、职位列表标签唯一。

- Reload：actions/reload/reload.html；更新扩展、没有正在执行或 UNKNOWN 副作用时才用。
- Refresh：actions/refresh/refresh.html?expect=N；expect=0 推荐，N≥1 按自定义求职期望配置顺序。
- Scroll：actions/scroll/scroll.html；5秒窗口等待自然下一批 List。
- Detail：actions/detail/dom.html?auto=1&expect=N&pages=P；按真实职位 ID 点击卡片，捕获自然 Detail。P=1～21，每批15条；全新重采加 fresh=1，单批 latest=1。
- Greet：actions/greet/greet.html?jobId=...&securityId=...；必须**逐职位明确授权**，会发真实消息。
- Detail Diagnose：actions/detail/diagnose.html；只读检查 Hook、页面结构、滚动容器和采集回执，可传 jobId。
- Greet Status：diagnostics/greet-status.html；只读检查 Greet 队列、暂停和 UNKNOWN。

自动采集期间不可并发开启另一个相同动作；不根据虚拟列表的节点索引猜岗位；首条自然 Detail 不重复点击。每条只有 Chrome COMPLETE 与身份一致才可推进；UNKNOWN 与安全验证不得盲重试，不拼装独立详情 HTTP。

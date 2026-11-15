# shared

平台无关共享层：业务模型、纯逻辑、API client、状态/use-case、可跨 Web 和 Mobile 复用的展示组件。

不要在这里直接引用浏览器专属 API、Capacitor、地图 SDK、Web Audio 或 Service Worker。需要平台能力时，先在 `shared/adapters` 定义 port，再由 `web/adapters` 或 `mobile/adapters` 实现。


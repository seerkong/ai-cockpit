# Backend 模块文档

后端网关：为前端提供 WebSocket 服务，负责启动/管理 OpenCode server，并将 SSE 事件转为 WS 消息。

## 文档列表

| 文档 | 说明 | 何时阅读 |
|------|------|----------|
| [introduce/](./introduce/index.md) | 模块概念与职责 | 初次了解后端结构时 |
| [howto/](./howto/index.md) | 后端改动操作指南 | 增加消息类型/扩展事件时 |
| [example/](./example/index.md) | 后端关键代码示例 | 需要对照实现细节时 |
| [constaint/](./constaint/index.md) | 后端规则与约束 | 做较大改动前 |
| [misc/](./misc/index.md) | 权限/配置补充 | 调整 OpenCode 权限或运行参数时 |
| [troubleshooting/](./troubleshooting/index.md) | 常见问题排查 | 后端报错或无响应时 |

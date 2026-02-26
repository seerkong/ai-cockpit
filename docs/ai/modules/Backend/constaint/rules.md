# Backend 模块规则清单

## RULE-Backend-001: OpenCode 事件流必须可中断

后端在 abort/close 时必须停止 SSE 读取（`stopEventStream()`），避免 reader 泄漏或持续占用连接。

## RULE-Backend-002: 不要把未经处理的 OpenCode event 直接透传给前端

前端渲染依赖稳定的 `ServerMessage`。OpenCode event 的结构可能变化，后端应做兼容层与降噪处理。

## RULE-Backend-003: workspace 变更必须清理旧进程

当用户重新配置 workspace 时，必须停止旧事件流并 kill 旧 OpenCode server（当前 `handleConfig` 已实现该行为）。

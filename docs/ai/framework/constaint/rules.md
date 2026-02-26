# 工程与编码规则清单

## RULE-INFR-001: shared 类型必须保持无运行时副作用

`shared/` 仅承载类型与纯数据结构定义，不要引入运行时逻辑或环境相关代码。

## RULE-INFR-002: 共享协议变更必须同步更新三端

任何 WebSocket 消息协议变更必须同时更新：`shared/`、`backend/`、`frontend/`，并保证运行时兼容或明确破坏性变更。

## RULE-BE-001: 后端不得在 WS message handler 内做长时间阻塞

`websocket.message` 里应尽快 dispatch；耗时任务（如 OpenCode 事件流）应异步运行（当前实现对 prompt 使用了 `handlePrompt(...).catch(...)`）。

## RULE-FE-001: streaming 消息优先“更新现有条目”而不是无限新增

对于 `assistant_message`/`thinking`/`tool_use` 等流式更新，前端应复用/更新已有 UI message（当前 `useChat` 使用 ref 保存当前 message id）。

# 常见改动路径：扩展消息类型

该原型的跨端协议以 `shared/index.ts` 为中心。大多数功能扩展会同时触达 3 个包：

1) `shared/`：类型定义
2) `backend/`：生产消息（WS 输出）
3) `frontend/`：消费消息（UI 渲染）

## 示例：新增一种 ServerMessage（概念步骤）

1. 在 `shared/index.ts` 扩展 `ServerMessage.type` 联合类型与对应 payload interface。
2. 在 `backend/src/index.ts` 的 `processEvent()` 或其他路径生成该 `ServerMessage` 并 `sendMessage()`。
3. 在 `frontend/src/hooks/useChat.ts` 的 `handleServerMessage` 增加 `case`，并在 UI 中渲染。

## 最小检查点

- 前端 `useWebSocket` 是否能正确 `JSON.parse` 新消息
- `useChat` 是否把新消息转成 `ChatMessage`（注意 streaming 场景：可能需要“更新已有 message”而不是一直 append）
- 共享类型是否能在 frontend/backend 两侧编译通过（path alias 与 workspace 依赖是否正确）

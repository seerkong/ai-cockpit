# 新增消息类型的 UI 渲染（前端视角）

当后端新增一种 `ServerMessage.type` 后，前端需要把它转换为 `ChatMessage` 并渲染。

## 步骤

1. 确认 shared 类型已更新

- `shared/index.ts` 中 `ServerMessage.type` 与 payload interface 已包含新类型。

2. 在 useChat 中消费该消息

- 找到 `frontend/src/hooks/useChat.ts` 的 `handleServerMessage`。
- 增加 `case '<new_type>'`：
  - 如果是“一次性消息”：append 一条新的 `ChatMessage`
  - 如果是“流式消息”：复用/更新现有 message（参考 `assistant_message`/`thinking`）

3. 在 MessageList 中渲染

- 当前 `MessageList` 仅对 `tool` 做了特殊 UI，其余按 `message.type` 加 class。
- 如果新类型需要特殊 UI：在 `MessageItem` 增加分支。

## 最小验证

- 浏览器控制台确认收到了 `ServerMessage`（`useWebSocket` 会打印日志）
- UI 消息是否更新而不是重复追加（尤其是 delta 场景）

# 扩展后端消息类型（后端视角）

本原型把 OpenCode SSE 事件映射为 `ServerMessage`（WS 推送）。当你想把更多信息展示到前端时，一般需要增加一种新的 `ServerMessage.type`。

## 步骤

1. 更新协议类型（shared）

- 在 `shared/index.ts` 扩展 `ServerMessage.type` 的联合类型。
- 为该类型新增一个明确的 payload interface（避免 `unknown`）。

2. 在后端生成该消息

- 找到生成消息的入口：通常是 `backend/src/index.ts` 的 `processEvent()`。
- 根据 OpenCode event 的 `event.type` 与 `event.properties`，构造新的 `ServerMessage` 并 `sendMessage()`。

3. 保证不会破坏流式语义

- 若是流式更新（delta）：避免频繁创建新 message；复用同一条消息的累计内容（当前实现对 assistant/thinking 使用 Map 做累计）。

4. 同步更新前端消费逻辑

- 前端在 `frontend/src/hooks/useChat.ts` 的 `handleServerMessage` 里需要增加对应 `case`。

## 代码落点提示

- 事件映射：`backend/src/index.ts`（`processEvent`）
- SSE 输入：`backend/src/opencode-client.ts`（`streamEvents`）
- WS 输出：`backend/src/index.ts`（`sendMessage`）

# 修改协议字段（shared 视角）

shared 是跨端契约中心。任何字段/类型变更都应该先从这里开始。

## 步骤

1. 更新 `shared/index.ts`

- 修改/新增 interface
- 更新 `ClientMessage.type` 或 `ServerMessage.type` 的联合类型

2. 同步更新 Backend

- 生产端：`backend/src/index.ts`（构造并发送 `ServerMessage`）
- 解析端：`backend/src/opencode-client.ts`（如果 OpenCode event 结构变化/需要更多字段）

3. 同步更新 Frontend

- 消费端：`frontend/src/hooks/useChat.ts`（解析 `ServerMessage.payload`）
- 渲染端：`frontend/src/components/*`（如果需要特殊 UI）

## 兼容性建议

- 新增字段：尽量可选（`?:`），并给出默认行为。
- 变更字段语义：视为破坏性变更，需要同步更新前后端并更新相关文档。

# Shared 模块概览

## 模块职责

- 定义前后端之间的 WebSocket 消息协议（`ClientMessage`/`ServerMessage`）
- 定义 payload 的结构（例如 `AssistantMessagePayload`、`ToolUsePayload`）
- 提供 OpenCode event 的最小类型子集（用于后端解析）

## 代码位置

```text
shared/index.ts
```

## 协议范围

### ClientMessage（Frontend → Backend）

- `config`：配置 workspace 目录
- `prompt`：发送 prompt，可携带 `sessionId` 触发 fork
- `abort`：中断当前 session

### ServerMessage（Backend → Frontend）

目前 `ServerMessage.payload` 在类型层面是 `unknown`，但同时定义了对应 payload interface：

- `SessionStartPayload`
- `AssistantMessagePayload`
- `ToolUsePayload`
- `ThinkingPayload`
- `ErrorPayload`
- `SystemPayload`

前后端实现依赖这些字段结构（见 `backend/src/index.ts` 与 `frontend/src/hooks/useChat.ts`）。

## OpenCode event（子集）

`OpencodeEvent` 以 `{ type: string, properties?: Record<string, unknown> }` 为主，另外声明了 `message.updated`、`message.part.updated`、`session.idle`、`session.error` 的结构化 interface。

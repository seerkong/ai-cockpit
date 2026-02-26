# 系统概览

该原型演示“浏览器实时聊天 UI ↔ WebSocket 网关 ↔ OpenCode 服务器（HTTP+SSE）”的端到端数据流。

## 组件与边界

- Frontend（React + Vite）：负责 UI、用户输入、渲染流式响应，通过 WebSocket 与后端通信。
- Backend（Bun + TypeScript）：对外提供 WebSocket 服务，负责启动/管理 OpenCode server，并将 OpenCode 事件转发给前端。
- OpenCode Server（`npx opencode-ai@latest serve`）：对外提供 REST API 与 SSE 事件流。

## 架构示意图（ASCII）

```text
┌─────────────────────────────────────────────────────────────┐
│                         Browser (React)                     │
│  App.tsx + hooks (useWebSocket/useChat)                     │
└───────────────┬─────────────────────────────────────────────┘
                │ WebSocket JSON (shared types)
                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Bun)                          │
│  - /ws: WebSocket upgrade + message routing                 │
│  - /health: health probe                                    │
│  - Spawns OpenCode server per workspace                      │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP REST + SSE (Authorization Basic)
                ▼
┌─────────────────────────────────────────────────────────────┐
│                   OpenCode Server Process                   │
│  - POST /session                                            │
│  - POST /session/:id/message                                 │
│  - GET  /event  (SSE)                                       │
│  - POST /session/:id/abort                                   │
└─────────────────────────────────────────────────────────────┘
```

## 核心数据流

### 1) 配置 workspace

1. 前端发送 `ClientMessage { type: 'config', payload: { workspace } }`。
2. 后端把 workspace 写入当前 WebSocket 对应的 `ClientState`。
3. 若 workspace 变化，会清理旧的 OpenCode server 与事件流。

相关代码：

- `backend/src/index.ts`（`handleConfig`）
- `shared/index.ts`（`ClientMessage`/`ConfigPayload`）

### 2) 发送 prompt 并流式接收

1. 前端发送 `ClientMessage { type: 'prompt', payload: { prompt, sessionId? } }`。
2. 后端：
   - 若未启动 OpenCode server：调用 `spawnOpenCodeServer(workspace, { autoApprove: true })`。
   - 创建 `OpenCodeClient`，等待 `/global/health`。
   - 创建 session（或 fork session 用于 follow-up）。
   - 先启动 SSE 事件流（后台任务），再调用 `/session/:id/message` 发送 prompt。
3. 后端将 SSE 事件映射为 `ServerMessage` 并推送给前端：
   - `assistant_message`：assistant 文本流（累计内容 + delta）
   - `thinking`：reasoning 流
   - `tool_use`：工具调用状态
   - `system`/`error`/`done`
4. 前端按消息类型渲染。

相关代码：

- `backend/src/index.ts`（`handlePrompt`、`processEventStream`、`processEvent`）
- `backend/src/opencode-client.ts`（`createSession`/`sendPrompt`/`streamEvents`）
- `frontend/src/hooks/useChat.ts`（`handleServerMessage`）
- `shared/index.ts`（`ServerMessage` 与 payload 结构）

### 3) Abort

1. 前端发送 `ClientMessage { type: 'abort', payload: { sessionId } }`。
2. 后端 `stopEventStream()` 并请求 OpenCode abort。

相关代码：

- `backend/src/index.ts`（`handleAbort`）
- `backend/src/opencode-client.ts`（`abort`、`stopEventStream`）

## 状态管理模型

后端为每条 WebSocket 连接维护一份 `ClientState`（存于 `WeakMap`）：

```ts
interface ClientState {
  workspace: string | null;
  server: OpenCodeServerInfo | null;
  client: OpenCodeClient | null;
  currentSessionId: string | null;
  isProcessing: boolean;
}
```

含义：一个 WS 连接在任意时刻只处理一个 prompt（`isProcessing`），并维护当前 session。

## 安全与风险提示

- 该原型会把用户输入的 `workspace` 作为子进程 `cwd`；仅适合本地开发/演示。
- `autoApprove: true` 代表工具执行可被自动批准（取决于 OpenCode 权限策略）；不要直接用于生产环境。

# Backend 模块概览

## 模块职责

- 对外提供 WebSocket：接收 `config/prompt/abort`，向前端推送流式事件。
- 启动并管理 OpenCode server 子进程：按 workspace 启动，必要时重启。
- 将 OpenCode 的 SSE 事件流映射为前端可渲染的 `ServerMessage`。

## 核心对象

### ClientState（每个 WS 连接一份）

位于 `backend/src/index.ts`：

- `workspace`: 当前配置的目录
- `server`: OpenCode server 进程信息（baseUrl/password/process）
- `client`: OpenCodeClient（HTTP/SSE）
- `currentSessionId`: 当前 session
- `isProcessing`: 防止并发 prompt

### OpenCodeClient

位于 `backend/src/opencode-client.ts`：

- 负责构建 headers（`x-opencode-directory` + Basic auth）
- REST：`createSession` / `forkSession` / `sendPrompt` / `abort`
- SSE：`streamEvents`（解析 `data:` 行并 yield JSON event）

### OpenCode server manager

位于 `backend/src/opencode-server.ts`：

- `spawnOpenCodeServer(directory, { autoApprove })`
- `killOpenCodeServer(server)`
- Windows 使用 `cmd /c npx ...`

## 对外接口

### HTTP

- `GET /health`：返回 `{ healthy: true }`

### WebSocket

- `GET /ws`：升级为 WebSocket
- 客户端消息：见 `shared/index.ts` 的 `ClientMessage`

## 代码位置

```text
backend/src/index.ts            # WS 网关、session 管理、事件转发
backend/src/opencode-client.ts  # OpenCode HTTP + SSE client
backend/src/opencode-server.ts  # OpenCode 子进程管理
shared/index.ts                 # WS 协议类型与 OpenCode event 子集
```

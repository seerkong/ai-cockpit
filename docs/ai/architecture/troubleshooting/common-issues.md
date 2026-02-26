# 常见问题与排查

## 1) 前端无法连接 WebSocket

现象：ConnectionStatus 显示 Disconnected，控制台报 WebSocket error。

排查：

1. 确认后端是否启动：`bun run dev:backend`
2. 确认端口：后端默认 `3001`（或检查 `PORT`）
3. 开发模式下前端会直接连 `ws://localhost:3001/ws`（见 `frontend/src/App.tsx`）

## 2) 卡在 “Starting OpenCode server...”

可能原因：

- `npx opencode-ai@latest` 无法下载/执行（网络、Node 环境问题）
- OpenCode server 进程启动后未输出 “opencode server listening on …”

排查：

1. 查看后端控制台输出（`spawnOpenCodeServer` 会捕获 stdout 并等待 URL）
2. 确认机器有 Node 18+ 且可运行 `npx -v`
3. 尝试单独在命令行运行：`npx -y opencode-ai@latest serve --hostname 127.0.0.1 --port 0`

## 3) OpenCode health check 失败

现象：后端报 `OpenCode server failed health check`。

排查：

- 后端调用的是 `${baseUrl}/global/health`（见 `OpenCodeClient.waitForHealth`）。确认 baseUrl 正确。
- 若启动速度慢：可考虑提高 `waitForHealth()` 的 timeout（代码层面）。

## 4) 有 session_start，但没有 assistant_message

可能原因：

- SSE 连接失败（Authorization/目录 header 不正确）
- SSE 事件被过滤掉（sessionId 不匹配）

排查：

1. 后端日志是否出现 `SSE event stream connected`
2. 检查 `OpenCodeClient.eventMatchesSession()` 的 sessionID 提取逻辑
3. 检查 OpenCode 返回的事件 properties 结构是否变化（可能需要扩展提取分支）

## 5) Abort 无效

排查：

- 后端需要同时 `stopEventStream()` 与调用 `/abort`（见 `backend/src/index.ts` 的 `handleAbort`）。
- 如果前端没传 `sessionId`，abort 会被忽略（见 `frontend/src/App.tsx` / `useChat.ts`）。

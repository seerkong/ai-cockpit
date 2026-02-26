# 技术栈与工程化概览

## Workspace 结构

该仓库是一个最小化 monorepo（workspaces）：

- `backend/`：Bun + TypeScript（WebSocket 网关 + OpenCode bridge）
- `frontend/`：React 18 + Vite 5 + TypeScript
- `shared/`：共享 TypeScript 类型（消息协议与 OpenCode 事件子集）

入口配置：`package.json`（根目录 `workspaces` 与 `scripts`）。

## 后端（backend）

- 运行时：Bun
- 服务模型：`Bun.serve({ websocket, fetch })`（见 `backend/src/index.ts`）
- OpenCode 集成：
  - `backend/src/opencode-server.ts`：负责 spawn/kill OpenCode server
  - `backend/src/opencode-client.ts`：负责 HTTP 请求与 SSE 事件解析

## 前端（frontend）

- 框架：React
- 构建：Vite
- 数据流：`useWebSocket` 接收 `ServerMessage`，交给 `useChat` 聚合为 UI message 列表（见 `frontend/src/hooks/useWebSocket.ts`、`frontend/src/hooks/useChat.ts`）

## shared 类型共享方式

该项目通过 alias + workspace 依赖让前后端共享类型：

- Vite alias：`frontend/vite.config.ts` 中 `alias: { shared: path.resolve(__dirname, '../shared') }`
- TS path：`frontend/tsconfig.json` 与 `backend/tsconfig.json` 中 `paths: { "shared": ["../shared"] }`

## 关键工程脚本

根目录脚本（`package.json`）：

- `bun run dev`：并行启动后端与前端
- `bun run dev:backend` / `bun run dev:frontend`：分别启动

## 数据存储与运行边界

- 该原型是 in-memory 的，没有 DB/持久化层（见 `README.md` 的 Key Differences）。
- “workspace” 由用户输入并作为 OpenCode server 的 `cwd` 使用；不要将其当成安全边界。

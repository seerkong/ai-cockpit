# 本地运行（架构视角）

本文件从“链路是否完整”的角度描述如何跑通：Frontend → Backend → OpenCode server。

## 前置条件

- 安装 Bun（最新版）
- Node.js 18+（用于 `npx opencode-ai@latest`）
- OpenCode CLI 已完成认证（否则 OpenCode server 可能无法正常工作）

## 启动步骤

在仓库根目录（prototype）执行：

```bash
bun install
bun run dev
```

也可以分别启动：

```bash
bun run dev:backend
bun run dev:frontend
```

## 端口与访问地址

- Frontend（Vite dev server）：默认 `http://localhost:3000`
- Backend（Bun.serve）：默认 `http://localhost:3001`
- WebSocket：`ws://localhost:3001/ws`

说明：前端在开发模式下会直接连 `ws://localhost:3001/ws`（见 `frontend/src/App.tsx` 的 `WS_URL`）。

## 验证链路

1. 打开 `http://localhost:3000`
2. 输入 workspace 路径（你要让 OpenCode 操作的项目目录）并点击 Configure
3. 发送一条消息
4. 期望看到：
   - `system`：Starting OpenCode server...
   - `session_start`
   - 流式 `assistant_message`/`thinking`/`tool_use`
   - `done`

如果停在 “Starting OpenCode server...” 或报错，参考 `docs/ai/architecture/troubleshooting/common-issues.md`。

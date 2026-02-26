# 开发工作流

## 安装依赖

在仓库根目录执行：

```bash
bun install
```

## 启动开发环境

推荐：一次性启动前后端

```bash
bun run dev
```

分别启动：

```bash
bun run dev:backend
bun run dev:frontend
```

## 构建

前端构建（从 root 运行）：

```bash
bun run --filter frontend build
```

说明：该仓库的后端以 Bun 直接运行 TS 入口为主；如需产物输出，可按 `backend/tsconfig.json` 的 `outDir` 自行扩展构建脚本。

## 测试

单元测试：

```bash
bun run test:backend
bun run test:frontend
```

端到端（E2E）：

```bash
bun run test:e2e
```

说明：E2E 使用 Playwright，并会自动启动前端 dev server（默认端口 5173）。该 E2E 目前通过网络拦截与 `EventSource` mock 来验证核心 UI 交互，不依赖真实后端或 OpenCode server。

## 调试建议

- WebSocket 链路：优先看浏览器控制台与后端日志（`useWebSocket`/`backend/src/index.ts` 有较多 `console.log`）
- OpenCode server 启动：查看 `spawnOpenCodeServer` 捕获的输出，确认是否打印监听 URL
- SSE：后端会打印 `Connecting to SSE...` / `SSE event stream connected`

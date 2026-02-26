# 迁移交付记录

## 默认运行路径

- 默认 runtime: `elysia`
- 可选 fallback: `BACKEND_RUNTIME=legacy`

## 关键实现

- 新增 `backend/src/runtime.ts`，统一启动逻辑并支持 runtime 切换
- `backend/src/index.ts` 改为通过 runtime 启动
- Elysia 通过 `all('/*')` 承载既有 HTTP/SSE 处理链
- Elysia WebSocket 路由 `/api/v1/workspaces/:workspaceId/stream/ws` 复用既有实时协议处理
- 保留 Bun.serve 旧实现入口（legacy 模式）

## 备份映射

- 备份目录：`backend/src/legacy/bun-serve/`
- 备份文件：`index.ts`、`app.ts`、`realtime-ws.ts`
- 说明：`backend/src/legacy/bun-serve/README.md`

## 验证结果

- `bun test`（backend）：通过
- `bun test --coverage`（backend）：通过，整体覆盖率为现有仓库基线（未达到 80%）
- 新增 `backend/src/runtime.test.ts`：覆盖 runtime 选择、legacy/elysia 健康检查、elysia ws snapshot

## 待后续持续验证

- Playwright 关键 e2e 在本环境下执行超时，建议在 CI 或开发机继续跑：
  - `bunx playwright test e2e/realtime-ws-mock.spec.ts -c playwright.config.ts`

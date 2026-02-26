# 兼容基线清单

## 命令基线

- `bun run --filter backend test`

## HTTP 基线（由 `backend/src/app.test.ts` 覆盖）

- CORS 与 OPTIONS 行为
- `/api/health` 健康检查
- `/api/config` 参数校验
- workspace/session/config/files/proxy 关键路径
- 关键错误语义：401/403/404/405/409/501

## SSE 基线（由 `backend/src/app.test.ts` 覆盖）

- `/api/v1/workspaces/:id/events` 事件转发
- `message.part.updated` 聚合行为
- 流式响应头和断流处理

## WebSocket 基线（由 `backend/src/realtime-ws.test.ts` 覆盖）

- 握手鉴权与 workspace 匹配
- subscribe 返回 snapshot
- patch 推送与增量更新

## 迁移后新增基线

- `backend/src/runtime.test.ts`: runtime 选择与 fallback 规则
- `BACKEND_RUNTIME=legacy|elysia` 启动路径可控

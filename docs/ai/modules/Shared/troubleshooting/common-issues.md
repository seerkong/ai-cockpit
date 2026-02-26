# Shared 常见问题与排查

## 1) TS 能编译，但浏览器运行时报找不到 shared

原因：TS paths 只影响类型检查；运行时需要 Vite alias。

排查：

- 检查 `frontend/vite.config.ts` 是否配置了 `resolve.alias.shared`
- 重新启动 Vite dev server（配置变更后需要重启）

## 2) 前后端对 payload 字段理解不一致

原因：`ServerMessage.payload` 是 `unknown`，靠运行时约定解析，变更时容易漏改。

建议：

- 变更协议时同时更新 `backend/src/index.ts` 与 `frontend/src/hooks/useChat.ts`
- 增加最小端到端验证：发一条消息看 UI 是否展示新增字段

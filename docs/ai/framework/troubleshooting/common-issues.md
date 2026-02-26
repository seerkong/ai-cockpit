# 常见问题与排查（工程化）

## 1) shared alias 解析失败

现象：TS 报 “Cannot find module 'shared'”。

排查：

- 前端：检查 `frontend/tsconfig.json` 的 `paths` 与 `frontend/vite.config.ts` 的 `resolve.alias` 是否一致
- 后端：检查 `backend/tsconfig.json` 的 `paths` 与 `include` 是否包含 `../shared/**/*`

## 2) Vite dev server WebSocket 代理异常

说明：`frontend/vite.config.ts` 配置了 `/ws` 的代理（ws: true），但当前 `frontend/src/App.tsx` 在 DEV 模式下直接连 `ws://localhost:3001/ws`。

如果你改为走代理（例如用相对路径），记得同步调整两处配置。

## 3) Windows 上 OpenCode server 启动失败

后端在 Windows 会使用：`cmd /c npx -y opencode-ai@latest serve ...`（见 `backend/src/opencode-server.ts`）。

排查：

- 确认系统 PATH 中有 `cmd` 与 `npx`
- 确认 Node 版本 >= 18
- 若公司网络限制下载，可能需要配置 npm registry 或提前缓存

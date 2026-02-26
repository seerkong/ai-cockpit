# 配置与环境变量

## 端口

- Backend：`PORT`（默认 3001），见 `backend/src/index.ts`
- Frontend：Vite `server.port = 3000`，见 `frontend/vite.config.ts`

## OpenCode server 相关

后端通过 `spawnOpenCodeServer()` 启动 OpenCode server，并设置环境变量：

- `OPENCODE_SERVER_PASSWORD`：随机生成的 Basic auth 密码（见 `backend/src/opencode-client.ts`）
- `OPENCODE_PERMISSION`：权限策略（原型默认 `autoApprove` 路径下设置为 `{ question: 'deny' }`）
- `NPM_CONFIG_LOGLEVEL=error`、`NODE_NO_WARNINGS=1`、`NO_COLOR=1`：减少噪音输出

## HTTP Header（Backend → OpenCode）

`OpenCodeClient` 构建请求头：

- `x-opencode-directory`: workspace 目录
- `Authorization: Basic ...`: `opencode:<serverPassword>`
- `Content-Type: application/json`
- SSE 额外：`Accept: text/event-stream`

相关代码：`backend/src/opencode-client.ts`（`buildHeaders`、`streamEvents`）。

# 目录结构与关键入口

## 目录结构

```text
prototype/
  README.md
  package.json            # workspaces + dev scripts
  backend/
    package.json
    tsconfig.json
    src/
      index.ts            # Bun.serve + WS 路由 + 事件转发
      opencode-client.ts  # OpenCode HTTP + SSE client
      opencode-server.ts  # Spawn/kill OpenCode server
  frontend/
    package.json
    vite.config.ts        # alias(shared) + dev server proxy
    tsconfig.json
    src/
      main.tsx            # React entry
      App.tsx             # 主 UI + WS wiring
      hooks/
        useWebSocket.ts
        useChat.ts
      components/
        MessageList.tsx
        ChatInput.tsx
        WorkspaceConfig.tsx
        ConnectionStatus.tsx
  shared/
    index.ts              # ClientMessage/ServerMessage + OpenCode event subset
```

## 关键入口（建议从这里开始读）

- 端到端流程：`README.md`
- 后端入口：`backend/src/index.ts`
- OpenCode 交互：`backend/src/opencode-client.ts`、`backend/src/opencode-server.ts`
- 前端入口：`frontend/src/App.tsx`、`frontend/src/hooks/useChat.ts`
- 协议定义：`shared/index.ts`

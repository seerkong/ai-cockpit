# Frontend 模块概览

## 模块职责

- 维护 WebSocket 连接（含重连）
- 把后端 `ServerMessage` 转换为可渲染的 `ChatMessage[]`
- 渲染消息列表、输入框、连接状态、workspace 配置

## 关键文件

```text
frontend/src/App.tsx                    # 主界面 + WS wiring
frontend/src/hooks/useWebSocket.ts      # WebSocket 连接与重连
frontend/src/hooks/useChat.ts           # 消息聚合与 streaming 更新
frontend/src/components/MessageList.tsx # 消息渲染
frontend/src/components/ChatInput.tsx   # 输入 + Abort
frontend/src/components/WorkspaceConfig.tsx
frontend/src/components/ConnectionStatus.tsx
frontend/src/index.css                  # 样式与 CSS 变量
shared/index.ts                         # ServerMessage 类型
```

## 运行时要点

### WebSocket URL 选择

`App.tsx` 中：

- DEV：直接连接 `ws://localhost:3001/ws`（避免代理问题）
- PROD：根据 `window.location` 拼装相对 host 的 `ws/wss`

### 流式更新策略

`useChat` 使用 `useRef` 保存“当前 assistant/thinking message id”，在收到新 delta 时更新同一条 UI message（避免无限新增）。

# Frontend 常见问题与排查

## 1) 连接状态一直是 Disconnected

排查：

- 后端是否在 `http://localhost:3001` 启动
- 前端 DEV 下使用固定 WS URL（见 `frontend/src/App.tsx` 的 `WS_URL`）

## 2) 发送按钮不可用

原因：`ChatInput` 在 `disabled || isProcessing` 时禁用；`disabled` 由 `!isConnected || !isConfigured` 决定。

排查：

- 是否点击了 Configure（workspace 为空会被忽略）
- WS 是否连上

## 3) 消息不滚动到最底部

前端用 `messagesEndRef.scrollIntoView({ behavior: 'smooth' })` 做自动滚动。

如果你引入了虚拟列表或改变 DOM 结构，需要重新检查 `MessageList` 末尾的 `<div ref={messagesEndRef} />` 是否仍然存在。

# 变更：迁移 AI 流式输出到 WebSocket + JSON Patch

## 背景和动机 (Context And Why)

当前 `ai-cockpit` 的实时更新主要依赖 SSE（EventSource）。在实际使用中会出现“等接口完全返回才显示”的体验问题，并且 SSE 的单向通道在长期扩展（例如 A2UI、自定义复杂卡片树与嵌套交互）上存在明显上限。

`vibe-kanban` 的实现路径表明：使用 WebSocket 作为实时通道，并通过 JSON Patch 以增量方式更新前端状态，可以同时满足“低延迟可感知流式”和“复杂 UI 状态树可扩展”的需求。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 用 workspace-scoped WebSocket 作为统一 realtime 通道，承载消息流式输出 + sessions/status + permissions/questions 等实时变化
- 使用 RFC 6902 JSON Patch 增量更新一个“规范化的实时状态树”（以稳定 ID 作为 key），为后续 A2UI 卡片树交互打基础
- 断线重连后以 snapshot 方式恢复（无需 seq-based resume）
- 保留 SSE `/events` 作为 fallback（WS 不可用时仍能工作）
- 补齐自动化测试，覆盖 streaming、重连 snapshot、fallback、以及避免 sessions refetch storm

**非目标:**
- 在本 track 内定义并实现完整的 A2UI 卡片 schema 与交互组件库
- 实现完整的 seq resume / 缺失 patch 重放协议（本 track 采用 snapshot 恢复）
- 引入需要浏览器实验特性的实现作为硬依赖（例如 WebSocketStream）

## 变更内容（What Changes）

- 后端：新增 workspace realtime WebSocket endpoint（Bun.serve websocket），实现订阅模型（subscribe session），把 OpenCode 上游事件转换为 realtime state 变更并生成 JSON Patch
- 前端：新增 WebSocket 客户端与 JSON Patch 应用层，把 SessionPage 及相关 UI 的实时更新切换为 WS；必要时自动降级到 SSE
- 协议：定义 WS 消息 envelope（snapshot、patch、subscribe、error 等）以及 realtime state 文档结构（规范化 state tree）
- 稳定性：在服务端加入 backpressure/safety limit；在前端加入掉线重连与 snapshot 重建

## 影响范围（Impact）

- 受影响的功能规范：
  - 新增能力（拟）：`realtime-ui-streaming`
  - 相关能力（可能需要补充/对齐）：`opencode-integration`

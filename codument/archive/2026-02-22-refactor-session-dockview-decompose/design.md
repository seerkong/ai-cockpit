## 上下文

SessionDockview.vue 是 ai-cockpit 前端的核心页面组件，在 Dockview 布局重构中快速迭代至 2280 行。文件内含 6 大职责域通过 72 个 provide() 调用桥接到 8 个 panel wrapper 组件。Production chunk 1.2MB (gzip 389KB)，主要由 dockview-core (~400KB)、highlight.js、marked 贡献。

约束：
- Vue 3 Composition API + `<script setup>` 风格
- Dockview panel 注册要求 Options API `export default { components }` 块
- Panel 组件通过 inject 获取父级 provide 的状态和 handlers
- 现有 4 个子面板组件（ChatPanel、RightPanel、ConnectionsPanel、BottomPanel）不在本次重构范围

## 方案概览

1. **Composable 拆分（6 个文件）**
   - `frontend/src/composables/useConnections.ts`
     - 封装 connectionPool、activeConnectionId、connectionTokens、connected、newConnectionModal、connectionContextMenu 等状态
     - 封装 handleNewConnection、handleCreateConnection、handleSelectConnection、fetchConnectionsForAnchor、refreshConnections 等 ~15 个函数
     - 接收参数：route、router、workspacesStore、configsStore、selectionStore、pushNotification
     - 返回所有状态 refs + handler 函数的对象
   - `frontend/src/composables/useSessions.ts`
     - 封装 sessionId、sessions、sessionWorking、sessionError、sessionShared、sessionShareUrl、sessionActionWorking、sessionActionStatus、sessionManager 等状态
     - 封装 handleSessionSelection、handleCreateSession、loadSessionsForConnection、runSessionAction、handleForkSession 等 ~15 个函数
     - 接收参数：activeConnectionId、getTokenForConnection、apiFetchForConnection、pushNotification
     - 内部管理 normalizeSessionsPayload、extractSessionId、bindSessionToConnection 等工具函数
   - `frontend/src/composables/useChat.ts`
     - 封装 messages、messagesHasOlder、messagesLoadingOlder、messagePollTimer 等状态
     - 封装 handleSendPrompt、handleAbort、refreshMessages、loadOlderMessages、startMessagePolling、stopMessagePolling 等 ~8 个函数
     - 接收参数：activeConnectionId、sessionId、getTokenForConnection、apiFetchForConnection、resolveExecutionConnectionId、capabilities、pushNotification
     - 在 onUnmounted 中自动清理 pollTimer
   - `frontend/src/composables/useComposerMetadata.ts`
     - 封装 agentOptions、modelOptions、commandOptions、capabilities 等状态
     - 封装 refreshComposerMetadata 及 normalizeCommandOptions、normalizeAgentOptions、normalizeModelOptions 等规范化函数
     - 接收参数：apiFetchForConnection
   - `frontend/src/composables/useDockviewLayout.ts`
     - 封装 dockApi ref
     - 封装 saveLayout、restoreLayout、createDefaultLayout、onReady
     - 使用常量 LAYOUT_STORAGE_KEY = 'session-dockview-layout-v3'
     - 纯函数式，不依赖其他 composable
   - `frontend/src/composables/useNotifications.ts`
     - 封装 notifications ref 和 pushNotification 函数
     - 支持 setTimeout 自动过期移除

2. **Composable 依赖图**
   - useNotifications ← 无依赖（最底层）
   - useDockviewLayout ← 无依赖
   - useConnections ← useNotifications.pushNotification
   - useComposerMetadata ← useConnections.apiFetchForConnection
   - useSessions ← useConnections.{activeConnectionId, getTokenForConnection, apiFetchForConnection}, useNotifications.pushNotification
   - useChat ← useConnections.{activeConnectionId, getTokenForConnection, apiFetchForConnection, resolveExecutionConnectionId}, useSessions.sessionId, useComposerMetadata.capabilities, useNotifications.pushNotification

3. **SessionDockview.vue 重写为组合层**
   - `<script setup>` 仅做：import composables → 调用 → 解构返回值 → provide() → 少量胶水逻辑（loadWorkspaceData、watchers）
   - provide() 调用保留在页面组件中，composable 不自行 provide
   - UI stub handlers（15 个 console.log 占位）保留在页面组件中或移入独立 `useRightPanelStubs.ts`

4. **通用 Panel Wrapper 工厂**
   - 新增 `frontend/src/composables/panel-wrapper-factory.ts`
   - 导出 `createPanelWrapper(component, injectMap)` 函数
     - `injectMap`: `Record<string, string>` — key 为 inject key，value 为传给子组件的 prop name
     - 返回一个 Vue Options API 组件定义对象，包含 inject + render 函数
   - 8 个 wrapper 改为：`const ConnectionsPanelWrapper = createPanelWrapper(ConnectionsPanel, { connections: 'connections', ... })`
   - Options API `export default { components }` 块缩减至 ~20 行

5. **Dynamic Import 懒加载**
   - `frontend/src/router.ts`：SessionDockview 路由已使用 `() => import('../pages/SessionDockview.vue')`（确认现状）
   - `ChatPanel.vue`：highlight.js 和 marked 改为 dynamic import，在首次渲染 markdown 时按需加载
   - Vite 自动对 dynamic import 做 code splitting，dockview-vue 作为 SessionDockview 的依赖会自然拆分到独立 chunk
   - 如需进一步控制，在 `vite.config.ts` 添加 manualChunks 将 dockview-core 独立

## 影响范围与修改点（Impact）

- 新增文件（7 个）：
  - `frontend/src/composables/useConnections.ts`
  - `frontend/src/composables/useSessions.ts`
  - `frontend/src/composables/useChat.ts`
  - `frontend/src/composables/useComposerMetadata.ts`
  - `frontend/src/composables/useDockviewLayout.ts`
  - `frontend/src/composables/useNotifications.ts`
  - `frontend/src/composables/panel-wrapper-factory.ts`
- 重写文件（1 个）：
  - `frontend/src/pages/SessionDockview.vue` — 从 2280 行重写为 ≤400 行组合层
- 修改文件（1-2 个）：
  - `frontend/src/components/panels/ChatPanel.vue` — highlight.js/marked 改为 dynamic import
  - `frontend/src/router.ts` — 确认 SessionDockview 已为 lazy route（可能无需改动）

## 决策

- **决策：composable 不自行 provide，由页面组件统一 provide**
  - 理由：provide 是组件树层级概念，composable 是逻辑复用概念。混合会导致 provide 调用分散在多个文件中，难以追踪。页面组件作为唯一 provide 源，清晰可控。
  - 备选方案：composable 内部 provide → 拒绝，因为 provide 必须在 setup 上下文中调用，且分散后难以维护。

- **决策：使用通用工厂函数替代手写 wrapper**
  - 理由：8 个 wrapper 的模式完全一致（inject → props），手写导致 236 行重复代码。工厂函数将模式抽象为 ~30 行。
  - 备选方案：保持手写 → 拒绝，因为每次新增 provide key 都需要同步修改所有相关 wrapper。

- **决策：highlight.js/marked 在 ChatPanel 中 dynamic import**
  - 理由：这两个库仅在渲染 markdown 消息时使用，不应阻塞首屏。ChatPanel 是使用方，应由它负责按需加载。
  - 备选方案：在 composable 中 dynamic import → 拒绝，因为 markdown 渲染是 UI 层关注点。

## 风险 / 权衡

- **Dockview panel 注册仍需 Options API** → 通用工厂函数返回 Options API 组件定义，这是 dockview-vue 的硬性要求，无法完全消除
- **Composable 间循环依赖风险** → 依赖图设计为单向 DAG（通知→连接→会话/元数据→聊天），严格禁止反向依赖
- **Dynamic import 增加首次交互延迟** → dockview 在路由切换时加载，用户感知为正常页面切换延迟；highlight.js 在首条消息渲染时加载，可用 loading placeholder 缓解
- **provide key 字符串散落** → 本次不做 InjectionKey<T> 改造，留作后续 track

## 待解决问题

- ChatPanel.vue 中 highlight.js 的 dynamic import 是否需要 loading 状态占位？（实现时决定）
- UI stub handlers（15 个）是否值得单独抽为 composable？（实现时根据行数决定）

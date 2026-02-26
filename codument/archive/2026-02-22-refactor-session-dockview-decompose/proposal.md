# 变更：SessionDockview 组件拆分与 Chunk Size 优化

## 背景和动机 (Context And Why)

SessionDockview.vue 在 Dockview 布局重构中快速迭代，积累为 2280 行单体文件，包含 6 大职责域、72 个 provide() 调用、236 行 Options API wrapper 样板代码。Production JS chunk 达 1.2MB (gzip 389KB)，超出 Vite 500KB 警告阈值。单体文件导致：开发时认知负担高、AI 辅助编辑时上下文窗口浪费、无法按需加载重依赖（dockview-core、highlight.js、marked）。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 按职责域拆分为 6 个 Vue composables（useConnections、useSessions、useChat、useComposerMetadata、useDockviewLayout、useNotifications）
- 用通用 createPanelWrapper 工厂函数替代 8 个手写 panel wrapper，消除 Options API 样板
- 通过 dynamic import 懒加载 dockview-vue、highlight.js、marked，将首屏 chunk 降至 500KB 以下
- SessionDockview.vue 从 2280 行降至 ≤400 行

**非目标:**
- 不改变任何用户可见行为（纯等价重构）
- 不实现右侧面板 UI stubs 的实际功能
- 不做 provide/inject key 的 InjectionKey<T> 类型化改造
- 不重构 CSS 样式
- 不改变子面板组件（ChatPanel、RightPanel、ConnectionsPanel、BottomPanel）

## 变更内容（What Changes）

- 新增 `frontend/src/composables/useConnections.ts` — 连接管理 state + handlers (~380 行)
- 新增 `frontend/src/composables/useSessions.ts` — 会话管理 state + handlers (~400 行)
- 新增 `frontend/src/composables/useChat.ts` — 聊天消息 state + handlers (~340 行)
- 新增 `frontend/src/composables/useComposerMetadata.ts` — agents/models/commands 获取与规范化 (~149 行)
- 新增 `frontend/src/composables/useDockviewLayout.ts` — 布局持久化与默认布局 (~124 行)
- 新增 `frontend/src/composables/useNotifications.ts` — 通知列表与自动过期 (~9 行)
- 新增 `frontend/src/composables/panel-wrapper-factory.ts` — 通用 panel wrapper 工厂函数
- 修改 `frontend/src/pages/SessionDockview.vue` — 重写为 composable 组合层（≤400 行）
- 修改 `frontend/src/router.ts` — SessionDockview 路由改为 dynamic import
- 修改 `frontend/vite.config.ts` — 可能调整 manualChunks（如需要）

## 影响范围（Impact）

- 受影响的功能规范：无（纯重构，行为不变）
- 受影响的代码：`frontend/src/pages/SessionDockview.vue`、`frontend/src/router.ts`、可能 `frontend/vite.config.ts`
- 新增文件：7 个 composable/工厂文件

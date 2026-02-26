# Spec: SessionDockview 组件拆分与 Chunk 优化

## Overview

SessionDockview.vue 当前为 2280 行单体文件，包含连接管理、会话管理、聊天消息、Composer 元数据、Dockview 布局、通知等 6 大职责域，72 个 provide() 调用，236 行 Options API panel wrapper 代码。Production JS chunk 为 1.2MB (gzip 389KB)。

本 Track 目标：
- 按职责域拆分为独立 Vue composables，每个 composable 封装自己的 state + handlers
- 用通用工厂函数替代 8 个手写 panel wrapper，消除 Options API 样板代码
- 通过 dynamic import 懒加载 dockview-core、highlight.js、marked 等重依赖，降低首屏 chunk size
- 重构为纯行为变更零的等价重构，所有现有功能保持不变

## ADDED Requirements

### Requirement: 系统 SHALL 将连接管理逻辑拆分为 useConnections composable

系统 SHALL 提供 `useConnections` composable，封装所有连接相关的响应式状态和处理函数。
composable SHALL 包含 connectionPool、activeConnectionId、connectionTokens、connected 等状态。
composable SHALL 包含 handleNewConnection、handleCreateConnection、handleSelectConnection、fetchConnectionsForAnchor、refreshConnections 等处理函数。
composable SHALL 接收必要的外部依赖（route、router、stores）作为参数或通过 composable 内部获取。

#### Scenario: useConnections composable 独立工作
- **GIVEN** SessionDockview 页面加载
- **WHEN** 页面初始化 useConnections composable
- **THEN** composable 返回所有连接相关的响应式状态和处理函数
- **AND** 返回值可直接用于 provide() 或模板绑定

### Requirement: 系统 SHALL 将会话管理逻辑拆分为 useSessions composable

系统 SHALL 提供 `useSessions` composable，封装所有会话相关的响应式状态和处理函数。
composable SHALL 包含 sessionId、sessions、sessionWorking、sessionError、sessionShared 等状态。
composable SHALL 包含 handleSessionSelection、handleCreateSession、loadSessionsForConnection、handleForkSession、handleShareSession 等处理函数。
composable SHALL 接收 activeConnectionId 和 token 获取函数作为依赖。

#### Scenario: useSessions composable 独立工作
- **GIVEN** 用户已选择一个连接
- **WHEN** useSessions 接收到 activeConnectionId
- **THEN** composable 自动加载该连接的会话列表
- **AND** 提供会话选择、创建、操作等完整功能

### Requirement: 系统 SHALL 将聊天消息逻辑拆分为 useChat composable

系统 SHALL 提供 `useChat` composable，封装所有消息相关的响应式状态和处理函数。
composable SHALL 包含 messages、messagesHasOlder、messagesLoadingOlder、messagePollTimer 等状态。
composable SHALL 包含 handleSendPrompt、handleAbort、refreshMessages、loadOlderMessages、startMessagePolling、stopMessagePolling 等处理函数。
composable SHALL 接收 activeConnectionId、sessionId、token 获取函数作为依赖。

#### Scenario: useChat composable 消息轮询
- **GIVEN** 用户已选择一个会话
- **WHEN** useChat 接收到有效的 sessionId
- **THEN** composable 自动开始消息轮询
- **AND** 在 sessionId 变化或组件卸载时自动停止旧轮询

### Requirement: 系统 SHALL 将 Composer 元数据逻辑拆分为 useComposerMetadata composable

系统 SHALL 提供 `useComposerMetadata` composable，封装 agents、models、commands 的获取和规范化逻辑。
composable SHALL 包含 agentOptions、modelOptions、commandOptions、capabilities 等状态。
composable SHALL 包含 refreshComposerMetadata 函数及所有 normalize 工具函数。

#### Scenario: useComposerMetadata 在连接激活时刷新
- **GIVEN** 用户选择了一个已就绪的连接
- **WHEN** activeConnectionId 变化且连接状态为 ready
- **THEN** composable 自动获取该连接的 agents、models、commands 数据
- **AND** 规范化后更新响应式状态

### Requirement: 系统 SHALL 将 Dockview 布局逻辑拆分为 useDockviewLayout composable

系统 SHALL 提供 `useDockviewLayout` composable，封装布局持久化和默认布局创建逻辑。
composable SHALL 包含 dockApi ref、saveLayout、restoreLayout、createDefaultLayout、onReady 等函数。
composable SHALL 使用 localStorage key `session-dockview-layout-v3` 进行布局持久化。

#### Scenario: useDockviewLayout 布局持久化
- **GIVEN** 用户调整了面板布局
- **WHEN** dockview 触发 onDidLayoutChange 事件
- **THEN** composable 自动将布局 JSON 保存到 localStorage
- **AND** 下次页面加载时从 localStorage 恢复布局

### Requirement: 系统 SHALL 将通知逻辑拆分为 useNotifications composable

系统 SHALL 提供 `useNotifications` composable，封装通知列表状态和 pushNotification 函数。
composable SHALL 支持自动过期移除通知。

#### Scenario: useNotifications 推送和自动过期
- **GIVEN** 系统需要显示一条通知
- **WHEN** 调用 pushNotification 函数
- **THEN** 通知添加到列表并在模板中显示
- **AND** 通知在指定时间后自动从列表中移除

### Requirement: 系统 SHALL 用通用工厂函数替代手写 panel wrapper 组件

系统 SHALL 提供 `createPanelWrapper(component, injectKeys)` 通用工厂函数。
工厂函数 SHALL 自动从 inject keys 获取值并作为 props 传递给目标组件。
系统 SHALL 使用该工厂函数生成所有 8 个 panel wrapper，消除 Options API 样板代码。
工厂函数 SHALL 定义在独立文件中（如 `panel-wrapper-factory.ts`）。

#### Scenario: 通用工厂生成的 wrapper 与手写 wrapper 行为一致
- **GIVEN** 使用 createPanelWrapper 生成 ConnectionsPanelWrapper
- **WHEN** Dockview 渲染该 wrapper 组件
- **THEN** wrapper 正确 inject 所有需要的值
- **AND** 将 inject 的值作为 props 传递给 ConnectionsPanel
- **AND** 行为与原手写 wrapper 完全一致

### Requirement: 系统 SHALL 通过 dynamic import 懒加载重依赖以优化 chunk size

系统 SHALL 对 dockview-vue/dockview-core 使用 dynamic import 进行懒加载。
系统 SHALL 对 highlight.js 和 marked 使用 dynamic import 进行懒加载。
SessionDockview 路由 SHALL 使用 route-level code splitting（`() => import(...)`）。
优化后主 chunk（不含懒加载部分）SHOULD 小于 500KB。

#### Scenario: 首屏加载不包含 dockview 和 highlight.js
- **GIVEN** 用户访问 Workspace 列表页（首页）
- **WHEN** 页面加载完成
- **THEN** dockview-core、highlight.js、marked 的代码不在首屏 JS bundle 中
- **AND** 仅在用户导航到任务详情页时按需加载

## Non-Functional Requirements

- 重构 SHALL 为纯等价重构，不改变任何用户可见行为
- 所有现有单元测试 SHALL 继续通过
- 所有现有 E2E 测试 SHALL 继续通过
- 每个 composable 文件 SHOULD 不超过 400 行
- SessionDockview.vue 重构后 SHOULD 不超过 400 行（仅含 composable 组合、provide 调用、模板、样式）
- TypeScript 类型安全 SHALL 保持不变，不引入 any 类型逃逸

## Acceptance Criteria

- SessionDockview.vue 从 2280 行降至 ≤400 行
- 6 个 composable 文件各自封装独立职责域
- 8 个 panel wrapper 由通用工厂函数生成，Options API 代码 ≤30 行
- Production JS chunk 中 SessionDockview 相关 chunk ≤500KB（或通过懒加载拆分后首屏不含 dockview）
- `bun run build` 通过
- `bun test`（前端 15/15、后端 83/83）全部通过
- 现有 E2E 测试通过

## Out of Scope

- 新增功能或改变现有行为
- 右侧面板 UI stub 的实际实现
- Terminal/Console 面板的实际实现
- CSS 样式重构
- provide/inject key 的类型化（InjectionKey<T>）改造（可作为后续 track）

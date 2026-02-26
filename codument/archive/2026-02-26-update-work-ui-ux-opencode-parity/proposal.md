# 变更：/work UI/UX 体验优化与 opencode Web 交互对齐

## 背景和动机 (Context And Why)

当前 /work 页面的交互体验与 opencode 官方 web 版存在较大差距：连接列表无状态分组、输入框缺少 slash command 和文件附加、Model 选择器使用原生 select、问题确认藏在右侧面板不够醒目、消息不显示时间戳和耗时。这些差距影响了用户的操作效率和体验流畅度。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 连接列表按业务状态（Idle/Waiting/Active/Other）分栏显示，使用 dockview Splitview
- 将状态标签从 Chat 上方迁移到连接条目上
- 底部 Terminal/Console 面板支持整体展开/收起（Toggle 按钮）
- Chat 工具栏紧凑化：Tools/Reasoning/Expand tools 收纳到 Dropdown Menu
- 输入框支持 "/" slash command 弹窗和 "+" 文件/图片附加
- Agent/Model 选择器移至输入框下方，Model 改为带搜索的弹窗选择
- Permission/Question 确认迁移到输入框上方 Dock 浮层（阻断输入）
- 消息显示创建时间和 turn 耗时（进行中消息每 15 秒刷新）
- 进行中连接显示处理时间计时
- Chat Tab 标题动态显示会话名称
- 底部状态栏显示连接上下文占用百分比
- 右侧面板 Tab 重排为 Todo → Context → Review → Files

**非目标:**
- 不重写 dockview 布局引擎或替换 dockview 库
- 不实现 opencode 的 contenteditable + inline pill 输入框（保持 textarea）
- 不实现 opencode 的 project/workspace 两级分组（保持连接级别）
- 不实现真实终端（xterm.js），底部面板仍为 placeholder
- 不修改后端 API 或 proxy 层

## 变更内容（What Changes）

- 新增 `ConnectionsSplitview.vue` — 按状态分栏的连接列表组件
- 修改 `ConnectionsPanel.vue` — 集成 Splitview，显示状态标签和处理时间
- 新增 `PermissionDock.vue` — 权限确认 Dock 浮层
- 新增 `QuestionDock.vue` — 问题确认 Dock 浮层（支持多问题分页）
- 新增 `ModelSelectorPopover.vue` — 带搜索的模型选择弹窗
- 新增 `SlashCommandPopover.vue` — "/" command 弹窗
- 新增 `FileAttachPopover.vue` — "+" 文件搜索/附加弹窗
- 新增 `SessionStatusBar.vue` — 底部状态栏（上下文占用等）
- 修改 `ChatPanel.vue` — 工具栏紧凑化、输入框交互升级、消息时间戳/耗时、Dock 浮层集成
- 修改 `useDockviewLayout.ts` — 底部面板 Toggle、右侧 Tab 重排
- 修改 `session-dockview-panels.ts` — 更新 inject map 适配新 provide

## 影响范围（Impact）

- 受影响的功能规范：Connections 面板、Chat 面板、Right 面板、Bottom 面板、Dockview 布局
- 受影响的文件/模块：
  - `frontend/src/components/panels/ConnectionsPanel.vue`
  - `frontend/src/components/panels/ChatPanel.vue`
  - `frontend/src/components/panels/RightPanel.vue`
  - `frontend/src/components/panels/BottomPanel.vue`
  - `frontend/src/composables/useDockviewLayout.ts`
  - `frontend/src/pages/SessionDockview.vue`
  - `frontend/src/pages/session-dockview-panels.ts`

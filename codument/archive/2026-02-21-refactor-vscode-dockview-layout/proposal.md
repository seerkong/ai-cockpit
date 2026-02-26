# 变更：VSCode 风格 Dockview 布局重构

## 背景和动机 (Context And Why)

当前前端使用固定的 CSS Grid 布局，SessionPage.vue 是一个 3700+ 行的单体组件，包含所有面板逻辑。用户无法自定义面板位置和大小，布局不够灵活。为了提供更好的用户体验和更专业的 IDE 风格界面，需要引入可拖拽、可调整大小的面板系统。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 引入 dockview 库实现可拖拽、可调整大小的面板系统
- 创建全局工具栏（顶部）和状态栏（底部），在所有页面始终可见
- 创建活动栏（左侧）作为主导航，切换不同页面
- 将 SessionPage.vue 拆分为独立的面板组件
- 实现布局持久化，用户调整后刷新页面保持布局
- 统一暗黑主题风格

**非目标:**
- 底部面板 Console/Terminal 的具体功能实现（仅占位）
- 左侧面板除 Connections 外的其他 tab
- 浮动面板（Floating panels）功能
- 多 workspace 同时打开的 tab 管理
- 面板最大化/最小化功能

## 变更内容（What Changes）

- **新增** `dockview-vue` 依赖
- **新增** 全局布局组件 `AppLayout.vue`，包含工具栏、活动栏、状态栏
- **新增** 任务详情页 dockview 容器组件 `SessionDockview.vue`
- **拆分** SessionPage.vue 为独立面板组件：
  - `ConnectionsPanel.vue` - 左侧连接管理
  - `ChatPanel.vue` - 中间对话区
  - `BottomPanel.vue` - 底部面板（Console/Terminal 占位）
  - `ReviewPanel.vue` - 右侧 Review tab
  - `ContextPanel.vue` - 右侧 Context tab
  - `FilesPanel.vue` - 右侧 Files tab
  - `TodoPanel.vue` - 右侧 TodoList tab
- **修改** App.vue 使用新的全局布局
- **修改** HomePage.vue 适配新布局结构
- **修改** styles.css 配合 dockview 暗黑主题
- **新增** 布局持久化逻辑（localStorage）

## 影响范围（Impact）

- 受影响的功能规范：无（功能不变，仅布局重构）
- 受影响的文件/模块：
  - `frontend/src/App.vue`
  - `frontend/src/pages/HomePage.vue`
  - `frontend/src/pages/SessionPage.vue`（将被拆分）
  - `frontend/src/styles.css`
  - `frontend/src/router.ts`
  - `frontend/package.json`（新增依赖）

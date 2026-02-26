# Design: VSCode 风格 Dockview 布局重构

## 上下文

当前前端架构：
- `App.vue` 仅渲染 `<RouterView />`
- `SessionPage.vue` 是 3700+ 行的单体组件，包含所有面板逻辑
- 使用 CSS Grid 固定布局：`grid-template-columns: 260px minmax(0, 1fr) 300px`
- 无组件目录，所有 UI 内联在页面组件中
- 状态管理使用 Pinia stores（workspaces, workspace-configs）

目标架构：
- VSCode 风格布局：工具栏 + 活动栏 + 主内容区 + 状态栏
- 任务详情页使用 dockview 实现可拖拽面板
- 组件化拆分，便于维护

## 方案概览

1. **全局布局层**
   - 创建 `AppLayout.vue` 作为全局布局容器
   - 使用 CSS Grid 实现固定区域：工具栏、活动栏、主内容区、状态栏
   - 活动栏使用 Vue Router 进行页面切换
   - 工具栏和状态栏暂时显示基础信息

2. **Dockview 集成**
   - 安装 `dockview-vue` 包
   - 创建 `SessionDockview.vue` 作为 dockview 容器
   - 使用 `markRaw()` 包装 DockviewApi 避免 Vue 响应式代理问题
   - 注册面板组件到 dockview

3. **面板组件拆分**
   - 从 SessionPage.vue 提取独立面板组件
   - 每个面板组件接收 `params: IDockviewPanelProps` prop
   - 使用 Pinia stores 共享状态
   - 使用 provide/inject 传递 workspace 上下文

4. **布局持久化**
   - 使用 dockview 的 `toJSON()` 序列化布局
   - 保存到 localStorage，key 为 `ai-cockpit.dockview-layout.v1`
   - 页面加载时使用 `fromJSON()` 恢复布局
   - 监听 `onDidLayoutChange` 自动保存

5. **主题适配**
   - 使用 dockview 内置暗黑主题（`dockview-theme-abyss`）
   - 调整全局 CSS 变量与 dockview 主题协调
   - 确保工具栏、活动栏、状态栏颜色一致

## 影响范围与修改点（Impact）

### 新增文件
```
frontend/src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.vue          # 全局布局容器
│   │   ├── AppToolbar.vue         # 顶部工具栏
│   │   ├── AppActivityBar.vue     # 左侧活动栏
│   │   └── AppStatusBar.vue       # 底部状态栏
│   └── panels/
│       ├── ConnectionsPanel.vue   # 左侧连接面板
│       ├── ChatPanel.vue          # 中间对话面板
│       ├── BottomPanel.vue        # 底部面板容器
│       ├── ReviewPanel.vue        # 右侧 Review tab
│       ├── ContextPanel.vue       # 右侧 Context tab
│       ├── FilesPanel.vue         # 右侧 Files tab
│       └── TodoPanel.vue          # 右侧 TodoList tab
├── pages/
│   └── SessionDockview.vue        # dockview 容器页面
└── lib/
    └── dockview-layout.ts         # 布局持久化工具
```

### 修改文件
- `frontend/package.json` - 添加 `dockview-vue` 依赖
- `frontend/src/App.vue` - 使用 AppLayout 包装 RouterView
- `frontend/src/pages/HomePage.vue` - 适配新布局结构
- `frontend/src/pages/SessionPage.vue` - 重构为使用 SessionDockview
- `frontend/src/styles.css` - 添加 dockview 主题覆盖和新布局样式
- `frontend/src/router.ts` - 可能需要调整路由结构

## 决策

### 决策 1：全局布局不使用 dockview
- **决策**：工具栏、活动栏、状态栏使用固定 CSS 布局，仅主内容区使用 dockview
- **理由**：这些区域不需要拖拽调整，固定布局更简单可靠
- **备选方案**：整个页面使用 dockview 嵌套 - 复杂度高，不必要

### 决策 2：面板组件使用 Options API 风格
- **决策**：面板组件使用 `defineComponent` + Options API
- **理由**：dockview-vue 官方示例使用此风格，兼容性更好
- **备选方案**：使用 `<script setup>` - 官方无示例，可能有兼容问题

### 决策 3：状态管理保持 Pinia
- **决策**：继续使用 Pinia stores 管理共享状态
- **理由**：现有架构已使用 Pinia，无需改变
- **备选方案**：使用 provide/inject 全部传递 - 会导致 prop drilling

### 决策 4：布局持久化使用 localStorage
- **决策**：使用 localStorage 存储布局 JSON
- **理由**：简单可靠，无需后端支持
- **备选方案**：存储到后端 - 增加复杂度，暂不需要

## 风险 / 权衡

| 风险 | 缓解措施 |
|------|----------|
| SessionPage.vue 拆分可能引入 bug | 增量拆分，每个面板单独测试 |
| dockview Vue 3 集成问题 | 严格遵循官方示例，使用 `markRaw()` |
| 布局持久化版本兼容 | 使用版本化 key，布局加载失败时回退默认 |
| 性能影响（大量面板） | 使用 dockview 内置虚拟化，按需渲染 |

## 待解决问题

- [x] 确定工具栏具体显示内容 → 只显示一个 Help 菜单项（类似 VSCode 顶部菜单栏风格）
- [x] 确定状态栏具体显示内容 → 暂时只滚动显示当前选中 connection 对应 workspace 的完整路径
- [x] 确定活动栏图标设计 → 类似 VSCode 最左侧的图标设计风格，使用 SVG 图标
- [x] 确定 dockview 主题是否需要自定义调整 → 未来支持可选择，暂时默认使用暗黑风格

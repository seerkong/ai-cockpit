## 上下文

ai-cockpit /work 页面使用 dockview-vue 实现 IDE 风格布局。当前已完成 SessionDockview 组件拆分（composables 化），前端通过 proxy 后端与 opencode server 通信。本次变更聚焦 UI/UX 层面，不涉及后端改动。

技术栈：Vue 3 Composition API + dockview-vue + TypeScript + Vite。
参考实现：`E:\ai-dev\src\opencode\packages\app\src\pages\session\` (SolidJS)。
opencode API 文档：https://open-code.ai/zh/docs/server

## 方案概览

1. **连接列表状态分栏**
   - 在 `ConnectionsPanel.vue` 内部使用 dockview `SplitviewVue` 组件
   - 4 个垂直分栏：Idle / Waiting / Active / Other
   - 每个分栏是一个 collapsible pane，标题栏显示状态名 + 计数 badge
   - 连接状态映射逻辑：
     - `session.status === 'idle'` → Idle
     - `permission.updated` 或 `question` 待处理 → Waiting
     - `session.status === 'busy'` → Active
     - 其他（connecting/error） → Other
   - 选中连接切换分栏时：通过 watch 检测状态变化，保持 `activeConnectionId` 不变，自动展开目标分栏

2. **状态标签迁移**
   - 从 `ChatPanel.vue` 的 composer 区域移除 session status 显示
   - 在 `ConnectionsPanel.vue` 每个连接条目右侧添加 status badge（小型彩色标签）

3. **底部面板 Toggle**
   - 在 `useDockviewLayout.ts` 中新增 `toggleBottomPanel()` 方法
   - 利用 dockview API `panel.api.setSize({ height })` 实现收起（height=0）和展开（恢复记忆高度）
   - 在 `BottomPanel.vue` 标题栏添加 chevron 图标按钮
   - 通过 provide/inject 传递 toggle 函数

4. **Chat 工具栏紧凑化**
   - 将 Tools / Reasoning / Expand tools checkbox 从独立行移入 Dropdown Menu
   - 工具栏右侧添加齿轮图标按钮，点击展开 Dropdown
   - 默认值：Tools=true, Reasoning=true, Expand tools=false
   - 状态存储在 `ChatPanel.vue` 的 reactive state 中

5. **Slash Command 弹窗**
   - 新增 `SlashCommandPopover.vue`
   - 监听 textarea 的 input 事件，检测 "/" 前缀
   - 弹窗定位在 textarea 上方（使用 CSS absolute positioning）
   - 数据源：已有的 `commandOptions` inject
   - 键盘导航：↑↓ 选择，Enter 确认，Esc 关闭

6. **文件附加**
   - 新增 `FileAttachPopover.vue`
   - "+" 按钮在 textarea 左侧或下方
   - 点击弹出搜索框，调用 `/find/file?query=<q>` API
   - 选择后将文件路径作为 `{ type: 'file', url: path }` 添加到 pending attachments
   - 支持 paste 事件检测图片（`event.clipboardData.files`）
   - 支持 dragover/drop 事件处理文件拖拽
   - 附件预览区显示在输入框下方

7. **Agent/Model 选择器重构**
   - 新增 `ModelSelectorPopover.vue`
     - 触发器：当前 model label 按钮
     - 弹窗内容：搜索框 + 按 provider 分组的模型列表
     - 保持当前 `modelOptions` 的分组和显示名逻辑
   - Agent 选择器改为小型 pill 按钮，点击弹出列表
   - 两者位置移至 textarea 下方一行

8. **Permission/Question Dock 浮层**
   - 新增 `PermissionDock.vue`
     - 显示在 composer 区域上方
     - 内容：权限类型 icon + title + pattern + Deny/AllowOnce/AllowAlways 按钮
     - 显示时 textarea 添加 `pointer-events: none; opacity: 0.5` 阻断输入
   - 新增 `QuestionDock.vue`
     - 单问题：radio/checkbox 选项 + 自定义输入 + Reply/Reject
     - 多问题：progress segments 导航 + Back/Next/Submit
     - 参考 `E:\ai-dev\src\opencode\packages\app\src\pages\session\session-question-dock.tsx`

9. **消息时间戳与耗时**
   - 修改 `ChatPanel.vue` 消息渲染区域
   - 每条消息 meta 区添加 `time.created` 格式化显示
   - Assistant 消息添加 turn duration 计算（`time.completed - userMessage.time.created`）
   - 进行中消息：使用 `setInterval(15000)` 刷新耗时显示

10. **进行中连接处理时间**
    - 在 Active 分栏的连接条目上显示 "Processing: Xs"
    - 记录每个连接进入 Active 状态的时间戳
    - 使用 `setInterval(15000)` 刷新

11. **对话标题栏与更多操作**
    - Chat Tab 标题保持 "Chat" 不变
    - 在 `ChatPanel.vue` 对话消息区域顶部新增独占一行的标题栏组件
    - 标题栏左侧显示会话标题（截断 + hover tooltip）
    - 标题栏右侧添加"更多"按钮（⋯ 图标），点击弹出 Dropdown Menu
    - Menu 包含：Fork / Share / Unshare / Summarize / Revert / Unrevert 等操作（从原工具栏迁移）
    - 需要 provide session title ref

12. **上下文占用显示**
    - 新增 `SessionStatusBar.vue`
    - 从最新 assistant 消息的 `tokens` 字段计算占用百分比
    - 需要 model 的 `limit.context` 信息（从 `/provider` API 或 modelOptions 获取）
    - 显示格式：`Context: XX%`，hover tooltip 显示详细 tokens

13. **右侧 Tab 重排**
    - 修改 `useDockviewLayout.ts` 的 `createDefaultLayout()`
    - 调整 addPanel 顺序：right-todo → right-context → right-review → right-files

## 影响范围与修改点（Impact）

- `frontend/src/components/panels/ConnectionsPanel.vue` — 重写为 Splitview 分栏
- `frontend/src/components/panels/ChatPanel.vue` — 工具栏、输入框、消息渲染、Dock 浮层
- `frontend/src/components/panels/BottomPanel.vue` — Toggle 按钮
- `frontend/src/composables/useDockviewLayout.ts` — Tab 标题、底部 Toggle、Tab 重排
- `frontend/src/pages/SessionDockview.vue` — provide 新状态（session title、toggle fn、attachments）
- `frontend/src/pages/session-dockview-panels.ts` — inject map 更新
- 新增 6 个组件文件

## 决策

- **决策：使用 dockview Splitview 实现连接分栏**
  - 理由：与现有 dockview 生态一致，原生支持拖拽调整高度
  - 替代方案：自定义 Accordion — 更灵活但引入额外复杂度

- **决策：Dock 浮层阻断输入而非右侧面板**
  - 理由：参考 opencode 的 UX 设计，确保用户必须先处理确认请求
  - 替代方案：右侧面板 + 通知提示 — 容易被忽略

- **决策：保持 textarea 而非 contenteditable**
  - 理由：contenteditable 的 inline pill 实现复杂度高，本次聚焦交互优化而非输入框重写
  - 替代方案：contenteditable + pill — 留作后续迭代

- **决策：Model 选择器使用 Popover 弹窗**
  - 理由：对齐 opencode 交互，搜索功能在模型多时必要
  - 替代方案：保持原生 select — 不支持搜索，体验差

## 风险 / 权衡

- **dockview Splitview 嵌套风险** → 需验证 Splitview 在 dockview panel 内部是否正常工作；如不行，回退到自定义 Accordion
- **文件上传后端支持** → 当前 proxy 可能不支持 multipart file upload；需要验证 `/session/:id/message` 的 file part 是否通过 URL 引用而非上传二进制
- **消息 time 字段可用性** → 需确认当前 proxy 是否透传 `time.created` 和 `time.completed`；如缺失需在 proxy 层补充
- **上下文占用计算** → 需要 model context limit 信息，可能需要新增 `/provider` API 调用或从 modelOptions 扩展

## 待解决问题

- [ ] 确认 dockview `SplitviewVue` 是否可嵌套在 panel 内部使用
- [ ] 确认 proxy 层是否透传消息的 `time` 字段
- [ ] 确认 file part 的 `url` 字段是否支持本地文件路径引用
- [ ] 确认 model context limit 信息的获取方式

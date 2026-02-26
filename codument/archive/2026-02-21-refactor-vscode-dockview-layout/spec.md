# Spec: VSCode-style Dockview Layout Refactor

## Overview

本 Track 目标是将前端重构为 VSCode 风格布局，使用 dockview 库实现可拖拽、可调整大小的面板系统。

关键目标：
- 引入全局系统工具栏（顶部）和状态栏（底部），在所有页面始终显示
- 左侧活动栏（Activity Bar）作为路由导航，切换 Workspace 列表页和任务详情页
- 任务详情页使用 dockview 实现灵活的面板布局
- 支持布局持久化，用户调整面板后刷新页面保持布局

## Functional Requirements

### Requirement: 系统 SHALL 提供全局工具栏和状态栏

系统 SHALL 在页面最顶部显示系统工具栏，无论切换什么页面始终可见。
系统 SHALL 在页面最底部显示状态栏，无论切换什么页面始终可见。
工具栏和状态栏 SHALL 不属于 dockview 管理范围，使用固定布局。

#### Scenario: 工具栏和状态栏在页面切换时保持可见
- **GIVEN** 用户在任意页面
- **WHEN** 用户通过活动栏切换到另一个页面
- **THEN** 顶部工具栏和底部状态栏保持可见
- **AND** 仅中间内容区域发生变化

### Requirement: 系统 SHALL 提供活动栏作为主导航

系统 SHALL 在页面左侧显示活动栏（Activity Bar），包含大图标按钮。
活动栏 SHALL 包含至少两个导航项：Workspace 列表、任务详情。
点击活动栏按钮 SHALL 触发 Vue Router 路由切换。
活动栏 SHALL 不属于 dockview 管理范围，使用固定布局。

#### Scenario: 通过活动栏切换到 Workspace 列表页
- **GIVEN** 用户在任务详情页
- **WHEN** 用户点击活动栏的 Workspace 图标
- **THEN** 路由切换到 Workspace 列表页（首页）
- **AND** 活动栏高亮当前选中的图标

#### Scenario: 通过活动栏切换到任务详情页
- **GIVEN** 用户在 Workspace 列表页
- **WHEN** 用户点击活动栏的任务详情图标
- **THEN** 路由切换到任务详情页
- **AND** 活动栏高亮当前选中的图标

### Requirement: Workspace 列表页 SHALL 保持简单布局

Workspace 列表页（首页）SHALL 不使用 dockview，保持当前简单列表形式。
该页面 SHALL 显示在活动栏右侧的主内容区域。

#### Scenario: Workspace 列表页布局
- **GIVEN** 用户在 Workspace 列表页
- **WHEN** 页面渲染完成
- **THEN** 显示 workspace 配置列表
- **AND** 不显示 dockview 面板系统

### Requirement: 任务详情页 SHALL 使用 dockview 实现面板布局

任务详情页 SHALL 使用 dockview 库实现可拖拽、可调整大小的面板系统。
dockview 区域 SHALL 位于活动栏右侧、工具栏下方、状态栏上方的主内容区域。

#### Scenario: 任务详情页 dockview 初始化
- **GIVEN** 用户导航到任务详情页
- **WHEN** 页面加载完成
- **THEN** dockview 面板系统初始化
- **AND** 显示默认面板布局

### Requirement: 任务详情页左侧 SHALL 显示 Connections 面板

任务详情页左侧区域 SHALL 是一个多 tab 布局的侧边栏。
第一个 tab SHALL 显示 Connections 列表（当前的连接管理功能）。
暂时只需要 Connections 一个 tab，但架构 SHALL 支持后续添加更多 tab。

#### Scenario: 左侧 Connections 面板显示
- **GIVEN** 用户在任务详情页
- **WHEN** 查看左侧面板
- **THEN** 显示 Connections tab
- **AND** tab 内容为连接列表和新建连接按钮

### Requirement: 任务详情页中间区 SHALL 上下分割显示对话和底部面板

中间区域 SHALL 上下分割为两部分。
上方 SHALL 显示对话历史和输入框（Chat 面板）。
下方 SHALL 预留底部面板区域，包含 Console 和 Terminal 两个 tab（暂时占位不实现具体功能）。

#### Scenario: 中间区域上下布局
- **GIVEN** 用户在任务详情页
- **WHEN** 查看中间区域
- **THEN** 上方显示 Chat 面板（对话历史和输入框）
- **AND** 下方显示底部面板区域

#### Scenario: 底部面板 tab 切换
- **GIVEN** 用户在任务详情页
- **WHEN** 用户点击底部面板的 Console 或 Terminal tab
- **THEN** 切换到对应的 tab 内容
- **AND** 暂时显示占位内容

### Requirement: 任务详情页右侧 SHALL 显示多 tab 面板

右侧区域 SHALL 是一个多 tab 布局的面板。
右侧面板 SHALL 包含当前详情页右侧的所有 tab：Review、Context、Files、TodoList。

#### Scenario: 右侧面板 tab 显示
- **GIVEN** 用户在任务详情页
- **WHEN** 查看右侧面板
- **THEN** 显示 Review、Context、Files、TodoList 四个 tab
- **AND** 可以点击切换 tab 内容

### Requirement: 系统 SHALL 支持面板拖拽和调整大小

用户 SHALL 能够拖拽面板到不同位置。
用户 SHALL 能够调整面板之间的分隔线来改变面板大小。
dockview SHALL 处理所有拖拽和调整大小的交互。

#### Scenario: 调整面板大小
- **GIVEN** 用户在任务详情页
- **WHEN** 用户拖拽面板之间的分隔线
- **THEN** 相邻面板的大小相应调整
- **AND** 面板内容自适应新尺寸

#### Scenario: 拖拽面板到新位置
- **GIVEN** 用户在任务详情页
- **WHEN** 用户拖拽某个面板的标题栏到另一个位置
- **THEN** 面板移动到新位置
- **AND** 其他面板自动调整布局

### Requirement: 系统 SHALL 持久化用户的布局调整

系统 SHALL 将用户的布局调整保存到 localStorage。
系统 SHALL 在页面刷新后恢复用户保存的布局。
如果没有保存的布局，系统 SHALL 使用默认布局。

#### Scenario: 布局自动保存
- **GIVEN** 用户调整了面板布局
- **WHEN** 布局发生变化
- **THEN** 系统自动将布局保存到 localStorage

#### Scenario: 布局恢复
- **GIVEN** 用户之前调整过布局
- **WHEN** 用户刷新页面或重新访问
- **THEN** 系统从 localStorage 恢复之前的布局
- **AND** 面板位置和大小与之前一致

#### Scenario: 默认布局回退
- **GIVEN** localStorage 中没有保存的布局
- **WHEN** 用户首次访问任务详情页
- **THEN** 系统使用默认布局初始化面板

## Non-Functional Requirements

- 面板拖拽和调整大小 SHOULD 流畅无卡顿
- dockview SHALL 使用暗黑主题（如 `dockview-theme-abyss` 或 `dockview-theme-dark`）
- 全局工具栏、状态栏、活动栏及所有原有组件 SHALL 配合 dockview 暗黑主题进行颜色搭配，保持视觉一致性
- 布局持久化 SHOULD 使用 dockview 的 `toJSON()`/`fromJSON()` API
- 组件拆分 SHOULD 遵循单一职责原则，便于维护

## Acceptance Criteria

- 全局工具栏和状态栏在所有页面始终可见
- 活动栏可以切换 Workspace 列表页和任务详情页
- Workspace 列表页保持简单布局，不使用 dockview
- 任务详情页使用 dockview 实现面板系统
- 左侧显示 Connections 面板（多 tab 架构，暂时只有一个 tab）
- 中间上方显示 Chat 面板，下方显示底部面板（Console/Terminal tab 占位）
- 右侧显示 Review/Context/Files/TodoList 四个 tab
- 面板可拖拽、可调整大小
- 布局调整后刷新页面能恢复

## Out of Scope

- 底部面板 Console/Terminal 的具体功能实现（仅占位）
- 左侧面板除 Connections 外的其他 tab
- 浮动面板（Floating panels）功能
- 多 workspace 同时打开的 tab 管理
- 面板最大化/最小化功能

# Spec: /work UI/UX

## Overview

This spec defines the UI/UX capabilities for the `/work` page, covering connection list layout, chat composer interactions, model/agent selection, permission/question docks, message metadata display, and panel organization. Aligned with opencode web interaction patterns.

## Requirements

### Requirement: 连接列表状态分栏显示

系统 SHALL 在左侧 Connections 面板中，使用 dockview 内置 Paneview 按业务状态将连接分为多个可展开/收起的分栏。

分栏顺序（从上到下）：
1. **Idle** — 空闲状态的连接
2. **Waiting** — 等待人工确认的连接
3. **Active** — 对话进行中的连接
4. **Other** — 其他状态

#### Scenario: 连接按状态自动归入对应分栏
- **GIVEN** 用户已建立多个连接，各连接处于不同业务状态
- **WHEN** 连接列表渲染
- **THEN** 每个连接自动归入对应状态分栏
- **AND** 每个分栏标题显示状态名称
- **AND** 分栏内容区域显示连接数量

#### Scenario: 选中连接切换分栏后保持选中
- **GIVEN** 用户已选中一个 Idle 状态的连接
- **WHEN** 用户发送消息，该连接状态变为 Active
- **THEN** 该连接从 Idle 分栏移至 Active 分栏
- **AND** 该连接保持选中状态
- **AND** Active 分栏自动展开

#### Scenario: 分栏可独立展开/收起
- **GIVEN** 连接列表显示多个分栏
- **WHEN** 用户点击某分栏标题
- **THEN** 该分栏在展开/收起之间切换

#### Scenario: 从顶部 Connection 菜单新建连接
- **GIVEN** 用户在 /work 页面
- **WHEN** 用户点击顶部菜单 Connection → New Connection
- **THEN** 打开 New Connection modal
- **AND** Connections 面板内不显示 New Connection 按钮

---

### Requirement: 连接状态标签迁移

系统 SHALL 将原本显示在 Chat 输入框上方的业务状态标签迁移到左侧 Connections 列表中每个连接条目上显示。

#### Scenario: 状态标签显示在连接条目
- **GIVEN** 用户查看 Connections 面板
- **WHEN** 连接列表渲染
- **THEN** 每个连接条目显示其当前业务状态标签
- **AND** Chat 输入框上方不再显示独立的状态行

---

### Requirement: 连接上下文占用百分比显示

系统 SHALL 在用户点击选中某个连接后，在底部状态栏显示该连接对应会话的上下文 token 占用百分比。

#### Scenario: 状态栏显示上下文占用
- **GIVEN** 用户选中一个已建立会话的连接
- **WHEN** 该连接的最新 assistant 消息包含 tokens 信息
- **THEN** 底部状态栏显示上下文占用百分比
- **AND** hover 时显示 tooltip 包含 input tokens、output tokens、cost

#### Scenario: 无 token 信息时显示占位
- **GIVEN** 用户选中一个尚无消息的连接
- **WHEN** 状态栏渲染
- **THEN** 显示 "Context: —" 占位文本

---

### Requirement: 进行中连接显示处理时间

系统 SHALL 在 Active 分栏中的每个连接条目上，显示从上一次发起/继续对话到当前的处理时间。

#### Scenario: 显示进行中的处理时间
- **GIVEN** 某连接处于 Active（进行中）状态
- **WHEN** 连接列表渲染
- **THEN** 该连接条目显示 "Processing: Xs" 或 "Processing: Xm Ys" 格式的计时
- **AND** 每 15 秒刷新一次显示

---

### Requirement: 对话标题栏与更多操作

系统 SHALL 在对话区域顶部新增独占一行的会话标题栏，标题栏右侧有"更多"按钮可展开操作菜单。

#### Scenario: 对话区域显示会话标题行
- **GIVEN** 用户已选中一个会话
- **WHEN** Chat 面板渲染
- **THEN** 对话消息区域顶部显示独占一行的会话标题
- **AND** 标题过长时截断并 hover 显示完整标题 tooltip

#### Scenario: 更多按钮展开操作菜单
- **GIVEN** 对话标题栏已显示
- **WHEN** 用户点击标题栏右侧的"更多"按钮
- **THEN** 弹出操作菜单，包含 Fork、Share、Summarize、Revert 等

#### Scenario: 无会话时标题栏显示占位
- **GIVEN** 用户未选中任何会话
- **WHEN** Chat 面板渲染
- **THEN** 标题栏显示 "No session selected"

---

### Requirement: 底部面板整体展开/收起

系统 SHALL 支持 /work 中间区域底部面板整体展开/收起。

#### Scenario: 点击 Toggle 按钮收起底部面板
- **GIVEN** 底部面板处于展开状态
- **WHEN** 用户点击底部面板标题栏的 Toggle 按钮
- **THEN** 底部面板收起
- **AND** 中间 Chat 区域自动扩展填充空间

#### Scenario: 点击 Toggle 按钮展开底部面板
- **GIVEN** 底部面板处于收起状态
- **WHEN** 用户点击 Toggle 按钮
- **THEN** 底部面板恢复到上次展开时的高度

---

### Requirement: Chat 工具栏紧凑化与展开配置

系统 SHALL 将 Chat 上方工具栏中的勾选项（Tools、Reasoning、Expand tools）收纳到工具栏右侧的配置按钮中，通过 Dropdown Menu 展开配置。

#### Scenario: 点击配置按钮展开选项
- **GIVEN** Chat 工具栏显示
- **WHEN** 用户点击工具栏右侧的配置图标
- **THEN** 弹出 Dropdown Menu，包含 Tools、Reasoning、Expand tools 三个 checkbox 选项
- **AND** Tools 和 Reasoning 默认勾选

#### Scenario: 切换选项立即生效
- **GIVEN** Dropdown Menu 已展开
- **WHEN** 用户切换某个 checkbox
- **THEN** 对话消息区域立即按新配置重新渲染

---

### Requirement: 输入框 Slash Command 弹窗

系统 SHALL 在 Chat 输入框中支持输入 "/" 后弹出可选择的 command 列表。

#### Scenario: 输入 "/" 触发 command 弹窗
- **GIVEN** 用户在 Chat 输入框中
- **WHEN** 用户输入 "/"
- **THEN** 在输入框上方弹出 command 列表弹窗
- **AND** 列表显示所有可用 command 的名称和描述

#### Scenario: 搜索过滤 command
- **GIVEN** command 弹窗已显示
- **WHEN** 用户继续输入字符
- **THEN** 列表实时过滤，仅显示匹配的 command

#### Scenario: 选择 command 填入输入框
- **GIVEN** command 弹窗已显示
- **WHEN** 用户点击或按 Enter 选择某个 command
- **THEN** 输入框内容替换为 "/<command_name> "
- **AND** 弹窗关闭

---

### Requirement: 输入框文件附加功能

系统 SHALL 在 Chat 输入框旁提供 "+" 按钮，支持选择添加文件和图片。

#### Scenario: 点击 "+" 按钮选择文件
- **GIVEN** 用户在 Chat 输入框旁
- **WHEN** 用户点击 "+" 按钮
- **THEN** 弹出文件搜索弹窗
- **AND** 用户可搜索并选择文件路径附加到消息

#### Scenario: 粘贴图片自动附加
- **GIVEN** 用户在 Chat 输入框中
- **WHEN** 用户粘贴剪贴板中的图片
- **THEN** 图片作为 file part 附加到待发送消息
- **AND** 输入框下方显示图片缩略图预览

#### Scenario: 拖拽文件到输入框
- **GIVEN** 用户在 /work 页面
- **WHEN** 用户将文件拖拽到 Chat 输入框区域
- **THEN** 文件作为附件添加到待发送消息

---

### Requirement: Agent/Model 选择器重构

系统 SHALL 将 Agent 和 Model 选择器从输入框上方移至输入框下方，并将 Model 选择器改为弹窗式交互（带搜索功能）。

#### Scenario: Model 选择器弹窗交互
- **GIVEN** 用户在 Chat 输入框下方看到当前 Model 标签
- **WHEN** 用户点击 Model 标签
- **THEN** 弹出 Model 选择弹窗
- **AND** 弹窗顶部有搜索输入框
- **AND** 模型按 provider 分组显示

#### Scenario: 搜索过滤模型
- **GIVEN** Model 选择弹窗已打开
- **WHEN** 用户在搜索框输入关键词
- **THEN** 模型列表实时过滤

#### Scenario: Agent 选择器位置
- **GIVEN** 用户在 Chat 输入框下方
- **WHEN** 输入框渲染
- **THEN** Agent 选择器显示在输入框下方，与 Model 选择器同行

---

### Requirement: 问题确认 Dock 浮层

系统 SHALL 将 Permission 和 Question 确认交互迁移到 Chat 输入框上方的 Dock 浮层中。

#### Scenario: Permission 请求显示为 Dock 浮层
- **GIVEN** 后端推送 permission.updated 事件
- **WHEN** 当前会话收到权限请求
- **THEN** 在 Chat 输入框上方显示 Dock 浮层
- **AND** 浮层显示权限类型、标题、pattern
- **AND** 提供 Deny / Allow Once / Allow Always 按钮
- **AND** 输入框被阻断，无法输入新消息

#### Scenario: 单问题确认
- **GIVEN** 后端推送 question 事件
- **WHEN** 当前会话收到单个问题
- **THEN** Dock 浮层显示问题内容
- **AND** 如果有选项，显示 radio/checkbox 选择
- **AND** 如果无选项，显示文本输入框
- **AND** 提供 Reply / Reject 按钮

#### Scenario: 多问题分页收集
- **GIVEN** 后端推送多个 question 事件
- **WHEN** 当前会话有多个待回答问题
- **THEN** Dock 浮层显示分页导航
- **AND** 提供 Back / Next / Submit 按钮

---

### Requirement: 消息时间戳与耗时显示

系统 SHALL 在对话历史中每条消息上显示创建时间和已消耗时间。

#### Scenario: 显示消息创建时间
- **GIVEN** 对话历史中有消息
- **WHEN** 消息渲染
- **THEN** 每条消息显示创建时间（格式：HH:mm）

#### Scenario: 显示已完成消息的耗时
- **GIVEN** assistant 消息已完成
- **WHEN** 消息渲染
- **THEN** 显示 turn 耗时（格式为 "Xs" 或 "Xm Ys"）

#### Scenario: 进行中消息动态刷新耗时
- **GIVEN** assistant 消息正在进行中
- **WHEN** 消息渲染
- **THEN** 显示从 user message created 到当前时间的耗时
- **AND** 每 15 秒刷新一次

---

### Requirement: 右侧面板 Tab 重排

系统 SHALL 将 /work 右侧面板的 Tab 顺序调整为：Todo → Context → Review → Files。

#### Scenario: Tab 按新顺序显示
- **GIVEN** 用户打开 /work 页面
- **WHEN** 右侧面板渲染
- **THEN** Tab 顺序为 Todo、Context、Review、Files（从左到右）

---

### Requirement: 连接列表渲染方式

原有的扁平连接列表 SHALL 改为按状态分栏的 Splitview 布局。

#### Scenario: 替代原有扁平列表
- **GIVEN** 用户打开 /work 页面
- **WHEN** Connections 面板渲染
- **THEN** 连接不再以扁平列表显示
- **AND** 改为按状态分栏的 Splitview 布局

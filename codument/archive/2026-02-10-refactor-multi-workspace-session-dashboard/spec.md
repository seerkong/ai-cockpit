# Spec: Multi-workspace Session Dashboard Refactor

## Overview

本 Track 目标是把当前以单 workspace/单 session URL 驱动的页面，升级为“多 workspace 快速切换 + 会话状态可观测 + 连接实例可管理”的工作台体验。

关键目标：
- 详情页左侧增加 workspace 列表，顶部显示当前打开 workspace 的 path。
- session 列表显示可执行状态（idle、running、等待审批、等待问题等）。
- 根页面改为 workspace path 配置管理（CRUD + 测试连接 + 跳转详情），不承担连接生命周期控制。
- 详情页 URL 不再包含 sessionId，并支持多连接实例（conn-1, conn-2...）与 session 绑定。

## Functional Requirements

### Requirement: Session 详情页 SHALL 提供 workspace 快速切换区和当前 path 展示
系统 SHALL 在 session 详情页左侧 session 列表左边新增 workspace 列表，用于快速切换当前焦点 workspace。
系统 SHALL 在详情页顶部展示当前焦点 workspace 的 path（directory）。

#### Scenario: 从详情页快速切换 workspace
- **GIVEN** 用户已进入详情页
- **AND** 已存在多个 workspace
- **WHEN** 用户在左侧 workspace 列表点击另一个 workspace
- **THEN** 页面焦点切换到目标 workspace
- **AND** 顶部 path 更新为目标 workspace 的 directory
- **AND** 中间 session 列表更新为目标 workspace 的 sessions

### Requirement: 详情页路由 SHALL 不包含 sessionId
系统 SHALL 使用不带 `:sessionId` 的详情路由。
系统 SHALL 在进入详情页时恢复该 workspace 上次会话；若不可用则回退到最新会话。

#### Scenario: 无 sessionId 路由刷新
- **GIVEN** 用户访问 `/workspaces/{workspaceId}/sessions`
- **WHEN** 页面初始化
- **THEN** 系统恢复该 workspace 最近一次选择的 session
- **AND** 若该 session 不存在或不可访问，则选择最新 session

#### Scenario: 兼容旧路由
- **GIVEN** 用户访问旧路由 `/workspaces/{workspaceId}/sessions/{sessionId}`
- **WHEN** 页面加载成功
- **THEN** 系统使用该 sessionId 初始化当前会话选择
- **AND** 浏览器地址被规范化为不含 sessionId 的新路由

### Requirement: Session 列表 SHALL 展示主状态并按优先级归并
系统 SHALL 在 session 列表中展示每个 session 的一个主状态标签。
状态优先级 SHALL 为：等待审批 > 等待问题 > running > retry > error > idle。

#### Scenario: 同时存在多个状态信号时的主状态决策
- **GIVEN** 某 session 同时处于 running
- **AND** 该 session 存在待审批请求
- **WHEN** 系统计算 session 主状态
- **THEN** 列表标签显示“等待审批”
- **AND** 不显示较低优先级标签为主状态

#### Scenario: 常规空闲状态展示
- **GIVEN** 某 session 无待审批、无待问题、无错误，且不在运行
- **WHEN** 渲染 session 列表项
- **THEN** 主状态显示为 idle

### Requirement: 根页面 SHALL 作为 workspace 配置管理页
根页面 SHALL 提供 workspace path 的增删改查。
根页面 SHALL 提供“测试连接”能力（验证路径在指定连接方式下是否可连通），但不建立持久连接。
根页面 SHALL 提供“打开详情”按钮进入详情页。
根页面 SHALL 不提供 disconnect 操作。

#### Scenario: 在根页面测试连接
- **GIVEN** 用户在根页面配置了 workspace path
- **WHEN** 用户点击测试连接
- **THEN** 系统返回连接可达/不可达结果与错误信息
- **AND** 不创建持久 workspace 连接记录

#### Scenario: 在根页面打开详情
- **GIVEN** 用户在根页面选中某个 workspace 配置
- **WHEN** 用户点击打开详情
- **THEN** 跳转到该 workspace 的详情页

### Requirement: 详情页 SHALL 管理 workspace 连接实例
详情页中的 workspace 项右键菜单 SHALL 提供连接与断开操作。
连接操作 SHALL 支持：创建新进程连接、连接已存在 OpenCode Server。
系统 SHALL 为同一 workspace 维护可区分的连接实例标识（如 conn-1、conn-2）。

#### Scenario: 在 workspace 项右键创建连接
- **GIVEN** 用户在详情页右键某个 workspace 项
- **WHEN** 用户选择连接并选择“新进程”或“已有服务”
- **THEN** 系统创建一个新的连接实例并分配连接标识（如 conn-1）
- **AND** 该连接显示在该 workspace 的连接池中

#### Scenario: 断开连接实例
- **GIVEN** 某 workspace 存在连接实例
- **WHEN** 用户在右键菜单选择断开
- **THEN** 目标连接实例被关闭并从活跃连接池移除

### Requirement: Session 与连接实例 SHALL 支持显式绑定
被激活执行的 session MUST 绑定一个连接实例。
session 列表项 SHALL 显示绑定连接标签（如 conn-2）。
系统 SHALL 支持在 session 列表中为会话绑定空闲连接，以及解除已有绑定。

#### Scenario: 使用空闲连接绑定 session
- **GIVEN** 当前 workspace 存在空闲连接实例
- **AND** 某 session 尚未绑定连接
- **WHEN** 用户在 session 项右键并选择一个空闲连接
- **THEN** 该 session 与所选连接建立绑定
- **AND** 列表项显示对应连接标签

#### Scenario: 解除 session 连接绑定
- **GIVEN** 某 session 已绑定连接实例
- **WHEN** 用户在 session 项右键选择“解除绑定”
- **THEN** 该 session 解除绑定
- **AND** 原连接实例回到空闲状态（若未断开）

#### Scenario: 激活 session 时强制绑定
- **GIVEN** 某 session 未绑定连接
- **WHEN** 用户触发会话执行动作（例如发送 prompt）
- **THEN** 系统阻止执行并提示先绑定连接

### Requirement: 系统 SHALL 支持同一 workspace 下多 session 并发运行
系统 SHALL 允许不同 session 绑定不同连接实例并同时处于运行状态。

#### Scenario: 多 session 并发
- **GIVEN** 同一 workspace 下存在 conn-1 与 conn-2
- **AND** session-A 绑定 conn-1，session-B 绑定 conn-2
- **WHEN** 用户分别触发 session-A 与 session-B 执行
- **THEN** 两个 session 可并发运行
- **AND** 各自状态与输出互不混淆

## Non-Functional Requirements

- 详情页在切换 workspace/session 时，状态更新 SHOULD 保持可感知实时性。
- 新路由方案 MUST 保持刷新可恢复，不因去除 sessionId 导致空白或错误页。
- 连接绑定和状态显示 MUST 避免误导（例如显示已断开连接仍可执行）。

## Acceptance Criteria

- 详情页左侧具备 workspace 列表，顶部可见当前 workspace path。
- 详情路由不包含 sessionId，刷新后按“恢复上次会话，失败回退最新会话”生效。
- session 列表主状态按优先级正确显示。
- 根页面完成 workspace path CRUD + 测试连接 + 打开详情，并移除 disconnect 操作。
- 详情页 workspace 右键可创建/断开连接，连接实例有可视化编号。
- session 可绑定/解绑连接，未绑定时不能激活执行。
- 同一 workspace 下可实现多 session 并发运行（不同连接实例）。

## Out of Scope

- 远程多机集群连接编排与调度。
- 跨浏览器/跨设备同步会话选择状态。
- 对 OpenCode 上游协议本身进行破坏性修改。

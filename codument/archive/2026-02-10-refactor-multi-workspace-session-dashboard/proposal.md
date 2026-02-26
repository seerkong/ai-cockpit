# 变更：多 Workspace 会话工作台重构

## 背景和动机 (Context And Why)
当前交互以单 workspace/单 session URL 为核心，导致详情页切换效率低、状态可观测性不足、连接能力分散在根页与详情页之间，无法满足多 workspace 并行与多 session 并发执行的操作需求。需要将体验升级为“配置与连接分离、连接实例显式管理、session 状态可快速决策”。

## “要做”和“不做” (Goals / Non-Goals)
**目标:**
- 在详情页提供 workspace 快速切换与当前 workspace path 展示。
- 去除详情页 URL 中 sessionId，采用“恢复上次会话，失败回退最新会话”。
- 在 session 列表展示主状态，并按优先级表达待处理任务（审批/问题/运行等）。
- 将根页面改为 workspace path 配置管理（CRUD + 测试连接 + 打开详情），不再承担 disconnect。
- 在详情页引入 workspace 连接实例池（conn-1、conn-2...）和 session-connection 绑定机制，支持同 workspace 多 session 并发运行。

**非目标:**
- 不实现跨设备同步会话选择状态。
- 不实现远程多机/集群级连接编排。
- 不改变 OpenCode 上游协议语义。
- 不在本 Track 引入新的后端分布式调度系统。

## 变更内容（What Changes）
- 路由与导航重构：详情页改为不含 sessionId 的路由，并兼容旧路由迁移。
- 详情页布局重构：新增 workspace 列表区（位于 session 列表左侧）与顶部 path 显示。
- session 状态模型增强：引入主状态优先级规则，统一展示 idle/running/retry/error/等待审批/等待问题。
- 根页职责调整：提供 workspace path 配置 CRUD、测试连接、打开详情；移除 disconnect 控件。
- 连接管理下沉详情页：workspace 右键菜单支持“连接（新进程/已有服务）”与“断开”；连接实例编号化。
- 会话绑定机制：session 项支持绑定/解绑空闲连接；未绑定连接禁止激活执行；绑定连接以标签显示。
- 并发执行能力：支持同 workspace 下多个 session 绑定不同连接并同时运行。

## 影响范围（Impact）
- 受影响的功能规范：
  - OpenCode 集成与 workspace 生命周期管理
  - Realtime WebSocket 会话状态与前端展示策略
  - 前端路由与工作台导航体验
- 受影响的代码域：
  - 前端路由定义与页面结构（Home/Workspace/Session）
  - 前端 workspace store 与 session 状态聚合逻辑
  - 后端 workspace 连接管理与连接实例抽象
  - 相关单元测试与 E2E 验证用例

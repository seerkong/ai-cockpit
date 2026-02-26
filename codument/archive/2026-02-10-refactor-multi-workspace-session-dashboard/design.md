## 上下文

本次变更同时涉及前端路由、页面布局、状态聚合、连接生命周期和会话执行约束：
- 现有详情页路由强绑定 `:sessionId`，不利于“单入口工作台”与多 workspace 快速切换。
- 根页面当前承担连接和断开操作，职责与“配置管理”目标不一致。
- session 列表缺少可行动状态聚合，用户无法快速识别待审批/待回答任务。
- 当前连接模型为 workspace 级“单连接语义”，不满足“同 workspace 多 session 并发运行”。

约束：
- 需要保持 WebSocket/SSE 回退链路与现有能力兼容。
- 不能依赖隐藏目录文档或外部 track 说明。
- 必须支持旧路由访问并平滑迁移。

## 方案概览

1. 路由与导航重构
  - 新增详情页规范路由：`/workspaces/:workspaceId/sessions`（不含 `sessionId`）。
  - 保留旧路由入口：`/workspaces/:workspaceId/sessions/:sessionId` 作为兼容入口。
    - 进入后将该 `sessionId` 写入当前选择态。
    - 完成初始化后 `replace` 到新路由。
  - 详情页采用“单焦点 workspace + 快速切换”模型，减少并列复杂布局。

2. 详情页三栏结构
  - 左栏：workspace 列表（支持右键连接/断开）。
  - 中栏：session 列表（显示主状态与连接标签）。
  - 右栏/主区域：当前 session 详情与对话流。
  - 顶部：显示当前焦点 workspace path。

3. 根页面职责重定义
  - 仅做 workspace path 配置管理（CRUD）。
  - 提供“测试连接”（spawn/port 两种方式）但不建立持久连接。
  - 提供“打开详情”按钮进入详情页。
  - 移除 disconnect 控件。

4. 连接实例池模型（workspace 维度）
  - 每个 workspace 维护连接实例集合：`conn-1`, `conn-2`, ...
  - 连接创建方式：
    - 创建新进程连接（spawn）
    - 连接已有 OpenCode server（port）
  - 连接状态：`idle` | `busy` | `error` | `closed`

5. 会话绑定模型（session 维度）
  - session 可绑定一个连接实例（`boundConnectionId`）。
  - session 列表项显示绑定标签（如 `conn-2`）。
  - 支持在 session 项右键绑定空闲连接 / 解绑连接。
  - 未绑定连接时，阻止激活执行（prompt/shell/command）。

6. session 主状态聚合器
  - 输入信号：
    - realtime session status（idle/busy/retry/error）
    - pending permissions
    - pending questions
  - 输出规则（单主状态）：
    - 等待审批 > 等待问题 > running > retry > error > idle

7. 并发执行策略
  - 同一 workspace 下，不同 session 绑定不同连接实例时可并发执行。
  - 执行链路按 `session -> connection` 路由，避免输出串扰。

## 影响范围与修改点（Impact）

- 前端路由层：会影响 route 定义与兼容跳转逻辑。
- 前端状态层：workspace store 与 session 视图状态需新增连接池与绑定状态。
- 前端交互层：
  - Home 页面改为配置管理
  - Session 页面重排布局，新增 workspace 列表和右键菜单
  - session 列表增加状态与连接标签
- 后端接口层：
  - 新增/扩展连接实例管理 API（创建、列举、断开、测试）
  - 会话执行 API 需要接受/解析绑定连接上下文
- Realtime 层：状态聚合数据输入需要完整覆盖 permission/question/session status。

## 决策

- 决策：采用“无 sessionId 规范路由 + 旧路由兼容入口”
  - 原因：满足新 URL 语义并降低迁移风险。

- 决策：采用“单焦点 workspace + 快速切换”，而非并列多工作区会话墙
  - 原因：信息密度与实现复杂度平衡更好，且符合当前页面结构演进路径。

- 决策：连接能力下沉详情页，根页面保留测试连接但不持久连接
  - 原因：分离“配置”与“运行时连接管理”职责。

- 决策：session 必须绑定连接后才可激活执行
  - 原因：显式资源约束，确保并发可控与可观测。

- 考虑的替代方案：
  - 方案 A：继续保留 `:sessionId` 路由
    - 放弃，因与需求冲突。
  - 方案 B：详情页并列展示多个 workspace session 列表
    - 放弃，首版复杂度高，易造成交互拥挤。
  - 方案 C：根页面保留 connect/disconnect
    - 放弃，职责不清，和新信息架构冲突。

## 风险 / 权衡

- 风险：去除 `sessionId` 后会降低“可分享到指定 session”的天然能力
  - 缓解：保留旧路由兼容入口，并在 UI 中明确当前策略为“恢复上次/回退最新”。

- 风险：连接池引入后端状态复杂度上升
  - 缓解：连接实例生命周期与 session 绑定生命周期分离，先实现最小状态机。

- 风险：并发执行可能导致错误归属
  - 缓解：执行请求强制携带 `sessionId + connectionId`，并在日志与事件中带双键。

- 风险：状态聚合优先级误判影响用户决策
  - 缓解：将优先级规则固化为纯函数并覆盖单测。

## 兼容性设计

- 路由兼容：保留旧路由并规范化跳转到新路由。
- API 兼容：现有单连接流程在无显式绑定时可保持受控回退（仅在兼容窗口内），并通过 UI 提示迁移。
- UI 兼容：旧入口按钮“Workspaces”可继续跳转根页，但根页行为改为配置管理。

## 迁移计划

1. 第一步：引入新路由与旧路由兼容跳转，不改变核心执行链路。
2. 第二步：上线详情页 workspace 列表与顶部 path，完成单焦点切换。
3. 第三步：上线 session 状态聚合展示（仅展示，不改执行）。
4. 第四步：上线连接实例池与 session 绑定能力，并将执行动作绑定化。
5. 第五步：根页改造为配置管理页，移除 disconnect，补齐测试连接能力。
6. 回滚策略：
  - 可按功能开关回退到旧详情布局和旧执行路径；
  - 保留旧路由解析能力直到验证稳定。

## 待解决问题

- 连接实例编号策略是否需要跨重启稳定（如持久化 conn 序号）。
- 当绑定连接异常断开时，session 状态应如何自动回退（保留绑定或自动解绑）。
- 测试连接的超时、重试和错误文案标准化策略。

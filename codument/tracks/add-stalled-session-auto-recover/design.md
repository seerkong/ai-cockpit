## 上下文

本变更需要跨越 UI（右侧面板设置）、会话运行状态（busy|retry）、消息进展判定（指纹变化）、以及会话控制动作（abort + 发送 prompt）。属于跨模块/跨切面变更，因此需要设计说明。

约束与前提：
- 本项目中每个 connection 同一时间只绑定一个 session（用户说明）。
- 进行中判定使用 session runtime status `busy|retry`。
- “无新消息”使用 message fingerprint 无变化判定。
- 当存在 permission/question/长工具/消息刷新失败等情况时，watchdog 必须暂停。
- UI 侧需要一个 Settings tab，把可控项统一收纳。

## 方案概览

1. Settings tab 与配置管理
  - 新增 RightPanel mode：`right-settings`。
  - Settings tab 内容包含：
    - `stalledAutoRecover.enabled`（默认 true）
    - `stalledAutoRecover.timeoutMinutes`（默认 5）
    - 迁移已有 `autoAcceptPermissions` 与 `codumentAutoRefreshEnabled`
  - 配置存储：采用前端可持久化的用户设置（localStorage 或等价 store），使刷新页面不会丢失默认启用状态。

2. Watchdog 检测逻辑（前端驱动）
  - 在活跃会话维度维护：
    - `lastActivityAtMs`
    - `lastFingerprint`
    - `lastAutoRecoverAtMs`（cooldown）
    - `attemptCountInWindow`
  - 指纹计算：从最新的 message/parts 提取稳定字段，示例：
    - lastMessageID
    - lastPartID
    - lastPartType
    - text length / tool status
  - lastActivity 更新条件：只有当 fingerprint 变化时更新，避免仅靠轮询导致误判。

3. Auto-recover 动作序列（安全）
  - 动作顺序：abort → wait idle/not busy（上限 60s）→ send prompt `请继续`。
  - before-act double check：到达阈值时强制执行一次消息刷新，确认 fingerprint 仍未变化再行动。
  - 暂停条件：
    - pending permission / pending question
    - long-running tool running
    - message refresh 失败/离线
  - 防循环：
    - cooldown（例如 10-15 分钟）
    - 每会话每窗口最大尝试次数（例如 1-2 次）

4. 可观测性
  - UI 显示：Toast 或在会话状态区域展示“Auto-recovered at HH:MM”。
  - （可选）在 RightPanel Settings 中展示最近一次自动恢复时间与次数。

## 影响范围与修改点（Impact）

- 受影响的文件/模块（预期，非穷举）：
  - `/work` 页面注入与右侧面板组织（SessionDockview / dockview panels map）
  - `RightPanel` 组件：新增 settings mode 与 UI
  - `useChat` / `useSessions`：消息刷新、abort、send prompt 与 watchdog 定时器
  - 可能新增：用户设置 store（持久化）

## 决策

- 决策：watchdog v1 采用前端驱动实现。
  - 原因：UI 具备上下文（permission/question 阻断、用户可见反馈），更容易避免误伤与循环。

- 考虑的替代方案：后端常驻 watchdog。
  - 理由：可在 UI 关闭时生效，但风险更高（可能在用户不知情时 abort 长任务），且需要更强的持久化策略与限流。

## 风险 / 权衡

- 风险：长工具运行时间超过 5 分钟会被误判卡住。
  - 缓解：检测 running tool 时暂停；并提供可调阈值。

- 风险：网络/轮询失败导致误判。
  - 缓解：刷新失败时暂停；触发前强制刷新确认。

- 风险：多标签页同时打开导致重复 abort/continue。
  - 缓解：前端 singleflight（按 workspaceId/sessionId 加锁）或用 localStorage 共享锁；必要时后端提供原子化“auto-recover”接口。

## 兼容性设计

- 新增 Settings tab 不应破坏现有右侧面板的 Todo/Context/Review/Files/Codument 内容；仅迁移开关位置并保持默认值语义一致。

## 迁移计划

1) 引入 Settings tab（并保留原开关的默认行为）。
2) 接入 watchdog 逻辑（默认开启，严格遵循暂停条件与防循环）。
3) 增加测试与回归验证。

回滚：
- 关闭默认启用或移除 watchdog 定时器逻辑，并保留 Settings tab（或回退到原 tab）。

## 待解决问题

- 如何在当前 /work 数据流中稳定获得 session status `busy|retry`（优先复用已有来源，避免引入第二套状态口径）。
- long-running tool 的判定规则：是否提供白名单（例如 `bash`/`task`）或仅基于 tool part status。

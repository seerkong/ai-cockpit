# ai-cockpit - 产品定义

## 产品愿景

ai-cockpit 是一个“AI 编码驾驶舱”（cockpit）：面向多个 OpenCode workspace 的运行监控与编排控制层。

它的核心价值是把“并行运行很多 workspace / worktree 的 AI 编码工作”变得可观测、可控、可自动化，并能持续降低冲突与人工介入成本。

## 目标用户

- 需要同时推进多个代码库/多个 worktree 的开发者（个人/小团队）
- 维护多条并行实现线（bugfix/feature/refactor）的工程负责人
- 需要把 OpenCode 与其他开发工具统一纳入控制面的用户

## 核心功能

- 多 workspace / 多 connection 管理：连接、状态聚合、会话列表、绑定关系
- 统一实时通道：SSE/WS 事件接入、状态归一、增量 UI 更新（JSON Patch）
- 运行监控与操作控制：查看运行中会话、触发/中止、权限/问题交互（阻断式 Dock）
- 事件持久化：将上游事件写入 SQLite，以支持断点恢复、审计与指标计算
- 对接生态：与 Codument（spec coding）和 OpenCode 插件（omo-slim-plus）协作，形成闭环

## 成功指标

持续优化的四个产品指标（KPI）：

1. 并发管理能力
   - 前期：固定最大并发（全局/按项目）
   - 后期：可根据 CPU/内存/AI token 额度动态调度
2. 自动化率
   - Step 级与 Run 级的自动化占比（需要明确事件口径）
3. 冲突检测准确率
   - 单项目拆多 worktree，每个 worktree 占用一个 connection 的协作模式下，尽早发现冲突风险并减少无效并行
4. 人工干预率
   - 降低审批/澄清/恢复/冲突解决等人工介入次数与等待时间

备注：指标定义、采集口径、以及当前基线数值记录在 `codument/kpi-baseline.md`。

---

*最后更新: 2026-03-01*

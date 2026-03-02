# 变更：会话卡住自动恢复（Abort + “请继续”）与右侧设置面板整合

## 背景和动机 (Context And Why)

在多 workspace/多连接并行运行时，偶发会出现“连接/会话一直显示进行中，但长时间没有任何新消息进展”的情况。此类卡住会显著降低并发效率并提升人工干预率。

本变更通过引入一个可配置的 watchdog，自动对卡住的会话执行 `abort` 并发送 `请继续`，使其尽可能自动恢复。同时将 `/work` 右侧面板中与运行控制相关的可勾选能力统一收纳到一个 Settings tab，提升可发现性与一致性。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 当会话处于 `busy|retry` 且超过阈值（默认 5 分钟）无消息进展时，自动执行 `abort`，等待 idle 后发送 `请继续`。
- 在 `/work` 右侧面板提供可勾选开关与可调整的阈值配置：默认勾选、默认 5 分钟。
- 增加安全暂停条件（permission/question/长工具/消息刷新失败）与防循环保护（cooldown / 最大尝试）。
- 将右侧面板中现有的可控开关（例如自动接受权限、Codument 自动刷新）统一到 Settings tab。

**非目标:**
- 不实现后端常驻的“无 UI 也能运行”的 watchdog（本次以 UI 驱动为主）。
- 不引入新的外部依赖或新的遥测系统。
- 不改变 OpenCode 上游协议语义。

## 变更内容（What Changes）

- 前端：
  - 新增右侧 Settings tab，并迁移/汇总右侧面板中现有运行控制相关的勾选项。
  - 新增“卡住自动恢复”配置项（enabled + timeout minutes）。
  - 在会话运行中启动 watchdog：当检测到无进展超过阈值且满足安全规则时，调用 abort 并在 idle 后发送 `请继续`。
- 后端：
  - 复用现有 session abort 与 prompt 发送能力（如需可增加轻量级的防重/单飞保护，但不作为必选项）。

## 影响范围（Impact）

- 受影响的功能规范：
  - `/work` UI/UX（右侧面板 tab 与运行控制项）
  - 会话运行状态判定与消息进展判定
- 受影响的代码模块（预期）：
  - `/work` 页面（SessionDockview 注入与状态管理）
  - RightPanel 设置渲染
  - Chat/Session 发送、abort 与消息刷新逻辑

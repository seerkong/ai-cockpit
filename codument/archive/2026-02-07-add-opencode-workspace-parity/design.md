## 上下文

本 Track 的目标是将 OpenCode 官方 Web 端 "workspace opened" 页面中除 Web Terminal 以外的能力移植到 `ai-cockpit`，并以交互/行为对齐（interaction parity）为主要验收门槛。

当前仓库状态（用于设计约束，而非规范来源）：
- 后端已使用 `Bun.serve()`，并存在 legacy 的 `/api/config` + `/api/opencode/*` 代理形态。
- 前端目前是单页 Vue 原型（`frontend/src/App.vue`），尚未形成 workspace shell 的可维护结构。

额外参考资料（本 Track 自包含）：
- Upstream 关键文件映射：`upstream-reference.md`
- Track-local cockpit API 合约摘要：`api-contract.md`
- Parity matrix：`parity-matrix.md`
- 手工 QA checklist：`manual-qa-checklist.md`

## 方案概览

1) 后端：稳定 cockpit API + provider adapter
- 继续使用 `Bun.serve()` 作为服务模型。
- 以 workspace 为边界管理多个 OpenCode 实例（workspace registry）。
- 为前端提供版本化 cockpit API（/api/v1/...），并在迁移期保留 legacy 端点。
- 通过 provider capabilities 对 UI/行为进行 gate（不支持则隐藏/禁用）。
- 事件（SSE）作为 store 更新触发；对高频事件进行合并/降噪（可服务端或客户端实现）。

2) 前端：从原型到 workspace shell
- 引入路由与状态管理，将原型拆分为：workspace 列表/连接页、workspace shell、session 页面。
- workspace shell 采用固定布局：sidebar + header 命令入口 + main chat + right panels（review/context）。
- 以 interaction parity 为优先：prompt input（@ agent、/ slash、abort、! shell-mode）、chat turn/parts 语义、review diff 交互与 context 检视能力。

3) 里程碑驱动 + parity 驱动交付
- 按 proposal 中 M1..M6 里程碑拆分实现，降低一次性移植的风险。
- parity matrix 作为“完成定义”的约束：每个 area 都有可验证的交互点。

## 影响范围与修改点（Impact）

- 后端：workspace registry / provider adapter / cockpit API / SSE relay / diffs & files 访问
- 前端：router + store + workspace shell 组件化、prompt input、chat timeline、review/context panels
- shared：消息/事件/权限等类型形状（OpenCode-like）

## 决策

- 决策：后端本 Track 保持 `Bun.serve()`。
  - 原因：减少变量，优先跑通 cockpit API 与 UI 对齐；Elysia 迁移另起 Track。

- 决策：验收门槛以 interaction parity 为主。
  - 原因：保证核心交互可用且稳定，视觉细节可后续迭代。

- 决策：多 workspace 管理纳入本 Track。
  - 原因：这是产品长期目标之一，并影响路由、状态组织与 API 设计。

- 决策：`@` 仅用于 agent 选择；不要求 `@` 选择 file。
  - 原因：降低 prompt input 的复杂度；文件上下文可以通过 review/context/file tools 等其他路径补齐。

- 决策：迁移期保留 legacy 端点。
  - 原因：减少中断与回归风险；允许前后端分步迁移。

## 风险 / 权衡

- 范围大且跨模块：需要严格按里程碑拆分与 gate，避免“一步到位”导致集成风险。
- SSE 与 UI 流式渲染：高频更新容易造成性能问题；需要事件合并/降噪与 UI 虚拟化/渲染优化（如有必要）。
- provider 能力差异：某些 session actions/permissions/inline comments 可能受上游 API 限制；需要 capability-gated 的产品策略。

## 兼容性设计

- 保持 `/api/config` 与 `/api/opencode/*` 可用；逐步迁移前端到 `/api/v1/...`。
- 认证支持 `Authorization: Bearer` 与 `x-proto-session`（后者作为迁移期兼容）。

## 迁移计划

1) M1：补齐 cockpit API + provider abstraction（workspace registry、关键 endpoint、SSE relay）。
2) M2：前端结构化（router/store + workspace shell layout）。
3) M3：chat + prompt input parity。
4) M4：review + context parity。
5) M5：session/workspace actions + permissions flow。
6) M6：QA + hardening（回归与手工 checklist）。

## 待解决问题

- Inline diff comments 是否需要持久化（后端存储）？还是仅作为 UI 辅助并可注入 prompt（客户端态）即可满足当前验收？
答：不需要后端持久化
- 多 workspace 的 token/连接信息是否需要持久化（例如 localStorage）以支持刷新恢复？
答：需要

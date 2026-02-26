# 变更：移植 OpenCode Workspace 页面（排除 Terminal）并实现交互对齐

## 背景和动机 (Context And Why)

`ai-cockpit` 目前具备连接 OpenCode server、管理 session、基础对话渲染与部分文件工具能力，但与 OpenCode 官方 Web 端在 workspace 打开后的核心交互（chat、prompt input、review、context、permissions 等）仍存在明显差距。

本变更的目标是把 OpenCode 官方 Web 端 "workspace opened" 页面中除 Web Terminal 以外的能力移植到 `ai-cockpit`，并保持对后续接入其他 headless AI coding server 的可扩展性（通过稳定的 cockpit API 与 adapter 层）。

## “要做”和“不做” (Goals / Non-Goals)

**目标:**
- 实现 OpenCode workspace-opened 页面交互/行为对齐（interaction parity），明确排除 terminal。
- 支持多 workspace 管理（connect/list/select/disconnect）。
- 建立/完善版本化 cockpit API（前端只依赖 `ai-cockpit` 后端），并在迁移期保持现有原型端点可用。
- 以里程碑方式交付（M1..M6），降低大范围移植风险。

**非目标:**
- 不在本 Track 内迁移后端框架到 Elysia（保持 `Bun.serve()`）。
- 不实现 Web Terminal UI 及 terminal 相关行为。
- 不要求通过 `@` 选择 file（`@` 仅用于 agent 选择）。
- 不追求像素级 UI 还原（可在后续 Track 以视觉对齐为目标继续迭代）。

## 变更内容（What Changes）

- 前端：从单页原型演进为可承载 workspace shell 的结构（含侧边栏、header 命令入口、主 chat、右侧 review/context 面板），并逐步补齐：
  - chat timeline 的 turn/parts 交互语义
  - prompt input（model/agent、`@` agent、`/` slash、history、attachments、abort、`!` shell-mode）
  - review panel（diff 列表、unified/split、expand/collapse、view file）
  - diff inline comments + 将选择内容加入 prompt context
  - context tab（usage/cost、system prompt、raw message viewer）
  - session actions（new/fork/share/unshare/undo/redo/revert/compact），按 capability 进行显示/禁用
  - permissions/questions flow（permission.asked UI + auto-accept toggle），按 capability 进行显示/禁用

- 后端：保持 `Bun.serve()`，完善 workspace registry 与 provider adapter，扩展版本化 cockpit API（/api/v1/...）以支撑上述 UI 行为，并在迁移期继续保留 legacy 行为（例如 /api/config 与 /api/opencode/*）。

- 质量与验证：维护本 Track 内的 parity matrix 与手工 QA checklist；对关键交互（prompt input、SSE 事件、diff 渲染、permissions）增加回归验证。

## 影响范围（Impact）

- 受影响的功能规范：新增/强化 `workspace-management`、`cockpit-api`、`workspace-shell-ui`、`chat-ui`、`review-diffs`、`permissions-flow` 等能力。
- 受影响的代码/模块（预期）：
  - 后端：`backend/src/index.ts`、`backend/src/workspace-registry.ts`、`backend/src/providers/*`、`backend/src/opencode-client.ts`（SSE/event）
  - 前端：`frontend/src/*`（从 `App.vue` 原型拆分为可维护结构）
  - 共享类型：`shared/*`（消息与事件形状、diff/permission/question 等）

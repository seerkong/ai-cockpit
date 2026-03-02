# ai-cockpit

## 项目概述

ai-cockpit 是一个用于“管理与编排 OpenCode（以及未来其他 headless AI coding server）”的驾驶舱项目。

当前仓库的核心实现重心：
- 以 workspace/connection 为管理单元，支持同一目录（directory）下多连接实例并发
- 统一 realtime 通道（WebSocket + JSON Patch，保留 SSE fallback）驱动前端增量渲染
- 通过 SQLite 持久化上游事件（full event log），为恢复与后续指标采集打基础

与本项目协作的相关项目（外部仓库）：
- `codument`：spec coding 工具（tracks/specs/plan.xml），用于定义与推进变更；适合提供“规范与计划”的结构化输入
- `omo-slim-plus`：OpenCode 插件（agents/tools/hooks），适合在数据平面提供更强的信号采集与控制能力

持续优化指标（KPI）见 `codument/product.md` 与 `codument/kpi-baseline.md`。

## 仓库结构

Monorepo（Bun workspaces）：
- `backend/`：后端（Elysia 承载），负责 workspace registry、代理 OpenCode、事件持久化、realtime WS
- `frontend/`：前端（Vue 3 + Vite + dockview），提供 /work 驾驶舱 UI
- `shared/`：共享类型与协议（realtime WS 消息、JSON Patch、数据模型）

后端关键包（高频触点）：
- `backend/packages/organ/`：workspace registry（多连接、session 绑定、目录级 status stream）
- `backend/packages/composer/`：realtime WS hub（上游 SSE -> 归一状态 -> JSON Patch）
- `backend/packages/core/`：SQLite 存储（workspaces + events full event log）
- `backend/packages/elysia-shell/`：后端入口与运行时装配

## 运行与开发

常用命令：
- `bun run dev`：并行启动后端与前端
- `bun run test`：backend + frontend + e2e

数据库：
- 默认路径由后端工作目录下的 `data.sqlite` 决定（可用 `AI_COCKPIT_DB_PATH` 覆盖）
- 当前 schema 主要包含 `workspaces` 与 `events`（full event log）


---

*最后更新: 2026-03-01*

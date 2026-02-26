# 变更：后端从 Bun.serve 重构为 Elysia 承载

## 背景和动机 (Context And Why)
当前后端以 Bun 内置 `serve` + 大量手工路由分支维护，HTTP、WebSocket、SSE 的入口与治理逻辑分散，维护成本和回归风险较高。
本次通过迁移到 Elysia，建立统一承载层并保持现有接口行为兼容，同时备份原实现用于功能核对，降低迁移不确定性。

## “要做”和“不做” (Goals / Non-Goals)
**目标:**
- 将后端入口改造为由 Elysia 统一承载 HTTP、WebSocket、SSE。
- 保持现有对外接口与核心协议行为严格兼容。
- 在代码目录保留原 Bun.serve 关键文件备份，用于逐项对照回归。
- 保持开发启动、测试和关键链路验证可运行。

**非目标:**
- 不新增业务能力或改变产品交互流程。
- 不重设计现有 API 契约与业务语义。
- 不进行与本次迁移无关的大规模代码风格重构。

## 变更内容（What Changes）
- 将后端主入口改造为 Elysia 应用实例，替代 Bun.serve 作为主承载。
- 将现有手工路由逻辑拆分迁移到 Elysia 路由定义，保持兼容行为。
- 迁移并接入 WebSocket 与 SSE 处理链路到 Elysia 承载路径。
- 新增迁移前 Bun.serve 相关文件备份目录与说明，支持功能缺失核对。
- 补齐迁移后的关键验证项（启动、核心后端测试、关键实时链路）。

## 影响范围（Impact）
- 受影响的功能规范：`opencode-integration`、`realtime-websocket`

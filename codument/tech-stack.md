# 技术栈

本文档定义了项目的技术选型和架构决策。

## 编程语言

| 语言 | 版本 | 用途 |
|------|------|------|
| TypeScript | ^5.x | 前后端与共享类型 |
| JavaScript | - | 少量工具/构建脚本 |

## 运行时

| 运行时 | 版本 | 用途 |
|--------|------|------|
| Bun | 1.3.6 | 后端运行时、包管理与测试 |

## 框架与库

### 后端

| 名称 | 版本 | 用途 |
|------|------|------|
| Elysia | ^1.4.25 | HTTP/WebSocket/SSE 承载层 |
| bun:sqlite | 内置 | SQLite 存储驱动（事件日志、workspace 记录） |

### 前端

| 名称 | 版本 | 用途 |
|------|------|------|
| Vue | ^3.5.27 | 前端 UI 框架 |
| Vue Router | ^4.5.1 | 路由（/work 等页面） |
| Pinia | ^3.0.3 | 状态管理 |
| Vite | ^7.3.1 | 构建与开发服务器 |
| dockview-vue / dockview-core | ^4.13.1 | Dockview 布局与面板系统 |
| marked | ^15.0.6 | Markdown 渲染 |
| highlight.js | ^11.11.1 | 代码高亮 |
| dompurify | ^3.0.11 | Markdown/HTML 消毒 |

### 测试

| 名称 | 版本 | 用途 |
|------|------|------|
| Bun Test | 内置 | 单元测试 |
| Playwright | ^1.58.0 | E2E/回归测试 |

## 数据库

| 类型 | 名称 | 用途 |
|------|------|------|
| SQLite | `data.sqlite` | 持久化 workspaces 与 full event log（events） |

## 开发工具

| 工具 | 用途 |
|------|------|
| concurrently | 并行启动前后端开发服务器 |
| patch-package | 前端依赖补丁（frontend/postinstall） |
| sqlite3 CLI | 本地查询/排障（开发辅助） |

## CI/CD

| 平台 | 用途 |
|------|------|
| - | - |

## 部署环境

| 环境 | 平台 | 用途 |
|------|------|------|
| 开发 | 本地 | 开发和测试 |
| 生产 | - | 生产部署 |

## 架构决策

- 后端对前端提供稳定的 cockpit API；通过 provider/adapter 对接 OpenCode（未来可扩展其他 headless server）。
- Realtime 通道优先使用 WebSocket + RFC 6902 JSON Patch（增量更新规范化状态树）；保留 SSE fallback。
- 事件持久化采用 SQLite full event log（source of truth），支持断点恢复与后续指标计算。


---

## 技术约束

1. **版本兼容性**：所有依赖必须支持指定的运行时版本
2. **安全更新**：依赖必须定期更新以修复安全漏洞
3. **许可证**：只使用与项目许可证兼容的依赖

## 技术债务

| ID | 描述 | 优先级 | 状态 |
|----|------|--------|------|
| TD-1 | 运行指标与 KPI 采集口径未固化（缺少可计算的 telemetry 事件） | 高 | OPEN |
| TD-2 | 并发调度器/预算控制缺失（目前主要是连接/绑定层） | 高 | OPEN |
| TD-3 | 多 worktree 冲突检测与 ground truth 评估链路缺失 | 高 | OPEN |

---
*最后更新: 2026-03-01*

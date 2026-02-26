# Shared 模块规则清单

## RULE-Shared-001: shared 是跨端契约唯一来源

前后端不得各自定义一份协议结构；任何协议字段变更必须先落在 `shared/index.ts`。

## RULE-Shared-002: 避免在 shared 引入运行时依赖

shared 应保持轻量、纯类型/纯数据结构，避免引入 Bun/DOM/Node 特有 API。

## RULE-Shared-003: 协议变更必须同步更新文档

协议字段或消息类型变更后，至少更新：

- `docs/ai/architecture/introduce/overview.md`
- `docs/ai/framework/example/typical-changes.md`

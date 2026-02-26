# AI 文档维护指南

本目录的目标是让 AI/新成员能在 5-10 分钟内找到关键入口，并且在做改动时不踩坑。

## 维护原则

1. 先探索后更新：文档内容必须基于真实代码与当前行为。
2. 保持简洁：每个文件聚焦一个主题，避免写成“项目大百科”。
3. 代码示例必须来自实际代码：尽量复制/摘取真实片段，并标注对应代码路径。

## RULE-DOC-001: index.md 仅作文件索引

每个 `index.md` 只能做导航索引（1-2 句描述 + 三列表格），不要写具体步骤/说明。

## RULE-DOC-002: 禁止引用不存在的文件

所有链接必须指向仓库内实际存在的文件。

## RULE-DOC-003: 统一三列表格

所有 `index.md` 的“文档列表”统一使用三列表格：`文档`、`说明`、`何时阅读`。

## RULE-DOC-004: 规则命名规范

规则使用 `RULE-<SCOPE>-<NUMBER>`：

- `ARCH`: 架构级规则
- `FE`: 前端规则
- `BE`: 后端规则
- `INFR`: 通用/基础设施规则
- `<ModuleName>`: 模块特定规则（例如 `Backend`、`Frontend`、`Shared`）

## 目录结构约定

- 目录 `constaint/` 为既定拼写（来自生成规范），不要擅自改名为 `constraint/`，避免链接失效。
- `architecture/`、`framework/`、`modules/<Module>/` 都采用同样的 6 个子目录：
  - `introduce/`：概念与背景
  - `howto/`：可执行步骤
  - `example/`：来自真实代码的例子
  - `constaint/`：规则与约束
  - `misc/`：补充与配置
  - `troubleshooting/`：常见问题与排查

## 更新检查清单

- 新增/删除文件后：同步更新对应目录的 `index.md` 表格。
- 修改对外协议（WS 消息、payload 字段、事件映射）后：同步更新 `architecture/` 与 `modules/Shared/`。
- 变更开发脚本/端口/环境变量后：同步更新 `framework/howto/` 与 `architecture/misc/`。

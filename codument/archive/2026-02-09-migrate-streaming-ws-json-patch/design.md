## 上下文

当前 `ai-cockpit` 的实时更新依赖 SSE（EventSource）：前端常驻连接读取服务端推送事件，并把 `message.part.updated` 的 `delta` 合并到 UI。

已知问题与动机：
- SSE 在当前实现中存在“观感不流式”的风险（例如服务端为降噪做了过度 coalescing，导致 patch/增量在 `session.idle` 才一次性 flush）。
- SSE 是单向通道。未来要做 A2UI/复杂卡片树/嵌套交互时，长期需要一个稳定的双向实时通道。
- `vibe-kanban` 的路径证明：使用 WebSocket 作为实时通道，并通过 JSON Patch 以增量方式更新状态树，能同时满足“可感知流式”和“扩展到复杂 UI 状态”的需求。

当前代码基线（用于判断迁移成本）：
- 后端以 `Bun.serve({ fetch })` 为主，暂无 WebSocket endpoint。
- 前端暂无 `WebSocket` 使用点；实时更新只走 EventSource。
- 依赖上游 OpenCode server 的 `/event` SSE 事件流；本地有 SQLite 用于事件持久化与消息分页。

## 方案概览

1) 传输层：Workspace-scoped WebSocket
- Endpoint：workspace 级别，例如 `/api/v1/workspaces/:workspaceId/stream/ws?token=...`。
- 一条连接可订阅多个 session（为后续多面板、多卡片并行流打基础）。

2) 协议层：Snapshot + JSON Patch
- 连接建立后，客户端发送 `subscribe`（选择当前 session 或多个 session）。
- 服务端先发 `snapshot`（包含该订阅范围内的 realtime state 初始视图）。
- 后续所有变化以 RFC 6902 `patch` 形式推送。
- 连接断开后客户端重连，重连成功后重新获取 `snapshot`（本 track 不要求 seq resume）。

3) 状态模型：规范化 realtime state tree
- Patch 的目标文档为一个规范化对象：用稳定 ID 做 key 的 map/dict（避免 JSON Patch 对数组 index 的脆弱性）。
- 该状态树至少覆盖：messages（含 parts）、sessions list、session status、permissions、questions。
- 预留 `ui` 子树作为未来 A2UI 卡片树/交互的挂载点（本 track 不实现卡片 schema）。

4) 上游桥接：OpenCode events -> state mutation -> patch
- 后端持续消费上游 OpenCode 事件（以及/或利用本地 SQLite 持久化），把事件映射为对 realtime state 的变更。
- 变更被编码为 JSON Patch ops 并推送到所有订阅对应 session 的 WS 客户端。

5) 回退与兼容：保留 SSE
- SSE `/events` 仍保留作为 fallback。
- 前端默认尝试 WS；失败后自动降级到 SSE，保证功能可用。

## 协议草案（Wire Schema）

### Client -> Server

- `subscribe`
  - `workspaceId`
  - `sessionIds: string[]`

- `unsubscribe`
  - `sessionIds: string[]`

（可选）未来扩展：
- `ui.action`：把卡片交互事件回传给 agent/后端
- `ping`/`pong`：一般由 WebSocket 层处理

### Server -> Client

- `snapshot`
  - `state: RealtimeState`

- `patch`
  - `ops: RFC6902Operation[]`
  - （可选）`seq: number`（仅用于同连接内顺序标识/调试；重连后可重置）

- `error`
  - `message: string`

## 关键决策

- 决策：使用 workspace-scoped WS + subscribe 模式。
  - 原因：减少连接数量、方便跨 session/面板复用，并为未来多卡片并行流铺路。

- 决策：Patch 目标为规范化状态树（而不是 rawMessages 数组）。
  - 原因：JSON Patch 对数组下标敏感；规范化结构更适合复杂嵌套交互与局部更新。

- 决策：重连采用 snapshot 恢复，不做 seq resume。
  - 原因：降低首次落地复杂度；SQLite/REST hydration 已能支持恢复一致性。

- 决策：保留 SSE fallback。
  - 原因：降低迁移上线风险；同时保留调试通道。

## 考虑过的替代方案

- 仅修复 SSE（例如调整 coalescing/flush 策略）
  - 优点：改动小
  - 缺点：仍是单向通道，不利于 A2UI/复杂交互扩展

- WebSocket + Typed Events（不用 JSON Patch）
  - 优点：实现直观
  - 缺点：事件类型/字段随 UI 复杂度膨胀；长期维护成本高

- JSON Merge Patch（RFC 7386）
  - 优点：表达简单
  - 缺点：不如 RFC 6902 精确；对并发与局部变更控制较弱

## 风险 / 权衡

- 连接稳定性：WS 需要处理重连、心跳、代理配置（例如 Upgrade headers/timeout）。
- Backpressure：慢客户端可能导致服务端队列膨胀，需要显式限制与 drain 策略。
- 状态一致性：patch 依赖前端状态正确；需要通过 snapshot +（可选）test op 来检测漂移。
- 迁移复杂度：需要同时改后端传输层 + 前端消费层，且要保留 fallback。

## 兼容性设计

- 保持现有 REST endpoints 行为不变（prompt、messages、sessions、permissions、questions 等）。
- SSE `/events` 不移除，作为 fallback。
- 前端以 feature flag 或“优先 WS，失败降级 SSE”的策略逐步迁移。

## 迁移计划

1) 定义 realtime state 文档结构 + patch envelope，并在前端实现 patch 应用与 UI derivation（可先用本地 mock 驱动）。
2) 后端实现 workspace WebSocket endpoint，完成 token 校验 + subscribe + snapshot 下发。
3) 后端把上游 OpenCode events 映射为 state 变更并生成 JSON Patch，推送给订阅者。
4) 前端切换 SessionPage：优先 WS，失败降级 SSE。
5) 补齐测试：单测/集成测覆盖 patch 生成与应用、重连 snapshot、fallback。

## 待解决问题

- RealtimeState 的最小字段集合与命名（哪些字段必须进入 state，哪些仍通过 REST 拉取）。
- Snapshot 的来源（完全由 SQLite 构建 vs 混合 upstream REST + SQLite）。
- 是否引入第三方 JSON Patch 库（例如 `fast-json-patch`）或实现最小可用子集。
- 多客户端订阅与广播策略（同一 workspace 多 tab、多 session 并发）。

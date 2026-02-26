# 架构规则清单

## RULE-ARCH-001: WS 消息协议以 shared 为唯一来源

Frontend/Backend 之间的 WebSocket 消息类型与 payload 结构必须以 `shared/index.ts` 为唯一真相来源，禁止双方各写一套。

## RULE-ARCH-002: 一个 WS 连接同一时刻只处理一个 prompt

后端使用 `ClientState.isProcessing` 阻止并发 prompt，避免多个 SSE 流和 session 状态互相污染。

## RULE-ARCH-003: 事件流必须按 session 过滤

OpenCode 的 `/event` 是全局事件流。后端必须只转发属于当前 `sessionId` 的事件（见 `OpenCodeClient.eventMatchesSession`）。

## RULE-ARCH-004: “先订阅事件流，再发送 prompt”

为避免丢失最早期的 streaming/delta 事件，后端应先建立 SSE 连接，再调用 `/session/:id/message`。

## RULE-ARCH-005: workspace 视为不可信输入

workspace 会作为子进程 `cwd` 使用（见 `spawnOpenCodeServer`）。任何面向非本地环境的部署都必须增加校验/沙箱/权限隔离。

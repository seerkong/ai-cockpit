# Backend 常见问题与排查

## 1) “Already processing a request”

原因：同一条 WS 连接在上一个 prompt 未完成时又发起新 prompt（`isProcessing` 为 true）。

建议：

- 前端在 `isProcessing` 时禁用发送（当前 `ChatInput` 已在 `isProcessing` 时显示 Abort）
- 或者后端改为排队（需要额外设计，不属于当前原型行为）

## 2) “Unknown message type”

原因：前端发送了后端不认识的 `ClientMessage.type`。

排查：

- 检查 `shared/index.ts` 的 `ClientMessage.type`
- 检查 `backend/src/index.ts` 的 switch 分支

## 3) Event stream aborted

原因：abort 或 WS 关闭触发 `AbortController.abort()`，后端会将 `AbortError` 视为正常中断。

排查：

- 确认是否用户主动点了 Abort
- 确认前端是否频繁重连导致后端 close

# Manual QA Checklist

This checklist verifies the end-user behaviors added/changed by the `migrate-streaming-ws-json-patch` track.

## Run record

- Date: 2026-02-09
- Primary verification:
  - `bun run test:backend`
  - `bun run test:frontend`
  - `bun run test:e2e`
- Notes:
  - Default Playwright E2E includes mock WS tests and a real-env WS test that is skipped unless enabled.

## Realtime channel

### WebSocket path (preferred)

- [x] Frontend opens a workspace-scoped WS to `/api/v1/workspaces/:id/stream/ws?token=...`
- [x] Client sends `subscribe` and receives `snapshot`
- [x] Subsequent updates arrive as RFC6902 patch ops and UI updates incrementally

### Reconnect behavior

- [x] After WS drop, client reconnects and resubscribes
- [x] Server sends a fresh snapshot on reconnect and UI rehydrates

### SSE fallback

- [x] If WS cannot be established, the UI falls back to `/events` and remains functional

## Real environment verification (preferred)

Prereqs:
- Local OpenCode server running: `http://127.0.0.1:4096`
- Workspace directory: `E:\\tmp\\kunun.ts`
- Model selection:
  - `providerID`: `anthropic-yunyi-cfd`
  - `modelID`: `claude-opus-4-5-20251101`

Run:
- `AI_COCKPIT_REAL_E2E=1 bun run test:e2e e2e/realtime-ws-real.spec.ts`

Result:
- [x] Passed (connect-by-port + WS subscribe/snapshot + patch observed after shell-mode command)

## Environment-independent verification (CI-friendly)

- [x] Mock WS snapshot + patch incremental render: `e2e/realtime-ws-mock.spec.ts`
- [x] Mock WS reconnect snapshot rehydration: `e2e/realtime-ws-mock.spec.ts`
- [x] Mock WS failure -> SSE fallback: `e2e/realtime-ws-mock.spec.ts`

## Known deviations / not yet verified

- None

# Manual QA Checklist

This checklist is for verifying the core behaviors added/changed by the `improve-opencode-integration` track.

## Run record

- Date: 2026-02-08
- Primary verification:
  - `bun run test:backend`
  - `bun run test:frontend`
  - `bun run test:e2e`
- Notes: Playwright E2E uses network stubs + a mocked `EventSource` (does not require a real backend or OpenCode server).
- Reference: `e2e/improve-opencode-integration.spec.ts`

## Connect modes

- [ ] Spawn local OpenCode server (directory mode) still works
- [x] Connect to running local OpenCode server by port (UI fields + connect success)
- [ ] Invalid/unreachable port shows a clear error and user can fall back to spawn mode

## Model picker

- [ ] Model list groups by provider
- [ ] Keyword search filters across providers/models
- [x] Selecting a model is used for prompt requests (`providerID/modelID`)

## Messages pagination

- [x] Session loads latest messages page on open
- [x] "Load older" fetches prior page using cursor and prepends messages without duplicates

## /sessions refresh storms

- [x] SSE `session.status` / `session.idle` / `session.error` events do not trigger `/sessions` refetch loops
- [ ] Session actions (create/fork/title update) refresh sessions once as needed

## Persistence

- [ ] Backend persists SSE events to SQLite and can reload without losing already-received output
- [x] SQLite WAL/SHM artifacts are not committed (ignored/cleaned)

## Known deviations / not yet verified

- This checklist is mostly backed by stubbed E2E coverage; it does not validate a real `opencode serve` instance.

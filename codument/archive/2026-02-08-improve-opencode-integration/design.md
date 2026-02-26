## Context

This change crosses frontend UX, backend provider integration, and introduces a new persistence layer.

Key current behaviors:
- Workspace connect only supports spawning `opencode-ai@latest serve` per workspace (`backend/src/opencode-server.ts`).
- Models are fetched via the OpenCode provider list (`/provider`) and rendered as a flat `<select>` without search.
- The chat timeline is hydrated via `/messages` (full history) and updated via SSE (`/events`).
- The UI refreshes sessions aggressively on any `session.*` SSE event, causing repeated `/sessions` calls.

## Solution Overview

1) **Connect to running server (configured port)**
- Extend workspace connect to support a mode that binds a workspace to an existing OpenCode server running on localhost.
- The user provides workspace directory + server port; the backend validates health before completing connect.

2) **Model picker improvements**
- Replace the model `<select>` with a picker that supports:
  - provider grouping
  - keyword search
- Keep `providerID`/`modelID` as canonical IDs; show human labels separately.

3) **SQLite persistence (full SSE event log)**
- Persist every SSE event received from OpenCode into SQLite.
- Build message history reads from SQLite when possible to avoid repeated full-history calls.

4) **Reduce redundant `/sessions` refresh**
- Filter SSE-driven refreshes: do not refetch sessions list on `session.status`/`session.idle`/`session.error`.
- Debounce/coalesce refresh triggers and remove overlapping initial refresh paths.

## Impact / Touch Points

- Frontend
  - `frontend/src/pages/HomePage.vue` (connect UI)
  - `frontend/src/pages/SessionPage.vue` (model picker, session refresh behavior, message sync)

- Backend
  - `backend/src/app.ts` (new connect mode; message/sessions routing; optional replay)
  - `backend/src/workspace-registry.ts` (workspace state extended to support external server)
  - `backend/src/opencode-client.ts` (optional auth; discovery helpers)
  - New module(s): `backend/src/storage/*` for SQLite

## Key Decisions

### Canonical model representation
- Canonical: `{ providerID: string, modelID: string }` internally.
- On-wire (frontend -> backend -> OpenCode): normalize to the same shape for prompt/shell/command.
- UI labels may use provider/model names, but MUST NOT alter the canonical IDs.

### Local OpenCode server connection (configured port)
- The connect UI collects workspace directory + server port.
- The backend validates the server via the OpenCode health endpoint.
- No auth is used for this connect mode.

### Message history pagination
- Add cursor/pagination support for message history reads to avoid repeatedly transferring full history.
- SQLite event log is the source of truth; cursor can be based on event sequence or message creation time.

### SQLite schema direction
- Store a full event log table as the source of truth.
- Maintain optional derived tables (`messages`, `message_parts`) for fast reads.
- Add an explicit `workspaces` table as an independent root entity.
- Do NOT persist workspace connection method details (spawn vs port); connection choice is per-connect attempt.
- Add retention/cleanup controls (time-based and/or max size) to prevent unbounded growth.

## Risks / Tradeoffs

- Incorrect port configuration can make connect appear flaky; errors must be explicit.
- Event logs can grow quickly (especially `message.part.updated` deltas); coalescing and/or summarization may be needed for storage.
- Mixed model formats (string vs object) can cause subtle bugs; normalization must be end-to-end.
- Introducing persistence increases complexity and needs careful migration/versioning.

## Compatibility

- Keep existing `/api/v1/*` routes compatible; changes should be additive where possible.
- Existing "spawn local server" flow remains supported.

## Migration Plan

1) Add SQLite storage module and write events/messages into it.
2) Serve message history from SQLite where safe.
3) Add connect-to-running-server mode.
4) Update frontend to use new connect mode + improved model picker.
5) Optimize `/sessions` refresh behavior.

## Open Questions

- What should the default port UX look like (placeholder, validation, remembering last used port)?
- What retention policy should apply to the SQLite event log (max size, max age, manual clear)?
- Should we materialize messages/parts tables eagerly, or derive on read from the event log?
- On workspace disconnect, should persisted history remain (default), and should there be a separate "delete history" action?

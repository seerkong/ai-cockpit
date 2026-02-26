# Change: Improve OpenCode Integration

## Context And Why

`ai-cockpit` currently spawns a local OpenCode server per workspace and proxies session/chat features through a cockpit API.

In practice, several integration and UX issues make day-to-day usage painful:
- Users may already have an OpenCode server running via `opencode serve`, but `ai-cockpit` cannot connect to it.
- Model selection is a long flat list with no provider grouping or keyword search.
- Custom providers/models configured in OpenCode do not reliably show up.
- The frontend frequently re-fetches full message history and/or triggers redundant `/sessions` refresh storms.
- Model identifiers are not consistently represented end-to-end (provider/model mapping confusion).

This track addresses these gaps with a focus on correctness, performance, and keeping the cockpit API stable.

## Goals / Non-Goals

**Goals:**
 - Add a "connect to running OpenCode server" mode (user provides localhost port).
- Improve model picker UX: group by provider + keyword search.
- Ensure custom providers/models exposed by OpenCode are visible/selectable.
- Persist chat data on the backend using SQLite (full SSE event log) to reduce repeated full-history reads.
- Normalize model identifiers end-to-end using canonical `providerID`/`modelID`.
- Reduce redundant `/sessions` list requests during prompt lifecycles.

**Non-Goals:**
- Remote OpenCode server discovery/registry (non-local).
- Terminal UI work.
- Changing upstream OpenCode provider naming rules; we will handle consistency within `ai-cockpit`.

## What Changes

- Frontend:
  - Add a connect option for "running OpenCode server" alongside the existing local-spawn flow.
  - Replace/augment the model dropdown with a provider-grouped, searchable picker.
  - Reduce `refreshSessions()` calls (filter/debounce SSE session events; remove duplicate initial refresh paths).
  - Normalize model serialization across prompt/shell/command flows.

- Backend:
  - Add a connect-to-running-server path (connect to localhost by configured port and validate health).
  - Add SQLite persistence that stores the OpenCode SSE event stream and can back message history reads.
  - Maintain backward compatibility for existing cockpit endpoints.

## Impact

- Affected components:
  - Workspace connect and registry (backend)
  - Session/chat timeline and model picker (frontend)
  - SSE event relay and message fetching
  - New persistence layer (SQLite)

- Expected modified modules:
  - `frontend/src/pages/HomePage.vue`
  - `frontend/src/pages/SessionPage.vue`
  - `backend/src/app.ts`
  - `backend/src/workspace-registry.ts`
  - new backend SQLite module(s)

# Parity Matrix (Workspace Opened Page)

Status legend: TBD / TODO / IN_PROGRESS / DONE / N/A

| Area | Target parity (interaction) | Backend dependency | Status |
| --- | --- | --- | --- |
| Multi-workspace | connect/list/select/disconnect | cockpit API + workspace registry | DONE |
| Sessions | list + navigate + create | sessions endpoints | DONE |
| Workspace shell | sidebar + header + chat + right panels (no terminal) | router/store | DONE |
| Command palette | keyboard open + search + execute | commands + file/path search | DONE |
| Chat timeline | turns/parts + reasoning toggle + status + auto-scroll | messages + SSE | DONE |
| Prompt input | agent/model + @ agent + / commands + history + attach + abort + ! shell | prompt/abort/shell endpoints | DONE |
| Review panel | diffs list + unified/split + expand + view file | diffs + file content | DONE |
| Inline comments | line selection + comment anchors + add to prompt context | local-only (no backend persistence) | DONE |
| Context tab | usage/cost + system prompt + raw messages | messages metadata | DONE |
| Session actions | fork/share/revert/summarize, gated | action endpoints + capabilities | DONE |
| Permissions/questions | asked UI + respond + auto-accept toggle | permissions/questions endpoints + events | DONE |
| Terminal | excluded | N/A | N/A |
| @ mention file | excluded (only @ agent) | N/A | N/A |

## Backend API Gap (Cockpit API v1)

Source of truth for current implementation: `backend/src/app.ts` (routing) + `backend/src/index.ts` (Bun.serve bootstrap).

### Implemented

Workspaces:
- POST `/api/v1/workspaces/connect` (`backend/src/app.ts:317`)
- GET `/api/v1/workspaces` (`backend/src/app.ts:321`)
- DELETE `/api/v1/workspaces/{workspaceId}` (`backend/src/app.ts:758`)
- GET `/api/v1/workspaces/{workspaceId}/events` (`backend/src/app.ts:325`)

Sessions:
- GET `/api/v1/workspaces/{workspaceId}/sessions` (`backend/src/app.ts:336`)
- POST `/api/v1/workspaces/{workspaceId}/sessions` (`backend/src/app.ts:336`)
- GET `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}` (`backend/src/app.ts:742`)
- PATCH `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}` (`backend/src/app.ts:742`)
- DELETE `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}` (`backend/src/app.ts:742`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/fork` (`backend/src/app.ts:350`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/revert` (`backend/src/app.ts:384`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/unrevert` (`backend/src/app.ts:384`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/summarize` (`backend/src/app.ts:384`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/share` (`backend/src/app.ts:362`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/unshare` (`backend/src/app.ts:362`)
- GET `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/todo` (`backend/src/app.ts:399`)

Messages / Prompt:
- GET `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/messages` (`backend/src/app.ts:411`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/prompt` (`backend/src/app.ts:427`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/abort` (`backend/src/app.ts:443`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/shell` (`backend/src/app.ts:475`)
- POST `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/command` (`backend/src/app.ts:459`)

Review:
- GET `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/diffs` (`backend/src/app.ts:608`)

Files:
- GET `/api/v1/workspaces/{workspaceId}/files?path=.` (`backend/src/app.ts:621`)
- GET `/api/v1/workspaces/{workspaceId}/files/content?path=...` (`backend/src/app.ts:636`)
- GET `/api/v1/workspaces/{workspaceId}/files/search?pattern=...` (`backend/src/app.ts:651`)
- GET `/api/v1/workspaces/{workspaceId}/paths/search?query=...&kind=...&limit=...` (`backend/src/app.ts:666`)

Models / Agents / Commands:
- GET `/api/v1/workspaces/{workspaceId}/models` (`backend/src/app.ts:696`)
- GET `/api/v1/workspaces/{workspaceId}/agents` (`backend/src/app.ts:712`)
- GET `/api/v1/workspaces/{workspaceId}/commands` (`backend/src/app.ts:727`)

Permissions / Questions:
- GET `/api/v1/workspaces/{workspaceId}/permissions` (`backend/src/app.ts:491`)
- POST `/api/v1/workspaces/{workspaceId}/permissions/respond` (`backend/src/app.ts:521`)
- GET `/api/v1/workspaces/{workspaceId}/questions` (`backend/src/app.ts:506`)
- POST `/api/v1/workspaces/{workspaceId}/questions/reply` (`backend/src/app.ts:554`)
- POST `/api/v1/workspaces/{workspaceId}/questions/reject` (`backend/src/app.ts:585`)

### Missing (contract-defined, not implemented yet)

- None

### Upstream API deltas (FYI)

Upstream OpenCode exposes additional endpoints that are not currently wrapped by this cockpit API contract (may become needed for deeper UI parity later):

- `/session/status` (`session.status`)
- `/session/{sessionID}/children` (`session.children`)
- `/session/{sessionID}/init` (`session.init`)
- `/session/{sessionID}/message/{messageID}` (`session.message`)
- `/session/{sessionID}/message/{messageID}/part/{partID}` (`part.update`, `part.delete`)
- `/session/{sessionID}/prompt_async` (`session.prompt_async`)
- `/permission/{requestID}/reply` (`permission.reply`)

### Mismatches / Notes

- Workspace response `status` is always `ready` (contract allows `connecting`/`ready`/`error`). Evidence: `backend/src/app.ts:55`.
- Provider support is currently limited to `opencode.local` in `/workspaces/connect`. Evidence: `backend/src/app.ts:286`.
- Token parsing accepts `Authorization: Bearer`, `x-proto-session`, and `?token=` query param (query token is not in contract). Evidence: `backend/src/app.ts:40`.
- Some `/api/v1` routes (connect/list) currently do not require a token (contract implies a workspace connection token for protected access). Evidence: `backend/src/app.ts:317`, `backend/src/app.ts:321`.
- Legacy endpoints exist and must remain working during migration:
  - POST `/api/config` (connect) and `/api/opencode/*` raw proxy. Evidence: `backend/src/app.ts:313`, `backend/src/app.ts:765`.

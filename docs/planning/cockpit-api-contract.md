# Cockpit API Contract (Draft)

## Why
We want the Vue frontend to depend on a stable `ai-cockpit` backend API, not on OpenCode-specific endpoints, so we can:
- Port OpenCode official web workspace UX (excluding terminal) with minimal friction.
- Support other headless AI coding servers later via backend adapters.

This contract intentionally mirrors OpenCode v2 data shapes where it reduces UI porting risk.

## Compatibility (current repo)
Existing prototype endpoints:
- `POST /api/config` (connect workspace; returns token)
- `GET|POST /api/opencode/*` (raw proxy to OpenCode server)

Plan:
- Keep those working during the migration.
- Add a versioned cockpit API under `/api/v1/...`.

## Auth
- Preferred: `Authorization: Bearer <token>`
- Back-compat: `x-proto-session: <token>` (used today by `frontend/src/App.vue:208`)

Token represents a *workspace connection* (not a user account).

## Core entities (minimal)

### Workspace
```ts
type Workspace = {
  id: string;            // UUID
  provider: string;      // e.g. "opencode.local" | "opencode.remote" | "other"
  directory?: string;    // local path when applicable
  status: "connecting" | "ready" | "error";
  createdAt: number;
  capabilities: {
    chat: boolean;
    events: boolean;
    reviewDiffs: boolean;
    inlineComments: boolean;
    fileRead: boolean;
    fileSearch: boolean;
    commands: boolean;
    agents: boolean;
    models: boolean;
    permissions: boolean;
    questions: boolean;
  };
};
```

### Session
```ts
type Session = {
  id: string;
  title?: string;
  directory?: string;
  parentID?: string;
  time?: { created?: number; updated?: number; archived?: number };
  summary?: { files?: number; diffs?: Array<{ file: string; additions: number; deletions: number }> };
  share?: { url?: string };
  revert?: { messageID?: string };
};
```

### Message + Parts (OpenCode-like)
We keep the `{ info, parts }` shape because upstream and your current UI already use it.
```ts
type MessageInfo = {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  parentID?: string;
  time: { created: number; completed?: number };
  agent?: string;
  model?: { providerID: string; modelID: string };
  providerID?: string;
  cost?: number;
  tokens?: unknown;
  summary?: { diffs?: FileDiff[] };
  error?: { data?: { message?: string } };
};

type Part =
  | { id: string; type: "text"; text: string; synthetic?: boolean }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "tool";
      tool: string;
      callID: string;
      state: {
        status: "pending" | "completed" | "error";
        input: Record<string, unknown>;
        output: string;
        error?: string;
        raw?: string;
        // optional metadata fields (task session, etc.)
        metadata?: Record<string, unknown>;
      };
    }
  | {
      id: string;
      type: "file";
      mime: string;
      url: string;            // file://... or data:...
      filename?: string;
      source?: unknown;
    }
  | {
      id: string;
      type: "agent";
      name: string;
      source?: unknown;
    };

type MessageWithParts = { info: MessageInfo; parts: Part[] };
```

### FileDiff (review)
```ts
type FileDiff = {
  file: string;
  before: string | null | { encoding: "base64"; mimeType?: string; content: string };
  after: string | null | { encoding: "base64"; mimeType?: string; content: string };
  additions?: number;
  deletions?: number;
};
```

## API

### Workspaces

1) Connect
- `POST /api/v1/workspaces/connect`
```json
{ "provider": "opencode.local", "directory": "E:/repo/path", "autoApprove": true }
```
Response:
```json
{ "workspace": { "id": "ws_...", "status": "ready", "provider": "opencode.local", "directory": "E:/repo/path", "createdAt": 0, "capabilities": { "chat": true, "events": true, "reviewDiffs": true, "inlineComments": true, "fileRead": true, "fileSearch": true, "commands": true, "agents": true, "models": true, "permissions": true, "questions": true } }, "token": "<token>" }
```
Notes:
- This is the structured successor to `POST /api/config`.
- `autoApprove` matches current behavior (`spawnOpenCodeServer(..., { autoApprove: true })` in `backend/src/index.ts:57`).

2) List
- `GET /api/v1/workspaces`

3) Disconnect
- `DELETE /api/v1/workspaces/{workspaceId}`

### Sessions

4) List sessions
- `GET /api/v1/workspaces/{workspaceId}/sessions`

5) Create session
- `POST /api/v1/workspaces/{workspaceId}/sessions`
```json
{}
```

6) Get session
- `GET /api/v1/workspaces/{workspaceId}/sessions/{sessionId}`

7) Update session (title/archive)
- `PATCH /api/v1/workspaces/{workspaceId}/sessions/{sessionId}`
```json
{ "title": "...", "time": { "archived": 0 } }
```

8) Delete session
- `DELETE /api/v1/workspaces/{workspaceId}/sessions/{sessionId}`

9) Fork
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/fork`

10) Undo/redo (revert/unrevert)
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/revert`
```json
{ "messageID": "msg_..." }
```
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/unrevert`

11) Summarize/compact
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/summarize`
```json
{ "providerID": "...", "modelID": "..." }
```

12) Share/unshare
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/share`
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/unshare`

13) Todo list
- `GET /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/todo`

### Messages (chat timeline)

14) List messages (with parts)
- `GET /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/messages?limit=400&before=<messageId>`
Response:
```json
[
  { "info": { "id": "msg_...", "sessionID": "sess_...", "role": "user", "time": { "created": 0 } }, "parts": [ { "id": "part_...", "type": "text", "text": "..." } ] }
]
```

15) Send prompt (parts)
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/prompt`
```json
{ "messageID": "message_...", "agent": "Sisyphus", "model": { "providerID": "...", "modelID": "..." }, "variant": "default", "parts": [ { "id": "part_...", "type": "text", "text": "..." } ] }
```

16) Abort
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/abort`

17) Shell-mode (optional; clarify scope)
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/shell`
```json
{ "agent": "...", "model": { "providerID": "...", "modelID": "..." }, "command": "ls" }
```

18) Custom command invocation
- `POST /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/command`
```json
{ "command": "<name>", "arguments": "...", "agent": "...", "model": "providerID/modelID", "variant": "default", "parts": [] }
```

### Review (session diffs)

19) Session diffs
- `GET /api/v1/workspaces/{workspaceId}/sessions/{sessionId}/diffs`
Response:
```json
[{ "file": "src/a.ts", "before": "...", "after": "...", "additions": 1, "deletions": 0 }]
```

### Files (supports command palette + @mentions)

20) Directory listing (tree)
- `GET /api/v1/workspaces/{workspaceId}/files?path=.`

21) File content
- `GET /api/v1/workspaces/{workspaceId}/files/content?path=src/a.ts`
Response:
```json
{ "content": "...", "encoding": "text", "mimeType": "text/plain" }
```

22) Search (ripgrep-like)
- `GET /api/v1/workspaces/{workspaceId}/files/search?pattern=...`

23) Search paths (for `@` and palette)
- `GET /api/v1/workspaces/{workspaceId}/paths/search?query=...&kind=file|dir|both&limit=200`
Response:
```json
{ "items": ["src/main.ts", "src/components/"] }
```

### Models / Agents / Slash Commands

24) Models
- `GET /api/v1/workspaces/{workspaceId}/models`
Response:
```json
{ "providers": [ { "id": "openai", "name": "OpenAI", "models": [ { "id": "gpt-5", "name": "GPT-5", "limit": { "context": 0 } } ] } ] }
```

25) Agents
- `GET /api/v1/workspaces/{workspaceId}/agents`

26) Custom commands
- `GET /api/v1/workspaces/{workspaceId}/commands`

### Permissions / Questions (workflow parity)

27) List pending permission requests
- `GET /api/v1/workspaces/{workspaceId}/permissions`

28) Respond to permission request
- `POST /api/v1/workspaces/{workspaceId}/permissions/respond`
```json
{ "sessionID": "...", "permissionID": "...", "response": "once" }
```

29) List pending questions
- `GET /api/v1/workspaces/{workspaceId}/questions`

30) Reply/reject a question
- `POST /api/v1/workspaces/{workspaceId}/questions/reply`
```json
{ "requestID": "...", "answers": [["Option 1"], ["A", "B"]] }
```
- `POST /api/v1/workspaces/{workspaceId}/questions/reject`
```json
{ "requestID": "..." }
```

### Events (SSE)

29) Workspace event stream
- `GET /api/v1/workspaces/{workspaceId}/events`

SSE message body is JSON. For OpenCode provider, payload should be compatible with OpenCode v2 `Event`:
```json
{ "type": "message.part.updated", "properties": { "part": { "sessionID": "...", "messageID": "...", "id": "...", "type": "text", "text": "..." } } }
```

Notes:
- Coalesce high-frequency events (`message.part.updated`, `session.status`) either server-side or client-side (OpenCode coalesces in `E:/ai-dev/src/opencode/packages/app/src/context/global-sdk.tsx:32`).
- Frontend should treat events as triggers for store updates; avoid refetch-all where possible.

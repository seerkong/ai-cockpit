# Cockpit API Contract (Track-local)

This track assumes the frontend depends on a stable, versioned API served by the `ai-cockpit` backend.

## Auth

- Preferred: `Authorization: Bearer <token>`
- Back-compat: `x-proto-session: <token>`

Token represents a workspace connection (not a user account).

## Core Entities (minimal)

### Workspace

```ts
type Workspace = {
  id: string;
  provider: string;
  directory?: string;
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
        metadata?: Record<string, unknown>;
      };
    }
  | { id: string; type: "file"; mime: string; url: string; filename?: string; source?: unknown }
  | { id: string; type: "agent"; name: string; source?: unknown };

type MessageWithParts = { info: MessageInfo; parts: Part[] };
```

### FileDiff

```ts
type FileDiff = {
  file: string;
  before: string | null | { encoding: "base64"; mimeType?: string; content: string };
  after: string | null | { encoding: "base64"; mimeType?: string; content: string };
  additions?: number;
  deletions?: number;
};
```

## API (v1)

Base: `/api/v1/workspaces/{workspaceId}`

### Workspaces

- `POST /api/v1/workspaces/connect` -> `{ workspace, token }`
- `GET /api/v1/workspaces` -> `{ workspaces }`
- `DELETE /api/v1/workspaces/{workspaceId}` -> `{ ok: true }`

### Sessions

- `GET /sessions`
- `POST /sessions`
- `GET /sessions/{sessionId}`
- `PATCH /sessions/{sessionId}` (title/archive)
- `DELETE /sessions/{sessionId}`
- `POST /sessions/{sessionId}/fork`
- `POST /sessions/{sessionId}/revert`
- `POST /sessions/{sessionId}/unrevert`
- `POST /sessions/{sessionId}/summarize`
- `POST /sessions/{sessionId}/share`
- `POST /sessions/{sessionId}/unshare`
- `GET /sessions/{sessionId}/todo`

### Messages / Prompt

- `GET /sessions/{sessionId}/messages?limit=...&before=...` -> `MessageWithParts[]`
- `POST /sessions/{sessionId}/prompt` -> sends a prompt (parts)
- `POST /sessions/{sessionId}/abort`
- `POST /sessions/{sessionId}/shell` ("!" shell-mode)
- `POST /sessions/{sessionId}/command` (invoke a custom command)

### Review

- `GET /sessions/{sessionId}/diffs` -> `FileDiff[]`

### Files

- `GET /files?path=.` (directory listing)
- `GET /files/content?path=...`
- `GET /files/search?pattern=...` (ripgrep-like)
- `GET /paths/search?query=...&kind=file|dir|both&limit=...`

### Models / Agents / Commands

- `GET /models`
- `GET /agents`
- `GET /commands`

### Permissions / Questions

- `GET /permissions`
- `POST /permissions/respond`

- `GET /questions`
- `POST /questions/reply`
- `POST /questions/reject`

### Events (SSE)

- `GET /events`

SSE message body is JSON.

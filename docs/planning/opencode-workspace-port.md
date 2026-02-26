# OpenCode Workspace Page Port Plan (ai-cockpit)

## Goal
Port OpenCode official web "workspace opened" page features into this repo (`E:/ai-dev/ai-cockpit`), using the existing Vue frontend stack.

Long-term goals:
- Manage multiple workspaces (multiple OpenCode instances or remote OpenCode servers).
- Keep an internal "cockpit API" so we can add other headless AI coding web servers later.

## Scope
In-scope (port from OpenCode workspace page):
- Workspace shell layout: sidebar + header search/command bar + main chat + right-side review/context panels
- Core chat UX (turns, steps/tool parts, reasoning toggle, status line, auto-scroll, message navigation)
- Prompt input UX (model/agent selection, @ mention file/agent, / slash commands, prompt history, attachments)
- Change review (session diffs): file list, unified/split diff view, expand/collapse, view file
- Inline line comments on diffs + add comment/selection into prompt context
- Context tab (token/cost usage stats, breakdown, system prompt, raw message viewer)
- Session actions: new, fork, share/unshare, undo/redo/revert, compact/summarize (only if API supports)
- Permissions flow (permission.asked UI, auto-accept toggle) excluding terminal

Out-of-scope:
- Web terminal UI and terminal-related behaviors
- Desktop-only titlebar integration (OpenCode mounts into native titlebar)

## Decisions (confirmed)
- Backend framework: keep current `Bun.serve()` for now; postpone Elysia migration until cockpit API/UI stabilize.
- Delivery priority: do the full workspace-opened page parity (excluding terminal) in this port effort.
- UI fidelity: prioritize matching OpenCode official web UX; do not miss prompt input behaviors, especially `/` (slash commands) and `@` (agents/files) triggers.

## Current State (this repo)
Frontend:
- `frontend/src/App.vue` is a single-page prototype (no router) with:
  - workspace connect (`/api/config`)
  - sessions list + create session
  - basic chat rendering (text/reasoning/tool)
  - basic tool output + diff-like rendering
  - file tree + file content + ripgrep search

Backend:
- `backend/src/index.ts` uses `Bun.serve()` and proxies OpenCode via `/api/opencode/*`.
- Note: the codebase currently does NOT use Elysia (no `elysia` usage found under `backend/src`).

## Upstream Reference Map (OpenCode)
Web workspace app (SolidJS + Vite) lives under `E:/ai-dev/src/opencode/packages/app`.

Key upstream files to reference while porting:
- Route + providers: `E:/ai-dev/src/opencode/packages/app/src/app.tsx`
- Workspace shell layout (sidebar/workspaces/sessions + palette commands): `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx`
- Workspace page (session view): `E:/ai-dev/src/opencode/packages/app/src/pages/session.tsx`
- Chat turn rendering (user+assistant+steps, per-turn diffs): `E:/ai-dev/src/opencode/packages/ui/src/components/session-turn.tsx`
- Prompt input UX: `E:/ai-dev/src/opencode/packages/app/src/components/prompt-input.tsx`
- Review panel (diff list + inline comments): `E:/ai-dev/src/opencode/packages/ui/src/components/session-review.tsx`
- Command palette (Ctrl+P / mod+p): `E:/ai-dev/src/opencode/packages/app/src/components/dialog-select-file.tsx`
- Session header (search bar, share, review toggle): `E:/ai-dev/src/opencode/packages/app/src/components/session/session-header.tsx`
- Context tab (usage breakdown + raw messages): `E:/ai-dev/src/opencode/packages/app/src/components/session/session-context-tab.tsx`

## Feature Matrix (draft)
| Area | Upstream reference | Current in ai-cockpit | Target milestone | Notes |
| --- | --- | --- | --- | --- |
| Workspace shell layout (sidebar/header/panels) | `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx` | `frontend/src/App.vue` (single-page prototype) | M2 | Need router + layout components; exclude terminal panel |
| Workspace list / multi-workspace mgmt | `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx` | none (single workspace via `/api/config`) | M1/M2 | Add workspace registry in backend + workspace list UI |
| Sessions list + navigation | `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx` | `frontend/src/App.vue` (basic list) | M2 | Add sorting, rename/archive/delete, prefetch, keyboard nav |
| Command system + keybinds | `E:/ai-dev/src/opencode/packages/app/src/context/command/*` (via `session.tsx` + `layout.tsx`) | none | M2/M3 | Define command registry + keybind manager |
| Command palette (Ctrl+P/mod+p) | `E:/ai-dev/src/opencode/packages/app/src/components/dialog-select-file.tsx` | none | M3 | Commands + file search + recent files |
| Chat turn rendering | `E:/ai-dev/src/opencode/packages/ui/src/components/session-turn.tsx` | `frontend/src/App.vue` (flat message list) | M3 | Need turn grouping + steps collapse + status + auto-scroll |
| Prompt input UX | `E:/ai-dev/src/opencode/packages/app/src/components/prompt-input.tsx` | `frontend/src/App.vue` (textarea) | M3 | Add model/agent selection, @/slash popovers, history, attachments |
| Review panel (session diffs) | `E:/ai-dev/src/opencode/packages/ui/src/components/session-review.tsx` | `frontend/src/App.vue` (diff lines only from tool output) | M4 | Need dedicated panel + diff viewer (unified/split) + expand/collapse |
| Inline comments on diff + add to context | `E:/ai-dev/src/opencode/packages/ui/src/components/session-review.tsx` | none | M4 | Need line selection + comment anchors + prompt context integration |
| Context tab (usage/cost/raw) | `E:/ai-dev/src/opencode/packages/app/src/components/session/session-context-tab.tsx` | none | M4 | Requires provider/model/token info from backend |
| Session header (search/status/share/review toggle) | `E:/ai-dev/src/opencode/packages/app/src/components/session/session-header.tsx` | header only has workspace connect + status | M2/M5 | Search triggers palette; share/review toggle; status indicator |
| Session actions (fork/share/undo/redo/compact) | `E:/ai-dev/src/opencode/packages/app/src/pages/session.tsx` + `prompt-input.tsx` | only new session + send prompt | M5 | Depends on backend API support (OpenCode endpoints) |
| Permissions flow (permission.asked) | `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx` + `directory-layout.tsx` | backend currently `autoApprove: true` | M5 | Decide security model; implement UI for approvals |

## Key Gaps vs OpenCode (high-level)
- No router-based workspace/session pages (currently single `App.vue`).
- No command system + command palette.
- Prompt input is minimal (no model/agent selection, no @/slash popovers, no attachments/history/shell-mode).
- No dedicated "review panel" with file diffs + inline comments.
- No context tab (token/cost stats, breakdown, raw messages).
- Backend does not expose a stable cockpit API contract; currently a thin proxy.

## Architecture Direction (target)
1) Frontend ONLY talks to `ai-cockpit` backend.
2) Backend provides a stable "cockpit API" and adapter layer:
   - `OpenCodeAdapter` (first)
   - future adapters: other headless AI coding servers
3) Backend normalizes:
   - workspace/session/message data model
   - SSE events
   - diffs/review payloads

Related doc:
- Cockpit API contract (draft): `docs/planning/cockpit-api-contract.md`

## Milestones (planning-with-files)

### M0 - Planning + Feature Matrix
- [ ] Create this plan file + link from `GOAL.md`
- [ ] Build feature matrix (upstream -> local -> gap -> milestone)
- [ ] Decide scope priority: (A) chat+review first, then rest; or (B) full parity in one pass
- [ ] Decide backend direction: Bun.serve vs Elysia migration timing

### M1 - Cockpit API + Provider Abstraction
- [ ] Draft cockpit API contract (routes + event envelope)
- [ ] Implement workspace registry (multiple workspaces)
- [ ] Implement OpenCode adapter with typed helpers (sessions/messages/diffs/files/providers)
- [ ] SSE relay per workspace/session with reconnect/backoff

### M2 - Frontend App Restructure
- [ ] Add Vue Router routes: Home/workspaces, Workspace shell, Session
- [ ] Add state management (Pinia or equivalent)
- [ ] Implement workspace shell layout (excluding terminal)

### M3 - Chat + Prompt Input Parity
- [ ] Chat turn UI (turn grouping, steps expansion, status, auto-scroll)
- [ ] Prompt input parity (@ mention, / slash, model/agent required, history, attachments, abort)
- [ ] Command palette (Ctrl+P) for commands + file open

### M4 - Review + Context Parity
- [ ] Review panel parity (diff list + unified/split + expand/collapse)
- [ ] Inline comments on diffs + add to prompt context
- [ ] Context tab: token/cost stats + breakdown + raw message viewer

### M5 - Session/Workspace Actions
- [ ] Session actions: rename, fork, share/unshare, undo/redo/revert, compact/summarize
- [ ] Permissions flow + auto-accept toggle (excluding terminal)
- [ ] Notifications/status indicators

### M6 - QA + Hardening
- [ ] Manual QA checklist + sample workspace/session scenarios
- [ ] Regression tests around SSE + diff rendering + prompt input behaviors

## Open Questions
- Prompt input: should we include OpenCode's `!` shell-mode (runs commands via chat) even though terminal UI is excluded?
答:yes

# Manual QA Checklist

This checklist is for verifying the core workspace-opened flows (excluding terminal).

## Run record

- Date: 2026-02-07
- Primary verification: `bun run test:e2e` (Playwright)
- Notes: E2E currently uses network stubs + a mocked `EventSource` (does not require a real backend or OpenCode server).
- Reference: `e2e/workspace-opened.spec.ts`

## Workspace

- [ ] Connect a local workspace; UI shows connected/ready
- [ ] Connect a second workspace; list shows both
- [ ] Switch between workspaces; sessions/chat/panels update correctly
- [ ] Disconnect a workspace; UI updates and no stale events remain

## Sessions

- [ ] List sessions for a workspace
- [ ] Create a new session
- [ ] Navigate between sessions

## Chat Timeline

- [x] Streaming assistant response updates incrementally
- [x] Reasoning visibility toggle works
- [x] Tool parts render with status and expandable details
- [ ] Auto-scroll behavior is correct (does not fight manual scroll)
- [ ] Message navigation/jump works (if implemented)

## Prompt Input

- [ ] Select agent (and model if supported)
- [x] `@` opens agent picker and inserts selection
- [x] `/` opens slash command picker and inserts selection
- [ ] Prompt history works
- [ ] Attachments can be added (if supported)
- [x] Abort cancels in-flight generation and UI reflects it
- [ ] `!` shell-mode submits a command (no terminal UI)

## Review

- [x] Review panel opens and lists diff files
- [ ] Unified/split mode toggle works
- [ ] Expand/collapse works
- [ ] View file content from review
- [x] Inline comment: select lines and attach comment
- [x] Add diff selection into prompt context

## Context

- [x] Usage/cost breakdown renders when data available
- [ ] System prompt (if available) renders
- [x] Raw message viewer renders and is readable

## Session Actions / Permissions

- [ ] Actions are shown/hidden based on capabilities
- [x] Share/unshare works when supported
- [x] Revert/undo/redo works when supported (verified: revert/unrevert; undo/redo not implemented)
- [x] Permission request UI appears; response flows to backend
- [x] Auto-accept toggle behavior is correct

## Known deviations / not yet verified

- Workspace connect/switch/disconnect flows are not covered by the current Playwright E2E (requires additional test coverage or a real backend + OpenCode server environment).
- Session create + multi-session navigation are not covered by the current Playwright E2E.
- Auto-scroll + message navigation/jump are not explicitly verified.
- Prompt history, `!` shell-mode, and attachments are not verified here.
- Review split mode, expand/collapse, and view-file-from-review are not explicitly verified.
- Capability-gating behavior (actions hidden/disabled when not supported) is not explicitly verified.

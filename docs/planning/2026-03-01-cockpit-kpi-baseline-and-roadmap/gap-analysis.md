# Gap Analysis

Date: 2026-03-01

## Goal Restatement

Build a cockpit that can:
- monitor more OpenCode workspaces concurrently
- autonomously control execution across them
- continuously optimize: concurrency management, automation rate, conflict detection accuracy, and manual intervention rate

## Current State (What Exists)

In `ai-cockpit`:
- Multi-connection model per directory is implemented (session -> connection binding), with directory-level session status derived from upstream SSE events.
  - Key: `backend/packages/organ/src/workspace-registry.ts`
- Realtime channel exists as workspace-scoped WebSocket using RFC6902 JSON Patch against a normalized realtime state.
  - Key: `backend/packages/composer/src/realtime-ws.ts`
- Upstream SSE event stream can be persisted into SQLite as a full event log.
  - Key: `backend/packages/core/src/storage/sqlite.ts`
  - DB files currently present: `backend/packages/elysia-shell/data.sqlite`, `backend/data.sqlite`
- /work UI/UX parity track exists (connections splitview, permission/question dock, model selector popover, etc.).
  - Spec: `codument/specs/work-ui-ux/spec.md`

In collaborating repos:
- `codument`: provides structured track/spec/plan management, machine-readable CLI (`--json`), and generation of OpenCode slash commands.
- `omo-slim-plus`: provides OpenCode plugin hooks (tool before/after, session status normalization, background tasks), but telemetry export is currently only local log + in-session notifications.

## Gaps By KPI

### KPI 1: Concurrency Management Ability

What we have:
- multiple connections per directory; session binding; realtime hub per workspace

Missing:
- an explicit scheduler layer with concurrency budget, queueing, fairness, and backpressure rules
- dynamic adjustment based on CPU/memory/token budget
- telemetry to compute utilization, queue wait, overload rate

Impact:
- you can run multiple sessions, but you cannot manage system-level concurrency intentionally; the cockpit cannot “optimize concurrency” without a scheduler model and measured outcomes.

### KPI 2: Automation Rate

What we have:
- realtime event stream; UI interactions; OpenCode tool parts rendered

Missing:
- an explicit run/step execution model (`run_id`, `step_id`)
- actor attribution (`human|cockpit|agent|plugin`)
- stable definition of “automated step” and “autonomous run”

Impact:
- automation improvements cannot be tracked and will regress invisibly.

### KPI 3: Conflict Detection Accuracy (Multi-worktree)

What we have:
- a session-to-connection binding mechanism enabling concurrent runs per directory

Missing:
- a project/worktree model: `project_id -> worktree_id[]` and “concurrent run overlap” tracking
- conflict prediction v0 (even a trivial baseline like same-file overlap)
- ground truth collection (shadow merge or patch-apply simulation)
- a policy on how conflict risk affects scheduling decisions

Impact:
- concurrency increases will increase merge pain; without measurable conflict detection accuracy you cannot systematically reduce it.

### KPI 4: Manual Intervention Rate

What we have:
- permission/question UI docking patterns exist; upstream permission/question events can be persisted

Missing:
- intervention telemetry: start/end, category, reason, initiated-by
- time-based measurement (manual waiting time)

Impact:
- “autonomous control” cannot be judged; improvements become anecdotal.

## Cross-Project Positioning Gaps

`ai-cockpit` vs `codument`:
- Codument is strong at defining and tracking change (spec/plan/status), but cockpit needs to execute and measure outcomes across many workspaces.
- Gap: cockpit lacks a way to ingest codument status in realtime and to map plan tasks to actual run/step telemetry.

`ai-cockpit` vs `omo-slim-plus`:
- omo-slim-plus is inside OpenCode’s event/tool execution path; it can generate high-fidelity signals.
- Gap: those signals are not exported as structured telemetry to cockpit, so cockpit cannot compute KPIs or run a control loop.

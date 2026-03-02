# KPI Baseline (Initial State)

This document captures the initial, product-level KPI baseline for `ai-cockpit` so future iterations can be compared against a known starting point.

Updated: 2026-03-01

## Data Sources Used

- Code inspection (current behavior + defaults).
- Local SQLite event log:
  - `backend/packages/elysia-shell/data.sqlite`
  - `backend/data.sqlite`

Notes:
- Backend creates SQLite using `new SqliteStore(process.env.AI_COCKPIT_DB_PATH || 'data.sqlite')` (see `backend/packages/elysia-shell/src/index.ts`).
- The repo currently contains two SQLite files; in typical dev runs the effective DB path depends on `AI_COCKPIT_DB_PATH` and process working directory.

## Current Observability Coverage

- Persistent storage exists for:
  - `workspaces` (directory registry)
  - `events` (full upstream event log; source-of-truth cursor via `seq`)
- There is no dedicated telemetry schema for KPIs yet (no explicit `run/step/intervention/conflict` events).
- Metrics shown in the UI (tokens/cost) are computed from message metadata, not emitted as structured telemetry.

## Baseline Values (As Of 2026-03-01)

All four KPIs below are currently either unmeasured or only partially inferable, because the event log contains no recorded upstream events in the inspected DBs.

### KPI 1: Concurrency Management Ability

Measured value: UNMEASURED (no scheduler/run model).

What exists today (capability baseline):
- Multiple connection instances per directory group are supported, with session-to-connection binding (see `backend/packages/organ/src/workspace-registry.ts`).
- Workspace-scoped realtime hub exists (one hub per workspace ID), with patch batching and backpressure limits (see `backend/packages/composer/src/realtime-ws.ts`).

Current knobs/defaults (implementation constants, not product KPI values):
- Realtime patch flush interval: `PATCH_FLUSH_INTERVAL_MS = 25`.
- WS backpressure limit: `1024 * 1024`, `closeOnBackpressureLimit = true`.
- Frontend polling defaults: connection list refresh every `2000ms`, message polling every `2000ms` (legacy paths).

Missing to compute this KPI:
- A scheduler concept (budget, queue, run lifecycle) and its telemetry (queued/started/finished/paused).

### KPI 2: Automation Rate

Measured value: UNMEASURED.

Current state:
- There is no explicit `run_id` / `step_id` model.
- There is no durable event stream distinguishing `actor = human|cockpit|agent|plugin`.

Proxy signals currently available:
- Upstream OpenCode events can be persisted (once event stream is active). This can later be used to infer tool activity, session busy/idle, and error rates.

Missing to compute this KPI:
- Definition of what counts as an automated step.
- Emission of structured step lifecycle events (start/end/result) and actor attribution.

### KPI 3: Conflict Detection Accuracy (Multi-worktree / Multi-connection)

Measured value: NOT IMPLEMENTED.

Current state:
- No worktree-aware concurrency model exists at cockpit level (no `project_id` -> multiple `worktree_id` graph).
- No conflict predictor is implemented.
- No ground-truth evaluation pipeline exists (e.g., shadow merge / patch-apply simulation).

Missing to compute this KPI:
- A conflict event taxonomy: predicted vs ground-truth labels.
- Patch capture metadata per autonomous run (touched files, hunks, base commit) or equivalent.

### KPI 4: Manual Intervention Rate

Measured value: UNMEASURED.

Current state:
- Manual intervention is not recorded as telemetry.
- A partial proxy could be derived from upstream events:
  - `permission.*` and `question.*` events (if persisted).

Observed event log status (inspected SQLite DBs):
- `events` table row count: 0

Missing to compute this KPI:
- A clear definition of intervention categories (approval/clarification/recovery/conflict/override).
- Frontend + backend emission of intervention start/end (with durations) and attribution.

## Immediate Next Step (To Make KPIs Measurable)

- Define a shared telemetry event envelope and a minimal set of events required to compute the 4 KPIs.
- Emit these events from:
  - cockpit scheduler (once added)
  - cockpit UI (manual actions)
  - omo-slim-plus plugin hooks (tool before/after, background tasks)
- Store events in SQLite (new table, or an extension of the existing event log with a `source` field).

# Telemetry Schema v0 (Proposal)

Date: 2026-03-01

Purpose:
- define the minimum event schema needed to compute the 4 KPIs
- keep it versioned so cockpit + plugins can evolve safely

## Entities

- `project_id`: logical project (repo)
- `worktree_id`: one worktree directory (your collaboration unit)
- `connection_id`: cockpit connection instance
- `workspace_id`: cockpit workspace (current internal ID)
- `session_id`: OpenCode session
- `run_id`: one autonomous objective
- `step_id`: one discrete action in a run

## Event Envelope

All telemetry events SHALL carry:

```json
{
  "schema_version": "telemetry.v0",
  "ts": 0,
  "event": "run.started",
  "actor": "cockpit",
  "project_id": "...",
  "worktree_id": "...",
  "workspace_id": "...",
  "connection_id": "...",
  "session_id": "...",
  "run_id": "...",
  "step_id": "...",
  "trace_id": "...",
  "parent_step_id": "...",
  "payload": {}
}
```

Required fields:
- `schema_version`, `ts`, `event`, `actor`, `project_id`, `worktree_id`

Strongly recommended:
- `trace_id`, `parent_step_id` to reconstruct causality and waiting time

## Minimum Event Types

Scheduler / concurrency:
- `run.queued`
- `run.started`
- `run.finished` (`result=success|failure|aborted`)
- `run.paused` / `run.resumed` (optional)

Automation / steps:
- `step.started` (payload: `kind=prompt|tool|git|review|other`)
- `step.finished` (payload: `result=success|failure|aborted`, `duration_ms`)

Manual intervention:
- `human.intervention.started` (payload: `category`, `reason`)
- `human.intervention.ended` (payload: `duration_ms`)

Conflict prediction + labels:
- `conflict.predicted` (payload: `pair_id`, `risk_score`, `features`)
- `conflict.ground_truth` (payload: `pair_id`, `label=conflict|no_conflict`, `severity`)

System stability (guardrails):
- `connection.disconnected` (payload: `reason`)
- `overload.detected` (payload: `cpu`, `mem`, `queue_depth`, optional)

## Storage

Recommended approach in `ai-cockpit`:
- keep existing upstream OpenCode SSE event log in `events` (current design)
- add a separate table for telemetry, to avoid mixing raw upstream events with cockpit-level semantics

SQLite table sketch:

```sql
CREATE TABLE IF NOT EXISTS telemetry_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  actor TEXT NOT NULL,
  ts INTEGER NOT NULL,
  project_id TEXT,
  worktree_id TEXT,
  workspace_id TEXT,
  connection_id TEXT,
  session_id TEXT,
  run_id TEXT,
  step_id TEXT,
  trace_id TEXT,
  parent_step_id TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry_events(ts);
CREATE INDEX IF NOT EXISTS idx_telemetry_project_run ON telemetry_events(project_id, run_id, ts);
```

Retention:
- keep telemetry coarse; avoid storing full diffs by default
- store hashes/metadata; only store raw diff content behind an explicit opt-in

## How KPIs Map To Events

KPI 1 (Concurrency):
- utilization: concurrent `run.started` not yet `run.finished`
- queue wait: `run.started.ts - run.queued.ts`

KPI 2 (Automation):
- step automation rate: fraction of `step.finished` where `actor=cockpit|plugin`
- run autonomy rate: runs with zero `human.intervention.*`

KPI 3 (Conflict accuracy):
- precision/recall from `conflict.predicted` vs `conflict.ground_truth`

KPI 4 (Manual intervention):
- interventions per run + manual wait ratio from intervention durations

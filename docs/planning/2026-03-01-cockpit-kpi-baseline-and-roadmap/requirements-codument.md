# Capability Requests: codument-dev

Date: 2026-03-01

Context:
- `codument-dev` is the spec/plan-plane; `ai-cockpit` is the control-plane.
- To optimize the 4 KPIs, cockpit needs a machine-readable, stable view of plan execution state and a way to map plan tasks to runtime telemetry.

## Required Capabilities (To Support Cockpit)

1) Stable machine-readable outputs
- Provide stable JSON schemas for:
  - `codument list --json`
  - `codument show <id> --json`
  - `codument status --json`
- Include a schema version field so cockpit can handle upgrades.

2) Plan-to-execution correlation IDs
- Allow plan.xml tasks to carry IDs that cockpit can reuse as `run_id`/`step_id` references.
- Recommend adding optional metadata fields (without breaking validation):
  - `telemetry_run_id`
  - `telemetry_step_id`
  - `project_id`, `worktree_id` hints

3) Wave execution metadata
- If wave-mode is used, expose:
  - wave graph (DAG) in JSON
  - per-wave concurrency hints (`wave_config`)
  - blocked reasons and dependency edges

4) Status events (optional but high value)
- Provide a file-based or hook-based event stream when:
  - track status changes
  - task/subtask status changes
- This can be as simple as writing an append-only log file so cockpit can tail.

5) Minimal integration contract for cockpit
- Document:
  - where workspace dir is resolved
  - how to run codument commands non-interactively
  - the stability guarantees of stdout JSON

## Non-Goals

- codument-dev does not need to become a scheduler.
- codument-dev does not need to embed OpenCode runtime control.

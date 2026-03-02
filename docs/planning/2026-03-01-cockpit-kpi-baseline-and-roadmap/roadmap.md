# Implementation Roadmap (Phased)

Date: 2026-03-01

This roadmap is written to directly support the four KPIs:
1) concurrency management
2) automation rate
3) conflict detection accuracy
4) manual intervention rate

## Phase 0: Make KPIs Measurable (Telemetry Contract + Baselines)

Deliverables (cockpit repo):
- Adopt a versioned telemetry schema (see `telemetry-schema-v0.md`).
- Store telemetry events locally (SQLite) with retention controls.
- Add a simple reporter (SQL queries or a tiny endpoint) that produces:
  - concurrency utilization proxy
  - automation (step-level) proxy
  - manual intervention proxies
  - conflict evaluation placeholders (no predictor yet)

Deliverables (coordination):
- Align telemetry schema across `ai-cockpit`, `codument`, and `omo-slim-plus`.
- Define KPI formulas and guardrails (avoid “automation by failing fast”).

Exit criteria:
- You can compute baseline numbers (even if low/zero) for all four KPIs, and they update from real usage.

## Phase 1: Concurrency Manager v1 (Fixed Budgets)

Goal: increase concurrency safely with explicit control.

Deliverables:
- Introduce a scheduler layer:
  - global budget: max active runs
  - per-project budget (default 1)
  - per-worktree budget (default 1)
- Emit scheduler events (`run.queued`, `run.started`, `run.finished`, `run.paused`).
- Add guardrails:
  - overload detection (disconnect storms, retries, error spikes)
  - p95 queue wait

Exit criteria:
- KPI 1 becomes measurable with real utilization/queue wait/stability.

## Phase 2: Autonomy Harness v1 (Run/Step Model)

Goal: improve automation rate while controlling manual intervention.

Deliverables:
- Define:
  - `run_id`: one objective
  - `step_id`: one discrete action (tool call, prompt, git op, approval decision)
- Add actor attribution (`human|cockpit|agent|plugin`).
- Automate low-risk steps first:
  - retries with caps
  - health checks
  - read-only discovery
  - non-destructive formatting

Exit criteria:
- KPI 2 + KPI 4 become meaningful (step automation rate, manual wait ratio).

## Phase 3: Conflict Detection v0 + Evaluation Loop (Shadow Mode)

Goal: make conflict detection accuracy a real number.

Deliverables:
- Patch capture metadata per run:
  - touched files
  - base commit
  - optional hunk ranges
- Predictor v0:
  - conflict risk if same file touched concurrently
  - later: line-range overlap
- Ground truth pipeline:
  - shadow merge / patch-apply simulation in a sandbox
  - label outcomes as `conflict.ground_truth`
- Report precision/recall/lead time.

Exit criteria:
- KPI 3 is measured; predictor runs in shadow and produces daily accuracy reports.

## Phase 4: Control Loop (Dynamic Concurrency + Risk-Aware Scheduling)

Goal: optimize concurrency while reducing conflicts and manual interventions.

Deliverables:
- Dynamic budgets based on:
  - machine load (CPU/memory)
  - token/cost budget
  - conflict risk scores
  - overload/error rates
- Scheduling policies:
  - serialize risky worktree pairs
  - prioritize runs with low conflict risk or high expected value

Exit criteria:
- Concurrency increases without increasing conflict resolution burden.

# Ecosystem Map

Updated: 2026-03-01

This document describes how `ai-cockpit` collaborates with two sibling projects.

## Roles (定位差异)

`ai-cockpit` (this repo)
- Role: control-plane cockpit.
- Owns: multi-workspace monitoring, realtime UI, orchestration/scheduling, KPI measurement and improvement loop.
- Integrates: OpenCode servers (via adapters/providers) and other future headless AI coding servers.

`codument`
- Role: spec/plan-plane.
- Owns: structured change tracking (tracks/specs/plan.xml), validation, “what is the plan / what changed / status”.
- Produces: machine-readable plan/status that cockpit can ingest and display.

`omo-slim-plus`
- Role: data-plane + in-workspace automation surface.
- Owns: OpenCode plugin hooks/tools (tool before/after, background tasks, session lifecycle normalization).
- Produces: signals cockpit cannot reliably infer from the outside (tool lifecycle, patch metadata, local git state, environment failures).

## Integration Surfaces (What To Connect)

- cockpit <-> codument
  - Ingest: `codument list/show/status --json` outputs for tracks/specs, plus plan.xml task progress.
  - Display: dashboard panels for active tracks, waves/tasks, and blockers.

- cockpit <-> omo-slim-plus
  - Control: background tasks and other plugin tools (inside OpenCode) for parallel execution.
  - Telemetry: emit structured run/step/patch/conflict/intervention events to cockpit for KPI computation.

## Contracts To Stabilize (Next)

- Telemetry event envelope and required KPI events (versioned schema).
- Capability handshake (what fields/features a plugin/server can provide).
- Conflict evaluation ground truth method (shadow merge / patch-apply simulation) so “accuracy” is measurable.

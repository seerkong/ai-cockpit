# Capability Requests: omo-slim-plus

Date: 2026-03-01

Context:
- `omo-slim-plus` is inside the OpenCode execution path.
- It has the highest-fidelity signals for automation, step lifecycle, and patch metadata.
- To support cockpit KPIs, these signals must be exported as structured telemetry.

## Required Capabilities (To Support Cockpit KPIs)

1) Telemetry emission (structured, versioned)
- Emit `telemetry.v0` events (see `telemetry-schema-v0.md`) for:
  - tool execution before/after
  - background task lifecycle
  - session status transitions (busy/retry/idle/error)

Recommended output sinks (choose 1+):
- HTTP POST webhook to cockpit backend
- append-only JSONL file in a known location
- stdout/stderr stream tagging (less preferred)

2) Actor attribution
- For each step, emit `actor=plugin` and include tool name + call ID.

3) Patch capture metadata
- For steps that modify workspace state:
  - record touched files (path list)
  - optionally record base commit hash
  - optionally record diff hashes (not full diff by default)

4) Conflict-related signals
- Emit explicit events for:
  - patch apply failures
  - merge conflicts (if plugin performs merges)
  - file write collisions (if detectable)
- Provide enough metadata for cockpit to group by `project_id`/`worktree_id`.

5) Capability handshake
- Provide a way for cockpit to detect plugin capability set and telemetry schema version.
- Example: emit `plugin.capabilities` event on startup.

6) Safety and privacy controls
- Explicit flags to disable raw content telemetry.
- Default to metadata/hashes only.

## Optional (High Leverage)

- Git status snapshot tool:
  - return base commit, branch, dirty files list
- Shadow merge helper:
  - run conflict ground-truth evaluation in a sandbox (if safe)

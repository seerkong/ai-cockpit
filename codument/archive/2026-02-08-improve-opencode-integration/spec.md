# Spec: Improve OpenCode Integration

## Overview

This track improves the day-2 usability and performance of `ai-cockpit`'s OpenCode integration.

Primary goals:
- Support connecting to an already-running local `opencode serve` (headless) instance via a configured port.
- Improve model selection UX (group by provider + keyword search).
- Ensure custom providers/models (from OpenCode config) are visible in the UI.
- Persist conversation data on the backend via SQLite (full SSE event log), so the UI does not rely on repeatedly fetching full history.
- Fix provider/model identifier consistency (providerID/modelID).
- Reduce redundant `/sessions` refresh calls (especially bursts caused by SSE `session.*` events).

## ADDED Requirements

### Requirement: Connect to an existing local OpenCode server (configured port)
The system SHALL allow the user to connect a workspace to an already-running local `opencode serve` instance.
The system SHALL allow the user to provide the server port (localhost) and validate it before completing connect.

#### Scenario: Connect to a running OpenCode server
- **GIVEN** the user provides a local directory path
- **AND** the user selects "Connect to running OpenCode server"
- **AND** the user provides a local server port
- **WHEN** the user clicks Connect
- **THEN** the backend connects to the OpenCode server at that port
- **AND** the UI shows the workspace as connected/ready

#### Scenario: Invalid or unreachable server port
- **GIVEN** the user selects "Connect to running OpenCode server"
- **WHEN** the backend cannot reach a healthy OpenCode server at the provided port
- **THEN** the UI shows a clear error message
- **AND** the user can fall back to spawning a server

### Requirement: Backend SQLite persistence (full event log)
The backend SHALL persist the OpenCode SSE event stream into a local SQLite database.
The persisted data SHALL be sufficient to reconstruct message history for a session without requiring repeated full-history reads.
The backend SHALL store workspace records in an independent table.
The backend SHALL NOT persist the workspace connection method details (e.g. spawn vs configured port); the user can choose a connection method each time they connect.

#### Scenario: Load message history incrementally
- **GIVEN** a session has a large message history
- **WHEN** the UI requests messages with a cursor (pagination)
- **THEN** the backend returns a bounded page of messages
- **AND** the UI can fetch additional pages without re-downloading the full history

#### Scenario: Persist and recover after restart
- **GIVEN** the user has an active session with messages and SSE updates
- **WHEN** the `ai-cockpit` backend restarts
- **THEN** previously received events remain available in SQLite
- **AND** the UI can reload the session timeline without losing already-received assistant output

#### Scenario: Disconnect a workspace
- **GIVEN** the user has a connected workspace
- **WHEN** the user disconnects the workspace
- **THEN** the backend closes SSE/event streams and releases runtime resources
- **AND** the UI removes the workspace from the active list

## MODIFIED Requirements

### Requirement: Model picker usability (provider grouping + keyword search)
The UI SHALL provide a model picker that supports:
- grouping models by provider
- keyword search across providers and models

#### Scenario: Search and select a model
- **GIVEN** the workspace supports models
- **WHEN** the user types a keyword (e.g. "glm") in the model picker
- **THEN** matching models are filtered
- **AND** the user can select a model without scrolling a long flat list

### Requirement: Custom providers/models are visible
When the connected OpenCode server exposes custom providers/models (configured via OpenCode config), the UI SHALL list them.

#### Scenario: Custom provider models appear
- **GIVEN** the user's OpenCode server is configured with a custom provider and models
- **WHEN** the UI loads the models list
- **THEN** the custom provider's models appear in the picker

### Requirement: Canonical model identifiers (providerID/modelID)
The system SHALL treat `providerID` and `modelID` as canonical identifiers.
The system SHALL pass model selection consistently across prompt, shell, and command flows.
The system SHALL store and display model identifiers consistently (no alias drift).

#### Scenario: Selected model is reflected consistently
- **GIVEN** the user selects model `providerID/modelID`
- **WHEN** the user sends a prompt and receives an assistant response
- **THEN** the message metadata reflects the same `providerID` and `modelID`

### Requirement: Reduce redundant `/sessions` refresh calls
The UI SHALL NOT refetch the sessions list repeatedly during a single prompt lifecycle.
`session.status`/`session.idle`/`session.error` SSE events SHALL NOT cause unbounded refresh storms.

#### Scenario: Sending a prompt does not spam /sessions
- **GIVEN** the user is in an existing session
- **WHEN** the user sends a prompt
- **THEN** the number of `/sessions` list requests remains bounded (e.g. 0-1 per prompt)

## Acceptance Criteria

- Connecting to a running `opencode serve` works reliably via configured localhost port.
- Model picker supports provider grouping + keyword search.
- Custom providers/models visible when OpenCode server exposes them.
- Backend persists events to SQLite and can reload sessions without re-fetching full history repeatedly.
- Backend supports cursor/pagination for message history reads.
- Model identifiers are consistent end-to-end (providerID/modelID).
- `/sessions` fetch storms are eliminated; prompt lifecycle does not cause 5+ `/sessions` calls.

## Out of Scope

- Building a remote OpenCode server registry (non-local discovery).
- Terminal UI parity.
- Changing OpenCode upstream provider naming/aliasing rules (handled as best-effort display/consistency in `ai-cockpit`).

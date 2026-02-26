# Spec: Realtime WebSocket Channel

## Overview

This specification defines the WebSocket-based realtime channel for `ai-cockpit`. The channel streams RFC 6902 JSON Patch operations against a normalized "realtime state" document, enabling incremental UI updates for AI streaming output and related session/workspace state.

## Requirements

### Requirement: Workspace-scoped realtime WebSocket
The system SHALL expose a workspace-scoped WebSocket endpoint for realtime updates.
The system SHALL authenticate WebSocket connections using the workspace token.
The client SHALL be able to subscribe to one or more sessions within the workspace over the same WebSocket.

#### Scenario: Connect and subscribe
- **GIVEN** the user has an active workspace token
- **WHEN** the client opens a WebSocket connection to the workspace realtime endpoint
- **AND** the client sends a subscribe message selecting the current session
- **THEN** the server accepts the subscription
- **AND** the server begins sending realtime updates for that session

### Requirement: JSON Patch as the realtime payload
The server SHALL emit realtime updates as RFC 6902 JSON Patch operations.
The client SHALL apply patches sequentially in the order received.
The patch target document SHALL be a normalized state tree that uses stable IDs as keys.

#### Scenario: Apply incremental message updates via patch
- **GIVEN** a session is subscribed
- **WHEN** an assistant response streams incrementally
- **THEN** the server emits JSON Patch operations that update the assistant message parts in-place
- **AND** the UI updates incrementally without waiting for the response to finish

### Requirement: Unified realtime channel coverage
The WebSocket realtime channel SHALL cover (at minimum):
- message streaming updates (assistant text/reasoning parts and tool state)
- session status updates (busy/retry/idle/error)
- sessions list updates (create/fork/title changes)
- permission and question updates

#### Scenario: A single connection updates multiple UI surfaces
- **GIVEN** the workspace realtime WebSocket is connected
- **AND** the current session is subscribed
- **WHEN** the backend observes a session status change, a new permission request, and a message part update
- **THEN** the server emits patches that update the corresponding fields in the realtime state
- **AND** the UI reflects all changes without performing a sessions-list refetch storm

### Requirement: Reconnect recovery via snapshot
When the WebSocket connection drops, the client SHALL reconnect.
After reconnect, the server SHALL send a fresh snapshot of the realtime state for the active subscription.

#### Scenario: Reconnect during an in-flight generation
- **GIVEN** the client is subscribed to a session and the assistant is streaming output
- **WHEN** the WebSocket connection drops
- **AND** the client reconnects successfully
- **THEN** the server sends a snapshot that includes the already-produced output
- **AND** subsequent patches continue updating the same session state

### Requirement: SSE fallback remains supported
The system SHALL keep the existing SSE endpoint for realtime updates as a fallback mechanism.
The frontend SHALL be able to fall back to SSE if WebSocket is unavailable.

#### Scenario: WebSocket connection fails and client falls back
- **GIVEN** the client attempts to connect the workspace realtime WebSocket
- **WHEN** the connection fails
- **THEN** the client falls back to the SSE-based realtime updates
- **AND** the UI remains functional (with reduced realtime richness if needed)

### Requirement: Backpressure and safety limits
The system SHALL apply safety limits to avoid unbounded buffering when a client cannot keep up.
The system SHOULD batch/coalesce patch operations without defeating perceptible streaming.

#### Scenario: Slow client does not cause unbounded memory growth
- **GIVEN** a client is connected but is slow to process incoming messages
- **WHEN** the server detects sustained backpressure
- **THEN** the server applies configured limits (throttling and/or closing the connection)
- **AND** the system remains stable for other clients

## Non-Functional Requirements

- The realtime channel MUST NOT increase the frequency of redundant REST refresh calls compared to the SSE approach.
- The UI SHOULD show partial assistant output quickly during generation (perceptible streaming).
- The protocol SHOULD remain forward-compatible for future A2UI card tree updates.

## Acceptance Criteria

- When sending a prompt, assistant output appears incrementally in the UI (not only at completion).
- Sessions list, permissions, and questions reflect changes via the realtime channel without refetch storms.
- WebSocket reconnect rehydrates state via snapshot and continues receiving updates.
- SSE fallback path remains functional.
- Automated tests exist for streaming/reconnect/fallback behavior.

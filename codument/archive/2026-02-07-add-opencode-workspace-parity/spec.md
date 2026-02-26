# Spec: OpenCode Workspace Page Parity (Excluding Terminal)

## Overview

This track ports the OpenCode official web "workspace opened" page features into `ai-cockpit`.

Key constraints for this track:
- Backend stays on `Bun.serve()` (no Elysia migration in this track).
- Goal is interaction/behavior parity with OpenCode official web UX.
- Web terminal UI and terminal-specific behaviors are explicitly out of scope.

## ADDED Requirements

### Requirement: Multi-workspace management
The system SHALL support connecting, listing, selecting, and disconnecting multiple workspaces.

#### Scenario: Connect a local workspace
- **GIVEN** the user provides a local directory path
- **WHEN** the user connects the workspace
- **THEN** the backend returns a workspace token and workspace metadata
- **AND** the UI reflects the workspace as connected/ready

#### Scenario: Switch between workspaces
- **GIVEN** the user has connected at least two workspaces
- **WHEN** the user selects a different workspace
- **THEN** the UI updates to show sessions/chat/review for the selected workspace

### Requirement: Cockpit API boundary and backward compatibility
The frontend SHALL only talk to the `ai-cockpit` backend (not to provider-specific upstream endpoints directly).
The system SHALL preserve the current prototype endpoints during migration.

#### Scenario: Existing prototype flow continues to work
- **GIVEN** an existing client uses the legacy connect endpoint and legacy proxy endpoints
- **WHEN** the client connects and performs session + chat actions
- **THEN** the behavior remains functional while the new cockpit API is introduced

### Requirement: Workspace shell layout (excluding terminal)
The UI SHALL provide a workspace shell layout with sidebar, header search/command entry, main chat timeline, and right-side panels for review/context.

#### Scenario: Open a session page
- **GIVEN** the user is connected to a workspace
- **WHEN** the user opens a session
- **THEN** the UI shows the workspace shell layout
- **AND** the terminal UI is not present

### Requirement: Sessions list and navigation
The UI SHALL provide a sessions list and allow navigation between sessions.

#### Scenario: Navigate to an existing session
- **GIVEN** the workspace has existing sessions
- **WHEN** the user selects a session in the sidebar
- **THEN** the chat timeline and panels update to that session

### Requirement: Command system and command palette
The UI SHALL provide a command system with a command palette (keyboard accessible) that can:
- open files / navigate resources
- invoke supported session/workspace actions

#### Scenario: Open command palette via keyboard
- **GIVEN** the workspace shell is open
- **WHEN** the user presses the command palette shortcut (e.g. Ctrl+P / Mod+P)
- **THEN** the command palette opens
- **AND** the user can search and execute commands

### Requirement: Chat timeline interaction parity
The UI SHALL render chat turns and parts in a way that matches OpenCode interaction semantics, including:
- turn grouping
- step/tool parts rendering
- reasoning visibility toggle
- status line / streaming updates
- auto-scroll + message navigation

#### Scenario: Render assistant message with tool parts
- **GIVEN** the session contains an assistant message with text, reasoning, and tool parts
- **WHEN** the user views the chat timeline
- **THEN** the UI renders each part with appropriate affordances (expand/collapse where relevant)
- **AND** toggling reasoning visibility hides/shows reasoning content

### Requirement: Prompt input interaction parity
The UI SHALL provide prompt input behaviors matching OpenCode interaction semantics, including:
- model/agent selection (when supported)
- `@` mention for agents (file @-mention is out of scope for now)
- `/` slash commands
- prompt history
- attachments
- abort/cancel in-flight generation
- `!` shell-mode command submission (command-only, no terminal UI)

#### Scenario: Use @ mention and / slash
- **GIVEN** the user is composing a prompt
- **WHEN** the user types `@` and selects an agent
- **AND** the user types `/` and selects a slash command
- **THEN** the composed prompt includes the selected items in the correct form

#### Scenario: Abort an in-flight response
- **GIVEN** an assistant response is streaming
- **WHEN** the user triggers abort
- **THEN** the backend stops the in-flight operation
- **AND** the UI reflects the aborted state

### Requirement: Review panel (session diffs)
The UI SHALL provide a dedicated review panel for session diffs, including:
- file list
- unified and split diff views
- expand/collapse
- open/view file content

#### Scenario: View session diffs
- **GIVEN** a session has diffs
- **WHEN** the user opens the review panel
- **THEN** the UI shows a diff file list
- **AND** selecting a file renders its diff in unified or split mode

### Requirement: Inline diff comments and context capture
The UI SHALL support selecting diff lines, attaching inline comments, and adding selected context into the prompt composition.

#### Scenario: Add selection from diff into prompt
- **GIVEN** the user is viewing a diff in the review panel
- **WHEN** the user selects a range of lines and chooses to add it to prompt context
- **THEN** the prompt composer includes the selected diff context

### Requirement: Context panel
The UI SHALL provide a context panel that can display:
- token/cost usage and breakdown (when supported)
- system prompt (when supported)
- raw message viewer (for debugging/inspection)

#### Scenario: Inspect usage and raw messages
- **GIVEN** the session has token/cost information available
- **WHEN** the user opens the context panel
- **THEN** the UI renders usage information and a raw message viewer

### Requirement: Session actions (capability-gated)
The system SHALL provide session actions, gated by provider/backend capability, including:
- create new session
- fork session
- share/unshare
- undo/redo/revert
- summarize/compact

#### Scenario: Action unavailable when not supported
- **GIVEN** the provider/backend does not support an action
- **WHEN** the user opens session actions
- **THEN** unsupported actions are hidden or disabled with clear affordances

### Requirement: Permissions/questions flow (capability-gated)
The UI SHALL provide a permissions/questions flow matching OpenCode semantics, including:
- showing permission requests
- responding (once/always/deny as applicable)
- an auto-accept toggle (excluding terminal)

#### Scenario: Respond to a permission request
- **GIVEN** the backend emits a permission request event
- **WHEN** the user approves the request
- **THEN** the backend receives the response
- **AND** the session continues without requiring terminal UI

## Non-Functional Requirements

- Interaction parity is the primary acceptance bar; pixel-level fidelity is secondary.
- The system SHOULD degrade gracefully when a provider does not support a feature (capability gating).

## Acceptance Criteria

- All in-scope areas are implemented and verified via a parity matrix maintained within this track.
- A manual QA checklist exists and passes for the core workspace-opened flows (connect workspace, navigate sessions, chat, prompt input, review, context, permissions).
- Legacy endpoints remain functional during the migration.

## Out of Scope

- Web terminal UI and terminal-specific behaviors.
- Desktop-only titlebar integration.
- Migrating backend framework to Elysia (explicitly deferred).

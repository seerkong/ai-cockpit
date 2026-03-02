# Track Spec: Stalled Session Auto Recover

## Overview

This track adds a watchdog that detects when an in-progress session becomes stalled (no message progress for a configured duration) and automatically performs a recovery sequence:

1) abort current generation
2) wait until the session becomes idle
3) send a follow-up user prompt: `请继续`

The feature is configurable from the `/work` right panel:
- enabled by default
- stall timeout configurable (default 5 minutes)

In addition, the `/work` right panel consolidates existing user-controllable toggles into a unified **Settings** tab.

## ADDED Requirements

### Requirement: Auto-recover stalled in-progress sessions

The system SHALL detect when the current session is in progress and has made no message progress for longer than the configured stall timeout.
When detected, and when not paused by safety rules, the system SHALL perform auto-recovery by aborting the session and then prompting the session to continue.

Definitions:
- **In progress**: the session runtime status is `busy` or `retry`.
- **No message progress**: a stable message fingerprint does not change (see scenarios) during the observation window.
- **Auto-recover**: `abort` then send `请继续`.

#### Scenario: Auto-recover triggers after stall timeout
- **GIVEN** the active session runtime status is `busy` or `retry`
- **AND** auto-recover is enabled
- **AND** stall timeout is `5 minutes`
- **AND** the message fingerprint has not changed for more than `5 minutes`
- **AND** none of the pause conditions are active
- **WHEN** the watchdog performs a check
- **THEN** the system SHALL send an abort request for the active session
- **AND** the system SHALL wait until the session becomes idle (with a bounded wait)
- **AND** the system SHALL send a prompt message with exact text `请继续`
- **AND** the UI SHALL surface that an auto-recover action occurred

#### Scenario: Message progress resets the stall timer
- **GIVEN** the active session is in progress
- **AND** auto-recover is enabled
- **WHEN** the latest message fingerprint changes (e.g. a streamed text delta arrives, a tool part status changes, or a new message is appended)
- **THEN** the system SHALL update the last-activity timestamp
- **AND** the system SHALL NOT trigger auto-recover until a new full stall window elapses

#### Scenario: Guardrails prevent repeated loops
- **GIVEN** auto-recover is enabled
- **AND** the system has already performed auto-recover for this session within a configured cooldown window
- **WHEN** the stall timeout is exceeded again
- **THEN** the system SHALL NOT perform another auto-recover action
- **AND** the UI SHALL indicate auto-recover is temporarily suppressed for this session

---

### Requirement: Pause conditions (safety rules)

The system SHALL pause (disable) auto-recover actions when any safety condition indicates the session is blocked on human input or the system cannot reliably observe progress.

#### Scenario: Pause when permission is pending
- **GIVEN** the active session has a pending permission request
- **WHEN** the stall timeout is exceeded
- **THEN** the system SHALL NOT send abort
- **AND** the system SHALL NOT send `请继续`

#### Scenario: Pause when question is pending
- **GIVEN** the active session has pending questions
- **WHEN** the stall timeout is exceeded
- **THEN** the system SHALL NOT send abort
- **AND** the system SHALL NOT send `请继续`

#### Scenario: Pause when a long-running tool is running
- **GIVEN** the active session is in progress
- **AND** the latest assistant activity indicates a long-running tool part is still running
- **WHEN** the stall timeout is exceeded
- **THEN** the system SHALL NOT perform auto-recover
- **AND** the UI SHOULD communicate that a long-running tool is in progress

#### Scenario: Pause when message refresh is failing
- **GIVEN** the system cannot successfully refresh/observe messages (network failure or repeated refresh errors)
- **WHEN** the stall timeout would otherwise be exceeded
- **THEN** the system SHALL NOT perform auto-recover

---

### Requirement: Right panel Settings tab (consolidated toggles)

The `/work` right panel SHALL provide a dedicated **Settings** tab that consolidates user-controllable toggles used to affect runtime behavior.

At minimum, the Settings tab SHALL include:
- Stalled session auto-recover: enabled + stall timeout minutes
- Auto-accept permissions (existing capability)
- Codument auto-refresh (existing capability)

#### Scenario: Settings tab shows toggles and defaults
- **GIVEN** the user opens `/work`
- **WHEN** the right panel renders
- **THEN** a Settings tab is visible
- **AND** auto-recover is enabled by default
- **AND** stall timeout defaults to 5 minutes

#### Scenario: Updating stall timeout takes effect
- **GIVEN** auto-recover is enabled
- **WHEN** the user changes the stall timeout value
- **THEN** subsequent watchdog checks SHALL use the new timeout

#### Scenario: Disabling auto-recover stops watchdog actions
- **GIVEN** auto-recover is enabled
- **WHEN** the user disables auto-recover
- **THEN** the system SHALL stop any pending auto-recover action
- **AND** the system SHALL NOT send abort or `请继续` due to stall detection

## Non-Functional Requirements

- The watchdog MUST be safe by default (avoid infinite abort/continue loops).
- The watchdog MUST avoid acting when human input is required (permissions/questions).
- The watchdog SHOULD be observable (user can see when and why it acted).

## Acceptance Criteria

- With defaults, a session that is `busy|retry` and makes no observable message progress for 5 minutes is auto-recovered via abort + `请继续`.
- Auto-recover can be toggled and timeout adjusted from `/work` right panel Settings tab.
- Auto-recover does not run when permission/question is pending, when a long-running tool is running, or when messages cannot be refreshed.
- Existing right-panel runtime toggles are consolidated into Settings tab.

## Out of Scope

- Backend-only watchdog that runs without the UI.
- Remote cluster-level scheduling.
- Persisting or exporting telemetry for this behavior (can be a follow-up track).

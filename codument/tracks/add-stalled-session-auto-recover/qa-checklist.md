# QA Checklist: Stalled Session Auto Recover

This checklist is self-contained for this track.

## Setup

- Start app: `bun run dev`
- Open `/work`.
- Ensure you have at least one connected workspace and an active session.

## Settings Tab

- Open right panel tab: Settings.
- Verify defaults:
  - "Auto-recover stalled session" is enabled.
  - "Stall timeout" defaults to 5 minutes.
- Toggle off and verify no auto-recover actions are taken.
- Change timeout to 1 minute and verify subsequent detection uses the new value.

## Watchdog Triggers (Happy Path)

- Put the session into a state where runtime status is `busy` or `retry`.
- Ensure there is no message progress for longer than the configured timeout.
- Expect sequence:
  - a notification about auto-recover abort
  - abort request sent
  - after session becomes idle, a prompt "请继续" is sent

## Pause Conditions

- Pending permission present for the session:
  - Expect no abort and no "请继续".
- Pending question present for the session:
  - Expect no abort and no "请继续".
- Long-running tool part is running:
  - Expect no abort and no "请继续".
- Message refresh failing (simulate offline / backend down):
  - Expect no abort and no "请继续".

## Guardrails

- After a successful auto-recover, keep the session stalled again.
- Confirm cooldown prevents repeated triggers within ~10 minutes.

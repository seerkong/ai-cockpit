import { describe, expect, test } from 'bun:test'

import { computeSessionPrimaryStatus } from '../../src/lib/session-status'

describe('computeSessionPrimaryStatus', () => {
  test('follows priority approval > question > running > retry > error > idle', () => {
    expect(
      computeSessionPrimaryStatus({ hasPendingPermission: true, hasPendingQuestion: true, sessionStatus: 'busy' }),
    ).toBe('approval')

    expect(
      computeSessionPrimaryStatus({ hasPendingPermission: false, hasPendingQuestion: true, sessionStatus: 'busy' }),
    ).toBe('question')

    expect(
      computeSessionPrimaryStatus({ hasPendingPermission: false, hasPendingQuestion: false, sessionStatus: 'busy' }),
    ).toBe('running')

    expect(
      computeSessionPrimaryStatus({ hasPendingPermission: false, hasPendingQuestion: false, sessionStatus: 'retry' }),
    ).toBe('retry')

    expect(
      computeSessionPrimaryStatus({ hasPendingPermission: false, hasPendingQuestion: false, sessionStatus: 'error' }),
    ).toBe('error')

    expect(computeSessionPrimaryStatus({ hasPendingPermission: false, hasPendingQuestion: false })).toBe('idle')
  })
})

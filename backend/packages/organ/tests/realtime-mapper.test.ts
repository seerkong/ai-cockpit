import type { OpencodeEvent, RealtimeStateV1 } from 'shared'

import { parseRealtimeWsServerMessage } from 'shared'

import { applyOpencodeEventToRealtimeState, createRealtimeStateV1 } from '../src/realtime-mapper'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('realtime mapper (opencode event -> state + json patch ops)', () => {
  test('message.part.updated updates part text and indexes', () => {
    const state: RealtimeStateV1 = createRealtimeStateV1({ workspaceId: 'ws_1' })

    const e1: OpencodeEvent = {
      type: 'message.part.updated',
      properties: {
        part: { id: 'part_1', type: 'text', sessionID: 'sess_123', messageID: 'msg_1', text: 'h' },
        delta: 'a',
      },
    }

    const before = clone(state)
    const r1 = applyOpencodeEventToRealtimeState(state, e1)
    expect(r1.sessionId).toBe('sess_123')
    expect(r1.ops.length).toBeGreaterThan(0)

    expect(state.parts.byId.part_1?.text).toBe('h')
    expect(state.parts.idsByMessageId.msg_1).toEqual(['part_1'])
    expect(state.messages.byId.msg_1?.sessionID).toBe('sess_123')
    expect(state.messages.idsBySessionId.sess_123).toEqual(['msg_1'])

    // The mapper mutates state.
    expect(before).not.toEqual(state)

    const e2: OpencodeEvent = {
      type: 'message.part.updated',
      properties: {
        part: { id: 'part_1', type: 'text', sessionID: 'sess_123', messageID: 'msg_1', text: 'he' },
        delta: 'b',
      },
    }

    applyOpencodeEventToRealtimeState(state, e2)
    expect(state.parts.byId.part_1?.text).toBe('he')
  })

  test('message.part.updated maps tool parts with state', () => {
    const state: RealtimeStateV1 = createRealtimeStateV1({ workspaceId: 'ws_1' })

    const evt: OpencodeEvent = {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part_tool_1',
          type: 'tool',
          sessionID: 'sess_123',
          messageID: 'msg_1',
          tool: 'bash',
          callID: 'call_1',
          state: { status: 'running', input: { command: 'echo hi' } },
        },
      },
    }

    applyOpencodeEventToRealtimeState(state, evt)

    expect(state.parts.byId.part_tool_1?.type).toBe('tool')
    expect(state.parts.byId.part_tool_1?.tool).toBe('bash')
    expect(state.parts.byId.part_tool_1?.callID).toBe('call_1')
    expect(state.parts.byId.part_tool_1?.state?.status).toBe('running')
  })

  test('session.status updates session status', () => {
    const state: RealtimeStateV1 = createRealtimeStateV1({ workspaceId: 'ws_1' })
    const evt: OpencodeEvent = {
      type: 'session.status',
      properties: {
        sessionID: 'sess_123',
        status: { type: 'busy' },
      },
    }

    applyOpencodeEventToRealtimeState(state, evt)
    expect(state.sessions.byId.sess_123?.status).toBe('busy')
  })

  test('permission.asked marks permissions refresh for session', () => {
    const state: RealtimeStateV1 = createRealtimeStateV1({ workspaceId: 'ws_1' })
    const evt: OpencodeEvent = {
      type: 'permission.asked',
      properties: {
        sessionID: 'sess_123',
      },
    }

    applyOpencodeEventToRealtimeState(state, evt)
    expect(state.permissions.needsRefreshBySessionId.sess_123).toBe(true)
  })

  test('session.idle clears error via remove op (wire-safe)', () => {
    const state: RealtimeStateV1 = createRealtimeStateV1({ workspaceId: 'ws_1' })

    // Seed an error first so clearing has meaning.
    const errEvt: OpencodeEvent = {
      type: 'session.error',
      properties: {
        sessionID: 'sess_123',
        error: { message: 'boom' },
      },
    }
    applyOpencodeEventToRealtimeState(state, errEvt)
    expect(state.sessions.byId.sess_123?.status).toBe('error')
    expect(state.sessions.byId.sess_123?.error).toBe('boom')

    const idleEvt: OpencodeEvent = {
      type: 'session.idle',
      properties: {
        sessionID: 'sess_123',
      },
    }

    const r = applyOpencodeEventToRealtimeState(state, idleEvt)
    expect(state.sessions.byId.sess_123?.status).toBe('idle')
    expect(state.sessions.byId.sess_123?.error).toBeUndefined()

    // Critical: do not emit { value: undefined } for JSON Patch operations.
    expect(r.ops).toContainEqual({ op: 'add', path: '/sessions/byId/sess_123/status', value: 'idle' })
    expect(r.ops).toContainEqual({ op: 'remove', path: '/sessions/byId/sess_123/error' })

    // Ensure the patch message survives JSON serialization and re-parses.
    const msg = { type: 'patch', payload: { ops: r.ops } }
    const roundTripped = JSON.parse(JSON.stringify(msg))
    expect(parseRealtimeWsServerMessage(roundTripped)).not.toBeNull()
  })
})

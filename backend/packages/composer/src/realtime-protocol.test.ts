import {
  parseRealtimeWsClientMessage,
  parseRealtimeWsServerMessage,
  realtimeWsExampleClientSubscribe,
  realtimeWsExamplePatch,
  realtimeWsExampleSnapshot,
} from 'shared'

describe('realtime ws protocol (shared)', () => {
  test('client subscribe message round-trips and validates', () => {
    const raw = JSON.parse(JSON.stringify(realtimeWsExampleClientSubscribe))
    const parsed = parseRealtimeWsClientMessage(raw)
    expect(parsed).toEqual(realtimeWsExampleClientSubscribe)
  })

  test('server snapshot message round-trips and validates', () => {
    const raw = JSON.parse(JSON.stringify(realtimeWsExampleSnapshot))
    const parsed = parseRealtimeWsServerMessage(raw)
    expect(parsed).toEqual(realtimeWsExampleSnapshot)
  })

  test('server patch message round-trips and validates', () => {
    const raw = JSON.parse(JSON.stringify(realtimeWsExamplePatch))
    const parsed = parseRealtimeWsServerMessage(raw)
    expect(parsed).toEqual(realtimeWsExamplePatch)
  })

  test('rejects invalid subscribe payload', () => {
    const bad = { type: 'subscribe', payload: { sessionIds: 'nope' } }
    expect(parseRealtimeWsClientMessage(bad)).toBeNull()
  })
})

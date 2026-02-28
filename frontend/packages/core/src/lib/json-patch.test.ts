import { applyJsonPatch } from './json-patch'
import { realtimeWsExamplePatch, realtimeWsExampleSnapshot } from 'shared'

describe('json patch apply (realtime)', () => {
  test('applies patch ops to nested fields', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')
    if (realtimeWsExamplePatch.type !== 'patch') throw new Error('expected patch example')

    const base = realtimeWsExampleSnapshot.payload.state
    const ops = realtimeWsExamplePatch.payload.ops
    const res = applyJsonPatch(base, ops)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.state.sessions.byId.sess_123?.status).toBe('busy')
    expect(res.state.parts.byId.part_1?.text).toBe('hi there')

    // Ensure we don't mutate the input document.
    expect(base.sessions.byId.sess_123?.status).toBe('idle')
    expect(base.parts.byId.part_1?.text).toBe('hi')
  })

  test('returns error when patch cannot be applied', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')
    const base = realtimeWsExampleSnapshot.payload.state

    const res = applyJsonPatch(base, [{ op: 'replace', path: '/nope', value: 1 }])
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(typeof res.error).toBe('string')
    expect(res.error.length).toBeGreaterThan(0)
  })

  test('test op failures trigger error', () => {
    if (realtimeWsExampleSnapshot.type !== 'snapshot') throw new Error('expected snapshot example')
    const base = realtimeWsExampleSnapshot.payload.state

    const res = applyJsonPatch(base, [{ op: 'test', path: '/schemaVersion', value: 2 }])
    expect(res.ok).toBe(false)
  })
})

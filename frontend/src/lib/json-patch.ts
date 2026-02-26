import type { JsonPatchOperation } from 'shared'

type ApplyOk<T> = { ok: true; state: T }
type ApplyErr = { ok: false; error: string }
export type ApplyJsonPatchResult<T> = ApplyOk<T> | ApplyErr

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function decodeJsonPointerSegment(seg: string): string {
  // RFC 6901
  return seg.replace(/~1/g, '/').replace(/~0/g, '~')
}

function parseJsonPointer(path: string): string[] | null {
  if (path === '') return []
  if (!path.startsWith('/')) return null
  // Leading slash means first segment is empty.
  return path
    .split('/')
    .slice(1)
    .map(decodeJsonPointerSegment)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (!a || !b) return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (typeof a === 'object') {
    if (Array.isArray(b) || typeof b !== 'object') return false
    const aRec = a as JsonRecord
    const bRec = b as JsonRecord
    const aKeys = Object.keys(aRec)
    const bKeys = Object.keys(bRec)
    if (aKeys.length !== bKeys.length) return false
    for (const k of aKeys) {
      if (!(k in bRec)) return false
      if (!deepEqual(aRec[k], bRec[k])) return false
    }
    return true
  }

  return false
}

function getValueAtPointer(root: unknown, segments: string[]): unknown {
  let cur: unknown = root
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined
      cur = cur[idx]
      continue
    }
    if (isJsonRecord(cur)) {
      cur = cur[seg]
      continue
    }
    return undefined
  }
  return cur
}

function cloneJson<T>(value: T): T {
  // structuredClone is available in modern browsers and in Bun.
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function applyJsonPatch<T>(document: T, ops: JsonPatchOperation[]): ApplyJsonPatchResult<T> {
  const next = cloneJson(document)

  for (const op of ops) {
    const opName = op.op
    const segments = parseJsonPointer(op.path)
    if (!segments) {
      return { ok: false, error: `invalid json pointer path: ${op.path}` }
    }

    if (op.op === 'test') {
      const current = getValueAtPointer(next, segments)
      if (!deepEqual(current, op.value)) {
        return { ok: false, error: `test failed at ${op.path}` }
      }
      continue
    }

    if (segments.length === 0) {
      return { ok: false, error: `operation ${op.op} against document root is not supported` }
    }

    const parentSegments = segments.slice(0, -1)
    const leaf = segments[segments.length - 1] ?? ''
    const parent = getValueAtPointer(next, parentSegments)
    if (!parent || (typeof parent !== 'object' && !Array.isArray(parent))) {
      return { ok: false, error: `missing parent for path: ${op.path}` }
    }

    if (Array.isArray(parent)) {
      if (leaf === '-' && op.op === 'add') {
        parent.push(op.value)
        continue
      }

      const idx = Number(leaf)
      if (!Number.isInteger(idx) || idx < 0) {
        return { ok: false, error: `invalid array index '${leaf}' at ${op.path}` }
      }

      if (op.op === 'add') {
        if (idx > parent.length) return { ok: false, error: `array index out of bounds at ${op.path}` }
        parent.splice(idx, 0, op.value)
        continue
      }

      if (idx >= parent.length) return { ok: false, error: `array index out of bounds at ${op.path}` }

      if (op.op === 'replace') {
        parent[idx] = op.value
        continue
      }

      if (op.op === 'remove') {
        parent.splice(idx, 1)
        continue
      }

      return { ok: false, error: `unsupported op: ${opName}` }
    }

    if (!isJsonRecord(parent)) {
      return { ok: false, error: `invalid parent container at ${op.path}` }
    }

    if (op.op === 'add') {
      parent[leaf] = op.value
      continue
    }

    if (op.op === 'replace') {
      if (!(leaf in parent)) return { ok: false, error: `replace target missing at ${op.path}` }
      parent[leaf] = op.value
      continue
    }

    if (op.op === 'remove') {
      if (!(leaf in parent)) return { ok: false, error: `remove target missing at ${op.path}` }
      delete parent[leaf]
      continue
    }

    return { ok: false, error: `unsupported op: ${opName}` }
  }

  return { ok: true, state: next }
}

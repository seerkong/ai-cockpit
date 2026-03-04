import { describe, expect, test } from 'bun:test'
import os from 'node:os'
import path from 'node:path'

import { SqliteStore, ulid } from '@backend/core'
import { WorkspaceRegistry } from '../src/workspace-registry'

describe('WorkspaceRegistry persisted tokens', () => {
  test('getByToken restores from sqlite after restart', () => {
    const dbPath = path.join(os.tmpdir(), `ai-cockpit-${ulid()}.sqlite`)
    const store = new SqliteStore(dbPath)
    try {
      const id = ulid()
      const token = ulid()
      const directory = '/tmp/example'

      store.upsertConnection({
        id,
        token,
        directory,
        connectionMode: 'spawn',
        serverPort: null,
        autoApprove: true,
        createdAt: Date.now(),
        lastUsedAt: null,
      })

      const registry = new WorkspaceRegistry(store)
      const ws = registry.getByToken(token)
      expect(ws).toBeTruthy()
      expect(ws?.id).toBe(id)
      expect(ws?.token).toBe(token)
      expect(ws?.directory).toBe(directory)
    } finally {
      store.close()
      try {
        Bun.file(dbPath).delete()
      } catch {
        // ignore
      }
    }
  })

  test('disconnect removes persisted connection row', () => {
    const dbPath = path.join(os.tmpdir(), `ai-cockpit-${ulid()}.sqlite`)
    const store = new SqliteStore(dbPath)
    try {
      const id = ulid()
      const token = ulid()
      const directory = '/tmp/example'
      store.upsertConnection({
        id,
        token,
        directory,
        connectionMode: 'spawn',
        autoApprove: true,
      })

      const registry = new WorkspaceRegistry(store)
      const ws = registry.getByToken(token)
      expect(ws?.id).toBe(id)

      const ok = registry.disconnect(id)
      expect(ok).toBe(true)
      expect(store.getConnectionById(id)).toBeNull()
    } finally {
      store.close()
      try {
        Bun.file(dbPath).delete()
      } catch {
        // ignore
      }
    }
  })
})

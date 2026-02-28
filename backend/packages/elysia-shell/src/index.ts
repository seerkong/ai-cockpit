/**
 * @backend/elysia-shell — entry point.
 */

import { resolveBackendRuntime, startBackendServer } from './runtime'
import { WorkspaceRegistry } from '@backend/organ'
import { SqliteStore } from '@backend/core'

const PORT = Number(process.env.PORT || 3001)

const store = new SqliteStore(process.env.AI_COCKPIT_DB_PATH || 'data.sqlite')
const registry = new WorkspaceRegistry(store)

function cleanup() {
  registry.cleanupExpired(12 * 60 * 60 * 1000)
}

if (import.meta.main) {
  const cleanupTimer = setInterval(cleanup, 30 * 60 * 1000)

  const runtimeMode = resolveBackendRuntime()
  const server = startBackendServer({
    mode: runtimeMode,
    port: PORT,
    registry,
    store,
  })

  const shutdown = async () => {
    clearInterval(cleanupTimer)
    await server.stop()
  }

  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })

  console.log(`Prototype backend running on http://localhost:${server.port} (runtime: ${runtimeMode})`)
}

/**
 * @backend/composer — route composition and middleware wiring.
 */

export {
  createFetchHandler,
  corsHeaders,
  jsonResponse,
  getSessionToken,
  workspaceResponse,
} from './app'
export type {
  WorkspaceRecord,
  ConnectionInstance,
  WorkspaceRegistryLike,
} from './app'
export {
  tryUpgradeRealtimeWs,
  resolveRealtimeWsHandshake,
  createRealtimeWsHandler,
} from './realtime-ws'
export type { RealtimeWsData } from './realtime-ws'

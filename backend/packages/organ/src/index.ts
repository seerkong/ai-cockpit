/**
 * @backend/organ — domain organs (workspace, providers, codument, realtime).
 */

export { OpenCodeClient, generateServerPassword } from './opencode-client'
export type { OpenCodeConfig, SessionInfo } from './opencode-client'
export { spawnOpenCodeServer, killOpenCodeServer } from './opencode-server'
export type { OpenCodeServerInfo } from './opencode-server'
export { OpenCodeLocalProvider } from './providers/opencode-local'
export { OpenCodeLocalPortProvider } from './providers/opencode-local-port'
export { WorkspaceRegistry } from './workspace-registry'
export type { WorkspaceState, ConnectionInstanceState } from './workspace-registry'
export { listCodumentTracks, loadCodumentTrackTree } from './codument'
export type {
  CodumentTrackSummary,
  CodumentSubtaskNode,
  CodumentTaskNode,
  CodumentPhaseNode,
  CodumentTrackTree,
} from './codument'
export { createRealtimeStateV1, applyOpencodeEventToRealtimeState } from './realtime-mapper'

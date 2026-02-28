// @frontend/organ — stores, composables, Vue-logic libs
export * from '@frontend/core';

// Stores
export { useWorkspacesStore, type Workspace, type ConnectedWorkspace } from './stores/workspaces';
export { useWorkspaceConfigsStore, type WorkspaceConfig } from './stores/workspace-configs';
export { useWorkspaceSelectionStore } from './stores/workspace-selection';

// Composables
export { useChat, type UseChatDeps } from './composables/useChat';
export {
  useSessions,
  asObject,
  asString,
  normalizeSessionsPayload,
  normalizeMessagesPayload,
  extractSessionId,
  type SessionInfo,
  type ToolState,
  type MessagePart,
  type MessageInfo,
  type MessageWithParts,
  type SessionManagerState,
  type UseSessionsDeps,
} from './composables/useSessions';
export { useNotifications, type NotificationKind, type NotificationItem } from './composables/useNotifications';
export { useConnections, connectionEndpointKey, buildConnectionSingleflightKey, normalizeConnections, mergeConnectionsForAnchor } from './composables/useConnections';
export type { ConnectionInstance, ConnectionContextMenuState, NewConnectionModalState, UseConnectionsDeps } from './composables/connection-types';
export { useComposerMetadata, type Capabilities } from './composables/useComposerMetadata';
export { useDockviewLayout } from './composables/useDockviewLayout';
export {
  CONNECTION_STATUS_BUCKETS,
  bucketIdForConnectionStatus,
  bucketConnections,
  useConnectionStatusBuckets,
  type ConnectionStatusBucketId,
  type ConnectionStatusLike,
  type BucketedConnections,
} from './composables/connection-status-buckets';
export { createPanelWrapper, type InjectMapping, type InjectMap } from './composables/panel-wrapper-factory';

// Libs
export {
  createRealtimeWsClient,
  buildWorkspaceRealtimeWsUrl,
  type RealtimeWsClientOptions,
  type RealtimeWsClient,
} from './lib/realtime-ws-client';
export { newConnectionRequested, requestNewConnection } from './lib/toolbar-actions';
export {
  toConnectionStatusBadge,
  type ConnectionStatusBadgeKind,
  type ConnectionStatusBadge,
} from './lib/connection-status-badge';

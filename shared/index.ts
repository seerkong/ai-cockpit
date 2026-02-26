// Shared types between frontend and backend

/**
 * Message from client to server
 */
export interface ClientMessage {
  type: 'config' | 'prompt' | 'abort';
  payload: ConfigPayload | PromptPayload | AbortPayload;
}

export interface ConfigPayload {
  workspace: string;
}

export interface PromptPayload {
  prompt: string;
  sessionId?: string;
}

export interface AbortPayload {
  sessionId: string;
}

/**
 * Message from server to client
 */
export interface ServerMessage {
  type: 'connected' | 'session_start' | 'assistant_message' | 'tool_use' | 'thinking' | 'error' | 'done' | 'system';
  payload: unknown;
}

export interface SessionStartPayload {
  sessionId: string;
}

export interface AssistantMessagePayload {
  content: string;
  delta?: string;
}

export interface ToolUsePayload {
  toolName: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  content: string;
  input?: unknown;
  output?: string;
}

export interface ThinkingPayload {
  content: string;
  delta?: string;
}

export interface ErrorPayload {
  message: string;
}

export interface SystemPayload {
  message: string;
}

/**
 * OpenCode SDK Event types (subset of what OpenCode emits)
 */
export interface OpencodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

export interface MessageUpdatedEvent {
  type: 'message.updated';
  properties: {
    info: {
      id: string;
      sessionID: string;
      role: 'user' | 'assistant';
      model?: {
        providerID?: string;
        modelID?: string;
      };
    };
  };
}

export interface MessagePartUpdatedEvent {
  type: 'message.part.updated';
  properties: {
    part: TextPart | ReasoningPart | ToolPart;
    delta?: string;
  };
}

export interface TextPart {
  type: 'text';
  messageID: string;
  text: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  messageID: string;
  text: string;
}

export interface ToolPart {
  type: 'tool';
  messageID: string;
  callID: string;
  tool: string;
  state: ToolState;
}

export interface ToolState {
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: unknown;
  output?: string;
  error?: string;
  title?: string;
  metadata?: unknown;
}

export interface SessionIdleEvent {
  type: 'session.idle';
  properties: {
    sessionID: string;
  };
}

export interface SessionErrorEvent {
  type: 'session.error';
  properties: {
    sessionID: string;
    error?: {
      name?: string;
      type?: string;
      message?: string;
      data?: { message?: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Realtime WS + JSON Patch protocol (v1)
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export type JsonPatchOperation =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'test'; path: string; value: unknown }

export type RealtimeWsClientMessage =
  | { type: 'subscribe'; payload: { sessionIds: string[] } }
  | { type: 'unsubscribe'; payload: { sessionIds: string[] } }

export type RealtimeWsServerMessage =
  | { type: 'snapshot'; payload: { state: RealtimeStateV1 } }
  | { type: 'patch'; payload: { ops: JsonPatchOperation[] } }
  | { type: 'error'; payload: { message: string } }

export type RealtimeSessionStatusType = 'idle' | 'busy' | 'retry' | 'error'

export type RealtimeStateV1 = {
  schemaVersion: 1
  workspaceId: string
  subscriptions: { sessionIds: string[] }

  // Normalized state tree: maps keyed by stable IDs.
  sessions: {
    byId: Record<string, { id: string; title?: string; status?: RealtimeSessionStatusType; error?: string }>
    order: string[]
  }

  messages: {
    byId: Record<string, { id: string; sessionID: string; role: string }>
    idsBySessionId: Record<string, string[]>
  }

  parts: {
    byId: Record<
      string,
      {
        id: string
        messageID: string
        sessionID: string
        type: string
        text?: string
        tool?: string
        callID?: string
        state?: ToolState
      }
    >
    idsByMessageId: Record<string, string[]>
  }

  permissions: {
    needsRefreshBySessionId: Record<string, boolean>
  }

  questions: {
    needsRefreshBySessionId: Record<string, boolean>
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isJsonPatchOperation(value: unknown): value is JsonPatchOperation {
  if (!isJsonRecord(value)) return false
  if (typeof value.op !== 'string') return false
  if (typeof value.path !== 'string') return false
  if (value.op === 'add' || value.op === 'replace' || value.op === 'test') return 'value' in value
  if (value.op === 'remove') return true
  return false
}

export function parseRealtimeWsClientMessage(value: unknown): RealtimeWsClientMessage | null {
  if (!isJsonRecord(value)) return null
  const type = value.type
  const payload = value.payload
  if (type !== 'subscribe' && type !== 'unsubscribe') return null
  if (!isJsonRecord(payload)) return null
  if (!isStringArray(payload.sessionIds)) return null
  return { type, payload: { sessionIds: payload.sessionIds } }
}

export function parseRealtimeWsServerMessage(value: unknown): RealtimeWsServerMessage | null {
  if (!isJsonRecord(value)) return null
  const type = value.type
  const payload = value.payload
  if (type !== 'snapshot' && type !== 'patch' && type !== 'error') return null
  if (!isJsonRecord(payload)) return null

  if (type === 'error') {
    return typeof payload.message === 'string' ? { type, payload: { message: payload.message } } : null
  }

  if (type === 'patch') {
    const ops = payload.ops
    if (!Array.isArray(ops) || !ops.every(isJsonPatchOperation)) return null
    return { type, payload: { ops: ops as JsonPatchOperation[] } }
  }

  // snapshot
  const state = payload.state
  if (!isJsonRecord(state)) return null
  if (state.schemaVersion !== 1) return null
  return { type, payload: { state: state as unknown as RealtimeStateV1 } }
}

export const realtimeWsExampleClientSubscribe: RealtimeWsClientMessage = {
  type: 'subscribe',
  payload: { sessionIds: ['sess_123'] },
}

export const realtimeWsExampleSnapshot: RealtimeWsServerMessage = {
  type: 'snapshot',
  payload: {
    state: {
      schemaVersion: 1,
      workspaceId: 'ws_1',
      subscriptions: { sessionIds: ['sess_123'] },
      sessions: { byId: { sess_123: { id: 'sess_123', title: 'Demo', status: 'idle' } }, order: ['sess_123'] },
      messages: {
        byId: { msg_1: { id: 'msg_1', sessionID: 'sess_123', role: 'assistant' } },
        idsBySessionId: { sess_123: ['msg_1'] },
      },
      parts: {
        byId: { part_1: { id: 'part_1', messageID: 'msg_1', sessionID: 'sess_123', type: 'text', text: 'hi' } },
        idsByMessageId: { msg_1: ['part_1'] },
      },
      permissions: { needsRefreshBySessionId: { sess_123: false } },
      questions: { needsRefreshBySessionId: { sess_123: false } },
    },
  },
}

export const realtimeWsExamplePatch: RealtimeWsServerMessage = {
  type: 'patch',
  payload: {
    ops: [
      { op: 'replace', path: '/sessions/byId/sess_123/status', value: 'busy' },
      { op: 'add', path: '/parts/byId/part_1/text', value: 'hi there' },
    ],
  },
}

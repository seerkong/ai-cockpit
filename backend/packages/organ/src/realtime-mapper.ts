import type { JsonPatchOperation, OpencodeEvent, RealtimeSessionStatusType, RealtimeStateV1, ToolState } from 'shared'

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseToolState(value: unknown): ToolState | undefined {
  if (!isJsonRecord(value)) return undefined
  const status = typeof value.status === 'string' ? value.status : ''
  if (status !== 'pending' && status !== 'running' && status !== 'completed' && status !== 'error') return undefined
  return {
    status,
    input: value.input,
    output: typeof value.output === 'string' ? value.output : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    metadata: value.metadata,
  }
}

function encodeJsonPointerSegment(seg: string): string {
  // RFC 6901
  return seg.replace(/~/g, '~0').replace(/\//g, '~1')
}

function path(parts: string[]): string {
  if (parts.length === 0) return ''
  return `/${parts.map(encodeJsonPointerSegment).join('/')}`
}

function opAdd(pathname: string, value: unknown): JsonPatchOperation {
  return { op: 'add', path: pathname, value }
}

function mergeStreamingText(existing: string, nextText: unknown, delta: string): string {
  const candidate = typeof nextText === 'string' ? nextText : ''
  if (candidate) {
    if (!existing || candidate.startsWith(existing)) return candidate
    if (existing.startsWith(candidate)) return existing
  }
  if (delta && !existing.endsWith(delta)) return existing + delta
  return existing
}

function eventSessionId(evt: OpencodeEvent): string | null {
  const type = typeof evt.type === 'string' ? evt.type : ''
  const props = isJsonRecord(evt.properties) ? evt.properties : null
  if (!props) return null

  if (type.startsWith('session.')) {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  if (type === 'message.updated') {
    const info = isJsonRecord(props.info) ? props.info : null
    return info && typeof info.sessionID === 'string' ? info.sessionID : null
  }
  if (type === 'message.part.updated') {
    const part = isJsonRecord(props.part) ? props.part : null
    return part && typeof part.sessionID === 'string' ? part.sessionID : null
  }
  if (type === 'message.removed' || type === 'message.part.removed') {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  if (type === 'permission.asked' || type === 'question.asked') {
    return typeof props.sessionID === 'string' ? props.sessionID : null
  }
  return null
}

function ensureSession(state: RealtimeStateV1, ops: JsonPatchOperation[], sessionId: string) {
  if (!state.sessions.byId[sessionId]) {
    state.sessions.byId[sessionId] = { id: sessionId }
    ops.push(opAdd(path(['sessions', 'byId', sessionId]), state.sessions.byId[sessionId]))
  }
  if (!state.sessions.order.includes(sessionId)) {
    state.sessions.order.push(sessionId)
    ops.push(opAdd(path(['sessions', 'order', '-']), sessionId))
  }
}

function ensureMessagesIndex(state: RealtimeStateV1, ops: JsonPatchOperation[], sessionId: string) {
  if (!state.messages.idsBySessionId[sessionId]) {
    state.messages.idsBySessionId[sessionId] = []
    ops.push(opAdd(path(['messages', 'idsBySessionId', sessionId]), []))
  }
}

function ensureMessagePartsIndex(state: RealtimeStateV1, ops: JsonPatchOperation[], messageId: string) {
  if (!state.parts.idsByMessageId[messageId]) {
    state.parts.idsByMessageId[messageId] = []
    ops.push(opAdd(path(['parts', 'idsByMessageId', messageId]), []))
  }
}

function ensureMessage(state: RealtimeStateV1, ops: JsonPatchOperation[], input: { messageId: string; sessionId: string; role: string }) {
  const existing = state.messages.byId[input.messageId]
  if (!existing) {
    state.messages.byId[input.messageId] = {
      id: input.messageId,
      sessionID: input.sessionId,
      role: input.role,
    }
    ops.push(opAdd(path(['messages', 'byId', input.messageId]), state.messages.byId[input.messageId]))
  } else {
    // Keep it simple: overwrite the record (add == upsert semantics for objects).
    state.messages.byId[input.messageId] = { ...existing, sessionID: input.sessionId, role: input.role }
    ops.push(opAdd(path(['messages', 'byId', input.messageId]), state.messages.byId[input.messageId]))
  }

  ensureMessagesIndex(state, ops, input.sessionId)
  const list = state.messages.idsBySessionId[input.sessionId] ?? []
  if (!list.includes(input.messageId)) {
    list.push(input.messageId)
    state.messages.idsBySessionId[input.sessionId] = list
    ops.push(opAdd(path(['messages', 'idsBySessionId', input.sessionId, '-']), input.messageId))
  }
}

export function createRealtimeStateV1(input: { workspaceId: string }): RealtimeStateV1 {
  return {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    subscriptions: { sessionIds: [] },
    sessions: { byId: {}, order: [] },
    messages: { byId: {}, idsBySessionId: {} },
    parts: { byId: {}, idsByMessageId: {} },
    permissions: { needsRefreshBySessionId: {} },
    questions: { needsRefreshBySessionId: {} },
  }
}

export function applyOpencodeEventToRealtimeState(
  state: RealtimeStateV1,
  evt: OpencodeEvent,
): { ops: JsonPatchOperation[]; sessionId: string | null } {
  const ops: JsonPatchOperation[] = []
  const type = typeof evt.type === 'string' ? evt.type : ''
  const props = isJsonRecord(evt.properties) ? evt.properties : null
  const sessionId = eventSessionId(evt)

  if (!props) return { ops, sessionId }

  if (type === 'session.status' && sessionId) {
    const statusRec = isJsonRecord(props.status) ? props.status : null
    const statusType = statusRec && typeof statusRec.type === 'string' ? statusRec.type : ''
    const mapped: RealtimeSessionStatusType | null =
      statusType === 'busy' || statusType === 'retry' ? (statusType as RealtimeSessionStatusType) : null
    if (!mapped) return { ops, sessionId }

    ensureSession(state, ops, sessionId)
    state.sessions.byId[sessionId] = { ...state.sessions.byId[sessionId], status: mapped }
    ops.push(opAdd(path(['sessions', 'byId', sessionId, 'status']), mapped))
    return { ops, sessionId }
  }

  if (type === 'session.idle' && sessionId) {
    ensureSession(state, ops, sessionId)
    const prev = state.sessions.byId[sessionId]
    const hadError = typeof prev?.error === 'string'
    const { error: _error, ...rest } = prev
    state.sessions.byId[sessionId] = { ...rest, status: 'idle' }
    ops.push(opAdd(path(['sessions', 'byId', sessionId, 'status']), 'idle'))
    if (hadError) {
      ops.push({ op: 'remove', path: path(['sessions', 'byId', sessionId, 'error']) })
    }
    return { ops, sessionId }
  }

  if (type === 'session.error' && sessionId) {
    const errorRec = isJsonRecord(props.error) ? props.error : null
    const message =
      errorRec && typeof errorRec.message === 'string'
        ? errorRec.message
        : isJsonRecord(errorRec?.data) && typeof errorRec?.data?.message === 'string'
          ? (errorRec.data.message as string)
          : 'unknown error'

    ensureSession(state, ops, sessionId)
    state.sessions.byId[sessionId] = { ...state.sessions.byId[sessionId], status: 'error', error: message }
    ops.push(opAdd(path(['sessions', 'byId', sessionId, 'status']), 'error'))
    ops.push(opAdd(path(['sessions', 'byId', sessionId, 'error']), message))
    return { ops, sessionId }
  }

  if (type === 'permission.asked' && sessionId) {
    ensureSession(state, ops, sessionId)
    state.permissions.needsRefreshBySessionId[sessionId] = true
    ops.push(opAdd(path(['permissions', 'needsRefreshBySessionId', sessionId]), true))
    return { ops, sessionId }
  }

  if (type === 'question.asked' && sessionId) {
    ensureSession(state, ops, sessionId)
    state.questions.needsRefreshBySessionId[sessionId] = true
    ops.push(opAdd(path(['questions', 'needsRefreshBySessionId', sessionId]), true))
    return { ops, sessionId }
  }

  if (type === 'message.updated') {
    const info = isJsonRecord(props.info) ? props.info : null
    const messageId = info && typeof info.id === 'string' ? info.id : ''
    const infoSessionId = info && typeof info.sessionID === 'string' ? info.sessionID : ''
    const role = info && typeof info.role === 'string' ? info.role : 'assistant'
    if (!messageId || !infoSessionId) return { ops, sessionId }

    ensureSession(state, ops, infoSessionId)
    ensureMessage(state, ops, { messageId, sessionId: infoSessionId, role })
    return { ops, sessionId: infoSessionId }
  }

  if (type === 'message.part.updated') {
    const part = isJsonRecord(props.part) ? props.part : null
    const partId = part && typeof part.id === 'string' ? part.id : ''
    const messageId = part && typeof part.messageID === 'string' ? part.messageID : ''
    const partSessionId = part && typeof part.sessionID === 'string' ? part.sessionID : sessionId || ''
    const partType = part && typeof part.type === 'string' ? part.type : ''
    const delta = typeof props.delta === 'string' ? props.delta : ''
    if (!partId || !messageId || !partSessionId || !partType) return { ops, sessionId }

    // Keep the realtime state tree aligned with what the UI can currently render.
    // OpenCode emits other part types (e.g. step-start/step-finish) that we intentionally skip.
    if (partType !== 'text' && partType !== 'reasoning' && partType !== 'tool') {
      return { ops, sessionId: partSessionId }
    }

    ensureSession(state, ops, partSessionId)
    // Streaming part updates generally belong to assistant messages.
    ensureMessage(state, ops, { messageId, sessionId: partSessionId, role: 'assistant' })

    const existingText = typeof state.parts.byId[partId]?.text === 'string' ? (state.parts.byId[partId]?.text as string) : ''
    const nextText = mergeStreamingText(existingText, part.text, delta)

    const nextPart = {
      id: partId,
      messageID: messageId,
      sessionID: partSessionId,
      type: partType,
      text: partType === 'text' || partType === 'reasoning' ? nextText : undefined,
      tool: partType === 'tool' && typeof part.tool === 'string' ? part.tool : undefined,
      callID: partType === 'tool' && typeof part.callID === 'string' ? part.callID : undefined,
      state: partType === 'tool' ? parseToolState(part.state) : undefined,
    }
    state.parts.byId[partId] = nextPart
    ops.push(opAdd(path(['parts', 'byId', partId]), nextPart))

    ensureMessagePartsIndex(state, ops, messageId)
    const list = state.parts.idsByMessageId[messageId] ?? []
    if (!list.includes(partId)) {
      list.push(partId)
      state.parts.idsByMessageId[messageId] = list
      ops.push(opAdd(path(['parts', 'idsByMessageId', messageId, '-']), partId))
    }
    return { ops, sessionId: partSessionId }
  }

  return { ops, sessionId }
}

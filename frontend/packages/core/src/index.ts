// @frontend/core — pure functions, no Vue dependency
export { ulid } from './ulid';
export { applyJsonPatch, type ApplyJsonPatchResult } from './lib/json-patch';
export { formatDurationSeconds, formatDurationMs } from './lib/format-duration';
export {
  normalizeEpochMs,
  readMessageCreatedAtMs,
  readMessageCompletedAtMs,
  formatHHMM,
  computeAssistantTurnDurationMs,
  type MessageInfoLike,
  type MessageLike,
} from './lib/message-time';
export { sessionTitleFor, type SessionLike } from './lib/session-title';
export { computeSessionPrimaryStatus, type SessionPrimaryStatus } from './lib/session-status';
export {
  extractRawMessageAgent,
  extractRawMessagePreview,
  sortRawMessagesByCreated,
} from './lib/raw-message-list';
export {
  permissionId,
  permissionSessionId,
  normalizePermissionList,
  type PermissionRequest,
} from './lib/permissions';
export {
  questionId,
  questionSessionId,
  normalizeQuestionList,
  type QuestionRequest,
} from './lib/questions';
export {
  normalizePathSearchResults,
  fileUrlForPath,
  basenameFromPath,
} from './lib/path-search';

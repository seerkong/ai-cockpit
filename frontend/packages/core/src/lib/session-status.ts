export type SessionPrimaryStatus = 'approval' | 'question' | 'running' | 'retry' | 'error' | 'idle'

export function computeSessionPrimaryStatus(input: {
  hasPendingPermission: boolean
  hasPendingQuestion: boolean
  sessionStatus?: string
}): SessionPrimaryStatus {
  if (input.hasPendingPermission) return 'approval'
  if (input.hasPendingQuestion) return 'question'

  const status = input.sessionStatus || 'idle'
  if (status === 'busy') return 'running'
  if (status === 'retry') return 'retry'
  if (status === 'error') return 'error'
  return 'idle'
}

import { matchStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from './statusMaps'

export function getMatchStatusColor(status: string): string {
  return getMapColor(matchStatusMap, status)
}

export function getMatchStatusLabel(status: string): string {
  return getMapLabel(matchStatusMap, status)
}

export function formatMatchStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export function formatMatchFormat(format: string): string {
  const map: Record<string, string> = {
    bo1: 'Best of 1',
    bo3: 'Best of 3',
    bo5: 'Best of 5',
    bo7: 'Best of 7',
  }
  return map[format] ?? format
}

/**
 * Returns the next status in the admin match transition state machine.
 * Must follow backend allowed_transitions.
 */
export function getNextMatchStatus(status: string): string | null {
  const map: Record<string, string> = {
    pending: 'ready',
    ready: 'scheduled',
    scheduled: 'in_progress',
    checking_in: 'in_progress',
    in_progress: 'awaiting_result',
    awaiting_result: 'completed',
    completed: 'awaiting_result',
  }
  return map[status] ?? null
}

export function getMatchActionLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Mark Ready',
    ready: 'Schedule',
    scheduled: 'Start Match',
    checking_in: 'Start Match',
    in_progress: 'Await Result',
    awaiting_result: 'Complete',
    completed: 'Revert to Awaiting Result',
  }
  return map[status] ?? ''
}

export function getMatchActionColor(status: string): string {
  if (['awaiting_result', 'in_progress'].includes(status)) return 'success'
  if (status === 'completed') return 'warning'
  if (status === 'pending') return 'info'
  return 'primary'
}

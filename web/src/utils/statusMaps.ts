export type StatusMap = Record<string, { color: string; label: string; icon?: string }>

export const tournamentStatusMap: StatusMap = {
  draft: { color: 'grey', label: 'Draft', icon: 'mdi-file-document-edit-outline' },
  published: { color: 'info', label: 'Published', icon: 'mdi-eye' },
  registration: { color: 'success', label: 'Registration Open', icon: 'mdi-account-plus' },
  scheduled: { color: 'warning', label: 'Scheduled', icon: 'mdi-calendar-clock' },
  in_progress: { color: 'primary', label: 'In Progress', icon: 'mdi-play-circle' },
  completed: { color: 'success', label: 'Completed', icon: 'mdi-trophy' },
  finalized: { color: 'success', label: 'Finalized', icon: 'mdi-check-all' },
  cancelled: { color: 'error', label: 'Cancelled', icon: 'mdi-close-circle' },
}

export const matchStatusMap: StatusMap = {
  pending: { color: 'grey', label: 'Pending' },
  ready: { color: 'info', label: 'Ready' },
  scheduled: { color: 'primary', label: 'Scheduled' },
  checking_in: { color: 'warning', label: 'Check-in' },
  pick_ban: { color: 'info', label: 'Pick/Ban' },
  in_progress: { color: 'primary', label: 'In Progress' },
  awaiting_result: { color: 'warning', label: 'Awaiting Result' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' },
}

export const registrationStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending' },
  approved: { color: 'success', label: 'Approved' },
  checked_in: { color: 'info', label: 'Checked In' },
  active: { color: 'primary', label: 'Active' },
  eliminated: { color: 'grey', label: 'Eliminated' },
  disqualified: { color: 'error', label: 'Disqualified' },
  withdrawn: { color: 'grey-darken-1', label: 'Withdrawn' },
  no_show: { color: 'grey', label: 'No Show' },
}

export const resultClaimStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Awaiting Confirmation' },
  confirmed: { color: 'success', label: 'Confirmed' },
  disputed: { color: 'error', label: 'Disputed' },
  expired: { color: 'grey', label: 'Expired' },
  superseded: { color: 'grey-darken-1', label: 'Superseded' },
}

export const proposalStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Awaiting Response' },
  accepted: { color: 'success', label: 'Accepted' },
  rejected: { color: 'error', label: 'Rejected' },
  expired: { color: 'grey', label: 'Expired' },
  counter_proposed: { color: 'info', label: 'Counter Proposed' },
}

export const demoStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending', icon: 'mdi-clock-outline' },
  processing: { color: 'info', label: 'Processing', icon: 'mdi-cog-sync' },
  ready: { color: 'success', label: 'Ready', icon: 'mdi-check-circle' },
  failed: { color: 'error', label: 'Failed', icon: 'mdi-alert-circle' },
  archived: { color: 'grey', label: 'Archived', icon: 'mdi-archive' },
}

export const demoCategoryMap: StatusMap = {
  uncategorized: { color: 'grey', label: 'Uncategorized', icon: 'mdi-help-circle-outline' },
  pug: { color: 'blue', label: 'PUG', icon: 'mdi-account-group' },
  league: { color: 'purple', label: 'League', icon: 'mdi-trophy' },
  scrim: { color: 'teal', label: 'Scrim', icon: 'mdi-sword-cross' },
  ignored: { color: 'grey-darken-1', label: 'Ignored', icon: 'mdi-eye-off' },
}

export const disputeStatusMap: StatusMap = {
  open: { color: 'error', label: 'Open', icon: 'mdi-alert-circle' },
  assigned: { color: 'warning', label: 'Assigned', icon: 'mdi-account-check' },
  under_review: { color: 'info', label: 'Under Review', icon: 'mdi-magnify' },
  resolved: { color: 'success', label: 'Resolved', icon: 'mdi-check-circle' },
  closed: { color: 'grey', label: 'Closed', icon: 'mdi-close-circle' },
}

export const disputePriorityMap: StatusMap = {
  low: { color: 'grey', label: 'Low' },
  normal: { color: 'info', label: 'Normal' },
  high: { color: 'warning', label: 'High' },
  critical: { color: 'error', label: 'Critical' },
}

export const resultReviewStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending', icon: 'mdi-clock-alert' },
  approved: { color: 'success', label: 'Approved', icon: 'mdi-check' },
  rejected: { color: 'error', label: 'Rejected', icon: 'mdi-close' },
}

export function getStatusColor(map: StatusMap, status: string): string {
  return map[status]?.color ?? 'grey'
}

export function getStatusLabel(map: StatusMap, status: string): string {
  return map[status]?.label ?? status
}

export function getStatusIcon(map: StatusMap, status: string): string {
  return map[status]?.icon ?? 'mdi-help-circle'
}

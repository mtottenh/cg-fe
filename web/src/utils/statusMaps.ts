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

/**
 * Public-facing tournament status copy.
 *
 * Deliberately a SECOND map, not a duplicate to collapse into
 * `tournamentStatusMap`: player-facing pages use a warmer voice than the admin
 * surfaces ("Live Now" vs "In Progress", "Coming Soon" vs "Draft").
 *
 * It must cover EVERY backend status. `TournamentHeader` previously inlined this
 * as a `switch` whose cases had drifted from the API (`registration_open`,
 * `check_in_open`, `ready` — none of which the backend emits), so a tournament in
 * `registration` fell through and the RAW enum was rendered to users.
 * See COVERAGE-PLAN.md §9b P-4. Keep these keys in sync with
 * `tournamentStatusMap` above.
 */
export const tournamentPublicStatusMap: StatusMap = {
  draft: { color: 'grey', label: 'Coming Soon' },
  published: { color: 'info', label: 'Announced' },
  registration: { color: 'success', label: 'Registration Open' },
  scheduled: { color: 'secondary', label: 'Starting Soon' },
  in_progress: { color: 'primary', label: 'Live Now' },
  completed: { color: 'success', label: 'Completed' },
  finalized: { color: 'success', label: 'Finalized' },
  cancelled: { color: 'error', label: 'Cancelled' },
}

/**
 * Keys mirror `TournamentMatchStatus`
 * (api/crates/portal-core/src/types/tournament.rs) and the
 * `tournament_matches_check_status` CHECK constraint
 * (api/migrations/0030_create_tournaments.sql:369).
 */
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
  // Both are real backend statuses that were missing here, so they rendered as
  // the raw enum wherever getMatchStatusLabel() is used.
  forfeit: { color: 'error', label: 'Forfeit' },
  disputed: { color: 'error', label: 'Disputed' },
}

export const registrationStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending' },
  approved: { color: 'success', label: 'Approved' },
  checked_in: { color: 'info', label: 'Checked In' },
  active: { color: 'primary', label: 'Active' },
  eliminated: { color: 'grey', label: 'Eliminated' },
  disqualified: { color: 'error', label: 'Disqualified' },
  withdrawn: { color: 'grey', label: 'Withdrawn' },
  no_show: { color: 'grey', label: 'No Show' },
  // NOTE: `rejected` is not a backend status — `reject_registration` stores
  // `withdrawn` (portal-domain/src/services/tournament/registration.rs:178-193)
  // and the CHECK constraint does not permit it. Kept as a harmless alias.
  rejected: { color: 'error', label: 'Rejected' },
}

/** Keys mirror `ClaimStatus` (portal-domain/src/entities/result_claim.rs:134). */
export const resultClaimStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Awaiting Confirmation' },
  confirmed: { color: 'success', label: 'Confirmed' },
  disputed: { color: 'error', label: 'Disputed' },
  // `expired` is not a backend claim status; kept as a harmless alias.
  expired: { color: 'grey', label: 'Expired' },
  superseded: { color: 'grey', label: 'Superseded' },
  cancelled: { color: 'grey', label: 'Cancelled' },
}

/** Keys mirror `ProposalStatus` (portal-core/src/types/tournament.rs:919). */
export const proposalStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Awaiting Response' },
  accepted: { color: 'success', label: 'Accepted' },
  rejected: { color: 'error', label: 'Rejected' },
  expired: { color: 'grey', label: 'Expired' },
  counter_proposed: { color: 'info', label: 'Counter Proposed' },
  cancelled: { color: 'grey', label: 'Cancelled' },
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
  ignored: { color: 'grey', label: 'Ignored', icon: 'mdi-eye-off' },
}

/**
 * Keys mirror `DisputeStatus` (portal-domain/src/entities/dispute.rs:151) and
 * the `disputes_check_status` CHECK (api/migrations/0039_disputes.sql:43):
 * `pending` / `under_review` / `resolved` / `cancelled`.
 *
 * `pending` and `cancelled` were missing, so the two most common dispute states
 * rendered as the raw enum in the admin disputes table and detail modal — while
 * `open` / `assigned` / `closed` below are values the backend cannot emit.
 */
export const disputeStatusMap: StatusMap = {
  pending: { color: 'error', label: 'Pending', icon: 'mdi-alert-circle' },
  under_review: { color: 'info', label: 'Under Review', icon: 'mdi-magnify' },
  resolved: { color: 'success', label: 'Resolved', icon: 'mdi-check-circle' },
  cancelled: { color: 'grey', label: 'Cancelled', icon: 'mdi-close-circle' },
  // Legacy keys, unreachable from the backend. Kept as harmless aliases.
  open: { color: 'error', label: 'Open', icon: 'mdi-alert-circle' },
  assigned: { color: 'warning', label: 'Assigned', icon: 'mdi-account-check' },
  closed: { color: 'grey', label: 'Closed', icon: 'mdi-close-circle' },
}

export const disputePriorityMap: StatusMap = {
  low: { color: 'grey', label: 'Low' },
  normal: { color: 'info', label: 'Normal' },
  high: { color: 'warning', label: 'High' },
  critical: { color: 'error', label: 'Critical' },
}

export const teamRoleMap: StatusMap = {
  captain: { color: 'primary', label: 'Captain' },
  founder: { color: 'purple', label: 'Founder' },
  officer: { color: 'secondary', label: 'Officer' },
  coach: { color: 'success', label: 'Coach' },
  manager: { color: 'secondary', label: 'Manager' },
  player: { color: 'info', label: 'Player' },
  substitute: { color: 'warning', label: 'Substitute' },
}

export const leagueRoleMap: StatusMap = {
  owner: { color: 'purple', label: 'Owner' },
  admin: { color: 'primary', label: 'Admin' },
  moderator: { color: 'info', label: 'Moderator' },
  member: { color: 'grey', label: 'Member' },
}

/**
 * Shared across three different backend status columns, so it is the union of
 * all of them: `league_teams` (`active`/`inactive`/`disbanded`),
 * `league_team_members` (`active`/`inactive`/`left`/`removed`), `teams`
 * (`active`/`inactive`/`disbanded`/`suspended`) and legacy `team_members`
 * (`active`/`inactive`/`benched`/`trial`).
 */
export const teamStatusMap: StatusMap = {
  active: { color: 'success', label: 'Active' },
  inactive: { color: 'grey', label: 'Inactive' },
  pending: { color: 'warning', label: 'Pending' },
  disbanded: { color: 'error', label: 'Disbanded' },
  left: { color: 'error', label: 'Left' },
  suspended: { color: 'error', label: 'Suspended' },
  // Real backend values that were missing and rendered as the raw enum.
  removed: { color: 'error', label: 'Removed' },
  benched: { color: 'grey', label: 'Benched' },
  trial: { color: 'info', label: 'Trial' },
}

export const teamInvitationStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending' },
  accepted: { color: 'success', label: 'Accepted' },
  declined: { color: 'error', label: 'Declined' },
  cancelled: { color: 'grey', label: 'Cancelled' },
  expired: { color: 'grey', label: 'Expired' },
}

/**
 * Keys mirror `SeasonStatus` (portal-core/src/types/league_team.rs:12) and the
 * `league_seasons_check_status` CHECK
 * (api/migrations/0025_league_teams_and_seasons.sql:61):
 * `draft` / `registration` / `active` / `playoffs` / `completed` / `cancelled`.
 *
 * `registration`, `active` and `playoffs` were missing, so every non-draft
 * season rendered as the raw enum; `registration_open` / `registration_closed` /
 * `in_progress` below are values the backend cannot emit.
 */
export const seasonStatusMap: StatusMap = {
  draft: { color: 'grey', label: 'Draft' },
  registration: { color: 'info', label: 'Registration Open' },
  active: { color: 'primary', label: 'Active' },
  playoffs: { color: 'deep-purple', label: 'Playoffs' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' },
  // Legacy keys, unreachable from the backend. Kept as harmless aliases.
  registration_open: { color: 'info', label: 'Registration Open' },
  registration_closed: { color: 'warning', label: 'Registration Closed' },
  in_progress: { color: 'primary', label: 'In Progress' },
}

export const banTypeMap: StatusMap = {
  platform: { color: 'error', label: 'Platform', icon: 'mdi-block-helper' },
  matchmaking: { color: 'warning', label: 'Matchmaking', icon: 'mdi-controller-off' },
  chat: { color: 'info', label: 'Chat', icon: 'mdi-message-off' },
  league: { color: 'purple', label: 'League', icon: 'mdi-trophy-broken' },
  tournament: { color: 'orange', label: 'Tournament', icon: 'mdi-tournament' },
}

export const banStatusMap: StatusMap = {
  active: { color: 'error', label: 'Active' },
  lifted: { color: 'success', label: 'Lifted' },
  expired: { color: 'grey', label: 'Expired' },
}

export const permissionCategoryMap: StatusMap = {
  platform: { color: 'purple', label: 'Platform' },
  team: { color: 'blue', label: 'Team' },
  league: { color: 'green', label: 'League' },
  tournament: { color: 'orange', label: 'Tournament' },
  admin: { color: 'error', label: 'Admin' },
}

export const leagueAccessTypeMap: StatusMap = {
  open: { color: 'success', label: 'Open', icon: 'mdi-lock-open-variant' },
  application: { color: 'warning', label: 'Application', icon: 'mdi-file-document-edit' },
  invite_only: { color: 'grey', label: 'Invite Only', icon: 'mdi-lock' },
}

export const resultReviewStatusMap: StatusMap = {
  pending: { color: 'warning', label: 'Pending', icon: 'mdi-clock-alert' },
  approved: { color: 'success', label: 'Approved', icon: 'mdi-check' },
  rejected: { color: 'error', label: 'Rejected', icon: 'mdi-close' },
}

export function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
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

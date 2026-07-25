import type { components } from '@/api/types'

type S = components['schemas']

/**
 * A status → presentation map.
 *
 * P-31 made every status a compile-checked union in the generated client, and
 * P-86 keyed the e2e fixtures to those unions. This is the same fix for `src/`:
 * pass the union as `K` and the map must cover it **exactly** — a key the
 * backend does not have fails to compile, and a value it does have that the map
 * omits fails to compile too.
 *
 * That is not hypothetical tidiness. `StatusMap` used to be
 * `Record<string, ...>`, which accepts anything, and it shipped two bugs:
 * `disputePriorityMap` defined `critical` when the backend enum says `urgent`
 * (P-79), and the games table had no map at all (P-91). Both rendered the raw
 * wire value to users.
 *
 * `StatusMap` without a type argument stays permissive, for the maps that have no
 * union to key against — see P-112. Those are the ONLY ones that can still drift;
 * prefer the keyed form whenever a union exists, and if one does not, say in a
 * comment on the map *why* (no enum at all / client-derived / DTO still
 * stringifies it) so the next reader does not have to re-derive it.
 *
 * P-112 took this from 11 unkeyed maps to 5 by typing six DTO fields that stood in
 * front of enums which already derived `Serialize` + `ToSchema`. Two of the five
 * that remain are one-line DTO edits away; three genuinely have nothing to key to.
 */
export type StatusMap<K extends string = string> = Record<
  K,
  { color: string; label: string; icon?: string }
>


export const tournamentStatusMap: StatusMap<S['TournamentStatus']> = {
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
// P-112: keyed at last. This map needed no API change at all — `TournamentStatus`
// has been a declared union since P-31 and `tournamentStatusMap` above was already
// keyed to it; this one was simply never converted. Keying it is what enforces the
// "keep these keys in sync" instruction in the comment above, which until now was
// only a request.
export const tournamentPublicStatusMap: StatusMap<S['TournamentStatus']> = {
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
export const matchStatusMap: StatusMap<S['TournamentMatchStatus']> = {
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

// P-112: dropped a stale `rejected` key — no such registration status exists.
export const registrationStatusMap: StatusMap<S['TournamentRegistrationStatus']> = {
  pending: { color: 'warning', label: 'Pending' },
  approved: { color: 'success', label: 'Approved' },
  checked_in: { color: 'info', label: 'Checked In' },
  active: { color: 'primary', label: 'Active' },
  eliminated: { color: 'error', label: 'Eliminated' },
  disqualified: { color: 'error', label: 'Disqualified' },
  withdrawn: { color: 'grey', label: 'Withdrawn' },
  no_show: { color: 'error', label: 'No Show' },
}

/** Keys mirror `ClaimStatus` (portal-domain/src/entities/result_claim.rs:134). */
// P-112: dropped a stale `expired` key — `ClaimStatus` has no such value.
export const resultClaimStatusMap: StatusMap<S['ClaimStatus']> = {
  pending: { color: 'warning', label: 'Pending' },
  confirmed: { color: 'success', label: 'Confirmed' },
  disputed: { color: 'error', label: 'Disputed' },
  superseded: { color: 'grey', label: 'Superseded' },
  cancelled: { color: 'grey', label: 'Cancelled' },
}

/** Keys mirror `ProposalStatus` (portal-core/src/types/tournament.rs:919). */
export const proposalStatusMap: StatusMap<S['ProposalStatus']> = {
  pending: { color: 'warning', label: 'Awaiting Response' },
  accepted: { color: 'success', label: 'Accepted' },
  rejected: { color: 'error', label: 'Rejected' },
  expired: { color: 'grey', label: 'Expired' },
  counter_proposed: { color: 'info', label: 'Counter Proposed' },
  cancelled: { color: 'grey', label: 'Cancelled' },
}

export const demoStatusMap: StatusMap<S['DemoStatus']> = {
  pending: { color: 'warning', label: 'Pending', icon: 'mdi-clock-outline' },
  processing: { color: 'info', label: 'Processing', icon: 'mdi-cog-sync' },
  ready: { color: 'success', label: 'Ready', icon: 'mdi-check-circle' },
  failed: { color: 'error', label: 'Failed', icon: 'mdi-alert-circle' },
  archived: { color: 'grey', label: 'Archived', icon: 'mdi-archive' },
}

// P-112: `DemoResponse.category` was `String` in front of `DemoCategory`, which
// already derived `Serialize` + `ToSchema`. Now typed, so this map is locked.
export const demoCategoryMap: StatusMap<S['DemoCategory']> = {
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
// P-112: dropped stale `open`/`assigned`/`closed` keys — none exist in `DisputeStatus`.
export const disputeStatusMap: StatusMap<S['DisputeStatus']> = {
  pending: { color: 'warning', label: 'Pending' },
  under_review: { color: 'info', label: 'Under Review' },
  resolved: { color: 'success', label: 'Resolved' },
  cancelled: { color: 'grey', label: 'Cancelled' },
}

// P-79: the backend enum is `low | normal | high | URGENT`
// (portal-domain/src/entities/dispute.rs:209). This map said `critical`, which
// no dispute can ever have — so every `urgent` dispute, the priority
// auto-assigned to CHEATING reports, fell through to the raw wire value and
// rendered as literal "urgent priority" in the lowest-weight grey styling.
//
// P-112 CLOSED for this map: `DisputeResponse.priority` is now typed
// `DisputePriority` on the wire, so the union exists and this map is keyed to it.
// The drift that produced P-79 is now a compile error rather than a grey chip
// reading "urgent priority".
export const disputePriorityMap: StatusMap<S['DisputePriority']> = {
  low: { color: 'grey', label: 'Low' },
  normal: { color: 'info', label: 'Normal' },
  high: { color: 'warning', label: 'High' },
  urgent: { color: 'error', label: 'Urgent' },
}

/**
 * P-131 — why a dispute's `reason` needs a map at all.
 *
 * It reads like free text and was rendered like free text (a `pre-wrap` block in
 * the detail modal, a truncating span in the queue), but `DisputeResponse.reason`
 * is the `DisputeReason` ENUM — the picker in `ResultDisputeModal` writes one of
 * seven wire values. So both admin surfaces printed `player_misconduct` at the
 * operator triaging the report. `description` beside it is the free-text field
 * and stays unmapped.
 *
 * Keyed, so a reason the backend adds and this map forgets is a compile error
 * rather than another snake_case leak.
 */
export const disputeReasonMap: StatusMap<S['DisputeReason']> = {
  wrong_score: { color: 'warning', label: 'Wrong Score', icon: 'mdi-numeric' },
  wrong_winner: { color: 'warning', label: 'Wrong Winner', icon: 'mdi-trophy-broken' },
  cheating: { color: 'error', label: 'Cheating', icon: 'mdi-shield-alert' },
  rule_violation: { color: 'error', label: 'Rule Violation', icon: 'mdi-gavel' },
  technical_issue: { color: 'info', label: 'Technical Issue', icon: 'mdi-lan-disconnect' },
  player_misconduct: { color: 'error', label: 'Player Misconduct', icon: 'mdi-account-alert' },
  other: { color: 'grey', label: 'Other', icon: 'mdi-help-circle-outline' },
}

// P-91: the games table rendered `{{ item.status }}` raw because no map existed.
// `disable` writes `maintenance`, not `disabled` (repositories/game.rs:182), so
// a disabled game showed the literal string "maintenance" to the operator.
//
// NOT keyable (P-112): `games.status` is a bare `VARCHAR` column with no Rust
// enum behind it, so there is nothing to declare in the spec. Declaring one would
// mean inventing a type and hoping it matches what the column holds.
//
// The column is not unconstrained, though — `games_check_status`
// (migrations/0003_create_games.sql:49) permits FIVE values, and this map covered
// only two of them, so `inactive`, `beta` and `deprecated` fell through to the raw
// wire value in the admin table. The three added below close that; keying is what
// would have caught it, which is the whole argument for P-112.
export const gameStatusMap: StatusMap = {
  active: { color: 'success', label: 'Active' },
  inactive: { color: 'grey', label: 'Inactive' },
  beta: { color: 'info', label: 'Beta' },
  deprecated: { color: 'grey', label: 'Deprecated' },
  maintenance: { color: 'warning', label: 'Disabled' },
}

// P-112: every `role` field on the league-team responses (member, member-with-player,
// player-membership, and both invitation shapes) was `String` in front of
// `LeagueTeamRole`. Typing them produced the union — and keying this map to it
// deleted FOUR keys the backend can never emit: `founder`, `officer`, `coach` and
// `manager`. `LeagueTeamRole` is exactly captain | player | substitute.
export const teamRoleMap: StatusMap<S['LeagueTeamRole']> = {
  captain: { color: 'primary', label: 'Captain' },
  player: { color: 'info', label: 'Player' },
  substitute: { color: 'warning', label: 'Substitute' },
}

// NOT keyable yet (P-112): `LeagueMemberResponse.membership_type` and
// `LeagueInvitationResponse.role` are still `String` in front of
// `LeagueMembershipType`, which already derives `Serialize` + `ToSchema`. The DTO
// lives in `dto/responses/league.rs`, held by another lane this wave.
// When it is typed, key this to `S['LeagueMembershipType']` — which will drop
// `owner`, a key that enum does not have.
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
// P-112: this map is used for TWO enums — `LeagueTeamStatus` on the team row and
// `LeagueTeamSeasonStatus` on the season row — so it is keyed to their union.
// Keying it revealed that five season values (`forming`, `registered`,
// `eliminated`, `disqualified`, `withdrawn`) had NO entry and rendered as the
// raw wire value, while six values belonging to neither enum (`left`,
// `suspended`, `removed`, `benched`, `trial`, plus a duplicate) sat unused.
//
// ...except `left` and `removed` were NOT unused, and dropping them re-opened
// the leak the keying was meant to close. There is a THIRD consumer:
// `MyLeagueTeamsPage` renders `membership.status`, which is
// `LeagueTeamMemberStatus` (active | inactive | left | removed) — a member row,
// not a team row. `v_player_league_teams` (migrations/0026:454) has no status
// filter and `list_memberships_for_player` adds none, so a player who leaves or
// is removed keeps a card on "My Teams" and its chip printed the literal wire
// value `left` / `removed`. Found by auditing the call sites while fixing P-133,
// which is the same "the map does not cover the enum the call site feeds it"
// mistake one property over. The union now names all three enums, so the next
// consumer to point a fourth enum at this map fails to compile.
export const teamStatusMap: StatusMap<
  S['LeagueTeamStatus'] | S['LeagueTeamSeasonStatus'] | S['LeagueTeamMemberStatus']
> = {
  // LeagueTeamStatus
  active: { color: 'success', label: 'Active' },
  inactive: { color: 'grey', label: 'Inactive' },
  disbanded: { color: 'error', label: 'Disbanded' },
  // LeagueTeamSeasonStatus — `LeagueTeamsPanel`/`AdminTeamsPage` render
  // `team_status` from the season row through this same map.
  forming: { color: 'info', label: 'Forming' },
  pending: { color: 'warning', label: 'Pending' },
  registered: { color: 'success', label: 'Registered' },
  eliminated: { color: 'error', label: 'Eliminated' },
  disqualified: { color: 'error', label: 'Disqualified' },
  withdrawn: { color: 'grey', label: 'Withdrawn' },
  // LeagueTeamMemberStatus — `MyLeagueTeamsPage` renders `membership.status`.
  left: { color: 'grey', label: 'Left' },
  removed: { color: 'error', label: 'Removed' },
}

export const teamInvitationStatusMap: StatusMap<S['LeagueTeamInvitationStatus']> = {
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
// P-112: dropped stale `registration_open`/`registration_closed`/`in_progress`
// keys — the season enum renamed them and the map kept both spellings.
export const seasonStatusMap: StatusMap<S['SeasonStatus']> = {
  draft: { color: 'grey', label: 'Draft' },
  registration: { color: 'success', label: 'Registration Open' },
  active: { color: 'primary', label: 'Active' },
  playoffs: { color: 'warning', label: 'Playoffs' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' },
}

// P-112: `BanResponse.ban_type` is now typed `BanType` on the wire.
export const banTypeMap: StatusMap<S['BanType']> = {
  platform: { color: 'error', label: 'Platform', icon: 'mdi-block-helper' },
  matchmaking: { color: 'warning', label: 'Matchmaking', icon: 'mdi-controller-off' },
  chat: { color: 'info', label: 'Chat', icon: 'mdi-message-off' },
  league: { color: 'purple', label: 'League', icon: 'mdi-trophy-broken' },
  tournament: { color: 'orange', label: 'Tournament', icon: 'mdi-tournament' },
}

// NOT keyable (P-112): unlike `banTypeMap` above, this is not a wire field at all.
// `AdminBansPage.getBanStatusKey()` DERIVES the key client-side from `lifted_at` /
// `ends_at` / `is_active`, so there is no backend enum to key against and never
// will be until the API exposes a computed ban state.
export const banStatusMap: StatusMap = {
  active: { color: 'error', label: 'Active' },
  lifted: { color: 'success', label: 'Lifted' },
  expired: { color: 'grey', label: 'Expired' },
}

// NOT keyable (P-112): `permissions.category` is free text —
// `migrations/0009_create_permissions.sql:14` declares it `VARCHAR(64) NOT NULL
// DEFAULT 'general'` with NO check constraint and no Rust enum, so any category a
// seed invents is legal. (`roles.category` IS constrained, but that is a different
// column and this map is only ever fed `PermissionResponse.category`.)
export const permissionCategoryMap: StatusMap = {
  platform: { color: 'purple', label: 'Platform' },
  team: { color: 'blue', label: 'Team' },
  league: { color: 'green', label: 'League' },
  tournament: { color: 'orange', label: 'Tournament' },
  admin: { color: 'error', label: 'Admin' },
}

// NOT keyable yet (P-112): `LeagueAccessType` already derives `Serialize` +
// `ToSchema`, but `LeagueResponse.access_type` is still `String`
// (`dto/responses/league.rs`, held by another lane this wave). One-line fix there,
// then key this to `S['LeagueAccessType']`.
export const leagueAccessTypeMap: StatusMap = {
  open: { color: 'success', label: 'Open', icon: 'mdi-lock-open-variant' },
  application: { color: 'warning', label: 'Application', icon: 'mdi-file-document-edit' },
  invite_only: { color: 'grey', label: 'Invite Only', icon: 'mdi-lock' },
}

// Values from `ResultReviewStatus` (portal-domain/src/entities/result_review.rs:24).
// This map previously held `pending` -- which the backend CANNOT emit -- and omitted
// pending_acknowledgment, pending_admin_review and acknowledged, so the admin table
// and the modal chip both printed the raw enum. Same root cause as P-35, which gated
// the Decision Form on that same impossible value.
export const resultReviewStatusMap: StatusMap<S['ResultReviewStatus']> = {
  pending_acknowledgment: {
    color: 'warning',
    label: 'Awaiting Captains',
    icon: 'mdi-account-clock',
  },
  pending_admin_review: { color: 'warning', label: 'Needs Review', icon: 'mdi-clock-alert' },
  acknowledged: { color: 'info', label: 'Acknowledged', icon: 'mdi-check-circle-outline' },
  approved: { color: 'success', label: 'Approved', icon: 'mdi-check' },
  rejected: { color: 'error', label: 'Rejected', icon: 'mdi-close' },
}

// Evidence lifecycle. Values from migrations/0060_evidence_pending_status.sql:
// the CHECK constraint is ('pending','active','expired','deleted','quarantined').
export const evidenceStatusMap: StatusMap<S['EvidenceStatus']> = {
  pending: { color: 'warning', label: 'Pending', icon: 'mdi-clock-outline' },
  active: { color: 'success', label: 'Active', icon: 'mdi-check-circle' },
  expired: { color: 'grey', label: 'Expired', icon: 'mdi-clock-alert-outline' },
  deleted: { color: 'error', label: 'Deleted', icon: 'mdi-delete' },
  quarantined: { color: 'error', label: 'Quarantined', icon: 'mdi-shield-alert' },
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

// P-112 sweep: maps the guard's first run showed were missing entirely, so the
// components rendered the wire value. Both enums ARE declared, so both are
// compile-locked.
export const lineupStatusMap: StatusMap<S['LineupStatus']> = {
  draft: { color: 'grey', label: 'Draft' },
  submitted: { color: 'info', label: 'Submitted' },
  locked: { color: 'success', label: 'Locked' },
}

export const tournamentInvitationStatusMap: StatusMap<S['TournamentInvitationStatus']> = {
  pending: { color: 'warning', label: 'Pending' },
  accepted: { color: 'success', label: 'Accepted' },
  revoked: { color: 'error', label: 'Revoked' },
}

// P-117: stage formats were rendered raw ("round_robin") in the stages list and
// offered raw in the picker.
//
// P-112 CLOSED for this map: `TournamentStageResponse.format` is now typed
// `StageFormat` rather than stringified, so the union exists and the map is keyed
// to it. The picker's option list (`StagesTab.vue`) derives its titles from this
// same map, so a format the backend adds and this map forgets is now a compile
// error at the map — the failure P-99 shipped (`groups_and_playoffs` offered,
// `group_stage` missing) can no longer be written here.
export const stageFormatMap: StatusMap<S['StageFormat']> = {
  single_elimination: { color: 'primary', label: 'Single Elimination' },
  double_elimination: { color: 'primary', label: 'Double Elimination' },
  round_robin: { color: 'info', label: 'Round Robin' },
  swiss: { color: 'info', label: 'Swiss' },
  group_stage: { color: 'secondary', label: 'Group Stage' },
}

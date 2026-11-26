import type { components } from '@/api/types'
import { matchStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from './statusMaps'

type MatchStatus = components['schemas']['TournamentMatchStatus']

/**
 * The admin "advance this match" state machine, keyed to the generated union.
 *
 * `Partial<Record<MatchStatus, MatchStatus>>` rather than a bare
 * `Record<string, string>`: both the FROM key and the TO value are now
 * compile-checked against `TournamentMatchStatus`, so a status that the backend
 * does not have — on either side of the arrow — fails to build. `Partial`
 * because terminal statuses genuinely have no next step, and that absence is
 * the point (see below).
 *
 * Every pair below is in the backend's `allowed_transitions()`
 * (api/crates/portal-core/src/types/tournament.rs:446-472). The type cannot
 * check *that* — it only checks that the literals are real statuses — so the
 * pairs are pinned by `matchStatus.test.ts` instead.
 */
const NEXT_STATUS: Partial<Record<MatchStatus, MatchStatus>> = {
  pending: 'ready',
  // There is deliberately NO `ready` entry either.
  //
  // `ready: 'scheduled'` rendered a button labelled "Schedule" that flipped
  // the status and never asked for a time. A `scheduled` match with no
  // `scheduled_at` is one the check-in sweep never opens, so pressing it
  // stranded the match; the backend now refuses that transition. What moves
  // a match out of `ready` is setting its time: see `needsMatchTime` and the
  // schedule form on the Admin Actions tab.
  scheduled: 'in_progress',
  checking_in: 'in_progress',
  in_progress: 'awaiting_result',
  awaiting_result: 'completed',
  // P-82: there is deliberately NO `completed` entry.
  //
  // This map used to say `completed: 'awaiting_result'`, under a comment
  // claiming it followed the backend. It did not: `Completed` is a terminal
  // state — `TournamentMatchStatus::Completed.allowed_transitions()` returns
  // `vec![]` (tournament.rs:472) and `admin_transition` refuses it even with
  // the override flag. So the "Revert to Awaiting Result" control rendered on
  // every completed match, at two sites (`MatchOverviewTab` and the
  // `MatchesTab` row menu), and 400'd every single time it was pressed.
  //
  // Removing the entry removes the control: both sites gate on
  // `getNextMatchStatus(...)` being non-null.
  //
  // `forfeit` and `cancelled` are absent for the same reason — also terminal.
  // `pick_ban` and `disputed` are absent because they are not admin-advanced
  // here (veto is driven over the websocket; a dispute is resolved through the
  // dispute surface), NOT because a transition is unavailable.
  //
  // Admins DO need a way to correct a wrong-but-confirmed score — that is a
  // real gap, registered separately as P-72. It is not this control: an
  // un-complete path has to be built on the backend first, and inventing one
  // here would just move the 400.
}

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

/** Chip-sized variant: "bo3" → "Bo3". Unknown values pass through. */
export function formatMatchFormatShort(format: string): string {
  return /^bo\d+$/.test(format) ? `B${format.slice(1)}` : format
}

/**
 * The next status in the admin match transition state machine, or `null` when
 * there is no admin-advanceable step from here.
 *
 * `null` is load-bearing: both call sites render their transition control only
 * when this is non-null (`MatchOverviewTab.vue:66`, `MatchesTab.vue:66`), so a
 * status with no entry correctly shows no button at all.
 */
export function getNextMatchStatus(status: string, match?: TransitionContext): MatchStatus | null {
  if (startsVetoNext(status, match)) return 'pick_ban'
  return NEXT_STATUS[status as MatchStatus] ?? null
}

/** The fields of a match that change which admin step comes next. */
interface TransitionContext {
  veto_required?: boolean | null
}

/**
 * A match in check-in that has a map veto goes to the VETO next, not straight
 * to in-progress: the backend starts the veto session on that transition, and
 * the game server is only set up once the veto completes. Jumping to
 * in-progress instead skipped both, with no way back.
 */
function startsVetoNext(status: string, match?: TransitionContext): boolean {
  return status === 'checking_in' && !!match?.veto_required
}

/**
 * Whether an admin transition jumps over check-in / veto / server setup.
 * Those matches can only be played off-platform and reported by hand, and
 * `in_progress` has no route back — worth an explicit confirmation.
 */
export function skipsMatchSetup(fromStatus: string, toStatus: string): boolean {
  return toStatus === 'in_progress' && (fromStatus === 'scheduled' || fromStatus === 'checking_in')
}

export const SKIP_SETUP_WARNING =
  'This skips check-in and the map veto, and no game server is set up for the match — ' +
  'it would have to be played elsewhere and the result reported by hand. It cannot be undone.'

/**
 * Button copy for the transition offered by `getNextMatchStatus`.
 *
 * Keys must line up with `NEXT_STATUS` — a label without a transition is a
 * control that cannot act, which is exactly how P-82 presented ("Revert to
 * Awaiting Result" on a terminal status). `matchStatus.test.ts` asserts the two
 * key sets are identical.
 */
const ACTION_LABEL: Partial<Record<MatchStatus, string>> = {
  pending: 'Mark Ready',
  scheduled: 'Start Match',
  checking_in: 'Start Match',
  in_progress: 'Await Result',
  awaiting_result: 'Complete',
}

export function getMatchActionLabel(status: string, match?: TransitionContext): string {
  if (startsVetoNext(status, match)) return 'Start Veto'
  return ACTION_LABEL[status as MatchStatus] ?? ''
}

/**
 * Whether the admin's next step for this match is to set (or fix) its time.
 *
 * True for a `ready` match, and for a `scheduled` match that has no time: that
 * state should no longer be reachable, but matches that got there earlier
 * need the same way out.
 */
export function needsMatchTime(match: { status: string; scheduled_at?: string | null }): boolean {
  if (match.status === 'ready') return true
  return match.status === 'scheduled' && !match.scheduled_at
}

/** Whether the admin schedule endpoint accepts this match (`ready` or `scheduled`). */
export function canAdminSchedule(status: string): boolean {
  return status === 'ready' || status === 'scheduled'
}

export function getMatchActionColor(status: string): string {
  if (['awaiting_result', 'in_progress'].includes(status)) return 'success'
  if (status === 'pending') return 'info'
  return 'primary'
}

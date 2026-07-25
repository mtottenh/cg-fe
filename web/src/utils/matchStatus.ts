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
  ready: 'scheduled',
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

/**
 * The next status in the admin match transition state machine, or `null` when
 * there is no admin-advanceable step from here.
 *
 * `null` is load-bearing: both call sites render their transition control only
 * when this is non-null (`MatchOverviewTab.vue:66`, `MatchesTab.vue:66`), so a
 * status with no entry correctly shows no button at all.
 */
export function getNextMatchStatus(status: string): MatchStatus | null {
  return NEXT_STATUS[status as MatchStatus] ?? null
}

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
  ready: 'Schedule',
  scheduled: 'Start Match',
  checking_in: 'Start Match',
  in_progress: 'Await Result',
  awaiting_result: 'Complete',
}

export function getMatchActionLabel(status: string): string {
  return ACTION_LABEL[status as MatchStatus] ?? ''
}

export function getMatchActionColor(status: string): string {
  if (['awaiting_result', 'in_progress'].includes(status)) return 'success'
  if (status === 'pending') return 'info'
  return 'primary'
}

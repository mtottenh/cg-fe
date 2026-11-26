/**
 * Pure rules behind the admin match rescue tools: which tool applies in which
 * match status (and why not, when it does not), what each diagnosed problem's
 * suggested action is called, and the check-in deadline arithmetic.
 *
 * The statuses mirror what the backend accepts for each endpoint. They are a
 * convenience: the backend still decides, and its refusal is shown verbatim.
 */

/** Actions the diagnostics endpoint can suggest for a problem. */
export type SuggestedAction =
  | 'set_time'
  | 'extend_checkin'
  | 'reset_veto'
  | 'reset'
  | 'assign_server'
  | 'reload_server'
  | 'clear_server'
  | 'roster_check'
  | 'retry_completion'
  /** Enter or correct the score on the Results tab (e.g. a dropped server result). */
  | 'set_result'

/** Every tool on the Rescue tab that depends on the match status. */
export type RescueTool =
  | 'set_time'
  | 'check_in_window'
  | 'check_in_team'
  | 'start_veto'
  | 'skip_veto'
  | 'reset_veto'
  | 'reset'
  | 'reopen'
  | 'retry_completion'

interface ActionCopy {
  label: string
  icon: string
  color: string
}

const SUGGESTED_ACTION_COPY: Record<SuggestedAction, ActionCopy> = {
  set_time: { label: 'Set match time', icon: 'mdi-calendar-clock', color: 'primary' },
  extend_checkin: { label: 'Extend check-in', icon: 'mdi-timer-plus', color: 'primary' },
  reset_veto: { label: 'Restart veto', icon: 'mdi-restart', color: 'warning' },
  reset: { label: 'Reset match to Ready', icon: 'mdi-backup-restore', color: 'warning' },
  assign_server: { label: 'Assign server', icon: 'mdi-server-plus', color: 'primary' },
  reload_server: { label: 'Reload match on server', icon: 'mdi-server-network', color: 'primary' },
  clear_server: { label: 'Clear match from server', icon: 'mdi-server-remove', color: 'warning' },
  roster_check: { label: 'Check rosters', icon: 'mdi-account-search', color: 'primary' },
  retry_completion: { label: 'Retry completion', icon: 'mdi-refresh', color: 'primary' },
  set_result: { label: 'Enter the result', icon: 'mdi-scoreboard-outline', color: 'primary' },
}

/**
 * Button copy for a problem's `suggested_action`, or `null` for a value this
 * build does not know: a problem with an unknown action still shows its
 * message, it just gets no button that could not act.
 */
export function suggestedActionCopy(action: string): (ActionCopy & { action: SuggestedAction }) | null {
  const copy = SUGGESTED_ACTION_COPY[action as SuggestedAction]
  return copy ? { ...copy, action: action as SuggestedAction } : null
}

export interface ToolState {
  enabled: boolean
  /** Why the tool is unavailable; shown as the disabled button's tooltip. */
  why: string | null
}

const on: ToolState = { enabled: true, why: null }
const off = (why: string): ToolState => ({ enabled: false, why })

const DECIDED = ['forfeit', 'cancelled']

const TOOL_RULES: Record<RescueTool, (status: string) => ToolState> = {
  set_time: (s) =>
    ['ready', 'scheduled'].includes(s)
      ? on
      : off('Only a ready or scheduled match can be given a time. Reset the match to Ready first.'),
  check_in_window: (s) => {
    if (['ready', 'scheduled', 'checking_in'].includes(s)) return on
    if (DECIDED.includes(s)) {
      return off('The window closed and the match was decided. Use "Reopen match and check-in".')
    }
    if (s === 'pending') return off('Both teams must be known before check-in can open.')
    return off('Check-in is already over for this match.')
  },
  check_in_team: (s) =>
    s === 'checking_in' ? on : off('Teams can only be checked in while the check-in window is open.'),
  start_veto: (s) =>
    s === 'checking_in' ? on : off('The veto can be started from check-in. Use "Restart veto" once it has begun.'),
  skip_veto: (s) =>
    s === 'pick_ban' ? on : off('Only a match in pick/ban can skip the veto.'),
  reset_veto: (s) =>
    ['checking_in', 'pick_ban', 'in_progress'].includes(s)
      ? on
      : off('The veto can be restarted during check-in, pick/ban, or a live match with no result yet.'),
  reset: (s) => {
    if (s === 'pending') return off('Both teams must be known before the match can be ready.')
    if (s === 'ready') return off('The match is already Ready.')
    if (s === 'completed') {
      return off('A completed match keeps its result. Correct the score on the Results tab, or revert progression on Admin Actions.')
    }
    return on
  },
  reopen: (s) =>
    DECIDED.includes(s) ? on : off('Only a forfeited or cancelled match needs reopening.'),
  retry_completion: (s) =>
    ['completed', 'forfeit'].includes(s)
      ? on
      : off('Only a completed or forfeited match has a completion to re-run.'),
}

/** Whether `tool` applies to a match in `status`, and why not when it does not. */
export function toolState(tool: RescueTool, status: string): ToolState {
  return TOOL_RULES[tool](status)
}

/** Label for the check-in window tool: it opens the window, or moves its deadline. */
export function checkInWindowLabel(status: string): string {
  return status === 'checking_in' ? 'Extend check-in' : 'Open check-in now'
}

/** Minutes offered by the quick chips under the deadline picker. */
export const DEADLINE_STEPS = [10, 20, 30] as const

/** Default length of a window an admin opens by hand. */
export const DEFAULT_WINDOW_MINUTES = 20

const MINUTE = 60_000

/**
 * A deadline `minutes` after whichever is later: now, or the deadline already
 * set. Extending a window that still has time left adds to it; extending an
 * expired one counts from now.
 */
export function bumpDeadline(current: string | null | undefined, minutes: number, now = new Date()): Date {
  const base = current ? Math.max(new Date(current).getTime(), now.getTime()) : now.getTime()
  return new Date(base + minutes * MINUTE)
}

/** "in 8 min" / "expired 12 min ago", relative to `now`. Empty when there is no time. */
export function describeRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - now.getTime()
  const minutes = Math.round(Math.abs(diff) / MINUTE)
  const span = minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`
  return diff >= 0 ? `in ${span}` : `expired ${span} ago`
}

export function isPast(iso: string | null | undefined, now = new Date()): boolean {
  return !!iso && new Date(iso).getTime() < now.getTime()
}

export interface StuckHint {
  /** Tooltip and accessible name of the row's rescue button. */
  label: string
  /** `warning` needs attention; `info` is decided, tools are there if it was a mistake. */
  severity: 'warning' | 'info'
}

/**
 * Whether a match row looks stuck, from the list data alone (no per-row
 * diagnostics call). `check_in_deadline` is only set once the window opens.
 */
export function stuckHint(
  match: { status: string; scheduled_at?: string | null; check_in_deadline?: string | null },
  now = new Date(),
): StuckHint | null {
  if (match.status === 'scheduled' && !match.scheduled_at) {
    return { label: 'Scheduled with no time: check-in will never open', severity: 'warning' }
  }
  if (match.status === 'checking_in' && isPast(match.check_in_deadline, now)) {
    return { label: 'Check-in window has expired', severity: 'warning' }
  }
  if (match.status === 'forfeit') {
    return { label: 'Forfeited without being played: open the rescue tools', severity: 'info' }
  }
  if (match.status === 'cancelled') {
    return { label: 'Cancelled: open the rescue tools', severity: 'info' }
  }
  return null
}

/** Reservation statuses that still hold (or wait for) a server. */
export function isLiveReservation(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'configuring' || status === 'ready' || status === 'live'
}

/** `settings.game_server` keys the admin settings card edits. */
export interface GameServerSettingsForm {
  enabled: boolean
  /** Blank = backend default. */
  autoConfirmMinutes: number | null
  /** Blank = the tournament's team size. */
  minPlayersToReady: number | null
}

type Json = Record<string, unknown>

const asObject = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Json) } : {}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Read the card's fields out of a tournament's stored `settings`. */
export function readGameServerSettings(settings: unknown): GameServerSettingsForm {
  const gs = asObject(asObject(settings).game_server)
  return {
    enabled: gs.enabled === true,
    autoConfirmMinutes: asNumber(gs.auto_confirm_minutes),
    minPlayersToReady: asNumber(gs.min_players_to_ready),
  }
}

/**
 * The full `settings` object to PATCH: the stored one with only the card's
 * `game_server` keys changed. Every other settings key, and every other
 * `game_server` key (region, cvars, ...), is carried over untouched; a blank
 * number removes its key so the backend default applies again.
 */
export function mergeGameServerSettings(stored: unknown, form: GameServerSettingsForm): Json {
  const settings = asObject(stored)
  const gs = asObject(settings.game_server)
  gs.enabled = form.enabled
  const setOrDrop = (key: string, value: number | null) => {
    if (value === null) delete gs[key]
    else gs[key] = value
  }
  setOrDrop('auto_confirm_minutes', form.autoConfirmMinutes)
  setOrDrop('min_players_to_ready', form.minPlayersToReady)
  return { ...settings, game_server: gs }
}

export interface GuidedReopenResult {
  ok: boolean
  /** Which step failed; null on success. */
  failedStep: 'reset' | 'check_in_window' | null
  /** What to tell the admin, including what did and did not happen. */
  message: string
}

const detailOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'the request failed')

/**
 * Reopen a match that an expired check-in window already forfeited or
 * cancelled: reset it to Ready, then open a fresh window.
 *
 * The two steps are separate requests, so a failure of the second leaves the
 * match reset. The message says exactly that, and what to do next, rather than
 * reporting the whole thing as failed.
 */
export async function runGuidedReopen(steps: {
  reset: () => Promise<unknown>
  openCheckIn: () => Promise<unknown>
}): Promise<GuidedReopenResult> {
  try {
    await steps.reset()
  } catch (e: unknown) {
    return {
      ok: false,
      failedStep: 'reset',
      message: `Nothing was changed. The match could not be reset: ${detailOf(e)}`,
    }
  }
  try {
    await steps.openCheckIn()
  } catch (e: unknown) {
    return {
      ok: false,
      failedStep: 'check_in_window',
      message:
        `The match was reset to Ready, but check-in could not be opened: ${detailOf(e)} ` +
        'Use "Open check-in now" to try again, or set a new match time.',
    }
  }
  return { ok: true, failedStep: null, message: 'Match reopened and check-in is open' }
}

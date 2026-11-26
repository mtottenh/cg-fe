/**
 * The shortest notice a proposed match time may give.
 *
 * Check-in opens 15 minutes before the scheduled time and closes shortly
 * after it. A time agreed with less notice than that starts with the window
 * already running — or, once the opponent takes a while to accept, already
 * over, which forfeits whoever is not at their keyboard. Thirty minutes
 * leaves the whole check-in lead ahead of both teams.
 */
export const MIN_PROPOSAL_LEAD_MINUTES = 30

/** The earliest time that may be proposed right now. */
export function earliestProposableTime(now: Date = new Date()): Date {
  return new Date(now.getTime() + MIN_PROPOSAL_LEAD_MINUTES * 60_000)
}

/** Whether `iso` gives at least the minimum notice, measured from `now`. */
export function givesEnoughNotice(iso: string, now: Date = new Date()): boolean {
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) && ms >= earliestProposableTime(now).getTime()
}

export const TOO_SOON_MESSAGE = `Pick a time at least ${MIN_PROPOSAL_LEAD_MINUTES} minutes from now`

/**
 * Teams may move an agreed time themselves until this long before the match;
 * after that only an organiser can (the backend refuses with 400).
 */
export const RESCHEDULE_CUTOFF_MINUTES = 60
export const RESCHEDULE_CUTOFF_MS = RESCHEDULE_CUTOFF_MINUTES * 60_000

/** Whether teams may still agree a new time for a match set for `scheduledAt`. */
export function canStillReschedule(scheduledAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!scheduledAt) return false
  const ms = new Date(scheduledAt).getTime()
  return Number.isFinite(ms) && ms - now.getTime() > RESCHEDULE_CUTOFF_MS
}

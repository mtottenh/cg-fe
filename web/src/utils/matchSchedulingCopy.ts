/**
 * What the match page tells a viewer while a match is waiting for its time.
 *
 * Who sets the time depends on the tournament: the two sides agree it between
 * themselves in a `self_scheduled` tournament, and an admin sets it in every
 * other mode. The page has to say which, because "time to be agreed" in a
 * tournament where players cannot propose one sends them looking for a control
 * that is not there.
 */
export interface MatchTimeContext {
  status: string
  hasTime: boolean
  /** The tournament is `self_scheduled`. */
  selfScheduled: boolean
  /** The viewer may propose and accept times (captain, owner or delegate). */
  canAgreeTime: boolean
}

/** Trails the format on the header line when the match has no time. */
export function noTimeLabel(selfScheduled: boolean): string {
  return selfScheduled ? 'Time to be agreed' : 'Time not set yet'
}

/** Now-card heading for `ready`, and for `scheduled` with no time; null otherwise. */
export function waitingForTimeHeading(ctx: MatchTimeContext): string | null {
  if (ctx.status === 'ready') {
    if (ctx.canAgreeTime) return 'Agree a time with your opponent'
    return ctx.selfScheduled ? 'Waiting for the teams to agree a time' : 'Waiting for a match time'
  }
  if (ctx.status === 'scheduled' && !ctx.hasTime) return 'Match time not set yet'
  return null
}

/** Now-card note for the same states; null when a panel does the explaining. */
export function waitingForTimeNote(ctx: MatchTimeContext): string | null {
  if (ctx.status === 'ready') {
    if (ctx.canAgreeTime) return null
    return ctx.selfScheduled
      ? 'The two captains agree a time between themselves. Check-in opens here shortly before it.'
      : 'An admin will set the time for this match. Check-in opens here shortly before it.'
  }
  if (ctx.status === 'scheduled' && !ctx.hasTime) {
    return 'This match has no time yet, so check-in cannot open. An admin needs to set one.'
  }
  return null
}

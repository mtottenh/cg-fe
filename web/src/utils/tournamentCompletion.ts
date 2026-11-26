/**
 * Completing a tournament early closes every remaining fixture. The API
 * refuses it while matches remain unless asked to force it, so the UI counts
 * them first and only forces once the admin has confirmed the warning.
 */

/** Statuses a match can no longer leave by being played. */
const SETTLED_STATUSES = ['completed', 'forfeit', 'cancelled']

export interface CompletionReadiness {
  total: number
  unfinished: number
  /** True only when there are matches and every one of them is settled. */
  allFinished: boolean
}

export function completionReadiness(
  matches: ReadonlyArray<{ tournament_id: string; status: string }>,
  tournamentId: string | null | undefined,
): CompletionReadiness {
  const own = matches.filter((m) => m.tournament_id === tournamentId)
  const unfinished = own.filter((m) => !SETTLED_STATUSES.includes(m.status)).length
  return { total: own.length, unfinished, allFinished: own.length > 0 && unfinished === 0 }
}

/** The confirm dialog for "Complete": a plain one, or a warning when matches remain. */
export function completeTournamentPrompt(readiness: CompletionReadiness): {
  title: string
  message: string
  action: string
  color: string
} {
  if (readiness.unfinished > 0) {
    const n = readiness.unfinished
    return {
      title: 'Matches are still unfinished',
      message:
        `${n} of ${readiness.total} ${readiness.total === 1 ? 'match has' : 'matches have'} ` +
        `not been played to a result. Completing the tournament now closes ` +
        `${n === 1 ? 'it' : 'them'} for good: ${n === 1 ? 'it' : 'they'} can no longer be ` +
        `scheduled, played or reported, and the standings stay as they are. ` +
        `This cannot be undone.`,
      action: `Complete with ${n} unfinished`,
      color: 'error',
    }
  }
  return {
    title: 'Complete Tournament',
    message:
      readiness.allFinished
        ? `All ${readiness.total} matches are finished. Mark this tournament as completed?`
        : 'Mark this tournament as completed? Remaining matches will no longer be playable.',
    action: 'Complete',
    color: 'warning',
  }
}

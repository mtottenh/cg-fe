/**
 * "n/m played" for a bracket or group.
 *
 * A forfeit is a decided match — it carries a winner and points — so it
 * counts as played; counting only `completed` left a finished group reading
 * "9/10 played" for ever. A cancelled match (a double no-show) will never be
 * played, so it comes out of the total and is reported on its own.
 */
export interface BracketProgress {
  played: number
  /** Matches that can be, or were, played: everything except cancelled. */
  total: number
  cancelled: number
}

export function bracketProgress(matches: ReadonlyArray<{ status: string }>): BracketProgress {
  const cancelled = matches.filter((m) => m.status === 'cancelled').length
  const played = matches.filter((m) => m.status === 'completed' || m.status === 'forfeit').length
  return { played, total: matches.length - cancelled, cancelled }
}

export function formatBracketProgress(p: BracketProgress): string {
  const base = `${p.played}/${p.total} played`
  return p.cancelled > 0 ? `${base} · ${p.cancelled} cancelled` : base
}

/**
 * Whether a series score is one a best-of-N can end on.
 *
 * Mirrors the API's `validate_series_score`
 * (portal-domain/src/services/tournament/helpers.rs): the winner has exactly
 * the wins the format needs and the loser has fewer. A Bo3 ends 2–0 or 2–1;
 * 3–0 and 1–0 are not finished Bo3 series.
 */

/** Games needed to win: bo1 → 1, bo3 → 2, bo5 → 3, bo7 → 4. Null if unknown. */
export function winsRequired(matchFormat: string | null | undefined): number | null {
  const m = /^bo(\d+)$/.exec(matchFormat ?? '')
  if (!m) return null
  const games = Number(m[1])
  if (!Number.isInteger(games) || games < 1 || games % 2 === 0) return null
  return (games + 1) / 2
}

/**
 * Null when the score is a finished series for the format (or the format is
 * unknown, in which case the API decides); otherwise why it is not.
 */
export function seriesScoreProblem(
  matchFormat: string | null | undefined,
  score1: number,
  score2: number,
): string | null {
  const needed = winsRequired(matchFormat)
  if (needed === null) return null
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    return 'Scores must be whole numbers, zero or more.'
  }
  const high = Math.max(score1, score2)
  const low = Math.min(score1, score2)
  if (high === needed && low < needed) return null
  const label = `Bo${needed * 2 - 1}`
  const valid = Array.from({ length: needed }, (_, i) => `${needed}–${i}`).join(', ')
  return `${score1}–${score2} is not a finished ${label} series: the winner must have exactly ${needed} and the loser fewer (${valid}).`
}

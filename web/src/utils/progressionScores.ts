/**
 * Series-score planning for the admin "Process" / "Reapply" progression
 * actions. Mirrors the backend rules (`validate_series_score` and the
 * progression handlers) so the admin sees the problem before submitting:
 *
 * - Explicit scores are both-or-neither, whole numbers >= 0, a finished
 *   best-of series (winner has exactly `winsRequired`, loser fewer) and must
 *   name the selected winner.
 * - Without explicit scores the backend keeps the stored score when it already
 *   favours the winner, mirrors it when it names the other side, and refuses a
 *   tie (0-0: an unplayed match or a reverted forfeit).
 */

/** Explicit series score sent with a progression request. */
export interface ProgressionScores {
  participant1Score: number
  participant2Score: number
}

export type ProgressionScorePlan =
  /** Send these scores. */
  | { kind: 'explicit'; scores: ProgressionScores }
  /** Send no scores; the backend keeps (or, when `swap`, mirrors) the stored score. */
  | { kind: 'stored'; swap: boolean }
  /** Cannot submit. */
  | { kind: 'invalid'; message: string }

/** Games needed to win a `boN` series; unknown formats fall back to Bo1. */
export function winsRequired(matchFormat: string | null | undefined): number {
  const m = /^bo(\d+)$/i.exec(matchFormat ?? '')
  const n = m ? Number(m[1]) : 1
  return n >= 1 && n % 2 === 1 ? (n + 1) / 2 : 1
}

function parseScore(raw: string | number | null | undefined): number | null | 'bad' {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (text === '') return null
  if (!/^\d+$/.test(text)) return 'bad'
  return Number(text)
}

export interface PlanInput {
  matchFormat: string | null | undefined
  /** Whether the selected winner is participant 1. */
  winnerIsParticipant1: boolean
  winnerName: string
  loserName: string
  /** Raw input values (text-field model). */
  participant1Input: string | number | null | undefined
  participant2Input: string | number | null | undefined
  /** Score currently stored on the match. */
  storedParticipant1: number
  storedParticipant2: number
}

/**
 * Decide what a progression request should send. Inputs left blank, or left
 * equal to the stored score, defer to the stored score (so a stored score that
 * names the other side is mirrored server-side); anything else is validated as
 * an explicit score.
 */
export function planProgressionScores(input: PlanInput): ProgressionScorePlan {
  const p1 = parseScore(input.participant1Input)
  const p2 = parseScore(input.participant2Input)
  const { storedParticipant1: s1, storedParticipant2: s2 } = input

  const bothBlank = p1 === null && p2 === null
  const unchanged = p1 === s1 && p2 === s2
  if (bothBlank || unchanged) {
    if (s1 === s2) {
      return {
        kind: 'invalid',
        message: `The current score ${s1}–${s2} does not determine a winner. Enter the series score for both participants.`,
      }
    }
    return { kind: 'stored', swap: s1 > s2 !== input.winnerIsParticipant1 }
  }

  if (p1 === null || p2 === null) {
    return { kind: 'invalid', message: 'Enter a score for both participants, or leave both blank.' }
  }
  if (p1 === 'bad' || p2 === 'bad') {
    return { kind: 'invalid', message: 'Scores must be whole numbers of 0 or more.' }
  }

  const winnerScore = input.winnerIsParticipant1 ? p1 : p2
  const loserScore = input.winnerIsParticipant1 ? p2 : p1
  if (winnerScore <= loserScore) {
    return {
      kind: 'invalid',
      message: `${input.winnerName} is the selected winner, so must have more games than ${input.loserName}.`,
    }
  }
  const wins = winsRequired(input.matchFormat)
  const format = `Bo${wins * 2 - 1}`
  if (winnerScore !== wins) {
    return {
      kind: 'invalid',
      message: `In a ${format} the winner must have exactly ${wins} game${wins === 1 ? '' : 's'}.`,
    }
  }
  // winnerScore === wins and loserScore < winnerScore, so the loser is below wins.
  return { kind: 'explicit', scores: { participant1Score: p1, participant2Score: p2 } }
}

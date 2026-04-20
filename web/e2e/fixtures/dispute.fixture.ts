/**
 * Dispute fixtures for E2E tests.
 *
 * Provides API helpers for the admin dispute-resolution flow:
 *   submit result  →  dispute the claim  →  raise a formal dispute  →
 *   admin posts messages (internal / public)  →  admin resolves
 *
 * Follows the same style as `match.fixture.ts` — plain fetch calls against
 * real JWTs, no UI clicks. All helpers are intentionally forgiving: they
 * return `null` / `false` on non-2xx so the caller can `test.skip()` cleanly
 * when the backing match is in an unexpected state (e.g., already resolved
 * by a previous run).
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

// Consumers pull seed/login helpers directly from the canonical fixture
// modules: `getSeededState` from `./seeded-state`, `loginAsPlayer2` from
// `./auth.fixture`. This file stays focused on dispute-specific helpers.

// =============================================================================
// Types
// =============================================================================

export interface MatchSummary {
  id: string
  tournament_id: string
  status: string
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  winner_registration_id: string | null
  participant1_score: number | null
  participant2_score: number | null
  [key: string]: unknown
}

export interface ResultClaim {
  id: string
  match_id: string
  status: string
  claimed_winner_registration_id: string
  [key: string]: unknown
}

export interface Dispute {
  id: string
  match_id: string
  status: string
  priority: string
  disputed_by_registration_id: string
  disputed_by_user_id: string
  reason: string
  description: string
  [key: string]: unknown
}

export interface DisputeMessage {
  id: string
  dispute_id: string
  author_user_id: string
  author_type: string
  message: string
  is_internal: boolean
  created_at: string
  [key: string]: unknown
}

export interface DisputeWithThread {
  dispute: Dispute
  messages: DisputeMessage[]
}

// =============================================================================
// Match / result helpers (independent of match.fixture.ts)
// =============================================================================

/**
 * Fetch a single match (including the participant registration IDs we need
 * to build a result claim). Uses the authoritative
 * `GET /v1/tournaments/{tournament_id}/matches/{match_id}` endpoint.
 */
export async function getMatch(
  token: string,
  tournamentId: string,
  matchId: string
): Promise<MatchSummary | null> {
  const response = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) return null
  const data = await response.json()
  return (data.data || data) as MatchSummary
}

/**
 * Fetch the first match for a tournament.
 */
export async function getFirstTournamentMatch(
  token: string,
  tournamentId: string
): Promise<MatchSummary | null> {
  const response = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  const matches: MatchSummary[] = data.data || []
  return matches.length > 0 ? matches[0] : null
}

/**
 * Submit a result claim for a match.
 *
 * Uses the real `POST /v1/matches/{match_id}/result` shape
 * (`claimed_winner_registration_id` + `participant{1,2}_score`).
 */
export async function submitResultClaim(
  token: string,
  matchId: string,
  claimedWinnerRegistrationId: string,
  participant1Score: number,
  participant2Score: number
): Promise<ResultClaim | null> {
  const response = await fetch(`${API_URL}/v1/matches/${matchId}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      claimed_winner_registration_id: claimedWinnerRegistrationId,
      participant1_score: participant1Score,
      participant2_score: participant2Score,
      game_results: [],
    }),
  })
  if (!response.ok) {
    console.error(
      `submitResultClaim failed (${response.status}): ${await response.text()}`
    )
    return null
  }
  const data = await response.json()
  // Response is ResultClaimSubmissionResponse { claim: ResultClaim, ... } ­— unwrap.
  const body = data.data || data
  return (body.claim || body) as ResultClaim
}

/**
 * Dispute a submitted result claim — flips the match to `Disputed` status
 * so we can subsequently raise a formal dispute record.
 */
export async function disputeResultClaim(
  token: string,
  matchId: string,
  claimId: string,
  reason: string
): Promise<boolean> {
  const response = await fetch(
    `${API_URL}/v1/matches/${matchId}/result/${claimId}/dispute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    }
  )
  if (!response.ok) {
    console.error(
      `disputeResultClaim failed (${response.status}): ${await response.text()}`
    )
    return false
  }
  return true
}

// =============================================================================
// Dispute helpers
// =============================================================================

export type DisputeReason =
  | 'wrong_score'
  | 'wrong_winner'
  | 'cheating'
  | 'rule_violation'
  | 'technical_issue'
  | 'player_misconduct'
  | 'other'

/**
 * Raise a formal dispute — creates a row in the admin dispute queue.
 *
 * Preconditions (enforced by the backend):
 *   - Match must be in `Completed` or `Disputed` status.
 *   - `registrationId` must belong to the caller and be one of the match
 *     participants.
 *   - No other pending dispute for this match.
 *
 * `description` must be 20–2000 chars.
 */
export async function raiseDispute(
  token: string,
  tournamentId: string,
  matchId: string,
  registrationId: string,
  reason: DisputeReason,
  description: string,
  resultClaimId?: string
): Promise<Dispute | null> {
  const response = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/dispute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        registration_id: registrationId,
        reason,
        description,
        ...(resultClaimId ? { result_claim_id: resultClaimId } : {}),
      }),
    }
  )
  if (!response.ok) {
    console.error(
      `raiseDispute failed (${response.status}): ${await response.text()}`
    )
    return null
  }
  const data = await response.json()
  return (data.data || data) as Dispute
}

/**
 * Post a message to a dispute as an admin. `isInternal=true` hides the
 * message from participant-facing views (verified against
 * `DisputeThreadPanel.vue` in scenario 3).
 */
export async function adminAddDisputeMessage(
  adminToken: string,
  disputeId: string,
  message: string,
  isInternal: boolean
): Promise<DisputeMessage | null> {
  const response = await fetch(
    `${API_URL}/v1/admin/disputes/${disputeId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        message,
        is_internal: isInternal,
        evidence_ids: [],
      }),
    }
  )
  if (!response.ok) {
    console.error(
      `adminAddDisputeMessage failed (${response.status}): ${await response.text()}`
    )
    return null
  }
  const data = await response.json()
  return (data.data || data) as DisputeMessage
}

/**
 * Resolve a dispute by overturning the original result — declares
 * `newWinnerRegistrationId` as the match winner with the given scores.
 */
export async function adminResolveOverturn(
  adminToken: string,
  disputeId: string,
  newWinnerRegistrationId: string,
  newParticipant1Score: number,
  newParticipant2Score: number,
  notes: string
): Promise<boolean> {
  const response = await fetch(
    `${API_URL}/v1/admin/disputes/${disputeId}/resolve/overturn`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        new_winner_registration_id: newWinnerRegistrationId,
        new_participant1_score: newParticipant1Score,
        new_participant2_score: newParticipant2Score,
        notes,
      }),
    }
  )
  if (!response.ok) {
    console.error(
      `adminResolveOverturn failed (${response.status}): ${await response.text()}`
    )
    return false
  }
  return true
}

/**
 * Fetch a dispute + its message thread. Admins see internal messages;
 * participants do not (backend filters server-side).
 */
export async function getDisputeThread(
  token: string,
  disputeId: string
): Promise<DisputeWithThread | null> {
  const response = await fetch(`${API_URL}/v1/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  return (data.data || data) as DisputeWithThread
}

// =============================================================================
// Test setup helpers
// =============================================================================

/**
 * End-to-end setup for a disputable match: takes an already-started match,
 * submits a P1-wins claim, then has P2 dispute it so the match is in
 * `Disputed` status and a formal dispute can be raised.
 *
 * Returns the context needed to raise + resolve the dispute.
 */
export interface DisputableMatchContext {
  tournamentId: string
  matchId: string
  p1RegistrationId: string
  p2RegistrationId: string
  claimId: string
}

export async function seedDisputableMatch(
  adminToken: string,
  player2Token: string,
  tournamentId: string,
  matchId: string,
  scores: { p1: number; p2: number } = { p1: 16, p2: 10 }
): Promise<DisputableMatchContext | null> {
  // 1. Fetch the match — we need both registration IDs.
  const match = await getMatch(adminToken, tournamentId, matchId)
  if (!match || !match.participant1_registration_id || !match.participant2_registration_id) {
    return null
  }

  // 2. P1 submits a result claim declaring themselves winner.
  const claim = await submitResultClaim(
    adminToken,
    matchId,
    match.participant1_registration_id,
    scores.p1,
    scores.p2
  )
  if (!claim) return null

  // 3. P2 disputes the claim — flips the match to `Disputed`.
  const disputed = await disputeResultClaim(
    player2Token,
    matchId,
    claim.id,
    'Scores are incorrect — I won this match.'
  )
  if (!disputed) return null

  return {
    tournamentId,
    matchId,
    p1RegistrationId: match.participant1_registration_id,
    p2RegistrationId: match.participant2_registration_id,
    claimId: claim.id,
  }
}

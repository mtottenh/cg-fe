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

import type { ClaimStatus, DisputeStatus, TournamentMatchStatus } from './api-status'

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
  status: TournamentMatchStatus
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
  status: ClaimStatus
  claimed_winner_registration_id: string
  [key: string]: unknown
}

/** Mirrors `DisputeResolutionResponse` — populated once a dispute is resolved. */
export interface DisputeResolution {
  resolution_type:
    | 'upheld'
    | 'overturned'
    | 'rematch'
    | 'adjusted'
    | 'double_dq'
  notes: string
  new_winner_registration_id?: string | null
  new_participant1_score?: number | null
  new_participant2_score?: number | null
}

export interface Dispute {
  id: string
  match_id: string
  status: DisputeStatus
  priority: string
  disputed_by_registration_id: string
  disputed_by_user_id: string
  reason: string
  description: string
  original_participant1_score?: number | null
  original_participant2_score?: number | null
  original_winner_registration_id?: string | null
  resolution?: DisputeResolution | null
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
 * Confirm a submitted result claim as the opponent. This is what turns a
 * *claim* into the match's recorded result: the match moves to `completed`
 * with the claimed winner and scores written onto the match row.
 *
 * Needed by the resolutions that operate on an already-confirmed result
 * (uphold / adjusted): only after confirmation does the match actually carry
 * the scores those resolutions are supposed to preserve or rewrite.
 */
export async function confirmResultClaim(
  token: string,
  matchId: string,
  claimId: string
): Promise<boolean> {
  const response = await fetch(
    `${API_URL}/v1/matches/${matchId}/result/${claimId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }
  )
  if (!response.ok) {
    console.error(
      `confirmResultClaim failed (${response.status}): ${await response.text()}`
    )
    return false
  }
  return true
}

/**
 * Dispute a submitted result claim. In the current API this atomically flips
 * the match to `Disputed` AND opens the tournament dispute (the row the admin
 * queue reads) — a separate raiseDispute call is no longer needed (and would
 * fail with "already has a pending dispute").
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

/**
 * Fetch the active dispute for a match. The claim-dispute endpoint opens the
 * dispute but does not return its id, so read it back here.
 */
export async function getMatchDispute(
  token: string,
  tournamentId: string,
  matchId: string
): Promise<Dispute | null> {
  const response = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/dispute`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) return null
  const data = await response.json()
  return (data.data || data) as Dispute
}

// =============================================================================
// Test setup helpers
// =============================================================================

/**
 * End-to-end setup for a disputable match: takes an already-started match,
 * submits a P1-wins claim, then has P2 dispute the claim — which in the
 * current API atomically flips the match to `Disputed` AND opens the
 * tournament dispute.
 *
 * Returns the context needed to resolve the dispute (including its id).
 */
export interface DisputableMatchContext {
  tournamentId: string
  matchId: string
  p1RegistrationId: string
  p2RegistrationId: string
  claimId: string
  /** The dispute opened by the claim dispute. */
  disputeId: string
}

export async function seedDisputableMatch(
  adminToken: string,
  player2Token: string,
  tournamentId: string,
  matchId: string,
  scores: { p1: number; p2: number } = { p1: 1, p2: 0 },
  // Disputing the claim now atomically OPENS the tournament dispute (the API
  // merged the two steps), so this text becomes the dispute's description.
  disputeReason = 'Scores are incorrect — I won this match.'
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

  // 3. P2 disputes the claim — flips the match to `Disputed` AND opens the
  //    tournament dispute (single atomic step in the current API).
  const disputed = await disputeResultClaim(
    player2Token,
    matchId,
    claim.id,
    disputeReason
  )
  if (!disputed) return null

  // 4. Read back the dispute the claim-dispute just opened (its id is not in
  //    the claim-dispute response).
  const dispute = await getMatchDispute(adminToken, tournamentId, matchId)
  if (!dispute) return null

  return {
    tournamentId,
    matchId,
    p1RegistrationId: match.participant1_registration_id,
    p2RegistrationId: match.participant2_registration_id,
    claimId: claim.id,
    disputeId: dispute.id,
  }
}

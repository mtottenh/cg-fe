/**
 * Extra fixtures for `match-results.spec.ts` ONLY.
 *
 * Scenario builder: composes `createCheckInScenario` (fresh tournament, two
 * ephemeral players, generated bracket, match driven to `checking_in`) and
 * then checks both participants in so the match auto-advances into
 * `in_progress` — the state required by the backend before a result claim
 * can be submitted (`MatchStatus::can_submit_result` allows only
 * `in_progress` / `awaiting_result`).
 *
 * Result-claim API helpers: these exist here instead of reusing
 * `submitResult`/`respondToResult` from `match.fixture.ts` because those
 * target `/v1/matches/{id}/results...` (plural) with a bare
 * `{ game_scores }` body. The backend's actual routes (see
 * `api/crates/portal-api/src/routes/matches.rs`) are:
 *
 *   POST /v1/matches/{match_id}/result
 *        body: { claimed_winner_registration_id, participant1_score,
 *                participant2_score, game_results, evidence_ids,
 *                demo_link_ids, notes }
 *        (participant1/2_score are SERIES scores; for a BO1 the total must
 *         equal 1, with per-map scores carried in game_results)
 *   GET  /v1/matches/{match_id}/result                  (public; pending claim)
 *   POST /v1/matches/{match_id}/result/{claim_id}/confirm
 *   POST /v1/matches/{match_id}/result/{claim_id}/dispute
 *        body: { reason, evidence_ids }
 *
 * Shared fixtures are frozen while several specs are converted in parallel,
 * so the corrected helpers live in this spec-private file.
 */

import {
  createCheckInScenario,
  checkInViaApi,
  getMatch,
  type CheckInScenario,
} from './checkin.fixture'
import {
  createDraftTournament,
  type TournamentSummary,
} from './tournament-lifecycle.fixture'
import { uniqueId } from './test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Re-export: a result scenario is a check-in scenario whose match has been
 *  advanced to `in_progress`. `p1` is always participant 1 on the match. */
export type ResultScenario = CheckInScenario

export interface ResultClaim {
  id: string
  status: string
  claimed_winner_registration_id: string
  claimed_participant1_score: number
  claimed_participant2_score: number
}

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(`${context}: failed to parse JSON (${String(err)}): ${text}`)
  }
}

/**
 * Force a match into a specific status via the admin transition endpoint.
 * Used as a deterministic fallback when the state machine's auto-advance
 * lands somewhere other than `in_progress` (e.g. `pick_ban` on
 * veto-required tournaments).
 */
export async function adminTransitionMatch(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  toStatus: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        to_status: toStatus,
        override_reason: `E2E fixture: force match to ${toStatus}`,
      }),
    },
  )
  if (!resp.ok) {
    throw new Error(
      `Admin transition to ${toStatus} failed (${resp.status}): ${await resp.text()}`,
    )
  }
}

/**
 * Build a fresh tournament with one match in `in_progress`, ready for
 * result submission. Every call creates brand-new users + tournament, so
 * parallel workers and repeated runs never contend on shared state.
 */
export async function createResultScenario(adminToken: string): Promise<ResultScenario> {
  const scenario = await createCheckInScenario(undefined, adminToken, {
    checkInRequired: true,
  })

  // Both participants check in at match level; the domain service then
  // auto-advances the match out of `checking_in` (into `pick_ban` when a
  // veto is required, otherwise straight to `in_progress`).
  await checkInViaApi(
    undefined,
    scenario.p1.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p1.registrationId,
  )
  await checkInViaApi(
    undefined,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p2.registrationId,
  )

  const match = await getMatch(undefined, adminToken, scenario.tournamentId, scenario.matchId)
  if (match.status !== 'in_progress') {
    await adminTransitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'in_progress')
  }

  return scenario
}

/**
 * Submit a BO1 result claim as a participant. `p1GameScore`/`p2GameScore`
 * are the per-map scores (e.g. 16-10); the series scores are derived from
 * them (1-0 or 0-1), matching what the backend's claim validation expects.
 * The winner registration id must belong to the higher-scoring side.
 */
export async function submitResultClaim(
  token: string,
  matchId: string,
  winnerRegistrationId: string,
  p1GameScore: number,
  p2GameScore: number,
): Promise<ResultClaim> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      claimed_winner_registration_id: winnerRegistrationId,
      participant1_score: p1GameScore > p2GameScore ? 1 : 0,
      participant2_score: p2GameScore > p1GameScore ? 1 : 0,
      game_results: [
        {
          game_number: 1,
          map_id: 'map_1',
          participant1_score: p1GameScore,
          participant2_score: p2GameScore,
          evidence_ids: [],
          demo_link_id: null,
        },
      ],
      evidence_ids: [],
      demo_link_ids: [],
      notes: null,
    }),
  })
  const body = await jsonOrThrow<ApiResult<{ claim: ResultClaim }>>(resp, 'Submit result claim')
  return body.data.claim
}

/** Fetch the current pending claim for a match (public endpoint). */
export async function getPendingClaim(matchId: string): Promise<ResultClaim> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result`)
  const body = await jsonOrThrow<ApiResult<ResultClaim>>(resp, 'Get pending result claim')
  return body.data
}

/** Confirm a result claim as the opponent. Completes the match. */
export async function confirmResultClaim(
  token: string,
  matchId: string,
  claimId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result/${claimId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  })
  if (!resp.ok) {
    throw new Error(`Confirm result claim failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Dispute a result claim as the opponent. Marks the match `disputed`. */
export async function disputeResultClaim(
  token: string,
  matchId: string,
  claimId: string,
  reason: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result/${claimId}/dispute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason, evidence_ids: [] }),
  })
  if (!resp.ok) {
    throw new Error(`Dispute result claim failed (${resp.status}): ${await resp.text()}`)
  }
}

/**
 * Create and publish a fresh TEAM tournament so the spec can assert the
 * public detail page renders for team participant types without depending
 * on seeded data.
 */
export async function createPublishedTeamTournament(
  adminToken: string,
): Promise<TournamentSummary> {
  const suffix = uniqueId()
  const tournament = await createDraftTournament(adminToken, {
    name: `E2E Results Team Tournament ${suffix}`,
    slug: `e2e-results-team-${suffix}`,
    participantType: 'team',
  })

  const resp = await fetch(`${API_URL}/v1/tournaments/${tournament.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Publish team tournament failed (${resp.status}): ${await resp.text()}`)
  }

  return tournament
}

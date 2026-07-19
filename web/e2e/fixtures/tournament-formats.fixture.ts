/**
 * Tournament FORMAT E2E helpers.
 *
 * The existing `tournament-lifecycle.fixture.ts` only drives a TWO-player
 * single-elimination tournament (`advanceToInProgress` hard-codes exactly two
 * registrations). Exercising every bracket generator needs 4+ individual
 * participants and a way to actually complete a match so progression can be
 * asserted, so those extra helpers live here.
 *
 * Everything drives the backend directly over HTTP. Endpoint shapes verified
 * against the API routes at rebase commit:
 *
 *   POST /v1/tournaments/{id}/publish|open-registration|close-registration|start   (admin)
 *   GET  /v1/tournaments/{id}/brackets                                             (public)
 *   GET  /v1/tournaments/{id}/matches                                              (public)
 *   GET  /v1/tournaments/{id}/brackets/{bracket_id}/standings                      (public)
 *   POST /v1/admin/tournaments/{id}/matches/{match_id}/schedule                    (admin)
 *   POST /v1/admin/tournaments/{id}/matches/{match_id}/transition                  (admin)
 *   POST /v1/matches/{match_id}/result                                             (participant)
 *   POST /v1/matches/{match_id}/result/{claim_id}/confirm                          (opponent)
 *   POST /v1/admin/tournaments/{id}/generate-next-round                            (admin, Swiss)
 *
 * Reuses `createTestUser` (checkin.fixture) plus `registerPlayer` /
 * `approveRegistration` (tournament-lifecycle.fixture) rather than re-rolling
 * registration.
 */

import { createTestUser } from './checkin.fixture'
import { registerPlayer, approveRegistration } from './tournament-lifecycle.fixture'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface FormatParticipant {
  userId: string
  username: string
  token: string
  registrationId: string
  displayName: string
}

export interface FormatMatch {
  id: string
  bracket_id: string
  round: number
  match_number: number
  bracket_position: string
  status: string
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  participant1_name: string | null
  participant2_name: string | null
  winner_registration_id: string | null
}

export interface FormatBracket {
  id: string
  bracket_type: string
  name: string
  total_rounds: number
  current_round: number
  group_number: number | null
}

export interface FormatStanding {
  registration_id: string
  participant_name: string | null
  position: number
  points: number
  matches_played: number
  matches_won: number
  matches_lost: number
}

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(`${context}: failed to parse JSON (${String(err)}): ${text}`)
  }
}

async function postAction(
  adminToken: string,
  tournamentId: string,
  action: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Tournament ${action} failed (${resp.status}): ${await resp.text()}`)
  }
}

/** List a tournament's brackets (public GET). */
export async function getBrackets(
  adminToken: string,
  tournamentId: string,
): Promise<FormatBracket[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/brackets`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<FormatBracket[]>>(resp, 'List brackets')
  return body.data ?? []
}

/** List a tournament's matches with the fields the format assertions need. */
export async function getMatches(
  adminToken: string,
  tournamentId: string,
): Promise<FormatMatch[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<FormatMatch[]>>(resp, 'List matches')
  return body.data ?? []
}

/** List standings for a bracket (round-robin / swiss). */
export async function getStandings(
  adminToken: string,
  tournamentId: string,
  bracketId: string,
): Promise<FormatStanding[]> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/brackets/${bracketId}/standings`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  )
  const body = await jsonOrThrow<ApiResult<FormatStanding[]>>(resp, 'List standings')
  return body.data ?? []
}

/**
 * Publish → open registration → register + approve N individual participants →
 * close registration → start. `check_in_required` is false (the fixture creates
 * the tournament that way), so `start` seeds every approved registration and
 * the format's bracket generator runs.
 *
 * Returns each participant paired with its registration id so the caller can
 * complete matches (which needs the winner's + loser's tokens).
 */
export async function driveIndividualTournamentToInProgress(
  adminToken: string,
  tournamentId: string,
  participantCount: number,
  namePrefix: string,
): Promise<FormatParticipant[]> {
  await postAction(adminToken, tournamentId, 'publish')
  await postAction(adminToken, tournamentId, 'open-registration')

  const participants: FormatParticipant[] = []
  for (let i = 1; i <= participantCount; i++) {
    const user = await createTestUser()
    const displayName = `${namePrefix} Player ${i}`
    const registrationId = await registerPlayer(user.token, tournamentId, displayName)
    await approveRegistration(adminToken, tournamentId, registrationId)
    participants.push({
      userId: user.userId,
      username: user.username,
      token: user.token,
      registrationId,
      displayName,
    })
  }

  await postAction(adminToken, tournamentId, 'close-registration')
  await postAction(adminToken, tournamentId, 'start')

  return participants
}

/**
 * Drive a `ready` match to `in_progress` via the admin endpoints so a result
 * claim can be submitted. State machine has no direct ready → in_progress edge:
 * ready → scheduled (admin schedule) → in_progress (admin transition).
 */
async function advanceMatchToInProgress(
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<void> {
  const scheduleResp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/schedule`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reason: 'E2E format fixture: schedule for completion',
      }),
    },
  )
  // 400 tolerated: match already advanced past `ready`.
  if (!scheduleResp.ok && scheduleResp.status !== 400) {
    throw new Error(`Admin schedule failed (${scheduleResp.status}): ${await scheduleResp.text()}`)
  }

  const transitionResp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        to_status: 'in_progress',
        override_reason: 'E2E format fixture: open for result submission',
      }),
    },
  )
  if (!transitionResp.ok && transitionResp.status !== 400) {
    throw new Error(
      `Admin transition to in_progress failed (${transitionResp.status}): ${await transitionResp.text()}`,
    )
  }
}

/**
 * Complete a match by playing out the result-claim saga: participant 1 is
 * declared the winner (1-0, matching the default Bo1 format), submits the
 * claim, and participant 2 confirms it. Confirmation runs the match-completion
 * saga which drives bracket progression / standings updates.
 *
 * No demos or evidence are attached, so the saga never pauses for review.
 *
 * Returns the winner's registration id.
 */
export async function completeMatchP1Wins(
  adminToken: string,
  tournamentId: string,
  match: FormatMatch,
  participants: FormatParticipant[],
): Promise<string> {
  const winnerRegId = match.participant1_registration_id
  const loserRegId = match.participant2_registration_id
  if (!winnerRegId || !loserRegId) {
    throw new Error(`Match ${match.id} is missing participants; cannot complete`)
  }

  const winner = participants.find((p) => p.registrationId === winnerRegId)
  const loser = participants.find((p) => p.registrationId === loserRegId)
  if (!winner || !loser) {
    throw new Error(`Could not map match ${match.id} participants to tokens`)
  }

  await advanceMatchToInProgress(adminToken, tournamentId, match.id)

  // Winner submits the claim (participant1_score=1 > participant2_score=0, Bo1).
  const submitResp = await fetch(`${API_URL}/v1/matches/${match.id}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${winner.token}`,
    },
    body: JSON.stringify({
      claimed_winner_registration_id: winnerRegId,
      participant1_score: 1,
      participant2_score: 0,
      game_results: [],
    }),
  })
  const submitBody = await jsonOrThrow<ApiResult<{ claim: { id: string } }>>(
    submitResp,
    'Submit result claim',
  )
  const claimId = submitBody.data.claim.id

  // Opponent confirms (a claimant cannot confirm their own claim) → saga runs.
  const confirmResp = await fetch(
    `${API_URL}/v1/matches/${match.id}/result/${claimId}/confirm`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${loser.token}` },
    },
  )
  if (!confirmResp.ok) {
    throw new Error(`Confirm result failed (${confirmResp.status}): ${await confirmResp.text()}`)
  }

  return winnerRegId
}

/**
 * Trigger Swiss next-round generation (admin). Requires every current-round
 * match to be complete. Returns the newly generated matches.
 */
export async function generateNextRound(
  adminToken: string,
  tournamentId: string,
): Promise<FormatMatch[]> {
  const resp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/generate-next-round`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  const body = await jsonOrThrow<ApiResult<FormatMatch[]>>(resp, 'Generate next round')
  return body.data ?? []
}

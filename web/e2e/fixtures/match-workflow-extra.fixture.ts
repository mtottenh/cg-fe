/**
 * Extra helpers for match-workflow.spec.ts.
 *
 * The shared fixtures cover check-in scenarios (checkin.fixture) and plain
 * tournament lifecycle driving (tournament-lifecycle / tournament-seeding
 * fixtures), but the match-workflow spec needs two things none of them
 * provide:
 *
 *  1. A tournament created with `scheduling_mode=self_scheduled` — the
 *     MatchSchedulingPanel / AvailabilityCalendarOverlay UI only renders for
 *     self-scheduled tournaments, and every existing builder leaves the
 *     backend default (`live`).
 *  2. Correct schedule-proposal and result-claim endpoints. The shared
 *     match.fixture.ts targets `/scheduling/proposals` and
 *     `/matches/{id}/results`, but the backend (verified against
 *     `/api/crates/portal-api/src/routes/{tournaments,matches}.rs`) serves:
 *
 *       POST /v1/tournaments/{tid}/matches/{mid}/schedule/propose
 *            body: { proposed_times: string[] }
 *       POST /v1/matches/{match_id}/result
 *            body: { claimed_winner_registration_id, participant1_score,
 *                    participant2_score }
 *       POST /v1/matches/{match_id}/result/{claim_id}/confirm
 *
 * Per the conversion ground rules, shared fixtures must not be edited, so
 * the corrected helpers live here.
 */

import { uniqueId, CS2_MAP_POOL } from './test-data'
import { createTestUser } from './checkin.fixture'
import { registerPlayer, approveRegistration } from './tournament-lifecycle.fixture'
import { startTournament, listMatches } from './tournament-seeding.fixture'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface WorkflowParticipant {
  userId: string
  username: string
  email: string
  password: string
  token: string
  registrationId: string
  participantName: string
}

export interface SelfScheduledScenario {
  tournamentId: string
  tournamentSlug: string
  tournamentName: string
  /** First-round match pairing p1 vs p2. Status is `ready` after creation. */
  matchId: string
  /** Normalized so p1 is always participant1 on the match. */
  p1: WorkflowParticipant
  p2: WorkflowParticipant
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

async function firstGameId(): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/games`)
  const body = await jsonOrThrow<ApiResult<Array<{ id: string }>>>(resp, 'List games')
  if (!body.data || body.data.length === 0) {
    throw new Error('No games available to create tournament')
  }
  return body.data[0].id
}

async function postAdminAction(
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

/**
 * Build a fully self-contained SELF-SCHEDULED tournament with two approved
 * players and a generated round-1 match left in `ready` status — exactly the
 * state where MatchDetailPage shows the scheduling panel (self_scheduled +
 * status in [ready, scheduled] + viewer is a participant).
 */
export async function createSelfScheduledScenario(
  adminToken: string,
): Promise<SelfScheduledScenario> {
  const suffix = uniqueId()
  const slug = `e2e-mwf-${suffix}`
  const name = `E2E Match Workflow ${suffix}`

  const gameId = await firstGameId()
  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name,
      slug,
      game_id: gameId,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'individual',
      min_participants: 2,
      max_participants: 4,
      check_in_required: false,
      scheduling_mode: 'self_scheduled',
    }),
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create self-scheduled tournament',
  )
  const tournamentId = created.data.id

  await postAdminAction(adminToken, tournamentId, 'publish')
  await postAdminAction(adminToken, tournamentId, 'open-registration')

  const p1User = await createTestUser()
  const p2User = await createTestUser()
  const p1Name = `Workflow P1 ${p1User.username}`
  const p2Name = `Workflow P2 ${p2User.username}`

  const p1RegId = await registerPlayer(p1User.token, tournamentId, p1Name)
  const p2RegId = await registerPlayer(p2User.token, tournamentId, p2Name)
  await approveRegistration(adminToken, tournamentId, p1RegId)
  await approveRegistration(adminToken, tournamentId, p2RegId)

  await startTournament(adminToken, tournamentId)

  const matches = await listMatches(adminToken, tournamentId)
  const targetMatch = matches.find(
    (m) =>
      (m.participant1_registration_id === p1RegId && m.participant2_registration_id === p2RegId) ||
      (m.participant1_registration_id === p2RegId && m.participant2_registration_id === p1RegId),
  )
  if (!targetMatch) {
    throw new Error(
      `No generated match pairs registrations ${p1RegId} / ${p2RegId}. ` +
        `Matches: ${JSON.stringify(matches)}`,
    )
  }

  // Normalize so p1 is always participant1 on the match.
  const p1IsSlotOne = targetMatch.participant1_registration_id === p1RegId
  const p1: WorkflowParticipant = p1IsSlotOne
    ? { ...p1User, registrationId: p1RegId, participantName: p1Name }
    : { ...p2User, registrationId: p2RegId, participantName: p2Name }
  const p2: WorkflowParticipant = p1IsSlotOne
    ? { ...p2User, registrationId: p2RegId, participantName: p2Name }
    : { ...p1User, registrationId: p1RegId, participantName: p1Name }

  return {
    tournamentId,
    tournamentSlug: created.data.slug,
    tournamentName: name,
    matchId: targetMatch.id,
    p1,
    p2,
  }
}

/**
 * Propose a match schedule as a participant via the REAL propose endpoint
 * (`/schedule/propose`). Throws on failure so specs never silently proceed
 * without the proposal they depend on.
 */
export async function proposeScheduleViaApi(
  token: string,
  tournamentId: string,
  matchId: string,
  times: string[],
): Promise<{ id: string; status: string; proposed_times: string[] }> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/schedule/propose`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ proposed_times: times }),
    },
  )
  const body = await jsonOrThrow<ApiResult<{ id: string; status: string; proposed_times: string[] }>>(
    resp,
    'Propose schedule',
  )
  return body.data
}

export interface MatchDetails {
  id: string
  status: string
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  participant1_name: string | null
  participant2_name: string | null
  participant1_score: number | null
  participant2_score: number | null
  winner_registration_id: string | null
}

/** Fetch a match with names + scores so specs can assert display values. */
export async function fetchMatchDetails(
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<MatchDetails> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  )
  const body = await jsonOrThrow<ApiResult<MatchDetails>>(resp, 'Get match details')
  return body.data
}

/**
 * Drive a match into `in_progress` using the admin endpoints.
 * State machine (portal-core types/tournament.rs): ready -> scheduled via
 * admin schedule; scheduled | checking_in | pick_ban -> in_progress via
 * admin transition.
 */
export async function advanceMatchToInProgress(
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<void> {
  let match = await fetchMatchDetails(adminToken, tournamentId, matchId)

  if (match.status === 'ready') {
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
          reason: 'E2E fixture: schedule match before starting play',
        }),
      },
    )
    if (!scheduleResp.ok) {
      throw new Error(`Admin schedule failed (${scheduleResp.status}): ${await scheduleResp.text()}`)
    }
    match = await fetchMatchDetails(adminToken, tournamentId, matchId)
  }

  if (['scheduled', 'checking_in', 'pick_ban'].includes(match.status)) {
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
          override_reason: 'E2E fixture: start match for result submission',
        }),
      },
    )
    if (!transitionResp.ok) {
      throw new Error(
        `Admin transition to in_progress failed (${transitionResp.status}): ${await transitionResp.text()}`,
      )
    }
  } else if (match.status !== 'in_progress' && match.status !== 'awaiting_result') {
    throw new Error(`Cannot advance match to in_progress from status "${match.status}"`)
  }
}

/**
 * Submit a result claim as a participant (`POST /v1/matches/{id}/result`).
 * Returns the created claim (the response wraps it as `{ claim: {...} }`).
 */
export async function submitResultClaim(
  token: string,
  matchId: string,
  claimedWinnerRegistrationId: string,
  participant1Score: number,
  participant2Score: number,
): Promise<{ id: string; status: string }> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      claimed_winner_registration_id: claimedWinnerRegistrationId,
      participant1_score: participant1Score,
      participant2_score: participant2Score,
    }),
  })
  const body = await jsonOrThrow<ApiResult<{ claim: { id: string; status: string } }>>(
    resp,
    'Submit result claim',
  )
  return body.data.claim
}

/** Confirm the opponent's result claim, completing the match atomically. */
export async function confirmResultClaim(
  token: string,
  matchId: string,
  claimId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result/${claimId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`Confirm result claim failed (${resp.status}): ${await resp.text()}`)
  }
}

/**
 * Complete a scenario's match end-to-end: advance to in_progress, p1 submits
 * a result claiming themselves the winner, p2 confirms. Leaves the match
 * `completed` with participant1 as winner and the given scores.
 */
export async function completeMatchWithResult(
  adminToken: string,
  scenario: SelfScheduledScenario,
  participant1Score = 1,
  participant2Score = 0,
): Promise<MatchDetails> {
  await advanceMatchToInProgress(adminToken, scenario.tournamentId, scenario.matchId)

  const claim = await submitResultClaim(
    scenario.p1.token,
    scenario.matchId,
    scenario.p1.registrationId,
    participant1Score,
    participant2Score,
  )
  await confirmResultClaim(scenario.p2.token, scenario.matchId, claim.id)

  const match = await fetchMatchDetails(adminToken, scenario.tournamentId, scenario.matchId)
  if (match.status !== 'completed') {
    throw new Error(`Expected match to be completed after confirm, got "${match.status}"`)
  }
  return match
}

/**
 * Extra fixtures for `team-tournament.spec.ts` ONLY.
 *
 * Every other e2e tournament is individual/1v1. This builder composes the full
 * TEAM-registration chain and drives a 5v5 Swiss tournament to `in_progress`,
 * so the flagship team spec can assert on real backend + UI behaviour without
 * relying on the seeded singleton in `global-setup.ts`.
 *
 * The chain mirrors `seedTeamTournament` in `global-setup.ts` but is reusable
 * and multi-team:
 *
 *   1. league (open) + season advanced to `registration`
 *      (league-season-extra.fixture: createLeague / createSeason / advanceSeason)
 *   2. N teams, each with a fresh owner + 4 invited members (= 5v5), each
 *      registered into the SEASON — this yields the `team_season_id` the
 *      tournament register-team call needs
 *      (team-roster.fixture: createTeamWithMembers)
 *   3. a team-scoped Swiss tournament (participant_type=team, team_size=5)
 *   4. each team's `team_season_id` registered into the tournament via
 *      POST /v1/tournaments/{id}/registrations/team, admin-approved, then the
 *      tournament is started so the Swiss bracket generates.
 *
 * Endpoint shapes verified against the backend:
 *   POST /v1/tournaments                                        (admin; create)
 *   POST /v1/tournaments/{id}/publish|open-registration|close-registration|start
 *   POST /v1/tournaments/{id}/registrations/team               (owner token)
 *        body: RegisterTeamRequest { team_season_id, participant_name }
 *   POST /v1/tournaments/{id}/registrations/{reg_id}/approve   (admin)
 *   POST /v1/admin/tournaments/{id}/matches/{match_id}/schedule|transition
 *   POST /v1/matches/{match_id}/result                         (winner team owner)
 *   POST /v1/matches/{match_id}/result/{claim_id}/confirm      (loser team owner)
 *
 * IMPORTANT (team result submission): the backend maps a result submitter to a
 * participant via `registration.registered_by == auth.user_id` (see
 * `result.rs::find_user_registration`). So each team must be registered into
 * the tournament by a DISTINCT user, and that same user submits/confirms its
 * results. We register every team with its own owner token, giving each match
 * side a distinct actor — the winner's owner submits, the loser's owner
 * confirms.
 */

import { createLeague, createSeason, advanceSeason } from './league-season-extra.fixture'
import { createTeamWithMembers } from './team-roster.fixture'
import { approveRegistration } from './tournament-lifecycle.fixture'
import { getCs2Game } from './awards.fixture'
import { uniqueId, CS2_MAP_POOL } from './test-data'
import type { FormatMatch } from './tournament-formats.fixture'
import type { TournamentRegistrationStatus, TournamentStatus } from './api-status'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

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

/** One registered team, with everything needed to act for it in matches. */
export interface TeamEntry {
  teamId: string
  teamSeasonId: string
  teamName: string
  teamTag: string
  /** Display name the team registers under (shown in Participants tab). */
  participantName: string
  /** Tournament registration id (match participant id). */
  registrationId: string
  /** Owner user id — this is `registered_by` on the tournament registration. */
  ownerUserId: string
  /** Owner token — the actor allowed to submit/confirm this team's results. */
  ownerToken: string
  /** Display names of every roster member (owner + invited members). */
  memberNames: string[]
}

export interface TeamTournamentApi {
  id: string
  slug: string
  format: string
  participant_type: string
  team_size: number | null
  status: TournamentStatus
}

export interface TeamSwissScenario {
  tournamentId: string
  tournamentSlug: string
  leagueId: string
  seasonId: string
  teams: TeamEntry[]
}

export interface CreateTeamSwissOptions {
  /** Number of teams to register (default 4 → floor(4/2)=2 R1 matches). */
  teamCount?: number
  /** Roster size per team (default 5 → 5v5). */
  teamSize?: number
}

/** Fetch a tournament's key fields via the public GET. */
export async function getTeamTournamentApi(tournamentId: string): Promise<TeamTournamentApi> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`)
  const body = await jsonOrThrow<ApiResult<TeamTournamentApi>>(resp, 'Fetch tournament')
  return body.data
}

/** List a tournament's registrations (admin). */
export async function listRegistrations(
  adminToken: string,
  tournamentId: string,
): Promise<Array<{ id: string; status: TournamentRegistrationStatus; participant_name: string; team_season_id?: string }>> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<
    ApiResult<Array<{ id: string; status: TournamentRegistrationStatus; participant_name: string; team_season_id?: string }>>
  >(resp, 'List registrations')
  return body.data ?? []
}

async function postAction(adminToken: string, tournamentId: string, action: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Tournament ${action} failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Register a team's season entry into the tournament (as the team owner). */
async function registerTeam(
  ownerToken: string,
  tournamentId: string,
  teamSeasonId: string,
  participantName: string,
): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations/team`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      team_season_id: teamSeasonId,
      participant_name: participantName,
    }),
  })
  const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Register team')
  return body.data.id
}

/**
 * Build the whole 5v5 Swiss scenario and drive it to `in_progress`:
 * league + season → N teams (owner + 4 members each) → team-scoped Swiss
 * tournament → register + approve every team → start.
 */
export async function createTeamSwissScenario(
  adminToken: string,
  opts: CreateTeamSwissOptions = {},
): Promise<TeamSwissScenario> {
  const teamCount = opts.teamCount ?? 4
  const teamSize = opts.teamSize ?? 5
  // createTeamWithMembers seeds the owner plus `memberCount` invited members,
  // so a 5-player roster needs teamSize - 1 additional members.
  const memberCount = teamSize - 1

  const gameId = (await getCs2Game()).id

  // --- 1. League (open) + season advanced to registration ---
  const league = await createLeague(adminToken, { gameId, namePrefix: 'E2E Swiss Team League' })
  const season = await createSeason(adminToken, league.leagueId, { namePrefix: 'E2E Swiss Team Season' })
  await advanceSeason(adminToken, season, 'registration')

  // --- 2. N teams with full 5-player rosters, each into the season ---
  const rosters = await Promise.all(
    Array.from({ length: teamCount }, (_, i) =>
      createTeamWithMembers({
        leagueId: league.leagueId,
        seasonId: season.seasonId,
        memberCount,
        teamNamePrefix: `Swiss Team ${i + 1}`,
      }),
    ),
  )

  // --- 3. Team-scoped Swiss tournament ---
  const suffix = uniqueId()
  const slug = `e2e-team-swiss-${suffix}`
  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: `E2E Team Swiss ${suffix}`,
      slug,
      game_id: gameId,
      format: 'swiss',
      map_pool: CS2_MAP_POOL,
      participant_type: 'team',
      team_size: teamSize,
      // Capacity is checked as count >= max on both register and approve, and
      // the count includes the row being processed — keep max above teamCount.
      min_participants: 2,
      max_participants: 8,
      registration_type: 'open',
      scheduling_mode: 'live',
      default_match_format: 'bo1',
      league_id: league.leagueId,
      season_id: season.seasonId,
      description: '5v5 Swiss team tournament for E2E coverage',
    }),
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create team Swiss tournament',
  )
  const tournamentId = created.data.id

  await postAction(adminToken, tournamentId, 'publish')
  await postAction(adminToken, tournamentId, 'open-registration')

  // --- 4. Register + approve each team, then start ---
  const teams: TeamEntry[] = []
  for (let i = 0; i < rosters.length; i++) {
    const roster = rosters[i]
    const participantName = `${roster.teamName}`
    const registrationId = await registerTeam(
      roster.owner.token,
      tournamentId,
      roster.teamSeasonId,
      participantName,
    )
    await approveRegistration(adminToken, tournamentId, registrationId)
    teams.push({
      teamId: roster.teamId,
      teamSeasonId: roster.teamSeasonId,
      teamName: roster.teamName,
      teamTag: roster.teamTag,
      participantName,
      registrationId,
      ownerUserId: roster.owner.userId,
      ownerToken: roster.owner.token,
      memberNames: [roster.owner.displayName, ...roster.members.map((m) => m.displayName)],
    })
  }

  await postAction(adminToken, tournamentId, 'close-registration')
  await postAction(adminToken, tournamentId, 'start')

  return {
    tournamentId,
    tournamentSlug: created.data.slug,
    leagueId: league.leagueId,
    seasonId: season.seasonId,
    teams,
  }
}

/**
 * Drive a freshly-generated match (status `ready`) to `in_progress` via the
 * admin endpoints. No direct ready → in_progress edge exists: schedule the
 * match (ready → scheduled), then transition it. Tolerates 400 (already past).
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
        reason: 'E2E team fixture: schedule for completion',
      }),
    },
  )
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
        override_reason: 'E2E team fixture: open for result submission',
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
 * Complete a team Bo1 match with participant 1 (the higher seed) winning 1-0.
 *
 * The winning team's owner submits the claim; the losing team's owner confirms
 * it (a claimant cannot confirm its own claim). Both are distinct users because
 * each team was registered by its own owner, so confirmation drives the
 * match-completion saga (bracket/standings updates). Returns the winner's
 * registration id.
 */
export async function completeTeamMatchP1Wins(
  adminToken: string,
  tournamentId: string,
  match: FormatMatch,
  teams: TeamEntry[],
): Promise<string> {
  const winnerRegId = match.participant1_registration_id
  const loserRegId = match.participant2_registration_id
  if (!winnerRegId || !loserRegId) {
    throw new Error(`Match ${match.id} is missing team participants; cannot complete`)
  }

  const winner = teams.find((t) => t.registrationId === winnerRegId)
  const loser = teams.find((t) => t.registrationId === loserRegId)
  if (!winner || !loser) {
    throw new Error(`Could not map match ${match.id} team participants to owner tokens`)
  }

  await advanceMatchToInProgress(adminToken, tournamentId, match.id)

  // Winning team's owner submits (participant1_score=1 > 0, Bo1). Empty
  // game_results keeps the saga from pausing on per-map evidence validation.
  const submitResp = await fetch(`${API_URL}/v1/matches/${match.id}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${winner.ownerToken}`,
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
    'Submit team result claim',
  )
  const claimId = submitBody.data.claim.id

  // Losing team's owner confirms → completion saga runs.
  const confirmResp = await fetch(
    `${API_URL}/v1/matches/${match.id}/result/${claimId}/confirm`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${loser.ownerToken}` },
    },
  )
  if (!confirmResp.ok) {
    throw new Error(`Confirm team result failed (${confirmResp.status}): ${await confirmResp.text()}`)
  }

  return winnerRegId
}

/**
 * Admin match-override API helpers.
 *
 * Builds the preconditions `admin-match-overrides.spec.ts` needs — a started
 * tournament whose bracket is in a known shape — so the spec itself only ever
 * performs the *override* through the admin UI.
 *
 * Endpoint shapes verified against:
 *   `api/crates/portal-api/src/routes/tournaments.rs`
 *   `api/crates/portal-api/src/routes/admin.rs`
 *
 *   POST /v1/tournaments                                                   (admin)
 *   POST /v1/tournaments/{id}/publish|open-registration|close-registration|start
 *   POST /v1/tournaments/{id}/registrations/player                         (player)
 *   POST /v1/tournaments/{id}/registrations/{rid}/approve                  (admin)
 *   GET  /v1/tournaments/{id}/matches                                      (admin)
 *   GET  /v1/tournaments/{id}/matches/{mid}                                (admin)
 *   GET  /v1/tournaments/{id}/brackets                                     (admin)
 *   GET  /v1/tournaments/{id}/brackets/{bid}/standings                     (public)
 *   POST /v1/admin/tournaments/{id}/matches/{mid}/transition               (admin)
 *
 * NOTE on the transition helper: it is used ONLY to build state the spec then
 * overrides (e.g. "a completed match whose bracket never advanced"). The
 * transition handler itself is driven through the UI by
 * `MatchOverviewTab.handleTransition` in the spec.
 */

import { createTestUser } from './checkin.fixture'
import { uniqueId, CS2_MAP_POOL } from './test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Backend match statuses, mirrored from `TournamentMatchStatus`
 *  (`api/crates/portal-core/src/types/tournament.rs:310`). */
export type MatchStatus =
  | 'pending'
  | 'ready'
  | 'scheduled'
  | 'checking_in'
  | 'pick_ban'
  | 'in_progress'
  | 'awaiting_result'
  | 'completed'
  | 'disputed'
  | 'forfeit'
  | 'cancelled'

export interface OverridePlayer {
  userId: string
  username: string
  token: string
  registrationId: string
  participantName: string
}

export interface OverrideMatch {
  id: string
  bracket_id: string
  round: number
  match_number: number
  bracket_position: string
  status: MatchStatus
  participant1_registration_id?: string
  participant2_registration_id?: string
  participant1_name?: string
  participant2_name?: string
  winner_registration_id?: string
  scheduled_at?: string
  completed_at?: string
  participant1_score: number
  participant2_score: number
}

export interface OverrideStanding {
  registration_id: string
  participant_name?: string
  matches_played: number
  matches_won: number
  matches_lost: number
  points: number
}

export interface OverrideScenario {
  tournamentId: string
  tournamentSlug: string
  tournamentName: string
  players: OverridePlayer[]
  matches: OverrideMatch[]
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

async function post(
  adminToken: string,
  path: string,
  context: string,
  body?: unknown,
): Promise<Response> {
  const resp = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!resp.ok) {
    throw new Error(`${context} failed (${resp.status}): ${await resp.text()}`)
  }
  return resp
}

export interface StartedTournamentOptions {
  /** Bracket format. `round_robin` is the only format whose progression
   *  revert has an observable effect — see the spec header. */
  format?: 'single_elimination' | 'round_robin'
  /** How many throwaway players to register + approve. */
  playerCount?: number
  /** Participant-name prefixes, one per player. Must be mutually
   *  non-substring: Playwright text matching is substring-based. */
  playerNames?: string[]
}

const DEFAULT_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']

/**
 * Create a tournament, register + approve `playerCount` throwaway players,
 * close registration and start it. Returns the generated bracket's matches.
 *
 * Registration type is `approval` so every registration is explicitly
 * approved here rather than depending on the P-2 auto-approve behaviour of
 * `open` tournaments.
 */
export async function createStartedTournament(
  adminToken: string,
  opts: StartedTournamentOptions = {},
): Promise<OverrideScenario> {
  const format = opts.format ?? 'single_elimination'
  const playerCount = opts.playerCount ?? 4
  const names = opts.playerNames ?? DEFAULT_NAMES

  if (playerCount > names.length) {
    throw new Error(`Only ${names.length} distinct participant names available`)
  }

  const gamesResp = await fetch(`${API_URL}/v1/games`)
  const games = await jsonOrThrow<ApiResult<Array<{ id: string }>>>(gamesResp, 'List games')
  if (!games.data || games.data.length === 0) {
    throw new Error('No games available to create tournament')
  }

  const suffix = uniqueId()
  const name = `E2E Overrides ${suffix}`
  const slug = `e2e-overrides-${suffix}`

  const createResp = await post(adminToken, '/v1/tournaments', 'Create tournament', {
    name,
    slug,
    game_id: games.data[0].id,
    format,
    map_pool: CS2_MAP_POOL,
    participant_type: 'individual',
    min_participants: 2,
    max_participants: playerCount,
    check_in_required: false,
    registration_type: 'approval',
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create tournament',
  )
  const tournamentId = created.data.id

  await post(adminToken, `/v1/tournaments/${tournamentId}/publish`, 'Publish tournament')
  await post(adminToken, `/v1/tournaments/${tournamentId}/open-registration`, 'Open registration')

  const players: OverridePlayer[] = []
  for (let i = 0; i < playerCount; i += 1) {
    const user = await createTestUser()
    // The suffix keeps names unique across parallel runs; the prefix keeps
    // them mutually non-substring so table rows can be located by name.
    const participantName = `${names[i]} ${suffix}`
    const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations/player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ participant_name: participantName }),
    })
    const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, `Register player ${i + 1}`)
    await post(
      adminToken,
      `/v1/tournaments/${tournamentId}/registrations/${body.data.id}/approve`,
      `Approve registration ${i + 1}`,
    )
    players.push({
      userId: user.userId,
      username: user.username,
      token: user.token,
      registrationId: body.data.id,
      participantName,
    })
  }

  await post(adminToken, `/v1/tournaments/${tournamentId}/close-registration`, 'Close registration')
  await post(adminToken, `/v1/tournaments/${tournamentId}/start`, 'Start tournament')

  const matches = await listOverrideMatches(adminToken, tournamentId)
  if (matches.length === 0) {
    throw new Error(`Starting tournament ${tournamentId} generated no matches`)
  }

  return {
    tournamentId,
    tournamentSlug: created.data.slug,
    tournamentName: name,
    players,
    matches,
  }
}

export async function listOverrideMatches(
  adminToken: string,
  tournamentId: string,
): Promise<OverrideMatch[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<OverrideMatch[]>>(resp, 'List matches')
  return body.data ?? []
}

export async function getOverrideMatch(
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<OverrideMatch> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<OverrideMatch>>(resp, 'Fetch match')
  return body.data
}

/** Locate a generated match by its bracket position (`R1M1`, `R2M1`, …).
 *  Positions are stable per format, unlike ids (UUID v7 prefixes collide). */
export function matchAt(matches: OverrideMatch[], bracketPosition: string): OverrideMatch {
  const found = matches.find((m) => m.bracket_position === bracketPosition)
  if (!found) {
    const seen = matches.map((m) => m.bracket_position).join(', ')
    throw new Error(`No match at bracket position ${bracketPosition} (have: ${seen})`)
  }
  return found
}

/** Drive one admin status transition via the API. Used only to BUILD state. */
export async function transitionMatchViaApi(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  toStatus: MatchStatus,
): Promise<void> {
  await post(
    adminToken,
    `/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    `Transition match to ${toStatus}`,
    { to_status: toStatus, override_reason: 'E2E precondition' },
  )
}

/**
 * Walk a freshly generated (`ready`) match to `completed` via the admin
 * transition endpoint.
 *
 * Completing a match this way deliberately does NOT run bracket progression —
 * `MatchLifecycleService::transition` only writes the status and its audit log
 * (`api/crates/portal-domain/src/services/tournament/match_lifecycle.rs:96`).
 * That is exactly the "automatic progression didn't run" state the admin
 * Process Progression control exists to repair.
 */
export async function completeMatchViaApi(
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<void> {
  for (const status of ['scheduled', 'in_progress', 'awaiting_result', 'completed'] as const) {
    await transitionMatchViaApi(adminToken, tournamentId, matchId, status)
  }
}

export async function listBracketIds(
  adminToken: string,
  tournamentId: string,
): Promise<string[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/brackets`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<Array<{ id: string }>>>(resp, 'List brackets')
  return (body.data ?? []).map((b) => b.id)
}

export async function listStandings(
  tournamentId: string,
  bracketId: string,
): Promise<OverrideStanding[]> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/brackets/${bracketId}/standings`,
  )
  const body = await jsonOrThrow<ApiResult<OverrideStanding[]>>(resp, 'Fetch bracket standings')
  return body.data ?? []
}

/** Matches won for one registration, from the derived bracket standings. */
export async function matchesWon(
  tournamentId: string,
  bracketId: string,
  registrationId: string,
): Promise<number> {
  const standings = await listStandings(tournamentId, bracketId)
  const row = standings.find((s) => s.registration_id === registrationId)
  if (!row) {
    throw new Error(`No standings row for registration ${registrationId} in bracket ${bracketId}`)
  }
  return row.matches_won
}

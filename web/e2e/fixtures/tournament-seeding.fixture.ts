import { createTestUser } from './checkin.fixture'
import { uniqueId, CS2_MAP_POOL } from './test-data'

/**
 * Tournament seeding / registration-approval API helpers.
 *
 * These helpers drive the backend directly so `tournament-seeding.spec.ts`
 * can land on the admin Registrations and Seeding tabs with deterministic
 * state (pending registrations, approved-only registrations, etc.) without
 * clicking through the public-facing registration UI.
 *
 * Endpoint shapes are verified against
 * `api/crates/portal-api/src/handlers/tournaments/registration.rs` and
 * `seeding.rs`:
 *
 *   POST   /v1/tournaments                                              (admin)
 *   POST   /v1/tournaments/{tournament_id}/publish                      (admin)
 *   POST   /v1/tournaments/{tournament_id}/open-registration            (admin)
 *   POST   /v1/tournaments/{tournament_id}/close-registration           (admin)
 *   POST   /v1/tournaments/{tournament_id}/registrations/player
 *          body: { participant_name: string }                            (Bearer player)
 *   POST   /v1/tournaments/{tournament_id}/registrations/{id}/approve   (admin)
 *   POST   /v1/tournaments/{tournament_id}/registrations/{id}/reject
 *          body: { reason?: string }                                    (admin)
 *   POST   /v1/tournaments/{tournament_id}/registrations/{id}/disqualify
 *          body: { reason: string }                                     (admin)
 *   POST   /v1/tournaments/{tournament_id}/start                        (admin)
 *   GET    /v1/tournaments/{tournament_id}/seeding                      (public)
 *   POST   /v1/tournaments/{tournament_id}/seeding/auto
 *          body: { algorithm?: string }                                 (admin)
 *   GET    /v1/tournaments/{tournament_id}/registrations                (admin)
 *   GET    /v1/tournaments/{tournament_id}/matches                      (admin)
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface CreatedTournament {
  id: string
  slug: string
}

export interface PendingPlayer {
  userId: string
  username: string
  email: string
  password: string
  token: string
  registrationId: string
  participantName: string
}

export interface SeedEntry {
  registration_id: string
  participant_name: string
  seed: number | null
  seed_rating: number | null
}

export interface RegistrationRow {
  id: string
  status: string
  participant_name: string
  seed: number | null
  checked_in: boolean
}

export interface MatchRow {
  id: string
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  status: string
  round: number
}

export interface CreateApprovalTournamentOptions {
  /** Override slug prefix; default `e2e-seeding`. */
  slugPrefix?: string
  minParticipants?: number
  maxParticipants?: number
  /** Override registration type. Defaults to "approval". */
  registrationType?: 'open' | 'approval' | 'invite_only' | 'qualification'
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
 * Create an individual tournament with `registration_type=approval`, publish
 * it, and open registration. Returns the tournament id + slug.
 *
 * Player registrations on an approval tournament land in `pending` status —
 * the admin must explicitly approve each one before seeding.
 */
export async function createApprovalTournament(
  adminToken: string,
  opts: CreateApprovalTournamentOptions = {},
): Promise<CreatedTournament> {
  const gamesResp = await fetch(`${API_URL}/v1/games`)
  const games = await jsonOrThrow<ApiResult<Array<{ id: string; name: string }>>>(
    gamesResp,
    'List games',
  )
  if (!games.data || games.data.length === 0) {
    throw new Error('No games available to create approval tournament')
  }

  const suffix = uniqueId()
  const slug = `${opts.slugPrefix ?? 'e2e-seeding'}-${suffix}`
  const body: Record<string, unknown> = {
    name: `E2E Seeding Tournament ${suffix}`,
    slug,
    game_id: games.data[0].id,
    format: 'single_elimination',
    map_pool: CS2_MAP_POOL,
    participant_type: 'individual',
    min_participants: opts.minParticipants ?? 4,
    max_participants: opts.maxParticipants ?? 8,
    check_in_required: false,
    registration_type: opts.registrationType ?? 'approval',
  }

  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create approval tournament',
  )

  // Publish → open registration. The backend rejects registrations while in draft.
  const publishResp = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!publishResp.ok) {
    throw new Error(`Publish tournament failed (${publishResp.status}): ${await publishResp.text()}`)
  }

  const openResp = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/open-registration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!openResp.ok) {
    throw new Error(
      `Open registration failed (${openResp.status}): ${await openResp.text()}`,
    )
  }

  return { id: created.data.id, slug: created.data.slug }
}

/**
 * Register `count` throwaway players against a tournament. Each player's
 * registration lands in `pending` when the tournament uses
 * `registration_type=approval`. Returns the full player + registration
 * payload so the spec can approve / reject specific rows by name.
 */
export async function registerPendingPlayers(
  tournamentId: string,
  count: number,
): Promise<PendingPlayer[]> {
  const players: PendingPlayer[] = []
  for (let i = 0; i < count; i += 1) {
    const user = await createTestUser()
    const participantName = `Seed Player ${i + 1} ${user.username}`
    const resp = await fetch(
      `${API_URL}/v1/tournaments/${tournamentId}/registrations/player`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ participant_name: participantName }),
      },
    )
    const body = await jsonOrThrow<ApiResult<{ id: string }>>(
      resp,
      `Register pending player ${i + 1}`,
    )
    players.push({
      ...user,
      registrationId: body.data.id,
      participantName,
    })
  }
  return players
}

/**
 * Approve a single registration as admin. 200 OK expected; 409 accepted
 * for idempotency (already approved).
 */
export async function approveRegistration(
  adminToken: string,
  tournamentId: string,
  registrationId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations/${registrationId}/approve`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`Approve registration failed (${resp.status}): ${await resp.text()}`)
  }
}

/**
 * Disqualify a registration as admin (used to simulate a late withdrawal in
 * the re-seed scenario — disqualify is a no-questions-asked admin action
 * whereas the player withdraw endpoint needs the participant's own token).
 */
export async function disqualifyRegistration(
  adminToken: string,
  tournamentId: string,
  registrationId: string,
  reason = 'E2E late withdrawal',
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations/${registrationId}/disqualify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason }),
    },
  )
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`Disqualify registration failed (${resp.status}): ${await resp.text()}`)
  }
}

export async function closeRegistration(
  adminToken: string,
  tournamentId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/close-registration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Close registration failed (${resp.status}): ${await resp.text()}`)
  }
}

export async function startTournament(
  adminToken: string,
  tournamentId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    throw new Error(`Start tournament failed (${resp.status}): ${await resp.text()}`)
  }
}

/**
 * Fetch seeding as admin. Returned seeds may be `null` before auto/manual
 * seeding has been applied, but the list still enumerates every eligible
 * registration.
 */
export async function fetchSeeding(
  adminToken: string,
  tournamentId: string,
): Promise<SeedEntry[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/seeding`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<SeedEntry[]>>(resp, 'Fetch seeding')
  return body.data ?? []
}

/** Auto-seed via API (used in the late-withdrawal scenario to avoid a tab round-trip). */
export async function autoSeedViaApi(
  adminToken: string,
  tournamentId: string,
  algorithm: 'random' | 'rating' | 'season_rank' = 'random',
): Promise<SeedEntry[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/seeding/auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ algorithm }),
  })
  const body = await jsonOrThrow<ApiResult<SeedEntry[]>>(resp, 'Auto-seed tournament')
  return body.data ?? []
}

export async function listRegistrations(
  adminToken: string,
  tournamentId: string,
): Promise<RegistrationRow[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<RegistrationRow[]>>(resp, 'List registrations')
  return body.data ?? []
}

export async function listMatches(
  adminToken: string,
  tournamentId: string,
): Promise<MatchRow[]> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<MatchRow[]>>(resp, 'List matches')
  return body.data ?? []
}

/**
 * End-to-end convenience: create an approval tournament, register `count`
 * players, approve all of them. Used by the manual-reorder and late-
 * withdrawal scenarios where the admin-approval UI flow isn't what's being
 * exercised.
 */
export async function createTournamentWithApprovedPlayers(
  adminToken: string,
  count: number,
  opts: CreateApprovalTournamentOptions = {},
): Promise<{ tournament: CreatedTournament; players: PendingPlayer[] }> {
  const tournament = await createApprovalTournament(adminToken, opts)
  const players = await registerPendingPlayers(tournament.id, count)
  for (const player of players) {
    await approveRegistration(adminToken, tournament.id, player.registrationId)
  }
  return { tournament, players }
}

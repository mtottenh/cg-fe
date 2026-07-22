/**
 * Tournament lifecycle API helpers.
 *
 * Drives the backend directly via HTTP so the lifecycle spec can shove a
 * tournament all the way through its state machine without clicking every
 * field in a modal.
 *
 * Endpoint shapes (verified against
 * `/api/crates/portal-api/src/routes/tournaments.rs` at rebase commit):
 *
 *   POST /v1/tournaments                                (admin)
 *   GET  /v1/tournaments/{id}                           (public)
 *   POST /v1/tournaments/{id}/publish                   (admin)
 *   POST /v1/tournaments/{id}/open-registration         (admin)
 *   POST /v1/tournaments/{id}/close-registration        (admin)
 *   POST /v1/tournaments/{id}/reopen-registration       (admin)
 *   POST /v1/tournaments/{id}/start                     (admin)
 *   POST /v1/tournaments/{id}/complete                  (admin)
 *   POST /v1/tournaments/{id}/finalize                  (admin)
 *   POST /v1/tournaments/{id}/cancel                    (admin)
 *   POST /v1/tournaments/{id}/registrations/player      (player)
 *        body: { participant_name: string }
 *   POST /v1/tournaments/{id}/registrations/{reg_id}/approve    (admin)
 *   GET  /v1/tournaments/{id}/matches                   (admin)
 */

import { uniqueId, CS2_MAP_POOL } from './test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface CreateTournamentOptions {
  name?: string
  slug?: string
  format?: 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss'
  participantType?: 'individual' | 'team'
  minParticipants?: number
  maxParticipants?: number
  checkInRequired?: boolean
}

export interface TournamentSummary {
  id: string
  slug: string
  name: string
  status: string
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
  const body = await jsonOrThrow<ApiResult<Array<{ id: string; name: string }>>>(
    resp,
    'List games',
  )
  if (!body.data || body.data.length === 0) {
    throw new Error('No games available to create tournament')
  }
  return body.data[0].id
}

/**
 * Create a fresh tournament in `draft` status. Returns the id + slug +
 * name so the spec can navigate to `/admin/tournaments/{id}` and assert
 * on the name in the page header.
 */
export async function createDraftTournament(
  adminToken: string,
  opts: CreateTournamentOptions = {},
): Promise<TournamentSummary> {
  const suffix = uniqueId()
  const gameId = await firstGameId()

  const body = {
    name: opts.name ?? `E2E Lifecycle ${suffix}`,
    slug: opts.slug ?? `e2e-lifecycle-${suffix}`,
    game_id: gameId,
    format: opts.format ?? 'single_elimination',
    map_pool: CS2_MAP_POOL,
    participant_type: opts.participantType ?? 'individual',
    min_participants: opts.minParticipants ?? 2,
    max_participants: opts.maxParticipants ?? 4,
    check_in_required: opts.checkInRequired ?? false,
  }

  const resp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  })
  const created = await jsonOrThrow<ApiResult<TournamentSummary>>(
    resp,
    'Create tournament',
  )
  return created.data
}

/** Fetch tournament status / metadata by id. Used to poll until a
 *  transition has been persisted. */
export async function fetchTournament(
  adminToken: string,
  tournamentId: string,
): Promise<TournamentSummary & { check_in_required: boolean }> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<TournamentSummary & { check_in_required: boolean }>>(
    resp,
    'Fetch tournament',
  )
  return body.data
}

/**
 * Register a player for a tournament. The token must belong to the
 * registering player; `displayName` becomes the registration's
 * `participant_name` (shown in the admin registrations tab).
 */
export async function registerPlayer(
  playerToken: string,
  tournamentId: string,
  displayName: string,
): Promise<string> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations/player`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`,
      },
      body: JSON.stringify({ participant_name: displayName }),
    },
  )
  const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Register player')
  return body.data.id
}

/** Admin-approve a pending registration. 409 on a double-approve is
 *  treated as success, so this is safe to call idempotently. */
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
    const text = await resp.text()
    throw new Error(`Approve registration failed (${resp.status}): ${text}`)
  }
}

/** List matches for a tournament (admin). Convenient for asserting that
 *  /start actually produced a bracket. */
export async function listMatches(
  adminToken: string,
  tournamentId: string,
): Promise<Array<{ id: string; status: string }>> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<Array<{ id: string; status: string }>>>(
    resp,
    'List matches',
  )
  return body.data ?? []
}

/**
 * Poll `GET /v1/tournaments/{id}` until its status equals `expected` or
 * `timeoutMs` elapses. Preferred over arbitrary `waitForTimeout` because
 * the UI + store refresh can be racy: the button click fires an action,
 * the page refetches, the chip re-renders — polling the backend avoids
 * all of that jitter.
 */
export async function waitForTournamentStatus(
  adminToken: string,
  tournamentId: string,
  expected: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    const t = await fetchTournament(adminToken, tournamentId)
    last = t.status
    if (t.status === expected) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `Tournament ${tournamentId} status did not reach "${expected}" within ${timeoutMs}ms (last seen: "${last}")`,
  )
}

/**
 * Drive a single lifecycle transition (`publish`, `open-registration`,
 * `close-registration`, `reopen-registration`, `start`, `complete`, …).
 *
 * Exported so specs can build the exact precondition they need WITHOUT
 * guarding on whatever state a shared tournament happens to be in. See
 * COVERAGE-PLAN.md §3 rule 3 ("own your state").
 */
export async function transitionTournament(
  adminToken: string,
  tournamentId: string,
  action: string,
): Promise<void> {
  await postAction(adminToken, tournamentId, action)
}

/**
 * Create a fresh tournament that is OPEN FOR REGISTRATION.
 *
 * Use this for any test that needs `Register Now` / `Withdraw` / `Check In`
 * to actually render. The globally seeded tournament (`TEST_TOURNAMENT_SLUG`)
 * is *started* by global-setup, so those controls never appear on it — which
 * is why the old registration tests were wrapped in visibility guards and
 * silently never ran (COVERAGE-PLAN.md §5.2).
 *
 * Returns the tournament with `status: 'registration'`.
 */
export async function createOpenRegistrationTournament(
  adminToken: string,
  opts: CreateTournamentOptions = {},
): Promise<TournamentSummary> {
  const tournament = await createDraftTournament(adminToken, opts)
  await postAction(adminToken, tournament.id, 'publish')
  await postAction(adminToken, tournament.id, 'open-registration')
  return { ...tournament, status: 'registration' }
}

/**
 * Admin-drive a tournament from `draft` straight through to `in_progress`
 * via direct API calls. Used by the "cancel mid-play" and "guards"
 * scenarios, where we need the tournament in a specific state but don't
 * care about asserting each UI transition along the way.
 */
export async function advanceToInProgress(
  adminToken: string,
  tournamentId: string,
  p1Token: string,
  p2Token: string,
  p1Name: string,
  p2Name: string,
): Promise<void> {
  await postAction(adminToken, tournamentId, 'publish')
  await postAction(adminToken, tournamentId, 'open-registration')
  const r1 = await registerPlayer(p1Token, tournamentId, p1Name)
  const r2 = await registerPlayer(p2Token, tournamentId, p2Name)
  await approveRegistration(adminToken, tournamentId, r1)
  await approveRegistration(adminToken, tournamentId, r2)
  await postAction(adminToken, tournamentId, 'close-registration')
  await postAction(adminToken, tournamentId, 'start')
}

/** Advance a tournament straight to `completed`. Builds on top of
 *  {@link advanceToInProgress} — used by the negative-guards scenario. */
export async function advanceToCompleted(
  adminToken: string,
  tournamentId: string,
  p1Token: string,
  p2Token: string,
  p1Name: string,
  p2Name: string,
): Promise<void> {
  await advanceToInProgress(adminToken, tournamentId, p1Token, p2Token, p1Name, p2Name)
  await postAction(adminToken, tournamentId, 'complete')
}

async function postAction(
  adminToken: string,
  tournamentId: string,
  action: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/${action}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Tournament ${action} failed (${resp.status}): ${text}`)
  }
}

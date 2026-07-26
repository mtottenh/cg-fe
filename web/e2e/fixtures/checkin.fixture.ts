import type { APIRequestContext } from '@playwright/test'
import { uniqueId, CS2_MAP_POOL } from './test-data'
import type { TournamentMatchStatus, TournamentRegistrationStatus } from './api-status'

/**
 * Match check-in / no-show API helpers.
 *
 * These helpers drive the backend directly via HTTP so that the spec can
 * assemble a deterministic "ready to check-in" match without clicking
 * through registration, seeding, and bracket generation in the UI.
 *
 * Endpoint shapes verified against
 * `/api/crates/portal-api/src/routes/tournaments.rs` and the
 * corresponding handlers in `handlers/tournaments/`:
 *
 *   POST /v1/tournaments/{tournament_id}/matches/{match_id}/check-in
 *        body: { registration_id: string }   (Bearer, participant token)
 *
 *   POST /v1/tournaments/{tournament_id}/process-no-shows
 *        body: none                          (Bearer, admin token)
 *
 *   GET  /v1/tournaments/{tournament_id}/matches/{match_id}
 *        (public; Bearer optional but supplied for consistency)
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface CheckInScenario {
  tournamentId: string
  tournamentSlug: string
  matchId: string
  p1: ParticipantToken
  p2: ParticipantToken
}

export interface ParticipantToken {
  userId: string
  username: string
  email: string
  password: string
  token: string
  registrationId: string
}

export interface CreateScenarioOptions {
  /** Existing tournament to reuse. If omitted, a fresh one is created. */
  tournamentId?: string
  /** Whether check-in should be required on the tournament. */
  checkInRequired: boolean
  /** If true, set `check_in_end` in the past so no-show processing is valid. */
  checkInEndInPast?: boolean
  /**
   * If true, stop after registrations are approved: no admin check-in
   * override, no /start, no matches. For tournament-level flows like
   * no-show processing, which operate on approved-but-not-checked-in
   * registrations BEFORE the bracket exists. `matchId` will be ''.
   */
  skipStart?: boolean
  /**
   * ISO timestamp to schedule the generated match at (defaults to
   * now + 10 minutes). Scheduling is once-only (ready -> scheduled), so
   * flows that need a specific scheduled_at (e.g. demo auto-linking away
   * from other test matches) must set it here.
   */
  scheduleAt?: string
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
    // Some endpoints (PATCH 204) may return empty body.
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(`${context}: failed to parse JSON (${String(err)}): ${text}`)
  }
}

/**
 * Register a brand-new user via `/v1/auth/register` and return a login token.
 * Registrations are idempotent-enough for test purposes because we use a
 * `uniqueId()` suffix on every run.
 */
export async function createTestUser(): Promise<{
  userId: string
  username: string
  email: string
  password: string
  token: string
}> {
  const suffix = uniqueId()
  const username = `ci_${suffix}`
  const email = `ci-${suffix}@example.com`
  const password = 'TestPassword123!'

  const registerResp = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      display_name: `CheckIn Tester ${suffix}`,
    }),
  })
  const registered = await jsonOrThrow<ApiResult<{ access_token: string; user?: { id: string } }>>(
    registerResp,
    'Register test user',
  )

  // Some register endpoints return access_token directly; otherwise log in.
  let token = registered.data?.access_token
  let userId = registered.data?.user?.id

  if (!token) {
    const loginResp = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username_or_email: email, password }),
    })
    const login = await jsonOrThrow<ApiResult<{ access_token: string; user?: { id: string } }>>(
      loginResp,
      'Login test user',
    )
    token = login.data.access_token
    userId = userId ?? login.data.user?.id
  }

  if (!userId) {
    // Fetch via /players/me
    const meResp = await fetch(`${API_URL}/v1/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const me = await jsonOrThrow<ApiResult<{ id: string; user_id?: string }>>(meResp, 'Fetch /players/me')
    userId = me.data.user_id ?? me.data.id
  }

  return { userId: userId!, username, email, password, token: token! }
}

/**
 * Create a fresh individual tournament with `check_in_required` set.
 * Returns the tournament id + slug.
 */
async function createIndividualTournament(
  adminToken: string,
  opts: { checkInRequired: boolean; checkInEndInPast?: boolean },
): Promise<{ tournamentId: string; slug: string }> {
  const gamesResp = await fetch(`${API_URL}/v1/games`)
  const games = await jsonOrThrow<ApiResult<Array<{ id: string; name: string }>>>(
    gamesResp,
    'List games',
  )
  if (!games.data || games.data.length === 0) {
    throw new Error('No games available to create tournament')
  }

  const suffix = uniqueId()
  const slug = `e2e-checkin-${suffix}`
  const body: Record<string, unknown> = {
    name: `E2E Check-in Tournament ${suffix}`,
    slug,
    // P-130: CS2 by slug, never positionally — `GET /v1/games` is
    // `ORDER BY sort_order` and the P-90 test sets aoe2's to 0, so `data[0]`
    // becomes aoe2 and the CS2 map pool below 400s with "Unknown map".
    game_id: (games.data.find((g: { id: string; slug?: string }) => g.slug?.toLowerCase() === 'cs2') ?? games.data[0]).id,
    format: 'single_elimination',
    map_pool: CS2_MAP_POOL,
    participant_type: 'individual',
    min_participants: 2,
    max_participants: 4,
    check_in_required: opts.checkInRequired,
  }

  if (opts.checkInEndInPast) {
    // Put the check-in window firmly in the past so process-no-shows is valid.
    const now = Date.now()
    body.check_in_start = new Date(now - 60 * 60 * 1000).toISOString()
    body.check_in_end = new Date(now - 5 * 60 * 1000).toISOString()
  } else if (opts.checkInRequired) {
    // is_check_in_open() requires BOTH timestamps set and now inside the
    // window — with them unset, tournament-level self check-in always 400s.
    const now = Date.now()
    body.check_in_start = new Date(now - 60 * 60 * 1000).toISOString()
    body.check_in_end = new Date(now + 60 * 60 * 1000).toISOString()
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
    'Create tournament',
  )
  return { tournamentId: created.data.id, slug: created.data.slug }
}

async function publishAndOpenRegistration(adminToken: string, tournamentId: string): Promise<void> {
  await fetch(`${API_URL}/v1/tournaments/${tournamentId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  await fetch(`${API_URL}/v1/tournaments/${tournamentId}/open-registration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
}

async function registerPlayer(
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

/**
 * Approve a registration (admin). Moves status Pending -> Approved so that
 * start_tournament can include it in seeding and bracket generation.
 */
async function approveRegistration(
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
  // 200 expected; 409 Conflict is acceptable if already approved.
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text()
    throw new Error(`Approve registration failed (${resp.status}): ${text}`)
  }
}

async function startTournament(adminToken: string, tournamentId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Start tournament failed (${resp.status}): ${text}`)
  }
}

/**
 * Admin-override check-in for a registration. Used by `createCheckInScenario`
 * to satisfy the backend's start-tournament precondition when the tournament
 * has `check_in_required=true`: `TournamentService::start_tournament` seeds
 * only checked-in participants in that mode (see
 * portal-domain/src/services/tournament/service.rs:513), so the bracket can't
 * be generated until someone has checked each player in. Admin-override is
 * synchronous and doesn't depend on the check-in window being open.
 */
async function adminCheckIn(
  adminToken: string,
  tournamentId: string,
  registrationId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations/${registrationId}/admin-check-in`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  // 200 expected; 409 Conflict is acceptable if already checked in.
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text()
    throw new Error(`Admin check-in failed (${resp.status}): ${text}`)
  }
}

async function listMatches(
  adminToken: string,
  tournamentId: string,
): Promise<Array<{ id: string; participant1_registration_id: string | null; participant2_registration_id: string | null; status: TournamentMatchStatus }>> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiResult<Array<{
    id: string
    participant1_registration_id: string | null
    participant2_registration_id: string | null
    status: TournamentMatchStatus
  }>>>(resp, 'List matches')
  return body.data ?? []
}

/**
 * End-to-end scenario builder: creates a fresh tournament (unless one is
 * supplied), registers two players, approves them, starts the tournament,
 * and returns the first generated match together with each participant's
 * registration id and login token.
 */
export async function createCheckInScenario(
  _request: APIRequestContext | undefined,
  adminToken: string,
  opts: CreateScenarioOptions,
): Promise<CheckInScenario> {
  // Create participants first so they exist when we register them.
  const p1User = await createTestUser()
  const p2User = await createTestUser()

  let tournamentId = opts.tournamentId
  let slug: string | undefined

  if (!tournamentId) {
    const created = await createIndividualTournament(adminToken, {
      checkInRequired: opts.checkInRequired,
      checkInEndInPast: opts.checkInEndInPast,
    })
    tournamentId = created.tournamentId
    slug = created.slug
    await publishAndOpenRegistration(adminToken, tournamentId)
  } else {
    // If reusing, fetch the slug for routing assertions.
    const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`)
    const body = await jsonOrThrow<ApiResult<{ slug: string }>>(resp, 'Fetch tournament')
    slug = body.data.slug
  }

  // Register each player, then admin-approve.
  const p1RegId = await registerPlayer(p1User.token, tournamentId, `Player One ${p1User.username}`)
  const p2RegId = await registerPlayer(p2User.token, tournamentId, `Player Two ${p2User.username}`)

  await approveRegistration(adminToken, tournamentId, p1RegId)
  await approveRegistration(adminToken, tournamentId, p2RegId)

  if (opts.skipStart) {
    return {
      tournamentId,
      tournamentSlug: slug ?? '',
      matchId: '',
      p1: { ...p1User, registrationId: p1RegId },
      p2: { ...p2User, registrationId: p2RegId },
    }
  }

  // When check-in is required, the start endpoint only seeds checked-in
  // registrations. Admin-override both players' check-in so the bracket
  // actually generates — tests that care about check-in status assert the
  // MATCH-level participant{1,2}_checked_in_at, which starts null regardless.
  if (opts.checkInRequired) {
    await adminCheckIn(adminToken, tournamentId, p1RegId)
    await adminCheckIn(adminToken, tournamentId, p2RegId)
  }

  // Start the tournament so matches are generated.
  await startTournament(adminToken, tournamentId)

  // Find the match that pairs our two registrations.
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
  const p1 = p1IsSlotOne
    ? { ...p1User, registrationId: p1RegId }
    : { ...p2User, registrationId: p2RegId }
  const p2 = p1IsSlotOne
    ? { ...p2User, registrationId: p2RegId }
    : { ...p1User, registrationId: p1RegId }

  // Generated matches land in `ready`; the match-level check-in endpoint
  // only accepts requests while status === 'checking_in'. Drive the match
  // there via the admin endpoints (ready → scheduled → checking_in).
  await advanceMatchToCheckingIn(adminToken, tournamentId, targetMatch.id, opts.scheduleAt)

  return {
    tournamentId,
    tournamentSlug: slug ?? '',
    matchId: targetMatch.id,
    p1,
    p2,
  }
}

/**
 * Tournament-level self check-in (the registration's own player confirms
 * attendance). Distinct from the MATCH-level check-in in checkInViaApi.
 */
export async function tournamentCheckIn(
  token: string,
  tournamentId: string,
  registrationId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations/${registrationId}/check-in`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!resp.ok) {
    throw new Error(`Tournament check-in failed (${resp.status}): ${await resp.text()}`)
  }
}

/**
 * Statuses from which the schedule step is a legitimate no-op — the match is
 * already at or past `scheduled`. Derived from `allowed_transitions`
 * (api/crates/portal-core/src/types/tournament.rs:447). `pending`, `cancelled`
 * and `forfeit` are deliberately absent: from any of those the fixture cannot
 * deliver what it promises, and saying so is the point.
 */
const AT_OR_PAST_SCHEDULED: TournamentMatchStatus[] = [
  'scheduled',
  'checking_in',
  'pick_ban',
  'in_progress',
  'awaiting_result',
  'completed',
  'disputed',
]

/** Same list minus `scheduled` — the transition step's no-op set. */
const AT_OR_PAST_CHECKING_IN: TournamentMatchStatus[] = AT_OR_PAST_SCHEDULED.filter(
  (s) => s !== 'scheduled',
)

/**
 * Drive a freshly-generated match (status `ready`) into `checking_in` using
 * the admin endpoints. The state machine has no direct ready → checking_in
 * edge: ready → scheduled (admin schedule) → checking_in (admin transition).
 *
 * P-3: both steps used to treat **any** HTTP 400 as success, in the name of
 * being rerun-safe. That conflates "already done" with "could not be done" —
 * the two states a fixture most needs to tell apart. A failed precondition then
 * surfaced much later as a confusing UI assertion failure in whichever spec
 * consumed the scenario, and a fixture that hides a failed precondition
 * produces a test that passes for the wrong reason.
 *
 * Rerun-safety is kept, but it is now EARNED rather than assumed: on a
 * non-OK response the match's actual status is read back, and the step is
 * treated as a no-op only when the match really is at or past the target.
 * Anything else throws with the status code, the response body and the
 * observed status.
 */
export async function advanceMatchToCheckingIn(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  scheduleAt?: string,
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
        scheduled_at: scheduleAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reason: 'E2E fixture: schedule match for check-in window',
      }),
    },
  )
  if (!scheduleResp.ok) {
    const body = await scheduleResp.text()
    const { status } = await getMatch(undefined, adminToken, tournamentId, matchId)
    if (!AT_OR_PAST_SCHEDULED.includes(status)) {
      throw new Error(
        `Admin schedule failed (${scheduleResp.status}) and match ${matchId} is still ` +
          `"${status}", so it was NOT already scheduled: ${body}`,
      )
    }
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
        to_status: 'checking_in',
        override_reason: 'E2E fixture: open the check-in window',
      }),
    },
  )
  if (!transitionResp.ok) {
    const body = await transitionResp.text()
    const { status } = await getMatch(undefined, adminToken, tournamentId, matchId)
    if (!AT_OR_PAST_CHECKING_IN.includes(status)) {
      throw new Error(
        `Admin transition to checking_in failed (${transitionResp.status}) and match ` +
          `${matchId} is "${status}", which is not at or past checking_in: ${body}`,
      )
    }
  }
}

/**
 * Check-in a single participant via the match check-in endpoint.
 * The `token` must belong to a user that owns the given `registrationId`.
 */
export async function checkInViaApi(
  _request: APIRequestContext | undefined,
  token: string,
  tournamentId: string,
  matchId: string,
  registrationId: string,
): Promise<{ status: TournamentMatchStatus; participant1_checked_in_at: string | null; participant2_checked_in_at: string | null }> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/check-in`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ registration_id: registrationId }),
    },
  )
  const body = await jsonOrThrow<ApiResult<{
    status: TournamentMatchStatus
    participant1_checked_in_at: string | null
    participant2_checked_in_at: string | null
  }>>(resp, 'Match check-in')
  return body.data
}

/**
 * Trigger no-show processing for the whole tournament.
 * Requires admin auth and `check_in_required=true` on the tournament.
 * Returns the list of registrations flagged as no-show.
 */
export async function processNoShows(
  _request: APIRequestContext | undefined,
  adminToken: string,
  tournamentId: string,
): Promise<Array<{ id: string; status: TournamentMatchStatus }>> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/process-no-shows`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  const body = await jsonOrThrow<ApiResult<Array<{ id: string; status: TournamentMatchStatus }>>>(
    resp,
    'Process no-shows',
  )
  return body.data ?? []
}

/** Fetch a match directly so tests can assert backend-visible state. */
export async function getMatch(
  _request: APIRequestContext | undefined,
  adminToken: string,
  tournamentId: string,
  matchId: string,
): Promise<{
  id: string
  status: TournamentMatchStatus
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  participant1_checked_in_at: string | null
  participant2_checked_in_at: string | null
  winner_registration_id: string | null
}> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  const body = await jsonOrThrow<ApiResult<{
    id: string
    status: TournamentMatchStatus
    participant1_registration_id: string | null
    participant2_registration_id: string | null
    participant1_checked_in_at: string | null
    participant2_checked_in_at: string | null
    winner_registration_id: string | null
  }>>(resp, 'Get match')
  return body.data
}

/** Fetch a tournament registration (for asserting NoShow status, etc.). */
export async function getRegistration(
  _request: APIRequestContext | undefined,
  adminToken: string,
  tournamentId: string,
  registrationId: string,
): Promise<{ id: string; status: TournamentRegistrationStatus; checked_in: boolean }> {
  const resp = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/registrations`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  )
  const body = await jsonOrThrow<ApiResult<Array<{ id: string; status: TournamentRegistrationStatus; checked_in: boolean }>>>(
    resp,
    'List registrations',
  )
  const row = (body.data ?? []).find((r) => r.id === registrationId)
  if (!row) {
    throw new Error(`Registration ${registrationId} not found in tournament ${tournamentId}`)
  }
  return row
}

/**
 * Inject a player session's token into the page's localStorage so the
 * Vue app treats the user as logged in without driving the login form.
 * Mirrors the key names used by `clearAuthState` in auth.fixture.ts.
 */
export async function primeAuthStorage(
  page: import('@playwright/test').Page,
  token: string,
  playerId?: string,
): Promise<void> {
  // Must be on the origin to touch localStorage.
  await page.goto('/')
  await page.evaluate(
    ({ t, pid }) => {
      localStorage.setItem('token', t)
      if (pid) localStorage.setItem('player_id', pid)
    },
    { t: token, pid: playerId ?? '' },
  )
}

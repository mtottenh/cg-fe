import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createTestUser, primeAuthStorage, getMatch } from './fixtures/checkin.fixture'
import { adminTransitionMatch } from './fixtures/match-results-extra.fixture'
import { uniqueId, CS2_MAP_POOL } from './fixtures/test-data'

/**
 * P-53 / P-56 — past registration #100, a participant could not submit a
 * result AT ALL.
 *
 * `useMatchDetail` resolved "which registration am I in this match?" in the
 * browser, by fetching `GET /v1/tournaments/{id}/registrations` and scanning
 * the returned page for the caller. `PaginationParams::limit()` clamps
 * `per_page` at 100, so the scan could only ever see the first 100 rows. Every
 * participant-only affordance on the match page — `canSubmitResult`,
 * `showConfirmationPanel`, `showSchedulingPanel`, `showCheckInPanel` — is
 * gated on that resolution, so anyone sorting past row 100 lost all of them.
 * The failure is SILENT: no error, no empty state, the controls simply never
 * render. 128-player CS2 events are routine, so this was a live hard ceiling.
 *
 * -------------------------------------------------------------------------
 * Why this test seeds 101 real registrations
 *
 * The cheaper version of this test — "assert the composable never issues a
 * paginated registrations scan" — proves the mechanism is gone but not that
 * the replacement works at scale, and it would pass against an endpoint that
 * itself paged internally. So the scale is real: 101 participants, one more
 * than the cap, with the subject registered LAST so their row is provably on
 * page 2. `registrations` are ordered `seed ASC NULLS LAST, registered_at ASC`
 * and `start_tournament` does not write seeds back, so registration order is
 * the list order and "the subject is row 101" is a property of the fixture,
 * not a hope about a seeding algorithm.
 *
 * The premise is asserted rather than assumed (step 2): if the subject ever
 * landed inside page 1, the submission below would prove nothing.
 *
 * The no-scan assertion is kept too, as a separate, narrower guard: it is what
 * stops the ceiling being reintroduced by someone "helpfully" restoring the
 * list fetch. It does NOT stand in for the scale test.
 * -------------------------------------------------------------------------
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** One past `PaginationParams::limit()`'s hard cap of 100. */
const PARTICIPANTS = 101

interface CeilingScenario {
  tournamentId: string
  tournamentSlug: string
  matchId: string
  subjectToken: string
  subjectUserId: string
  subjectRegistrationId: string
  subjectIsParticipant1: boolean
}

async function api<T>(path: string, init: RequestInit, context: string): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, init)
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

function adminPost(adminToken: string, path: string, context: string, body?: unknown) {
  return api<{ data: unknown }>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    context,
  )
}

/**
 * A started tournament with `PARTICIPANTS` registrations, where the LAST
 * registrant is seated in a match with a real opponent.
 *
 * Registration is `open` so the backend auto-approves (P-2) — 101 explicit
 * approvals would triple the request count for no coverage. Users are created
 * in small concurrent batches purely for wall-clock; the registration calls
 * themselves stay strictly ordered, because the subject being LAST is the
 * whole point of the fixture.
 */
async function createOverCapacityScenario(adminToken: string): Promise<CeilingScenario> {
  const games = await api<{ data: Array<{ id: string; slug?: string }> }>(
    '/v1/games',
    {},
    'List games',
  )
  const cs2 = games.data.find((g) => g.slug?.toLowerCase() === 'cs2') ?? games.data[0]
  if (!cs2) throw new Error('No games available')

  const suffix = uniqueId()
  const slug = `e2e-ceiling-${suffix}`
  const created = await adminPost(adminToken, '/v1/tournaments', 'Create tournament', {
    name: `E2E Ceiling ${suffix}`,
    slug,
    game_id: cs2.id,
    format: 'single_elimination',
    map_pool: CS2_MAP_POOL,
    participant_type: 'individual',
    min_participants: 2,
    max_participants: 128,
    check_in_required: false,
    registration_type: 'open',
  })
  const tournamentId = (created.data as { id: string }).id

  await adminPost(adminToken, `/v1/tournaments/${tournamentId}/publish`, 'Publish')
  await adminPost(adminToken, `/v1/tournaments/${tournamentId}/open-registration`, 'Open registration')

  // Create users concurrently in batches, then register them one at a time so
  // `registered_at` ordering is deterministic.
  const users: Array<Awaited<ReturnType<typeof createTestUser>>> = []
  const BATCH = 12
  for (let i = 0; i < PARTICIPANTS; i += BATCH) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH, PARTICIPANTS - i) }, () => createTestUser()),
    )
    users.push(...batch)
  }

  const registrationIds: string[] = []
  for (let i = 0; i < users.length; i += 1) {
    const body = await api<{ data: { id: string } }>(
      `/v1/tournaments/${tournamentId}/registrations/player`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${users[i]!.token}`,
        },
        body: JSON.stringify({ participant_name: `Seat ${String(i).padStart(3, '0')}` }),
      },
      `Register participant ${i}`,
    )
    registrationIds.push(body.data.id)
  }

  await adminPost(adminToken, `/v1/tournaments/${tournamentId}/close-registration`, 'Close registration')
  await adminPost(adminToken, `/v1/tournaments/${tournamentId}/start`, 'Start tournament')

  const subject = users[users.length - 1]!
  const subjectRegistrationId = registrationIds[registrationIds.length - 1]!

  const matches = await api<{
    data: Array<{
      id: string
      status: string
      participant1_registration_id?: string
      participant2_registration_id?: string
    }>
  }>(`/v1/tournaments/${tournamentId}/matches`, { headers: { Authorization: `Bearer ${adminToken}` } }, 'List matches')

  const target = matches.data.find(
    (m) =>
      m.participant1_registration_id &&
      m.participant2_registration_id &&
      (m.participant1_registration_id === subjectRegistrationId ||
        m.participant2_registration_id === subjectRegistrationId),
  )
  if (!target) {
    throw new Error(
      `The last registrant was not seated in a two-participant match — the fixture cannot ` +
        `exercise result submission. (Did the bracket give them a bye?)`,
    )
  }

  // Walk the match to `in_progress`, the state the backend requires before a
  // claim can be submitted. Going ready → scheduled → in_progress via the
  // admin transition deliberately skips `pick_ban`, so no veto session is
  // created and the submitted map is validated against the tournament pool.
  for (const status of ['scheduled', 'in_progress'] as const) {
    await adminTransitionMatch(adminToken, tournamentId, target.id, status)
  }

  return {
    tournamentId,
    tournamentSlug: slug,
    matchId: target.id,
    subjectToken: subject.token,
    subjectUserId: subject.userId,
    subjectRegistrationId,
    subjectIsParticipant1: target.participant1_registration_id === subjectRegistrationId,
  }
}

test.describe('Result submission past the registration-page ceiling (P-53/P-56)', () => {
  test('a participant registered 101st can submit a result through the match page', async ({
    page,
  }) => {
    // Seeding 101 users + registrations dominates the runtime.
    test.setTimeout(300_000)

    const adminToken = await getAdminToken()
    const scenario = await createOverCapacityScenario(adminToken)

    // --- 1. The subject really is past the ceiling. ---------------------
    // Asserted, not assumed: if their row fell inside the largest page a
    // client can request, the old scan would have found them and the
    // submission below would pass for the wrong reason.
    const page1 = await api<{ data: Array<{ id: string }>; meta?: { pagination?: { total_items?: number } } }>(
      `/v1/tournaments/${scenario.tournamentId}/registrations?per_page=100&page=1`,
      { headers: { Authorization: `Bearer ${scenario.subjectToken}` } },
      'List registrations page 1',
    )
    expect(page1.data).toHaveLength(100)
    expect(
      page1.data.map((r) => r.id),
      'the subject must NOT be reachable on page 1 — otherwise this test does not reproduce the ceiling',
    ).not.toContain(scenario.subjectRegistrationId)

    // --- 2. Record every registrations-list request the page makes. -----
    // The list fetch existed ONLY to be scanned. Restoring it is how the
    // ceiling comes back, so its absence is a guarded property.
    const registrationScans: string[] = []
    await page.route('**/v1/tournaments/*/registrations*', async (route) => {
      registrationScans.push(route.request().url())
      await route.continue()
    })

    await primeAuthStorage(page, scenario.subjectToken, scenario.subjectUserId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    // --- 3. The affordance the defect removed. --------------------------
    const panel = page.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
    await expect(
      panel,
      'the 101st registrant must be offered the result-submission panel',
    ).toBeVisible({ timeout: 30_000 })

    // --- 4. …and it actually works end to end. --------------------------
    const scoreInputs = panel.locator('input[type="number"]')
    // Claim a win for the subject, whichever slot they occupy.
    await scoreInputs.first().fill(scenario.subjectIsParticipant1 ? '16' : '10')
    await scoreInputs.nth(1).fill(scenario.subjectIsParticipant1 ? '10' : '16')

    const mapSelect = panel.locator('.v-select').filter({ hasText: 'Map for game 1' })
    if ((await mapSelect.count()) > 0) {
      await mapSelect.click()
      await page.getByRole('option').first().click()
    }

    const submitted = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/result`) &&
        res.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await panel.getByRole('button', { name: 'Submit Result' }).click()
    expect((await submitted).ok()).toBe(true)

    await expect(page.getByText('Awaiting Opponent Confirmation')).toBeVisible({ timeout: 15_000 })

    // --- 5. Backend cross-check: the claim is really theirs. ------------
    const claim = await api<{
      data: { status: string; submitted_by_registration_id: string }
    }>(`/v1/matches/${scenario.matchId}/result`, {}, 'Get pending claim')
    expect(claim.data.status).toBe('pending')
    expect(claim.data.submitted_by_registration_id).toBe(scenario.subjectRegistrationId)

    const match = await getMatch(undefined, adminToken, scenario.tournamentId, scenario.matchId)
    expect(match.status).toBe('awaiting_result')

    // --- 6. The paginated scan is gone, not merely widened. -------------
    expect(
      registrationScans,
      'the match page must not fetch the paginated registrations list — that fetch, and its ' +
        '100-row cap, IS the defect',
    ).toEqual([])
  })
})

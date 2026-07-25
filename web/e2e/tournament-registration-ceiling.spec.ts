import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createTestUser, primeAuthStorage } from './fixtures/checkin.fixture'
import {
  createOpenRegistrationTournament,
  registerPlayer,
  approveRegistration,
} from './fixtures/tournament-lifecycle.fixture'
import { uniqueId } from './fixtures/test-data'

/**
 * P-167 — past registration #20, a registered player is told they are NOT
 * registered.
 *
 * `TournamentDetailPage` fetched `GET /v1/tournaments/{id}/registrations` with
 * no `per_page` (so the API default of 20) and `useTournamentContext`
 * searched that page for the viewer. Everyone whose row sorted past #20
 * resolved to `null`, which is indistinguishable from "not registered": the
 * page rendered the join call-to-action, with no Registered chip, no withdraw
 * control and no check-in — on the page every entrant lands on first. The same
 * 20-row sample fed `hasEligibleTeams`, the participant count and the
 * organiser's pending-approvals badge.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TEST IS SHAPED THIS WAY
 *
 * 1. The premise is asserted, not assumed (step 1): the subject really is
 *    absent from the page the old code fetched. Without that, a green run
 *    proves nothing.
 *
 * 2. It records every registrations-LIST response the page receives and
 *    asserts none of them contained the subject's row (step 3). That is the
 *    part that cannot be satisfied by widening `per_page`: raise the page size
 *    far enough to cover the subject and this assertion goes red. The list
 *    fetch itself is legitimate here — the Participants tab is a table of it —
 *    so "no list request at all" (the guard Lane T could use on the match page)
 *    is not available; "the answer did not come from the list" is.
 *
 * 3. The organiser's numbers are asserted at values a page sample CANNOT
 *    produce: 24 pending out of 25 rows. The old arithmetic counted the
 *    pending rows of page 1 and could never exceed 20.
 * ---------------------------------------------------------------------------
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Comfortably past the API's default page size of 20. */
const PARTICIPANTS = 25
const MAX_PARTICIPANTS = 64

interface CeilingScenario {
  tournamentId: string
  tournamentSlug: string
  subjectToken: string
  subjectUserId: string
  subjectRegistrationId: string
  subjectName: string
}

let scenario: CeilingScenario

/**
 * A tournament open for registration with `PARTICIPANTS` entrants, where the
 * SUBJECT registers LAST and is the only one approved.
 *
 * - `approval` (not `open`): P-2 auto-approves on an open tournament, and this
 *   fixture needs a large pending queue to make the organiser's badge
 *   meaningful.
 * - The subject is approved so their card shows the Registered state and the
 *   withdraw affordance — the two things the defect removed.
 * - Registrations are issued strictly in order: `registrations` are ordered
 *   `seed ASC NULLS LAST, registered_at ASC` and nothing here writes seeds, so
 *   "the subject is row 25" is a property of the fixture rather than a hope.
 */
async function createOverCapacityScenario(adminToken: string): Promise<CeilingScenario> {
  const suffix = uniqueId()
  const tournament = await createOpenRegistrationTournament(adminToken, {
    name: `E2E Reg Ceiling ${suffix}`,
    slug: `e2e-reg-ceiling-${suffix}`,
    registrationType: 'approval',
    minParticipants: 2,
    maxParticipants: MAX_PARTICIPANTS,
  })

  // Users are created in small concurrent batches purely for wall-clock; the
  // registrations themselves stay strictly ordered.
  const users: Array<Awaited<ReturnType<typeof createTestUser>>> = []
  const BATCH = 8
  for (let i = 0; i < PARTICIPANTS; i += BATCH) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH, PARTICIPANTS - i) }, () => createTestUser()),
    )
    users.push(...batch)
  }

  const registrationIds: string[] = []
  for (let i = 0; i < users.length; i += 1) {
    registrationIds.push(
      await registerPlayer(users[i]!.token, tournament.id, `Seat ${String(i).padStart(3, '0')}`),
    )
  }

  const subject = users[users.length - 1]!
  const subjectRegistrationId = registrationIds[registrationIds.length - 1]!
  await approveRegistration(adminToken, tournament.id, subjectRegistrationId)

  return {
    tournamentId: tournament.id,
    tournamentSlug: tournament.slug,
    subjectToken: subject.token,
    subjectUserId: subject.userId,
    subjectRegistrationId,
    subjectName: `Seat ${String(PARTICIPANTS - 1).padStart(3, '0')}`,
  }
}

/**
 * The `TournamentRegistrationCard`, located by the copy only it renders
 * (title computed — TournamentRegistrationCard.vue:292-301). Same technique as
 * tournament-public.spec.ts, and deliberately matching BOTH the registered and
 * the not-registered titles: the defect showed the join CTA to a registered
 * player, so a locator that only matched the registered copy would fail with
 * "not found" instead of telling us which state rendered.
 */
function registrationCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({
      hasText:
        /Join This Tournament|Registration Pending|You're Registered|Check-in Now Open|You're All Set!|Registration Opens Soon|Registration Closed/,
    })
    .first()
}

/**
 * Record the registration ids returned by every registrations-LIST response
 * the page receives. Returns a getter, because the bodies are read
 * asynchronously.
 */
function recordListedRegistrationIds(page: Page): () => Promise<string[]> {
  const pending: Array<Promise<string[]>> = []
  page.on('response', (response) => {
    const url = response.url()
    // The list endpoint only — NOT `/registrations/me`, which is the fix.
    if (!/\/v1\/tournaments\/[^/]+\/registrations(\?|$)/.test(url)) return
    pending.push(
      response
        .json()
        .then((body: { data?: Array<{ id?: string }> }) =>
          (body.data ?? []).map((r) => r.id ?? ''),
        )
        .catch(() => []),
    )
  })
  return async () => (await Promise.all(pending)).flat()
}

test.describe.serial('Registration identity past the page ceiling (P-167)', () => {
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    scenario = await createOverCapacityScenario(await getAdminToken())
  })

  test('the 25th registrant is shown their registration, not the join CTA', async ({ page }) => {
    test.setTimeout(120_000)

    // --- 1. The premise: absent from the page the old code fetched. -------
    const page1 = await fetch(
      `${API_URL}/v1/tournaments/${scenario.tournamentId}/registrations?page=1&per_page=20`,
      { headers: { Authorization: `Bearer ${scenario.subjectToken}` } },
    ).then((r) => r.json() as Promise<{ data: Array<{ id: string }> }>)
    expect(page1.data).toHaveLength(20)
    expect(
      page1.data.map((r) => r.id),
      'the subject must NOT be on the first page — otherwise this test does not reproduce ' +
        'the ceiling and would pass against the scan it replaces',
    ).not.toContain(scenario.subjectRegistrationId)

    const listedIds = recordListedRegistrationIds(page)

    await primeAuthStorage(page, scenario.subjectToken, scenario.subjectUserId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // --- 2. The affordances the defect removed. ---------------------------
    const card = registrationCard(page)
    await expect(
      card.locator('.v-chip').filter({ hasText: 'Registered' }),
      'the 25th registrant must be shown as registered',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      card.getByRole('button', { name: 'Withdraw' }),
      '…and offered the withdraw control that goes with it',
    ).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)

    // --- 3. The answer did not come from a page of the list. --------------
    // This is what stops the ceiling being "fixed" by raising per_page: a page
    // big enough to contain the subject fails here.
    expect(
      await listedIds(),
      'the page must not learn the caller is registered by scanning the paginated list — ' +
        'that scan, and its page size, IS the defect',
    ).not.toContain(scenario.subjectRegistrationId)

    // --- 4. Backend cross-check: the row really is theirs and approved. ---
    const mine = await fetch(
      `${API_URL}/v1/tournaments/${scenario.tournamentId}/registrations/me`,
      { headers: { Authorization: `Bearer ${scenario.subjectToken}` } },
    ).then((r) => r.json() as Promise<{ data: { registrations: Array<{ id: string; status: string }> } }>)
    expect(mine.data.registrations).toHaveLength(1)
    expect(mine.data.registrations[0]!.id).toBe(scenario.subjectRegistrationId)
    expect(mine.data.registrations[0]!.status).toBe('approved')
  })

  test('the organiser sees real counts and can reach the registrations past row 20', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    await primeAuthStorage(page, adminToken)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // 24 of the 25 rows are still pending (only the subject was approved).
    // The old code counted the pending rows of page 1 — capped at 20 — so this
    // number was unreachable by construction.
    await expect(
      page.getByText(`${PARTICIPANTS - 1} pending approvals`),
      'the organiser badge must count every waiting registration, not the ones on page 1',
    ).toBeVisible({ timeout: 30_000 })

    // The capacity read is a real count too: "20 / 64" told an organiser there
    // were 44 free slots when there were 39.
    await expect(page.getByText(`${PARTICIPANTS} / ${MAX_PARTICIPANTS}`)).toBeVisible()

    // The participants table is paged by the server, and page 2 is reachable —
    // before this the tab rendered 20 rows and offered no way to see the rest.
    await page.getByRole('tab', { name: /Participants/ }).click()
    await expect(page.getByText(scenario.subjectName)).toHaveCount(0)
    await page.getByTestId('participants-pagination').getByRole('button', { name: 'Go to page 2' }).click()
    await expect(
      page.getByText(scenario.subjectName),
      'the 25th registrant must be reachable in the participants table',
    ).toBeVisible({ timeout: 15_000 })
  })
})

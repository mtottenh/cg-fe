import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  awardsStatsBody,
  catalogDemo,
  getCs2Game,
  getDemoLinks,
  setSteamId,
  submitDemoStats,
  uniqueSteamId,
} from './fixtures/awards.fixture'
import { adminTransitionMatch } from './fixtures/match-results-extra.fixture'
import { createTestUser } from './fixtures/checkin.fixture'
import { CS2_MAP_POOL, uniqueId } from './fixtures/test-data'

/**
 * `/admin/result-reviews` — a route no test had ever loaded (COVERAGE-PLAN §8),
 * hosting two handlers no test had ever reached (§7 Tier 2:
 * `ResultReviewDetailModal.handleApprove` / `handleReject`).
 *
 * ⭐ This is the regression test for **P-35**. The Decision Form in
 * `ResultReviewDetailModal.vue` was gated on `review.status === 'pending'` — a
 * value `ResultReviewStatus` cannot produce (the real variants are
 * pending_acknowledgment | pending_admin_review | acknowledged | approved |
 * rejected). The form therefore never rendered, and **no admin could approve or
 * reject a result review at all**. Fixed in 5b39d88; `isPending` now mirrors
 * `ResultReviewStatus::is_pending()`.
 *
 * The assertions below are written so they FAIL against the pre-fix component:
 * each test asserts the Decision Form is visible and then drives it.
 *
 * ---------------------------------------------------------------------------
 * How a `pending_admin_review` review is produced (all seeding, no UI):
 *
 *   1. CS2 tournament + two Steam-identified players with a scheduled match.
 *   2. A demo is catalogued and its stats submitted; the stats body reports
 *      13-7, and the auto-linker binds the demo to the match.
 *   3. The match is forced to `in_progress` and participant 1 submits a claim
 *      that cites that demo link but reports a DIFFERENT score (16-14).
 *   4. Participant 2 confirms. `MatchCompletionSaga::step_validate_demos`
 *      (api/crates/portal-domain/src/services/tournament/match_completion.rs:585)
 *      compares claim vs demo, records "Score mismatch: …", and
 *      `ResultReviewService::create_from_validation` routes a score mismatch to
 *      `ResultReview::for_score_mismatch` → status `pending_admin_review`.
 *      The saga then pauses awaiting the admin decision.
 *
 * The OTHER review flavour — `roster_mismatch` → `pending_acknowledgment` — is
 * NOT reachable end-to-end: `DemoValidatorAdapter::validate_match_demos`
 * (api/crates/portal-api/src/adapters/demo_validator.rs:83) declares
 * `let unrecognized = Vec::new()` and never mutates it, so
 * `has_roster_mismatch` is always false. That is COVERAGE-PLAN §9b **P-23**;
 * `ResultReviewAlert.handleAcknowledge` stays uncovered for that reason rather
 * than being faked here.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ReviewRecord {
  id: string
  match_id: string
  status: string
  score_mismatch: boolean
  roster_mismatch: boolean
  winner_mismatch: boolean
  admin_notes: string | null
  reviewed_by_user_id: string | null
  reviewed_at: string | null
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * Submit a BO1 result claim that CITES a demo link but disagrees with it.
 * `match-results-extra.fixture.ts` always sends `demo_link_ids: []`, and the
 * saga skips validation entirely when the claim cites no demos, so the
 * mismatch path needs its own submitter.
 */
async function submitClaimCitingDemo(
  token: string,
  matchId: string,
  winnerRegistrationId: string,
  demoLinkId: string,
  p1GameScore: number,
  p2GameScore: number,
): Promise<{ id: string }> {
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
          // Same map the demo reports, so the ONLY validation complaint is the
          // score — the mismatch this test is about.
          map_id: CS2_MAP_POOL[0],
          participant1_score: p1GameScore,
          participant2_score: p2GameScore,
          evidence_ids: [],
          demo_link_id: demoLinkId,
        },
      ],
      evidence_ids: [],
      demo_link_ids: [demoLinkId],
      notes: null,
    }),
  })
  const body = await jsonOrThrow<{ data: { claim: { id: string } } }>(resp, 'Submit result claim')
  return body.data.claim
}

async function confirmClaim(token: string, matchId: string, claimId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/result/${claimId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  })
  await jsonOrThrow(resp, 'Confirm result claim')
}

/** GET /v1/admin/result-reviews/{id} — the admin detail endpoint. */
async function getReview(adminToken: string, reviewId: string): Promise<ReviewRecord> {
  const resp = await fetch(`${API_URL}/v1/admin/result-reviews/${reviewId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<{ data: ReviewRecord }>(resp, 'Get result review')
  return body.data
}

/** GET /v1/admin/result-reviews — the list the page renders. */
async function listPendingReviews(adminToken: string): Promise<ReviewRecord[]> {
  const resp = await fetch(`${API_URL}/v1/admin/result-reviews?per_page=100`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<{ data: { reviews: ReviewRecord[] } }>(
    resp,
    'List pending result reviews',
  )
  return body.data.reviews ?? []
}

interface Participant {
  token: string
  registrationId: string
  steamId: string
}

interface ReviewScenario {
  tournamentId: string
  matchId: string
  /** The match's scheduled time; doubles as the demo's `match_date`. */
  scheduledAt: string
  p1: Participant
  p2: Participant
}

/**
 * Build a CS2 tournament with one started match between two Steam-identified
 * players.
 *
 * This deliberately does NOT use `createCheckInScenario` /
 * `createAwardsScenario`: those call `approveRegistration`, which the backend
 * now answers with **400** because open-registration tournaments auto-approve
 * (the P-2 fix), and the fixture only tolerates 409 — see the report note. The
 * builder below reads the status the register call actually returns and only
 * approves when the entry really is pending, so it is correct under either
 * behaviour.
 */
async function createStartedCs2Match(adminToken: string): Promise<ReviewScenario> {
  const game = await getCs2Game()
  const suffix = uniqueId()

  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `E2E Review Tournament ${suffix}`,
      slug: `e2e-review-${suffix}`,
      game_id: game.id,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'individual',
      min_participants: 2,
      max_participants: 2,
      check_in_required: false,
    }),
  })
  const tournamentId = (
    await jsonOrThrow<{ data: { id: string } }>(createResp, 'Create review tournament')
  ).data.id

  for (const action of ['publish', 'open-registration']) {
    const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    await jsonOrThrow(resp, `Tournament ${action}`)
  }

  const participants: Participant[] = []
  for (const label of ['One', 'Two']) {
    const user = await createTestUser()
    const steamId = uniqueSteamId()
    await setSteamId(user.token, steamId)

    const regResp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ participant_name: `Review Player ${label} ${suffix}` }),
    })
    const registration = (
      await jsonOrThrow<{ data: { id: string; status: string } }>(regResp, 'Register player')
    ).data

    if (registration.status !== 'approved') {
      const approveResp = await fetch(
        `${API_URL}/v1/tournaments/${tournamentId}/registrations/${registration.id}/approve`,
        { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } },
      )
      await jsonOrThrow(approveResp, 'Approve registration')
    }
    participants.push({ token: user.token, registrationId: registration.id, steamId })
  }

  const startResp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  await jsonOrThrow(startResp, 'Start tournament')

  const matchesResp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const matches = (
    await jsonOrThrow<{
      data: Array<{
        id: string
        participant1_registration_id: string | null
        participant2_registration_id: string | null
      }>
    }>(matchesResp, 'List matches')
  ).data
  const [a, b] = participants as [Participant, Participant]
  const match = matches.find(
    (m) =>
      (m.participant1_registration_id === a.registrationId &&
        m.participant2_registration_id === b.registrationId) ||
      (m.participant1_registration_id === b.registrationId &&
        m.participant2_registration_id === a.registrationId),
  )
  if (!match) {
    throw new Error(`No generated match pairs the two registrations in ${tournamentId}`)
  }

  // Schedule far in the future: the demo auto-linker's candidate window is
  // ±24h around the demo's match_date, and a shared dev DB is full of matches
  // scheduled "around now" (awards.fixture.ts:135-143 documents the same trap).
  const scheduledAt = new Date(
    Date.now() + (10 + Math.floor(Math.random() * 300)) * 24 * 60 * 60 * 1000,
  ).toISOString()
  const scheduleResp = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${match.id}/schedule`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        scheduled_at: scheduledAt,
        reason: 'E2E: pin the match away from other demo-link candidates',
      }),
    },
  )
  await jsonOrThrow(scheduleResp, 'Admin schedule match')

  // ready → scheduled → checking_in → in_progress; admin overrides still obey
  // the state machine (match_lifecycle.rs:324-338), so both hops are needed.
  await adminTransitionMatch(adminToken, tournamentId, match.id, 'checking_in')
  await adminTransitionMatch(adminToken, tournamentId, match.id, 'in_progress')

  const p1IsSlotOne = match.participant1_registration_id === a.registrationId
  return {
    tournamentId,
    matchId: match.id,
    scheduledAt,
    p1: p1IsSlotOne ? a : b,
    p2: p1IsSlotOne ? b : a,
  }
}

/**
 * Drive a fresh match all the way to a `pending_admin_review` result review and
 * return it. Throws (rather than returning null) if the review is not created —
 * a silent skip here would make every assertion below vacuous.
 */
async function createPendingAdminReview(
  adminToken: string,
): Promise<{ scenario: ReviewScenario; review: ReviewRecord }> {
  const scenario = await createStartedCs2Match(adminToken)

  // Catalog a demo whose stats say 13-7 and let the auto-linker bind it to the
  // match via the two players' Steam IDs.
  const game = await getCs2Game()
  const demoFile = `e2e-review-${uniqueId()}.dem`
  const demoId = await catalogDemo(adminToken, game.id, demoFile)
  const demo = await submitDemoStats(
    adminToken,
    demoId,
    awardsStatsBody(
      [
        { steamId: scenario.p1.steamId, playerName: 'Player1', kills: 20, headshotKills: 9, mag7Kills: 0 },
        { steamId: scenario.p2.steamId, playerName: 'Player2', kills: 11, headshotKills: 4, mag7Kills: 0 },
      ],
      scenario.scheduledAt,
      demoFile,
    ),
  )
  if (demo.tournament_id !== scenario.tournamentId) {
    throw new Error(
      `Demo ${demoId} did not auto-link into tournament ${scenario.tournamentId} ` +
        `(got ${demo.tournament_id}); the score-mismatch path needs a linked demo.`,
    )
  }
  const links = await getDemoLinks(adminToken, demoId)
  const link = links.find((l) => l.match_id === scenario.matchId)
  if (!link) {
    throw new Error(`Demo ${demoId} did not link to match ${scenario.matchId}`)
  }

  // Demo says 13-7; the claim says 16-14 → "Score mismatch" validation error.
  const claim = await submitClaimCitingDemo(
    scenario.p1.token,
    scenario.matchId,
    scenario.p1.registrationId,
    link.id,
    16,
    14,
  )
  await confirmClaim(scenario.p2.token, scenario.matchId, claim.id)

  const review = (await listPendingReviews(adminToken)).find(
    (r) => r.match_id === scenario.matchId,
  )
  if (!review) {
    throw new Error(
      `No result review was created for match ${scenario.matchId}; ` +
        'the score-mismatch seeding path is broken.',
    )
  }
  return { scenario, review }
}

/** Open the review's row in the admin table and return its detail dialog. */
async function openReviewDetail(page: Page, matchId: string) {
  const row = page.locator('.v-data-table tbody tr').filter({ hasText: matchId.slice(0, 8) })
  await expect(row).toBeVisible({ timeout: 20_000 })
  // Mismatch column: this review was raised by a score disagreement.
  await expect(row.getByText('Score', { exact: true })).toBeVisible()

  await row.getByRole('button', { name: 'View review' }).click()

  const dialog = page.getByRole('dialog').filter({ hasText: 'Result Review' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(matchId, { exact: true })).toBeVisible()
  return dialog
}

test.describe('Admin result reviews', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test('admin approves a flagged result from the review modal', async ({ page }) => {
    test.setTimeout(180_000)
    const { scenario, review } = await createPendingAdminReview(adminToken)
    expect(review.status, 'a score mismatch must route to admin review').toBe(
      'pending_admin_review',
    )
    expect(review.score_mismatch).toBe(true)
    expect(
      (await getReview(adminToken, review.id)).reviewed_at,
      'a fresh review is unresolved',
    ).toBeNull()

    await loginAsAdmin(page)
    await page.goto('/admin/result-reviews')
    await expect(page.getByRole('heading', { name: 'Result Reviews' })).toBeVisible()

    const dialog = await openReviewDetail(page, scenario.matchId)

    // The validation evidence the admin decides on. Only the demo-derived half
    // is asserted: the "Claimed Score" the backend puts on the review is the
    // SERIES score (1-0), not the map score the submitter typed, because the
    // auto-created demo link carries no `game_number` — see the report note on
    // false score-mismatch reviews. Asserting "1 - 0" here would certify that.
    await expect(dialog.getByText('Extracted Score')).toBeVisible()
    await expect(dialog.getByText('13 - 7')).toBeVisible()
    await expect(dialog.getByText(/Score mismatch: demo shows 13-7/)).toBeVisible()

    // ── P-35 regression: the Decision Form must render on a pending review ──
    const approveButton = dialog.getByRole('button', { name: 'Approve Result' })
    const rejectButton = dialog.getByRole('button', { name: 'Reject Result' })
    await expect(approveButton).toBeVisible()
    await expect(rejectButton).toBeVisible()

    const notes = `E2E approve ${Date.now()}`
    await dialog.getByLabel('Notes (optional)').fill(notes)

    const approvePromise = page.waitForResponse(
      (resp) =>
        /\/v1\/admin\/result-reviews\/[^/]+\/approve$/.test(resp.url()) &&
        resp.request().method() === 'POST',
    )
    await approveButton.click()
    const approveResponse = await approvePromise
    expect(approveResponse.ok(), 'POST …/approve must succeed').toBe(true)

    // UI: toast, dialog closed, row removed from the pending table.
    await expect(page.locator('.v-snackbar').getByText('Result approved')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(
      page.locator('.v-data-table tbody tr').filter({ hasText: scenario.matchId.slice(0, 8) }),
    ).toHaveCount(0)

    // Backend: the decision, the notes and the reviewer are all persisted.
    const resolved = await getReview(adminToken, review.id)
    expect(resolved.status).toBe('approved')
    expect(resolved.admin_notes).toBe(notes)
    expect(resolved.reviewed_by_user_id).not.toBeNull()
    expect(resolved.reviewed_at).not.toBeNull()
    expect(
      (await listPendingReviews(adminToken)).map((r) => r.id),
      'an approved review leaves the pending queue',
    ).not.toContain(review.id)
  })

  test('admin rejects a flagged result from the review modal', async ({ page }) => {
    test.setTimeout(180_000)
    const { scenario, review } = await createPendingAdminReview(adminToken)
    expect(review.status).toBe('pending_admin_review')

    await loginAsAdmin(page)
    await page.goto('/admin/result-reviews')

    const dialog = await openReviewDetail(page, scenario.matchId)

    const rejectButton = dialog.getByRole('button', { name: 'Reject Result' })
    await expect(rejectButton).toBeVisible()

    const notes = `E2E reject ${Date.now()}`
    await dialog.getByLabel('Notes (optional)').fill(notes)

    const rejectPromise = page.waitForResponse(
      (resp) =>
        /\/v1\/admin\/result-reviews\/[^/]+\/reject$/.test(resp.url()) &&
        resp.request().method() === 'POST',
    )
    await rejectButton.click()
    const rejectResponse = await rejectPromise
    expect(rejectResponse.ok(), 'POST …/reject must succeed').toBe(true)

    await expect(page.locator('.v-snackbar').getByText('Result rejected')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(
      page.locator('.v-data-table tbody tr').filter({ hasText: scenario.matchId.slice(0, 8) }),
    ).toHaveCount(0)

    const resolved = await getReview(adminToken, review.id)
    expect(resolved.status).toBe('rejected')
    expect(resolved.admin_notes).toBe(notes)
    expect(resolved.reviewed_at).not.toBeNull()
  })

  test('the review queue is admin-only', async () => {
    // coverage-plan-exempt: RBAC denial has no UI surface — the page is behind
    // the router's requiresAdmin guard, so the only way to prove the API itself
    // denies an ordinary signed-in user is to call it.
    const anon = await fetch(`${API_URL}/v1/admin/result-reviews`)
    expect(anon.status, 'anonymous callers must not read the review queue').toBe(401)

    const player = await createTestUser()
    const asPlayer = await fetch(`${API_URL}/v1/admin/result-reviews`, {
      headers: { Authorization: `Bearer ${player.token}` },
    })
    expect(asPlayer.status, 'a signed-in non-admin must be denied').toBe(403)
  })
})

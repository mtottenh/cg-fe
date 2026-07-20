import { test, expect, type Page, type Locator } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage, getMatch } from './fixtures/checkin.fixture'
import { type TournamentSummary } from './fixtures/tournament-lifecycle.fixture'
import {
  createResultScenario,
  createPublishedTeamTournament,
  submitResultClaim,
  getPendingClaim,
  confirmResultClaim,
  disputeResultClaim,
  type ResultScenario,
} from './fixtures/match-results-extra.fixture'

/**
 * Choose the map for a game when the panel asks for one.
 *
 * A match without a veto has no predetermined map, so the submitter picks it
 * from the tournament pool: `map_id` is validated server-side, and defaulting
 * it would record a plausible-but-wrong map. No-op when a veto already fixed
 * the maps.
 */
async function selectMapIfRequired(page: Page, panel: Locator, gameNumber = 1): Promise<void> {
  const mapSelect = panel.locator('.v-select').filter({ hasText: `Map for game ${gameNumber}` })
  if (!(await mapSelect.isVisible().catch(() => false))) return
  await mapSelect.click()
  await page.getByRole('option').first().click()
}

/**
 * Match Result Submission Tests
 *
 * Fully self-contained: every describe block builds its own tournament,
 * players, bracket and `in_progress` match through the ephemeral API
 * fixtures (`createResultScenario`), so no test depends on seeded state
 * and none needs a `test.skip()` fallback.
 *
 * Coverage:
 * - Tournament detail page + matches tab for a generated bracket
 * - Result submission panel (score inputs, series-winner computation,
 *   evidence attachment shell, submit gating)
 * - Result confirmation panel (opponent view of a pending claim)
 * - Result dispute modal (validation + cancel)
 * - Result history timeline
 * - Full E2E: P1 submits scores via the UI, P2 confirms via API, match
 *   completes and the UI shows the final result
 * - Dispute workflow: P1 submits, P2 disputes, match shows as disputed
 */

test.describe('Match Result Submission (Phase 1)', () => {
  let scenario: ResultScenario

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    scenario = await createResultScenario(adminToken)
  })

  test.describe('Match Detail Page', () => {
    test('should display tournament detail page with matches tab', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)
      await page.waitForLoadState('networkidle')

      // Tournament MUST exist - hard assertion
      await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible()

      // Should see tournament tabs
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Matches' })).toBeVisible()
    })

    test('should display generated matches in the matches tab', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible()

      // The fixture started the tournament, so the bracket exists and the
      // Matches tab MUST be enabled.
      const matchesTab = page.getByRole('tab', { name: 'Matches' })
      await expect(matchesTab).toBeVisible()
      await expect(matchesTab).toBeEnabled()

      await matchesTab.click()

      // The generated match card renders with its "#<n>" match-number chip.
      const matchCard = page.locator('.match-card').first()
      await expect(matchCard).toBeVisible({ timeout: 10000 })
      await expect(matchCard.getByText(/#\d+/).first()).toBeVisible()
    })
  })

  test.describe('Result Submission Panel', () => {
    test('participant sees score inputs, evidence shell and gated submit', async ({ page }) => {
      // P1 is a match participant; the match is `in_progress`, so the
      // submission panel must render.
      await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)

      await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
      await page.waitForLoadState('networkidle')

      const panel = page.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
      await expect(panel).toBeVisible({ timeout: 10000 })

      // Match format chip (fixture tournaments default to BO1).
      await expect(panel.getByText('Best of 1')).toBeVisible()

      // One ScoreInput per game: BO1 -> exactly two number fields.
      await expect(panel.locator('input[type="number"]')).toHaveCount(2)

      // Evidence attachment shell is embedded in the panel.
      await expect(panel.getByText('Attach Evidence')).toBeVisible()

      // Submit is gated until a valid winning scoreline is entered.
      await expect(panel.getByRole('button', { name: 'Submit Result' })).toBeDisabled()
    })

    test('entering a winning scoreline computes the series winner and enables submit', async ({ page }) => {
      await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)

      await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
      await page.waitForLoadState('networkidle')

      const panel = page.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
      await expect(panel).toBeVisible({ timeout: 10000 })

      const scoreInputs = panel.locator('input[type="number"]')
      await scoreInputs.first().fill('16')
      await scoreInputs.nth(1).fill('10')
      await selectMapIfRequired(page, panel)

      // Series winner alert appears with the 1-0 series score, and the
      // submit button unlocks. (Scores are typed but never submitted, so
      // this test does not mutate the shared scenario.)
      await expect(panel.getByText('Series Winner:')).toBeVisible()
      await expect(panel.getByText(/1\s*-\s*0/).first()).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Submit Result' })).toBeEnabled()
    })
  })

  test.describe('Match Navigation', () => {
    test('should navigate from the matches tab to the match detail page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)
      await page.waitForLoadState('networkidle')

      const matchesTab = page.getByRole('tab', { name: 'Matches' })
      await expect(matchesTab).toBeEnabled()
      await matchesTab.click()

      const matchCard = page.locator('.match-card').first()
      await expect(matchCard).toBeVisible({ timeout: 10000 })
      await matchCard.click()

      // Match cards route to the match detail page on click.
      await expect(page).toHaveURL(/\/matches\//)
      await expect(page.getByText(/Match #\d+/).first()).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Result State Display', () => {
    test('should display the live tournament status badge', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${scenario.tournamentSlug}`)
      await page.waitForLoadState('networkidle')

      // The fixture tournament is in_progress -> header badge shows "Live Now".
      const badge = page.locator('.status-badge')
      await expect(badge).toBeVisible()
      await expect(badge).toContainText('Live Now')
    })
  })

  test.describe('Admin Tournament Access', () => {
    test('should be able to access admin tournament page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Admin tournaments page MUST load
      await expect(page.getByRole('heading', { name: /Tournaments/i })).toBeVisible()
    })

    test('should list tournaments in the admin table', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

      // The fixture created at least one tournament, so the table cannot
      // be empty.
      await expect(page.locator('table tbody tr').first()).toBeVisible()
    })
  })
})

test.describe('Team Tournament Matches', () => {
  let teamTournament: TournamentSummary

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    teamTournament = await createPublishedTeamTournament(adminToken)
  })

  test('should display team tournament detail page', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto(`/tournaments/${teamTournament.slug}`)
    await page.waitForLoadState('networkidle')

    // Tournament MUST exist - it was created and published by the fixture.
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible()
    await expect(page.getByText(teamTournament.name).first()).toBeVisible()
    await expect(page.getByRole('tab').first()).toBeVisible()
  })
})

test.describe('Result Confirmation and Dispute UI', () => {
  let scenario: ResultScenario

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    scenario = await createResultScenario(adminToken)
    // P1 claims a 16-10 win. The claim stays pending so every test in this
    // block can exercise the opponent/submitter views against it.
    await submitResultClaim(
      scenario.p1.token,
      scenario.matchId,
      scenario.p1.registrationId,
      16,
      10,
    )
  })

  test('opponent sees the confirmation panel with claimed scores', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Opponent Submitted Result')).toBeVisible({ timeout: 10000 })
    // Per-map scoreline from the claim's game results.
    await expect(page.getByText(/16\s*-\s*10/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm Result' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dispute', exact: true })).toBeVisible()
  })

  test('result history timeline lists the pending claim', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Result History')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Result submitted').first()).toBeVisible()
  })

  test('dispute modal validates the reason and can be cancelled', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Dispute', exact: true }).click()

    const dialog = page.locator('.v-overlay--active', { hasText: 'Dispute Result' })
    await expect(dialog).toBeVisible()

    // Submit is gated on a reason of at least 10 characters.
    const submitDispute = dialog.getByRole('button', { name: 'Submit Dispute' })
    await expect(submitDispute).toBeDisabled()

    await dialog
      .getByRole('textbox', { name: 'Reason for dispute' })
      .fill('These scores are not what actually happened.')
    await expect(submitDispute).toBeEnabled()

    // Cancel closes the modal without disputing.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.v-overlay--active', { hasText: 'Dispute Result' })).toHaveCount(0)
  })

  test('submitter sees the awaiting-confirmation panel', async ({ page }) => {
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Awaiting Opponent Confirmation')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Submitted Result:')).toBeVisible()
  })
})

test.describe('Result Submission E2E', () => {
  test('P1 submits scores via the UI, P2 confirms via API, match completes', async ({ page }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)

    // --- P1 fills in the scoreline and submits through the panel. ---
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    const panel = page.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
    await expect(panel).toBeVisible({ timeout: 10000 })

    const scoreInputs = panel.locator('input[type="number"]')
    await scoreInputs.first().fill('16')
    await scoreInputs.nth(1).fill('10')
    await selectMapIfRequired(page, panel)

    const submitResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/result`) &&
        res.request().method() === 'POST',
      { timeout: 15000 },
    )
    await panel.getByRole('button', { name: 'Submit Result' }).click()
    const response = await submitResponse
    expect(response.ok()).toBe(true)

    // Submitter now sees the waiting panel.
    await expect(page.getByText('Awaiting Opponent Confirmation')).toBeVisible({ timeout: 10000 })

    // --- P2 confirms via API. ---
    const claim = await getPendingClaim(scenario.matchId)
    await confirmResultClaim(scenario.p2.token, scenario.matchId, claim.id)

    // Backend: match completed with P1 (participant 1, the 16) as winner.
    const completed = await getMatch(
      undefined,
      adminToken,
      scenario.tournamentId,
      scenario.matchId,
    )
    expect(completed.status).toBe('completed')
    expect(completed.winner_registration_id).toBe(scenario.p1.registrationId)

    // UI: match header shows the final series score.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Final').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/1\s*-\s*0/).first()).toBeVisible()
  })
})

test.describe('Result Dispute Workflow', () => {
  test('P1 submits a result, P2 disputes it, and the match shows as disputed', async ({ page }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)

    // P1 claims a 16-14 win; P2 disputes it via API.
    const claim = await submitResultClaim(
      scenario.p1.token,
      scenario.matchId,
      scenario.p1.registrationId,
      16,
      14,
    )
    await disputeResultClaim(
      scenario.p2.token,
      scenario.matchId,
      claim.id,
      'Incorrect scores - I won this match',
    )

    // Backend: the dispute flipped the match to `disputed`.
    const disputed = await getMatch(
      undefined,
      adminToken,
      scenario.tournamentId,
      scenario.matchId,
    )
    expect(disputed.status).toBe('disputed')

    // Admin sees the disputed state on the match detail page.
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Disputed').first()).toBeVisible({ timeout: 10000 })
  })
})

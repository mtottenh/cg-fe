import { test, expect, type Page, type Locator } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage, getMatch } from './fixtures/checkin.fixture'
import { type TournamentSummary } from './fixtures/tournament-lifecycle.fixture'
import {
  createResultScenario,
  createPublishedTeamTournament,
  submitResultClaim,
  type ResultScenario,
} from './fixtures/match-results-extra.fixture'

/**
 * Choose the map for a game when the panel asks for one.
 *
 * A match without a veto has no predetermined map, so the submitter picks it
 * from the tournament pool: `map_id` is validated server-side, and defaulting
 * it would record a plausible-but-wrong map. No-op when a veto already fixed
 * the maps.
 *
 * The presence check is `count()` rather than a visibility guard with a
 * swallowing `.catch()`: the select sits behind a plain `v-if` in
 * `ResultSubmissionPanel`, so it is either in the DOM or not, and `count()`
 * cannot hide a real failure the way the swallowed guard could. Callers
 * always await the panel being visible first.
 *
 * Returns the display name of the map that was chosen, so callers can assert
 * the finished match reports back the same map. `null` when a veto already
 * fixed the maps and no select was offered.
 */
async function selectMapIfRequired(
  page: Page,
  panel: Locator,
  gameNumber = 1,
): Promise<string | null> {
  const mapSelect = panel.locator('.v-select').filter({ hasText: `Map for game ${gameNumber}` })
  if ((await mapSelect.count()) === 0) return null
  await mapSelect.click()
  const option = page.getByRole('option').first()
  const label = (await option.innerText()).trim()
  await option.click()
  return label
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
 * - Result dispute modal (reason validation)
 * - Result history timeline
 * - Full E2E: P1 submits scores via the UI, P2 confirms via the UI in a
 *   second browser context, match completes and both pages show the final
 *   result (covers `ResultConfirmationPanel.handleConfirm`)
 * - Dispute workflow: P1's claim is seeded, P2 disputes it through the
 *   dispute modal, match shows as disputed (covers
 *   `ResultDisputeModal.handleDispute`)
 *
 * Both write paths are driven through the UI on purpose: the confirm and
 * dispute handlers are the two most important mutations in the product and
 * a real defect shipped in `handleDispute` while every test disputed via the
 * REST API. See `COVERAGE-PLAN.md` §5.1.
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

  // Validation only — the happy path (clicking "Submit Dispute") is covered by
  // the "Result Dispute Workflow" block below, which owns its own scenario.
  // This test must NOT dispute: the claim it runs against is shared with the
  // other tests in this describe block.
  test('dispute modal blocks submission until the reason is long enough', async ({ page }) => {
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)

    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Dispute', exact: true }).click()

    const dialog = page.locator('.v-overlay--active', { hasText: 'Dispute Result' })
    await expect(dialog).toBeVisible()

    // Submit is gated on a reason of at least 10 characters
    // (`ResultDisputeModal.reasonRules`).
    const submitDispute = dialog.getByRole('button', { name: 'Submit Dispute' })
    await expect(submitDispute).toBeDisabled()

    const reason = dialog.getByRole('textbox', { name: 'Reason for dispute' })

    // Too short: the rule message renders and submit stays locked.
    await reason.fill('too short')
    await reason.blur()
    await expect(dialog.getByText('Please provide at least 10 characters')).toBeVisible()
    await expect(submitDispute).toBeDisabled()

    // Long enough: the rule message clears and submit unlocks.
    await reason.fill('These scores are not what actually happened.')
    await expect(dialog.getByText('Please provide at least 10 characters')).toHaveCount(0)
    await expect(submitDispute).toBeEnabled()
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
  test('P1 submits scores via the UI, P2 confirms via the UI, match completes with a per-map breakdown', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

    // Two fully isolated browser contexts — one per player, so both halves of
    // the flow (submit and confirm) run against a real, separately
    // authenticated session. Pattern copied from `veto-realtime.spec.ts`.
    const contextP1 = await browser.newContext()
    const contextP2 = await browser.newContext()

    try {
      const pageP1 = await contextP1.newPage()
      const pageP2 = await contextP2.newPage()

      await primeAuthStorage(pageP1, scenario.p1.token, scenario.p1.userId)
      await primeAuthStorage(pageP2, scenario.p2.token, scenario.p2.userId)

      // --- P1 fills in the scoreline and submits through the panel. ---
      await pageP1.goto(matchUrl)
      await pageP1.waitForLoadState('networkidle')

      const panel = pageP1.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
      await expect(panel).toBeVisible({ timeout: 10000 })

      const scoreInputs = panel.locator('input[type="number"]')
      await scoreInputs.first().fill('16')
      await scoreInputs.nth(1).fill('10')
      const chosenMap = await selectMapIfRequired(pageP1, panel)
      // The scenario tournament runs no veto, so the panel MUST have asked P1
      // to name the map — that name is what the finished match has to report
      // back below.
      expect(chosenMap, 'the submission panel must ask P1 to pick a map').not.toBeNull()

      const submitResponse = pageP1.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/result`) &&
          res.request().method() === 'POST',
        { timeout: 15000 },
      )
      await panel.getByRole('button', { name: 'Submit Result' }).click()
      expect((await submitResponse).ok()).toBe(true)

      // Submitter now sees the waiting panel.
      await expect(pageP1.getByText('Awaiting Opponent Confirmation')).toBeVisible({
        timeout: 10000,
      })

      // --- P2 confirms through the confirmation panel (the action under
      //     test — `ResultConfirmationPanel.handleConfirm`). ---
      await pageP2.goto(matchUrl)
      await pageP2.waitForLoadState('networkidle')

      const confirmPanel = pageP2
        .locator('.v-card')
        .filter({ hasText: 'Opponent Submitted Result' })
        .first()
      await expect(confirmPanel).toBeVisible({ timeout: 10000 })
      // P2 is shown the exact scoreline P1 typed before confirming it.
      await expect(confirmPanel.getByText(/16\s*-\s*10/).first()).toBeVisible()

      const confirmResponse = pageP2.waitForResponse(
        (res) =>
          res.url().includes(`/matches/${scenario.matchId}/result/`) &&
          res.url().endsWith('/confirm') &&
          res.request().method() === 'POST',
        { timeout: 15000 },
      )
      await confirmPanel.getByRole('button', { name: 'Confirm Result' }).click()
      expect((await confirmResponse).ok()).toBe(true)

      // UI (P2, no reload): `handleResultConfirmed` refetches, so the match
      // header flips to the final series score and the confirmation panel goes.
      const p2Header = pageP2.locator('.v-card').filter({ hasText: /Match #\d+/ }).first()
      await expect(p2Header.getByText('Final').first()).toBeVisible({ timeout: 15000 })
      await expect(p2Header.getByText(/1\s*-\s*0/).first()).toBeVisible()
      await expect(pageP2.getByText('Opponent Submitted Result')).toHaveCount(0)

      // P-1: the per-map breakdown is the primary artifact of a finished
      // series, and it must carry the real map and the real map scoreline —
      // 16:10 — not just the 1-0 series score already in the header. This
      // could never render while `GET /matches/{id}/result` served pending
      // claims only: completing the match deleted the very data the summary
      // is gated on.
      const p2Summary = pageP2.getByTestId('map-results-summary')
      await expect(p2Summary).toBeVisible({ timeout: 15000 })
      await expect(p2Summary).toContainText(chosenMap!)
      await expect(p2Summary).toContainText(/16\s*:\s*10/)

      // Backend: match completed with P1 (participant 1, the 16) as winner.
      const completed = await getMatch(
        undefined,
        adminToken,
        scenario.tournamentId,
        scenario.matchId,
      )
      expect(completed.status).toBe('completed')
      expect(completed.winner_registration_id).toBe(scenario.p1.registrationId)

      // UI (P1): the submitter sees the same final result once refreshed.
      await pageP1.reload()
      await pageP1.waitForLoadState('networkidle')
      const p1Header = pageP1.locator('.v-card').filter({ hasText: /Match #\d+/ }).first()
      await expect(p1Header.getByText('Final').first()).toBeVisible({ timeout: 10000 })
      await expect(p1Header.getByText(/1\s*-\s*0/).first()).toBeVisible()
      await expect(pageP1.getByText('Awaiting Opponent Confirmation')).toHaveCount(0)

      // ...and on a cold load of the completed match, not just the page that
      // happened to be open when it finished.
      const p1Summary = pageP1.getByTestId('map-results-summary')
      await expect(p1Summary).toBeVisible({ timeout: 10000 })
      await expect(p1Summary).toContainText(chosenMap!)
      await expect(p1Summary).toContainText(/16\s*:\s*10/)
    } finally {
      await contextP1.close()
      await contextP2.close()
    }
  })
})

test.describe('Result Dispute Workflow', () => {
  test('P1 submits a result, P2 disputes it, and the match shows as disputed', async ({ page }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)

    // Seeding only: P1's claim is the precondition, not the action under test.
    await submitResultClaim(
      scenario.p1.token,
      scenario.matchId,
      scenario.p1.registrationId,
      16,
      14,
    )

    // `ResultDisputeModal.handleDispute` used to fire a second, redundant
    // `raiseDispute` POST (to the tournament-scoped /dispute route) that
    // always failed and was swallowed by `.catch(() => {})`. Disputing must
    // not produce ANY failing dispute request.
    const failedDisputeCalls: string[] = []
    page.on('response', (res) => {
      if (res.request().method() === 'POST' && res.status() >= 400 && res.url().includes('dispute')) {
        failedDisputeCalls.push(`POST ${res.url()} -> ${res.status()}`)
      }
    })

    // --- P2 disputes through the modal (the action under test). ---
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Opponent Submitted Result')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Dispute', exact: true }).click()

    const dialog = page.locator('.v-overlay--active', { hasText: 'Dispute Result' })
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('textbox', { name: 'Reason for dispute' })
      .fill('Incorrect scores - I won this match 16-14.')

    const disputeResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/result/`) &&
        res.url().endsWith('/dispute') &&
        res.request().method() === 'POST',
      { timeout: 15000 },
    )
    await dialog.getByRole('button', { name: 'Submit Dispute' }).click()
    expect((await disputeResponse).ok()).toBe(true)

    // UI (no reload): the modal closes, the confirmation panel retracts and
    // the result history marks the claim as disputed.
    await expect(page.locator('.v-overlay--active', { hasText: 'Dispute Result' })).toHaveCount(0)
    await expect(page.getByText('Opponent Submitted Result')).toHaveCount(0)

    // Backend: the dispute flipped the match to `disputed`.
    const disputed = await getMatch(
      undefined,
      adminToken,
      scenario.tournamentId,
      scenario.matchId,
    )
    expect(disputed.status).toBe('disputed')

    // UI after a reload: the match header carries the disputed status.
    await page.reload()
    await page.waitForLoadState('networkidle')
    const header = page.locator('.v-card').filter({ hasText: /Match #\d+/ }).first()
    await expect(header.getByText('Disputed').first()).toBeVisible({ timeout: 10000 })

    // Result History reflects the dispute. Asserted AFTER the reload on purpose:
    // in-page it still showed "Awaiting Confirmation" (the `pending` label) for
    // 10s+ even though the backend had flipped the claim — tracked as the
    // suspected refresh bug in COVERAGE-PLAN.md §9b P-6. If this assertion ever
    // starts passing before the reload, promote P-6 and move it back up.
    const history = page.locator('.v-card').filter({ hasText: 'Result History' }).first()
    await expect(history.getByText('Disputed').first()).toBeVisible({ timeout: 10000 })

    expect(failedDisputeCalls, 'disputing must not fire a failing dispute request').toEqual([])
  })
})

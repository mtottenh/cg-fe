import { test, expect, type Page, type Locator } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage, getMatch } from './fixtures/checkin.fixture'
import { createResultScenario } from './fixtures/match-results-extra.fixture'

/**
 * P-127 — submitting a result must update the match detail page IN-PAGE.
 *
 * This is the same defect P-6 fixed on the dispute path, on the flow the
 * product uses most. `ResultSubmissionPanel` renders behind `canSubmitResult`
 * (`useMatchDetail.ts`), which is `!currentResult || currentResult.status !==
 * 'pending'`. `handleSubmit` awaits `store.submitResult(...)`, which writes the
 * new **pending** claim into the store — falsifying that gate and unmounting
 * the panel through `MatchDetailPage`'s `v-else-if` — and only then calls
 * `emit('submitted')`. Vue's `emit()` opens with `if (instance.isUnmounted)
 * return`, so the event is discarded rather than delivered late, and
 * `handleResultSubmitted` never ran at all.
 *
 * What the submitter saw: the panel swapped for "Awaiting Opponent
 * Confirmation" (that part is driven by the store write, so it always worked)
 * on top of a page still rendering the pre-submit match — status "Live" instead
 * of "Awaiting Result", no claim in the Result History — and no confirmation
 * that anything had been recorded. It corrected itself 15 seconds later, on a
 * poll tick.
 *
 * **The 15s poll is deliberately disabled here.** `useMatchDetail`'s loop
 * returns early while `document.visibilityState === 'hidden'`, so an init
 * script pinning it to 'hidden' removes the rescue path entirely. Without it
 * this test would be timing-dependent — a run where the click landed ~13s after
 * load would pass on the poll rather than on the fix, which is precisely the
 * "green for the wrong reason" the finding is about. Same technique as
 * `match-dispute-refresh.spec.ts`.
 */

/**
 * Choose the map for a game when the panel asks for one.
 *
 * Duplicated from `match-results.spec.ts` (where it is spec-private) rather
 * than lifted into a shared fixture: that file is not this lane's to edit, and
 * a shared helper moved mid-wave is how two agents lose each other's work.
 *
 * `count()` rather than a swallowing `isVisible().catch()`: the select sits
 * behind a plain `v-if`, so it is either in the DOM or not.
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

test.describe('Match detail refresh after a result submission (P-127)', () => {
  test('submitting a result updates the header, the history and the submitter with no reload', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createResultScenario(adminToken)

    // Pin the tab "hidden" so the 15s poll can never fire — see the describe
    // comment. Must be installed before any navigation.
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
    })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    const header = page.locator('.v-card').filter({ hasText: /Match #\d+/ }).first()
    const panel = page.locator('.v-card').filter({ hasText: 'Submit Match Result' }).first()
    await expect(panel).toBeVisible({ timeout: 15000 })

    // Pre-state, so the assertions below are transitions rather than
    // coincidences: the match is live and no claim exists yet, so the Result
    // History card is not on the page at all.
    await expect(header.getByText('Live').first()).toBeVisible()
    await expect(page.getByText('Result History')).toHaveCount(0)

    // --- P1 submits through the panel (the action under test). ---
    const scoreInputs = panel.locator('input[type="number"]')
    await scoreInputs.first().fill('16')
    await scoreInputs.nth(1).fill('10')
    const chosenMap = await selectMapIfRequired(page, panel)
    expect(chosenMap, 'the submission panel must ask P1 to pick a map').not.toBeNull()

    // Await the mutation: `networkidle` resolves before the click's request is
    // even dispatched (COVERAGE-PLAN §2).
    const submitResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/matches/${scenario.matchId}/result`) &&
        res.request().method() === 'POST',
      { timeout: 15000 },
    )
    await panel.getByRole('button', { name: 'Submit Result' }).click()
    expect((await submitResponse).ok()).toBe(true)

    // ---------------------------------------------------------------------
    // IN-PAGE, NO RELOAD. Every timeout below is well inside the 15s poll
    // interval even if the poll were running — and the poll is off.
    // ---------------------------------------------------------------------

    // 1. The submitter is told the claim was recorded. This assertion is the
    //    purest form of the finding: the snackbar was `handleResultSubmitted`'s
    //    first line and it never fired, so the most-used action in the product
    //    acknowledged nothing. (Success toasts auto-dismiss after 3s, so it is
    //    asserted first.)
    await expect(
      page.getByText('Result submitted! Waiting for opponent confirmation.'),
    ).toBeVisible({ timeout: 5000 })

    // 2. The match header carries the new status. The backend moved the match
    //    to `awaiting_result` on submission; the page kept rendering `Live`.
    await expect(header.getByText('Awaiting Result').first()).toBeVisible({ timeout: 5000 })
    await expect(header.getByText('Live')).toHaveCount(0)

    // 3. The claim is in the Result History — the card did not exist before the
    //    submission, so this cannot pass on stale render.
    const history = page.locator('.v-card').filter({ hasText: 'Result History' }).first()
    await expect(history).toBeVisible({ timeout: 5000 })
    await expect(history.getByText('Pending').first()).toBeVisible()

    // 4. The submitter's own panel is now the waiting state (this half always
    //    worked — it is driven by the store write, not by the event — and is
    //    kept so a regression that broke it would not hide behind the fix).
    await expect(page.getByText('Awaiting Opponent Confirmation', { exact: true })).toBeVisible({ timeout: 5000 })

    // Backend cross-check (ground rule 4): the page is not merely showing what
    // it was told, the match really moved.
    const submitted = await getMatch(
      undefined,
      adminToken,
      scenario.tournamentId,
      scenario.matchId,
    )
    expect(submitted.status).toBe('awaiting_result')
  })
})

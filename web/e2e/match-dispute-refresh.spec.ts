import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage, getMatch } from './fixtures/checkin.fixture'
import {
  createResultScenario,
  submitResultClaim,
} from './fixtures/match-results-extra.fixture'

/**
 * P-6 — the match detail page must reflect a dispute IN-PAGE.
 *
 * `match-results.spec.ts`'s dispute test asserts the disputed state only
 * AFTER a `page.reload()`, with a comment saying the in-page assertion had
 * been seen failing for 10s+ ("promote P-6 if it ever starts passing before
 * the reload"). This spec is that assertion, promoted: everything below runs
 * without a reload.
 *
 * Why it failed: `MatchDetailPage.handleResultDisputed` called
 * `fetchResultData()`, which refetches the CLAIM and the claim history and
 * nothing else. Disputing also flips the MATCH (`status` → `disputed`,
 * `disputed` → true) and creates the tournament dispute row, and neither is
 * re-read — so the header chip, and the `match.disputed &&
 * activeDisputeId`-gated dispute thread, kept rendering pre-dispute state
 * until the 15s poll tick happened to rescue them.
 *
 * **The 15s poll is deliberately disabled here.** `useMatchDetail`'s poll
 * loop returns early while `document.visibilityState === 'hidden'`
 * (`useMatchDetail.ts:407`), so an init script that pins it to 'hidden'
 * removes the rescue path entirely. Without that, this test would be
 * timing-dependent: a run where the click landed ~13s after page load would
 * pass on the poll rather than on the fix, and the gate would be laundering
 * an unverified claim. With it, only the dispute handler itself can turn
 * these assertions green.
 */
test.describe('Match detail refresh after a dispute (P-6)', () => {
  test('disputing updates the header, the result history and the dispute thread with no reload', async ({
    page,
  }) => {
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

    // Pin the tab "hidden" so useMatchDetail's 15s poll can never fire — see
    // the describe comment. Must be installed before any navigation.
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
    })

    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)

    const header = page.locator('.v-card').filter({ hasText: /Match #\d+/ }).first()
    await expect(header.getByText('Awaiting Result').first()).toBeVisible({ timeout: 15000 })

    // --- P2 disputes through the modal (the action under test). ---
    await expect(page.getByText('Opponent Submitted Result')).toBeVisible({ timeout: 15000 })
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

    // ---------------------------------------------------------------------
    // IN-PAGE, NO RELOAD. Every timeout below is 5s — comfortably inside the
    // 15s poll interval even if the poll were running, and the poll is off.
    // ---------------------------------------------------------------------

    // 1. The match header carries the new status.
    await expect(header.getByText('Disputed').first()).toBeVisible({ timeout: 5000 })
    await expect(header.getByText('Awaiting Result')).toHaveCount(0)

    // 2. The result history marks the claim disputed.
    const history = page.locator('.v-card').filter({ hasText: 'Result History' }).first()
    await expect(history.getByText('Disputed').first()).toBeVisible({ timeout: 5000 })

    // 3. The dispute thread the dispute just created is on screen, with the
    //    participant reply box (`match.disputed && activeDisputeId`).
    await expect(page.getByRole('textbox', { name: 'Add a message' })).toBeVisible({
      timeout: 5000,
    })

    // Backend cross-check (ground rule 4).
    const disputed = await getMatch(
      undefined,
      adminToken,
      scenario.tournamentId,
      scenario.matchId,
    )
    expect(disputed.status).toBe('disputed')
  })
})

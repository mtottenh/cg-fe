import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { getSeededState } from './fixtures/seeded-state'
import {
  adminAddDisputeMessage,
  getDisputeThread,
  getMatch,
  raiseDispute,
  seedDisputableMatch,
  type DisputableMatchContext,
} from './fixtures/dispute.fixture'
import {
  checkInViaApi,
  createCheckInScenario,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

/**
 * Admin Dispute Resolution (backlog 1.2)
 *
 * Covers the admin surface that sits on top of the player-side dispute flow
 * exercised in `match-results.spec.ts`. API-seeds the dispute via real JWTs,
 * then drives `AdminDisputesPage` + `DisputeDetailModal` from the UI.
 *
 * Scenarios:
 *   1. Admin resolves in favour of P1 (overturn, P1 declared winner).
 *   2. Admin resolves in favour of P2 (overturn flips winner + scores).
 *   3. Admin internal note is hidden from the captain thread.
 *
 * Scenario 1 consumes the seeded match (matchIds[0]); scenarios 2 and 3 are
 * fully self-contained — each builds a fresh tournament + match via
 * `createCheckInScenario` so they never race on shared DB rows.
 */

// Serial: scenario 1 mutates the shared seeded match and leaves it in a
// terminal state; keep the file serial so it can't race with reruns.
test.describe.configure({ mode: 'serial' })

interface State {
  adminToken: string
  player2Token: string
  tournamentId: string
  matchIds: string[]
}

/**
 * Load the seeded fixture state. Returns `null` if `global-setup.ts` did
 * not produce the tokens / tournament / matches we need — individual tests
 * use this to `test.skip()` cleanly on an unseeded environment.
 */
function loadState(): State | null {
  let seeded: ReturnType<typeof getSeededState>
  try {
    seeded = getSeededState()
  } catch {
    return null
  }
  if (
    !seeded.adminToken ||
    !seeded.player2Token ||
    !seeded.tournamentId ||
    seeded.matchIds.length === 0
  ) {
    return null
  }
  return {
    adminToken: seeded.adminToken,
    player2Token: seeded.player2Token,
    tournamentId: seeded.tournamentId,
    matchIds: seeded.matchIds,
  }
}

/**
 * Self-contained disputable match: fresh tournament + two players, both
 * check in at the match level (with no veto session the second check-in
 * auto-advances the match to `in_progress`), then P1 submits a winning
 * result claim and P2 disputes it — leaving the match `disputed` and
 * ready for a formal dispute to be raised.
 */
async function buildDisputedMatch(
  request: APIRequestContext,
  adminToken: string,
  scores: { p1: number; p2: number },
): Promise<{ scenario: CheckInScenario; ctx: DisputableMatchContext }> {
  const scenario = await createCheckInScenario(request, adminToken, {
    checkInRequired: true,
  })

  await checkInViaApi(
    request,
    scenario.p1.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p1.registrationId,
  )
  await checkInViaApi(
    request,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p2.registrationId,
  )

  const match = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
  expect(
    match?.status,
    'both check-ins should auto-advance the match to in_progress',
  ).toBe('in_progress')

  // P1 claims the win with the given scores; P2 disputes the claim.
  const ctx = await seedDisputableMatch(
    scenario.p1.token,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scores,
  )
  expect(ctx, 'result claim + claim dispute should succeed').not.toBeNull()

  return { scenario, ctx: ctx! }
}

test.describe('Admin Dispute Resolution', () => {
  test('resolves dispute in favour of P1 — overturn declares P1 the winner', async ({
    page,
  }) => {
    const state = loadState()
    if (!state) {
      test.skip()
      return
    }

    const matchId = state.matchIds[0]
    const reason = `E2E dispute for P1 win ${Date.now()}`

    // --- API setup: submit P1-wins claim, P2 disputes it ------------------
    const ctx = await seedDisputableMatch(
      state.adminToken,
      state.player2Token,
      state.tournamentId,
      matchId,
      // Match-level scores are SERIES scores; the seeded tournament is bo1,
      // so the claim must sum to exactly 1 (DTO range 0..=10).
      { p1: 1, p2: 0 }
    )
    if (!ctx) {
      test.skip()
      return
    }

    const dispute = await raiseDispute(
      state.player2Token,
      state.tournamentId,
      matchId,
      ctx.p2RegistrationId,
      'wrong_score',
      reason,
      ctx.claimId
    )
    if (!dispute) {
      test.skip()
      return
    }

    // --- UI: admin sees dispute in list ----------------------------------
    await loginAsAdmin(page)
    await page.goto('/admin/disputes')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible()

    // Filter by match ID to isolate the row we care about. The column only
    // shows the first 8 chars (`match_id.slice(0, 8)...`), so check for
    // that truncated form.
    await page.getByRole('textbox', { name: 'Match ID' }).fill(matchId)
    await page.getByRole('textbox', { name: 'Match ID' }).press('Enter')
    await page.waitForLoadState('networkidle')

    const truncatedMatch = `${matchId.slice(0, 8)}...`
    const row = page.getByRole('row').filter({ hasText: truncatedMatch }).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    // Reason is truncated with style="max-width: 250px" but the full text
    // is still in the DOM.
    await expect(row).toContainText(reason)

    // --- UI: open detail modal, post admin reply, resolve in favour of P1 -
    await row.click()
    const modal = page.locator('.v-dialog').filter({ hasText: 'Dispute Details' })
    await expect(modal).toBeVisible()

    // Admin posts a non-internal reply via the modal UI. We only assert the
    // send succeeded via the snackbar / thread update — deeper UI checks
    // belong to the component test.
    const publicReply = `Reviewing match ${matchId.slice(0, 8)} ${Date.now()}`
    await modal.getByPlaceholder('Type a message...').fill(publicReply)
    await modal.getByRole('button', { name: 'Send' }).click()

    // Backend write lands — the message appears in the thread.
    await expect(modal.getByText(publicReply, { exact: false })).toBeVisible({
      timeout: 10000,
    })

    // Open the Overturn expansion panel. Scope to the panel itself so we
    // don't collide with the Resolve button (same text) or the Uphold
    // panel which also has a title.
    const overturnPanel = modal
      .locator('.v-expansion-panel')
      .filter({ hasText: 'Overturn Result' })
    await overturnPanel
      .locator('.v-expansion-panel-title')
      .first()
      .click()

    // Fill overturn form — inputs live inside the now-open panel.
    await overturnPanel.getByLabel(/P1 Score/).fill('1')
    await overturnPanel.getByLabel(/P2 Score/).fill('0')
    await overturnPanel.getByLabel(/Winner Reg ID/).fill(ctx.p1RegistrationId)
    await overturnPanel
      .getByLabel('Notes *')
      .fill('Admin reviewed evidence and confirmed the original claim.')

    // The panel title is itself a <button> named "Overturn Result", so
    // role alone matches both it and the submit button — the submit
    // v-btn is the last of the two.
    await overturnPanel
      .getByRole('button', { name: 'Overturn Result' })
      .last()
      .click()

    // After resolve, the modal's Resolution card renders with type "Overturned".
    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Overturned')).toBeVisible()

    // Close the modal via the X icon in the title bar. The close button is
    // the only icon button inside `v-card-title`.
    await modal
      .locator('.v-card-title')
      .getByRole('button')
      .first()
      .click()
    await expect(modal).toBeHidden({ timeout: 10000 })

    // --- Verification: resolved disputes leave the default (actionable)
    // queue, and are reachable via the Resolved status filter -------------
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('row').filter({ hasText: truncatedMatch })
    ).toHaveCount(0, { timeout: 10000 })

    await page.getByLabel('Status').click()
    await page.getByRole('option', { name: 'Resolved' }).click()
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('row').filter({ hasText: truncatedMatch }).first()
    ).toBeVisible({ timeout: 10000 })

    const updatedMatch = await getMatch(
      state.adminToken,
      state.tournamentId,
      matchId
    )
    expect(updatedMatch).not.toBeNull()
    expect(updatedMatch!.winner_registration_id).toBe(ctx.p1RegistrationId)
  })

  test('resolves dispute in favour of P2 — flips winner and score', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute for P2 win ${Date.now()}`

    // --- API setup: self-contained match, P1 claims 1-0, P2 disputes -----
    // Match-level scores are series scores (maps won), and the backend
    // requires p1+p2 to sum to a valid BO1 series — so the only valid
    // P1-wins claim on our generated BO1 match is 1-0.
    const { scenario, ctx } = await buildDisputedMatch(request, adminToken, {
      p1: 1,
      p2: 0, // original claim says P1 won the BO1
    })
    const matchId = scenario.matchId

    const dispute = await raiseDispute(
      scenario.p2.token,
      scenario.tournamentId,
      matchId,
      ctx.p2RegistrationId,
      'wrong_winner',
      reason,
      ctx.claimId
    )
    expect(dispute, 'raising the formal dispute should succeed').not.toBeNull()

    // --- UI: admin resolves in favour of P2 via the overturn form --------
    // Note: /v1/admin/disputes only ever returns pending disputes
    // (PgDisputeRepository::find_pending), so the dispute must still be
    // open when the admin looks at the queue — we resolve through the UI
    // rather than pre-resolving over the API.
    await loginAsAdmin(page)
    await page.goto('/admin/disputes')
    await page.waitForLoadState('networkidle')

    await page.getByRole('textbox', { name: 'Match ID' }).fill(matchId)
    await page.getByRole('textbox', { name: 'Match ID' }).press('Enter')
    await page.waitForLoadState('networkidle')

    const truncatedMatch = `${matchId.slice(0, 8)}...`
    const row = page.getByRole('row').filter({ hasText: truncatedMatch }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    await row.click()
    const modal = page.locator('.v-dialog').filter({ hasText: 'Dispute Details' })
    await expect(modal).toBeVisible()

    const overturnPanel = modal
      .locator('.v-expansion-panel')
      .filter({ hasText: 'Overturn Result' })
    await overturnPanel
      .locator('.v-expansion-panel-title')
      .first()
      .click()

    // Flip the BO1 to P2: 0-1 with P2 as the new winner.
    await overturnPanel.getByLabel(/P1 Score/).fill('0')
    await overturnPanel.getByLabel(/P2 Score/).fill('1')
    await overturnPanel.getByLabel(/Winner Reg ID/).fill(ctx.p2RegistrationId)
    await overturnPanel
      .getByLabel('Notes *')
      .fill('Evidence supports P2 as the correct winner.')
    // The panel title is itself a <button> named "Overturn Result"; the
    // submit v-btn is the last of the two.
    await overturnPanel
      .getByRole('button', { name: 'Overturn Result' })
      .last()
      .click()

    // Resolution card renders with type "Overturned".
    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Overturned')).toBeVisible()

    // Close the modal — resolving reloads the pending queue, and the
    // now-resolved dispute must drop out of it.
    await modal
      .locator('.v-card-title')
      .getByRole('button')
      .first()
      .click()
    await expect(modal).toBeHidden({ timeout: 10000 })
    await expect(
      page.getByRole('row').filter({ hasText: truncatedMatch })
    ).toHaveCount(0, { timeout: 10000 })

    // --- Verification: winner + scores flipped ---------------------------
    const updatedMatch = await getMatch(
      adminToken,
      scenario.tournamentId,
      matchId
    )
    expect(updatedMatch).not.toBeNull()
    expect(updatedMatch!.winner_registration_id).toBe(ctx.p2RegistrationId)
    expect(updatedMatch!.participant1_score).toBe(0)
    expect(updatedMatch!.participant2_score).toBe(1)
  })

  test('internal admin notes are hidden from the captain thread', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute for internal-note visibility ${Date.now()}`
    const internalText = `ADMIN-ONLY NOTE ${Date.now()}`
    const publicText = `Admin public note ${Date.now()}`

    // --- API setup: self-contained match, P1 claims 1-0, P2 disputes -----
    const { scenario, ctx } = await buildDisputedMatch(request, adminToken, {
      p1: 1,
      p2: 0,
    })
    const matchId = scenario.matchId

    const dispute = await raiseDispute(
      scenario.p2.token,
      scenario.tournamentId,
      matchId,
      ctx.p2RegistrationId,
      'wrong_score',
      reason,
      ctx.claimId
    )
    expect(dispute, 'raising the formal dispute should succeed').not.toBeNull()

    // Admin posts one internal and one public message via API.
    const internalMsg = await adminAddDisputeMessage(
      adminToken,
      dispute!.id,
      internalText,
      true
    )
    const publicMsg = await adminAddDisputeMessage(
      adminToken,
      dispute!.id,
      publicText,
      false
    )
    expect(internalMsg).not.toBeNull()
    expect(publicMsg).not.toBeNull()

    // --- Cross-check via API: admin sees both, captain sees only public --
    const adminView = await getDisputeThread(adminToken, dispute!.id)
    expect(adminView).not.toBeNull()
    const adminMessages = adminView!.messages.map((m) => m.message)
    expect(adminMessages).toEqual(expect.arrayContaining([internalText, publicText]))

    const captainView = await getDisputeThread(scenario.p2.token, dispute!.id)
    expect(captainView).not.toBeNull()
    const captainMessages = captainView!.messages.map((m) => m.message)
    expect(captainMessages).toContain(publicText)
    expect(captainMessages).not.toContain(internalText)
    const captainIsInternalFlags = captainView!.messages.map((m) => m.is_internal)
    expect(captainIsInternalFlags.some((flag) => flag === true)).toBe(false)

    // --- UI: captain (P2) views the match dispute thread -----------------
    // DisputeThreadPanel is rendered on the match detail page for
    // completed/disputed matches. The panel iterates the store's current
    // thread directly, so hiding internal messages relies on the server
    // response — already verified above. The UI check is a belt-and-braces
    // assertion that the internal text does NOT appear on the captain's
    // page, and the public text DOES.
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(
      `/tournaments/${scenario.tournamentSlug}/matches/${matchId}`
    )
    await page.waitForLoadState('networkidle')

    // The public message MUST render in the thread.
    await expect(page.getByText(publicText)).toBeVisible({ timeout: 10000 })

    // The internal message MUST NOT render anywhere in the DOM — not its
    // text, not a node whose id matches the message's primary key.
    await expect(page.getByText(internalText)).toHaveCount(0)
    if (internalMsg) {
      await expect(page.locator(`[data-id="${internalMsg.id}"]`)).toHaveCount(0)
    }
  })
})

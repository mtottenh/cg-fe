import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsPlayer2 } from './fixtures/auth.fixture'
import { getSeededState } from './fixtures/seeded-state'
import { testTournaments } from './fixtures/test-data'
import {
  adminAddDisputeMessage,
  adminResolveOverturn,
  getDisputeThread,
  getMatch,
  raiseDispute,
  seedDisputableMatch,
} from './fixtures/dispute.fixture'

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
 */

// Serial: scenarios each consume a distinct seeded match (matchIds[0..2])
// and leave it in a terminal state, so running them in parallel across
// the same tournament would race on the same DB rows.
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
      { p1: 16, p2: 10 }
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
    await page.getByLabel('Match ID').fill(matchId)
    await page.getByLabel('Match ID').press('Enter')
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
    await overturnPanel.getByLabel(/P1 Score/).fill('16')
    await overturnPanel.getByLabel(/P2 Score/).fill('10')
    await overturnPanel.getByLabel(/Winner Reg ID/).fill(ctx.p1RegistrationId)
    await overturnPanel
      .getByLabel('Notes *')
      .fill('Admin reviewed evidence and confirmed the original claim.')

    // The submit button also reads "Overturn Result" — scope by role to
    // the button (not the title).
    await overturnPanel
      .getByRole('button', { name: 'Overturn Result' })
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

    // --- Verification: row chip shows Resolved + match now has P1 winner --
    await page.waitForLoadState('networkidle')
    const resolvedRow = page
      .getByRole('row')
      .filter({ hasText: truncatedMatch })
      .first()
    await expect(resolvedRow).toContainText('Resolved', { timeout: 10000 })

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
  }) => {
    const state = loadState()
    if (!state) {
      test.skip()
      return
    }
    if (state.matchIds.length < 2) {
      test.skip(true, 'Need a second seeded match for this scenario')
      return
    }

    const matchId = state.matchIds[1]
    const reason = `E2E dispute for P2 win ${Date.now()}`

    // --- API setup -------------------------------------------------------
    const ctx = await seedDisputableMatch(
      state.adminToken,
      state.player2Token,
      state.tournamentId,
      matchId,
      { p1: 16, p2: 12 } // original claim says P1 won 16-12
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
      'wrong_winner',
      reason,
      ctx.claimId
    )
    if (!dispute) {
      test.skip()
      return
    }

    // Resolve directly via API — the UI flow is already covered in the
    // first scenario; here we focus on asserting the *effect* of resolving
    // in favour of P2 (flipped winner + flipped scores).
    const resolved = await adminResolveOverturn(
      state.adminToken,
      dispute.id,
      ctx.p2RegistrationId,
      10, // new P1 score
      16, // new P2 score — P2 now the winner
      'Evidence supports P2 as the correct winner.'
    )
    expect(resolved).toBe(true)

    // --- UI: admin sees the resolved dispute -----------------------------
    await loginAsAdmin(page)
    await page.goto('/admin/disputes')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Match ID').fill(matchId)
    await page.getByLabel('Match ID').press('Enter')
    await page.waitForLoadState('networkidle')

    const truncatedMatch = `${matchId.slice(0, 8)}...`
    const row = page.getByRole('row').filter({ hasText: truncatedMatch }).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('Resolved')

    // --- Verification: winner + scores flipped ---------------------------
    const updatedMatch = await getMatch(
      state.adminToken,
      state.tournamentId,
      matchId
    )
    expect(updatedMatch).not.toBeNull()
    expect(updatedMatch!.winner_registration_id).toBe(ctx.p2RegistrationId)
    expect(updatedMatch!.participant1_score).toBe(10)
    expect(updatedMatch!.participant2_score).toBe(16)
  })

  test('internal admin notes are hidden from the captain thread', async ({
    page,
  }) => {
    const state = loadState()
    if (!state) {
      test.skip()
      return
    }
    if (state.matchIds.length < 3) {
      test.skip(true, 'Need a third seeded match for this scenario')
      return
    }

    const matchId = state.matchIds[2]
    const reason = `E2E dispute for internal-note visibility ${Date.now()}`
    const internalText = `ADMIN-ONLY NOTE ${Date.now()}`
    const publicText = `Admin public note ${Date.now()}`

    // --- API setup -------------------------------------------------------
    const ctx = await seedDisputableMatch(
      state.adminToken,
      state.player2Token,
      state.tournamentId,
      matchId,
      { p1: 16, p2: 14 }
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

    // Admin posts one internal and one public message via API.
    const internalMsg = await adminAddDisputeMessage(
      state.adminToken,
      dispute.id,
      internalText,
      true
    )
    const publicMsg = await adminAddDisputeMessage(
      state.adminToken,
      dispute.id,
      publicText,
      false
    )
    expect(internalMsg).not.toBeNull()
    expect(publicMsg).not.toBeNull()

    // --- Cross-check via API: admin sees both, captain sees only public --
    const adminView = await getDisputeThread(state.adminToken, dispute.id)
    expect(adminView).not.toBeNull()
    const adminMessages = adminView!.messages.map((m) => m.message)
    expect(adminMessages).toEqual(expect.arrayContaining([internalText, publicText]))

    const captainView = await getDisputeThread(state.player2Token, dispute.id)
    expect(captainView).not.toBeNull()
    const captainMessages = captainView!.messages.map((m) => m.message)
    expect(captainMessages).toContain(publicText)
    expect(captainMessages).not.toContain(internalText)
    const captainIsInternalFlags = captainView!.messages.map((m) => m.is_internal)
    expect(captainIsInternalFlags.some((flag) => flag === true)).toBe(false)

    // --- UI: captain (player 2) views the match dispute thread -----------
    // DisputeThreadPanel is rendered on the match detail page for
    // completed/disputed matches. The panel iterates the store's current
    // thread directly, so hiding internal messages relies on the server
    // response — already verified above. The UI check is a belt-and-braces
    // assertion that the internal text does NOT appear on the captain's
    // page, and the public text DOES.
    await loginAsPlayer2(page)
    await page.goto(`/tournaments/${testTournaments.standard.slug}`)
    await page.waitForLoadState('networkidle')

    // Jump straight to the match detail page — we know the match ID.
    await page.goto(
      `/tournaments/${state.tournamentId}/matches/${matchId}`
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

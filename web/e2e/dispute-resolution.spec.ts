import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  adminAddDisputeMessage,
  confirmResultClaim,
  getDisputeThread,
  getMatch,
  raiseDispute,
  seedDisputableMatch,
  submitResultClaim,
  type DisputableMatchContext,
  type DisputeReason,
} from './fixtures/dispute.fixture'
import {
  checkInViaApi,
  createCheckInScenario,
  primeAuthStorage,
  type CheckInScenario,
  type ParticipantToken,
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
 *   4. Admin takes ownership of a dispute (assign → Under Review).
 *   5. Admin upholds a CONFIRMED result (winner + score survive intact).
 *   6. Admin adjusts a CONFIRMED score (the only path that rewrites one).
 *   7. Admin orders a rematch (match returns to `ready`).
 *   8. Admin double-DQs both teams (match `cancelled`).
 *
 * Every scenario is fully self-contained — each builds a fresh
 * tournament + two players + an in-progress match via
 * `createCheckInScenario`, then a disputed result claim via the dispute
 * fixtures, so they never race on shared DB rows and never depend on
 * `global-setup.ts` seeding.
 */

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
  // Becomes the opened dispute's description (see seedDisputableMatch).
  disputeReason?: string,
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

  // P1 claims the win with the given scores; P2 disputes the claim, which
  // atomically opens the tournament dispute.
  const ctx = await seedDisputableMatch(
    scenario.p1.token,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scores,
    disputeReason,
  )
  expect(ctx, 'result claim + claim dispute should succeed').not.toBeNull()

  return { scenario, ctx: ctx! }
}

/**
 * The other half of the dispute surface: a match whose result was actually
 * CONFIRMED (winner + scores written onto the match row), which a participant
 * then formally disputes.
 *
 * This is the precondition the "uphold" and "adjust scores" resolutions are
 * written for — both talk about "the original result", and only a confirmed
 * result puts one on the match. (The claim-dispute path in
 * `buildDisputedMatch` never confirms, so the match carries no scores at all.)
 */
interface ConfirmedResultDispute {
  scenario: CheckInScenario
  tournamentId: string
  matchId: string
  disputeId: string
  /** Registration seeded into the match's participant1 slot (and the winner). */
  participant1RegistrationId: string
  participant2RegistrationId: string
}

async function buildConfirmedResultDispute(
  request: APIRequestContext,
  adminToken: string,
  scores: { p1: number; p2: number },
  reason: DisputeReason,
  description: string,
): Promise<ConfirmedResultDispute> {
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
  expect(match, 'seeded match must be readable').not.toBeNull()
  expect(
    match!.status,
    'both check-ins should auto-advance the match to in_progress',
  ).toBe('in_progress')

  // Bracket seeding decides which scenario player lands in which slot, so
  // resolve the slots rather than assuming p1 === participant1.
  const players: ParticipantToken[] = [scenario.p1, scenario.p2]
  const first = players.find(
    (p) => p.registrationId === match!.participant1_registration_id,
  )
  const second = players.find(
    (p) => p.registrationId === match!.participant2_registration_id,
  )
  expect(
    first && second,
    'both scenario players must be the match participants',
  ).toBeTruthy()

  // participant1 claims the win, participant2 CONFIRMS it — this is what
  // writes the result onto the match row.
  const claim = await submitResultClaim(
    first!.token,
    scenario.matchId,
    first!.registrationId,
    scores.p1,
    scores.p2,
  )
  expect(claim, 'participant1 result claim should succeed').not.toBeNull()

  const confirmed = await confirmResultClaim(
    second!.token,
    scenario.matchId,
    claim!.id,
  )
  expect(confirmed, 'participant2 confirmation should succeed').toBe(true)

  const completed = await getMatch(
    adminToken,
    scenario.tournamentId,
    scenario.matchId,
  )
  expect(completed, 'match must be readable after confirmation').not.toBeNull()
  expect(completed!.status, 'confirmation completes the match').toBe('completed')
  expect(completed!.winner_registration_id).toBe(first!.registrationId)
  expect(completed!.participant1_score).toBe(scores.p1)
  expect(completed!.participant2_score).toBe(scores.p2)

  // The loser now formally disputes the confirmed result.
  const dispute = await raiseDispute(
    second!.token,
    scenario.tournamentId,
    scenario.matchId,
    second!.registrationId,
    reason,
    description,
  )
  expect(dispute, 'raising a dispute on the confirmed result should succeed').not.toBeNull()

  const disputedMatch = await getMatch(
    adminToken,
    scenario.tournamentId,
    scenario.matchId,
  )
  expect(disputedMatch!.status, 'raising a dispute flips the match to disputed').toBe(
    'disputed',
  )

  return {
    scenario,
    tournamentId: scenario.tournamentId,
    matchId: scenario.matchId,
    disputeId: dispute!.id,
    participant1RegistrationId: first!.registrationId,
    participant2RegistrationId: second!.registrationId,
  }
}

// ---------------------------------------------------------------------------
// UI helpers — every resolution takes the same route into the modal.
// ---------------------------------------------------------------------------

/**
 * Filter the admin dispute queue down to a single match and open that
 * dispute's detail modal. The server-side `match_id` filter guarantees the
 * table holds exactly the one dispute we seeded, so the row is unambiguous.
 */
/**
 * The queue's match cell names the two sides ("A vs B") since the admin
 * disputes fix; the truncated UUID only shows for a match with no names.
 * Every caller has already filtered the queue to one match id, so the rows
 * that name a match ARE that dispute.
 */
function disputeRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: ' vs ' })
}

async function openDisputeModal(page: Page, matchId: string): Promise<Locator> {
  await page.goto('/admin/disputes')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Match ID' }).fill(matchId)
  await page.getByRole('textbox', { name: 'Match ID' }).press('Enter')
  await page.waitForLoadState('networkidle')

  const row = disputeRow(page).first()
  await expect(row).toBeVisible({ timeout: 10000 })
  await row.click()

  const modal = page.locator('.v-dialog').filter({ hasText: 'Dispute Details' })
  await expect(modal).toBeVisible()
  return modal
}

/**
 * Expand one of the five resolution panels and hand it back scoped, so the
 * form fields (all of which share labels across panels) resolve unambiguously.
 */
async function openResolutionPanel(
  modal: Locator,
  panelTitle: string,
): Promise<Locator> {
  const panel = modal.locator('.v-expansion-panel').filter({ hasText: panelTitle })
  await expect(panel).toBeVisible()
  await panel.locator('.v-expansion-panel-title').first().click()
  await expect(panel.getByLabel('Notes *')).toBeVisible()
  return panel
}

/**
 * Close the modal and assert the resolved dispute has left the actionable
 * queue. `/v1/admin/disputes` with no status filter returns only
 * pending/under_review disputes, so a resolved one must disappear.
 */
async function closeModalAndExpectQueueEmpty(page: Page, modal: Locator) {
  await modal.locator('.v-card-title').getByRole('button').first().click()
  await expect(modal).toBeHidden({ timeout: 10000 })
  await page.waitForLoadState('networkidle')
  await expect(
    disputeRow(page),
  ).toHaveCount(0, { timeout: 10000 })
}

test.describe('Admin Dispute Resolution', () => {
  test('resolves dispute in favour of P1 — overturn declares P1 the winner', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute for P1 win ${Date.now()}`

    // --- API setup: self-contained match, P1 claims 1-0, P2 disputes -----
    // Match-level scores are SERIES scores; the generated tournament is
    // bo1, so the claim must sum to exactly 1 (DTO range 0..=10).
    const { scenario, ctx } = await buildDisputedMatch(request, adminToken, {
      p1: 1,
      p2: 0,
    }, reason)
    const matchId = scenario.matchId

    // --- UI: admin sees dispute in list ----------------------------------
    await loginAsAdmin(page)
    await page.goto('/admin/disputes')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible()

    // Filter by match ID to isolate the row we care about. The column only
    // names the two sides ("A vs B") — see disputeRow.
    await page.getByRole('textbox', { name: 'Match ID' }).fill(matchId)
    await page.getByRole('textbox', { name: 'Match ID' }).press('Enter')
    await page.waitForLoadState('networkidle')

    const row = disputeRow(page).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    // Claim-path disputes carry the structured reason `other` (the free text
    // is the description, shown only in the modal).
    //
    // P-131 changed the SPEC, not this test's intent: `reason` is the
    // `DisputeReason` enum and the queue now renders it through
    // `disputeReasonMap` instead of printing the wire value. The wire value is
    // still `other` — the API cross-checks below and in the sibling tests are
    // untouched — only the label is `Other`. `toContainText` is
    // case-sensitive, so this assertion still fails if the column regresses to
    // rendering the raw enum, which is the whole point of keeping it.
    await expect(row).toContainText('Other')

    // --- UI: open detail modal, post admin reply, resolve in favour of P1 -
    await row.click()
    const modal = page.locator('.v-dialog').filter({ hasText: 'Dispute Details' })
    await expect(modal).toBeVisible()
    // The full free-text description we raised the dispute with renders in
    // the modal body (it also appears in the auto-generated "Dispute
    // raised" system message, hence .first()).
    await expect(modal.getByText(reason, { exact: false }).first()).toBeVisible()

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
      disputeRow(page)
    ).toHaveCount(0, { timeout: 10000 })

    // The Status v-select is `clearable`, so getByLabel('Status') can
    // resolve to the hidden "Clear Status" icon — target the field itself.
    await page.locator('.v-select').filter({ hasText: 'Status' }).first().click()
    await page.getByRole('option', { name: 'Resolved' }).click()
    await page.waitForLoadState('networkidle')
    await expect(
      disputeRow(page).first()
    ).toBeVisible({ timeout: 10000 })

    const updatedMatch = await getMatch(
      adminToken,
      scenario.tournamentId,
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
    }, reason)
    const matchId = scenario.matchId

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

    const row = disputeRow(page).first()
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
      disputeRow(page)
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
    }, reason)
    const matchId = scenario.matchId

    // Admin posts one internal and one public message via API.
    const internalMsg = await adminAddDisputeMessage(
      adminToken,
      ctx.disputeId,
      internalText,
      true
    )
    const publicMsg = await adminAddDisputeMessage(
      adminToken,
      ctx.disputeId,
      publicText,
      false
    )
    expect(internalMsg).not.toBeNull()
    expect(publicMsg).not.toBeNull()

    // --- Cross-check via API: admin sees both, captain sees only public --
    const adminView = await getDisputeThread(adminToken, ctx.disputeId)
    expect(adminView).not.toBeNull()
    const adminMessages = adminView!.messages.map((m) => m.message)
    expect(adminMessages).toEqual(expect.arrayContaining([internalText, publicText]))

    const captainView = await getDisputeThread(scenario.p2.token, ctx.disputeId)
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

  test('admin takes ownership — Assign to Me moves the dispute to Under Review', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute for assignment ${Date.now()}`

    const { scenario, ctx } = await buildDisputedMatch(
      request,
      adminToken,
      { p1: 1, p2: 0 },
      reason,
    )

    // Precondition straight from the API — a freshly raised dispute is pending.
    const before = await getDisputeThread(adminToken, ctx.disputeId)
    expect(before).not.toBeNull()
    expect(before!.dispute.status).toBe('pending')

    await loginAsAdmin(page)
    const modal = await openDisputeModal(page, scenario.matchId)

    // The status chip renders the human label, not the raw enum.
    await expect(modal.getByText('Pending', { exact: true })).toBeVisible()

    const assignButton = modal.getByRole('button', { name: 'Assign to Me' })
    await expect(assignButton).toBeVisible()
    await assignButton.click()

    // UI: the chip flips to Under Review and the button retires itself — it
    // only renders while `dispute.status === 'pending'`.
    await expect(modal.getByText('Under Review', { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await expect(modal.getByText('Pending', { exact: true })).toHaveCount(0)
    await expect(assignButton).toHaveCount(0)

    // An under_review dispute is still resolvable, so the panel must remain.
    await expect(modal.getByText('Resolve Dispute')).toBeVisible()

    // --- API cross-check -------------------------------------------------
    const after = await getDisputeThread(adminToken, ctx.disputeId)
    expect(after).not.toBeNull()
    expect(after!.dispute.status).toBe('under_review')
    expect(after!.messages.map((m) => m.message)).toContain(
      'Dispute assigned for review',
    )

    // Assignment must not have resolved anything: the match stays disputed
    // and the dispute stays in the actionable queue.
    const match = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
    expect(match!.status).toBe('disputed')
  })

  test('upholds a confirmed result — winner and score survive the dispute', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const description = `E2E uphold: the confirmed 1-0 result is correct ${Date.now()}`

    // A CONFIRMED result (not just a claim) — "uphold the original result"
    // only means something when the match actually carries one.
    const built = await buildConfirmedResultDispute(
      request,
      adminToken,
      { p1: 1, p2: 0 },
      'wrong_winner',
      description,
    )

    await loginAsAdmin(page)
    const modal = await openDisputeModal(page, built.matchId)

    // The dispute snapshots the confirmed result as the "original".
    await expect(
      modal.locator('tr').filter({ hasText: 'Original Score' }),
    ).toContainText('1 - 0')
    await expect(
      modal.locator('tr').filter({ hasText: 'Original Winner' }),
    ).toContainText(built.participant1RegistrationId)

    const panel = await openResolutionPanel(modal, 'Uphold Original Result')
    await panel
      .getByLabel('Notes *')
      .fill('Reviewed both demos — the submitted 1-0 result is correct.')
    await panel.getByRole('button', { name: 'Uphold Result' }).last().click()

    // UI: the resolution card renders with type "Upheld", and the resolve
    // panel disappears because a resolved dispute cannot be resolved again.
    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Upheld', { exact: true })).toBeVisible()
    await expect(modal.getByText('Resolve Dispute')).toHaveCount(0)

    await closeModalAndExpectQueueEmpty(page, modal)

    // --- API cross-check: the match is completed again, untouched ---------
    const after = await getMatch(adminToken, built.tournamentId, built.matchId)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('completed')
    expect(after!.winner_registration_id).toBe(built.participant1RegistrationId)
    expect(after!.participant1_score).toBe(1)
    expect(after!.participant2_score).toBe(0)

    const thread = await getDisputeThread(adminToken, built.disputeId)
    expect(thread).not.toBeNull()
    expect(thread!.dispute.status).toBe('resolved')
    expect(thread!.dispute.resolution?.resolution_type).toBe('upheld')
    // Upholding leaves the result alone — no replacement winner is recorded.
    expect(thread!.dispute.resolution?.new_winner_registration_id).toBeFalsy()
  })

  test('adjusts a confirmed score — rewrites the match result and flips the winner', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const description = `E2E adjust: the recorded 1-0 score is wrong ${Date.now()}`

    // This is the ONLY admin path that can rewrite an already-confirmed
    // score, so the precondition has to be a confirmed result.
    const built = await buildConfirmedResultDispute(
      request,
      adminToken,
      { p1: 1, p2: 0 },
      'wrong_score',
      description,
    )

    await loginAsAdmin(page)
    const modal = await openDisputeModal(page, built.matchId)

    await expect(
      modal.locator('tr').filter({ hasText: 'Original Score' }),
    ).toContainText('1 - 0')

    // Adjust to 0-1. The winner field is optional here: the backend derives
    // the winner from the new scores, which must flip it to participant2.
    const panel = await openResolutionPanel(modal, 'Adjust Scores')
    await panel.getByLabel(/P1 Score/).fill('0')
    await panel.getByLabel(/P2 Score/).fill('1')
    await panel
      .getByLabel('Notes *')
      .fill('Scoreboard screenshot shows 0-1; correcting the recorded series.')
    await panel.getByRole('button', { name: 'Adjust Scores' }).last().click()

    // UI: resolution card shows the new score and the derived new winner.
    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Adjusted', { exact: true })).toBeVisible()
    await expect(
      modal.locator('tr').filter({ hasText: 'New Score' }),
    ).toContainText('0 - 1')
    await expect(
      modal.locator('tr').filter({ hasText: 'New Winner' }),
    ).toContainText(built.participant2RegistrationId)

    await closeModalAndExpectQueueEmpty(page, modal)

    // --- API cross-check: the confirmed result really was rewritten -------
    const after = await getMatch(adminToken, built.tournamentId, built.matchId)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('completed')
    expect(after!.participant1_score).toBe(0)
    expect(after!.participant2_score).toBe(1)
    expect(after!.winner_registration_id).toBe(built.participant2RegistrationId)

    const thread = await getDisputeThread(adminToken, built.disputeId)
    expect(thread).not.toBeNull()
    expect(thread!.dispute.status).toBe('resolved')
    expect(thread!.dispute.resolution?.resolution_type).toBe('adjusted')
  })

  test('orders a rematch — the disputed match returns to ready', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute resolved by rematch ${Date.now()}`

    const { scenario, ctx } = await buildDisputedMatch(
      request,
      adminToken,
      { p1: 1, p2: 0 },
      reason,
    )

    const before = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
    expect(before!.status).toBe('disputed')

    await loginAsAdmin(page)
    const modal = await openDisputeModal(page, scenario.matchId)

    const panel = await openResolutionPanel(modal, 'Order Rematch')
    await panel
      .getByLabel('Notes *')
      .fill('Server crashed mid-map — both teams to replay the match.')
    await panel.getByRole('button', { name: 'Order Rematch' }).last().click()

    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Rematch', { exact: true })).toBeVisible()

    await closeModalAndExpectQueueEmpty(page, modal)

    // --- API cross-check: the match is replayable again -------------------
    const after = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('ready')
    // The DTO omits null fields entirely, so normalise before asserting.
    // NB: this holds because the claim was never confirmed, so no winner was
    // ever written. A rematch ordered on a CONFIRMED result does NOT clear the
    // old winner/score/completed_at — `resolve_with_status_change`
    // (api/crates/portal-db/src/adapters/dispute.rs:483) updates `status`
    // alone. Reported as a finding rather than asserted here.
    expect(after!.winner_registration_id ?? null).toBeNull()

    const thread = await getDisputeThread(adminToken, ctx.disputeId)
    expect(thread).not.toBeNull()
    expect(thread!.dispute.status).toBe('resolved')
    expect(thread!.dispute.resolution?.resolution_type).toBe('rematch')
  })

  test('double-disqualifies both teams — the match is cancelled', async ({
    page,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const reason = `E2E dispute resolved by double DQ ${Date.now()}`

    const { scenario, ctx } = await buildDisputedMatch(
      request,
      adminToken,
      { p1: 1, p2: 0 },
      reason,
    )

    const before = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
    expect(before!.status).toBe('disputed')

    await loginAsAdmin(page)
    const modal = await openDisputeModal(page, scenario.matchId)

    const panel = await openResolutionPanel(modal, 'Double Disqualification')
    await panel
      .getByLabel('Notes *')
      .fill('Both rosters fielded ineligible players — both disqualified.')
    await panel.getByRole('button', { name: 'Double DQ' }).last().click()

    // `formatResolutionType` turns `double_dq` into "Double Dq".
    await expect(modal.getByText('Resolution')).toBeVisible({ timeout: 10000 })
    await expect(modal.getByText('Double Dq', { exact: true })).toBeVisible()

    await closeModalAndExpectQueueEmpty(page, modal)

    // --- API cross-check: neither side keeps the match ---------------------
    const after = await getMatch(adminToken, scenario.tournamentId, scenario.matchId)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('cancelled')
    // The DTO omits null fields entirely, so normalise before asserting.
    // Same caveat as the rematch test: the cancel path leaves an existing
    // winner/score in place, so this only holds on the never-confirmed path.
    expect(after!.winner_registration_id ?? null).toBeNull()

    const thread = await getDisputeThread(adminToken, ctx.disputeId)
    expect(thread).not.toBeNull()
    expect(thread!.dispute.status).toBe('resolved')
    expect(thread!.dispute.resolution?.resolution_type).toBe('double_dq')
  })
})

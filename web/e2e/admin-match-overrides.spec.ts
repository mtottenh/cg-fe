import { test, expect, type Locator, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  completeMatchViaApi,
  createStartedTournament,
  getOverrideMatch,
  listBracketIds,
  listResultOverrides,
  matchAt,
  matchesWon,
  recordConfirmedResult,
  transitionMatchViaApi,
} from './fixtures/admin-overrides.fixture'

/**
 * Admin match OVERRIDE paths — `AdminTournamentDetailPage` → Matches tab →
 * match-detail modal.
 *
 * Covers the handlers that had no e2e coverage before this spec (COVERAGE-PLAN
 * §4-F, "Admin — match & dispute"):
 *
 *   MatchOverviewTab.handleTransition          (:104)
 *   MatchAdminActionsTab.handleSchedule        (:275)  — user-priority item
 *   MatchAdminActionsTab.handleForfeit         (:286)
 *   MatchAdminActionsTab.handleDoubleForfeit   (:306)
 *   MatchAdminActionsTab.handleProcessProgression  (:324)
 *   MatchAdminActionsTab.handleReapplyProgression  (:346)
 *   MatchAdminActionsTab.handleRevertProgression   (:364)
 *
 * Every test seeds its own tournament via the API, performs the override
 * through the real UI (including the confirm dialog), and asserts on BOTH the
 * rendered result and the backend (§1.4).
 *
 * ---------------------------------------------------------------------------
 * What revert means, per bracket family (P-83, P-169)
 *
 * `ProgressionService::revert_progression` used to roll back `RoundRobin |
 * Swiss` only; for elimination brackets it logged "Would revert winner
 * progression - needs implementation" and returned 200 with the advanced
 * participant still seated. Both halves are implemented now, and they undo
 * different things, so both are exercised here:
 *
 *   round robin  — the recorded result is cleared and standings recompute
 *                  (there are no progression links in that format)
 *   elimination  — whoever this match seated in the next round is taken back
 *                  out, and that match drops back to `pending`
 *
 * The elimination revert refuses (409) rather than cascading when the next
 * round has already been played; the operator reverts the deeper match first.
 * ---------------------------------------------------------------------------
 */

/** The match-detail modal. Scoped by its title so it never collides with the
 *  confirm dialog, which is a sibling overlay, not a descendant. */
function matchDialog(page: Page): Locator {
  return page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
}

/** A `useConfirmDialog` overlay, located by its (unique) message body. The
 *  titles are NOT unique — "Forfeit Match" is also the admin card heading, and
 *  Playwright text matching is substring-based. */
function confirmOverlay(page: Page, message: string): Locator {
  return page.locator('.v-overlay--active').filter({ hasText: message })
}

/** The visible tab panel inside the modal. Inactive `v-window-item`s stay in
 *  the DOM behind `v-show`, so unscoped lookups would match hidden controls. */
function activePanel(dialog: Locator): Locator {
  return dialog.locator('.v-window-item--active')
}

/** A row of the admin Matches data table, located by both participant names
 *  (one name alone is ambiguous once a winner is advanced into a later round). */
function matchRow(page: Page, ...contains: string[]): Locator {
  let row = page.locator('tbody tr')
  for (const text of contains) row = row.filter({ hasText: text })
  return row
}

async function openMatchesTab(page: Page, tournamentId: string): Promise<void> {
  await page.goto(`/admin/tournaments/${tournamentId}?tab=matches`)
  await expect(page.getByRole('tab', { name: 'Matches' })).toBeVisible()
}

async function openMatchDetail(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: 'View match details' }).click()
  const dialog = matchDialog(page)
  await expect(dialog).toBeVisible()
  return dialog
}

async function openAdminActions(dialog: Locator): Promise<Locator> {
  await dialog.getByRole('tab', { name: 'Admin Actions' }).click()
  const panel = activePanel(dialog)
  await expect(panel.getByRole('button', { name: 'Schedule', exact: true })).toBeVisible()
  return panel
}

/** Pick a `v-select` option. The menu is teleported to the overlay container,
 *  so it is addressed through Vuetify's `v-select__content` content class. */
async function chooseOption(page: Page, select: Locator, optionText: string): Promise<void> {
  await select.click()
  await page.locator('.v-select__content .v-list-item').filter({ hasText: optionText }).click()
  await expect(page.locator('.v-select__content')).toHaveCount(0)
}

// ---------------------------------------------------------------------------

test.describe('Admin match overrides', () => {
  test('admin walks a match through the status machine from the Overview tab', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const target = matchAt(scenario.matches, 'R1M1')
    expect(target.status).toBe('ready')
    const p1 = target.participant1_name as string
    const p2 = target.participant2_name as string

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    const dialog = await openMatchDetail(page, matchRow(page, p1, p2))
    const overview = activePanel(dialog)
    await expect(overview.locator('.v-chip').filter({ hasText: 'Ready' })).toBeVisible()

    // ready → scheduled. `getMatchActionLabel('ready')` is "Schedule".
    await overview.getByRole('button', { name: 'Schedule', exact: true }).click()
    await expect(
      page.locator('.v-snackbar').getByText('Match transitioned to scheduled'),
    ).toBeVisible()
    await expect(overview.locator('.v-chip').filter({ hasText: 'Scheduled' })).toBeVisible()
    expect((await getOverrideMatch(adminToken, scenario.tournamentId, target.id)).status).toBe(
      'scheduled',
    )

    // scheduled → in_progress, proving the button relabels off the new status.
    await overview.getByRole('button', { name: 'Start Match', exact: true }).click()
    await expect(
      page.locator('.v-snackbar').getByText('Match transitioned to in progress'),
    ).toBeVisible()
    await expect(overview.locator('.v-chip').filter({ hasText: 'In Progress' })).toBeVisible()
    expect((await getOverrideMatch(adminToken, scenario.tournamentId, target.id)).status).toBe(
      'in_progress',
    )
  })

  test('admin manually schedules a match from the Admin Actions tab', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const target = matchAt(scenario.matches, 'R1M1')
    expect(target.scheduled_at ?? null).toBeNull()
    const p1 = target.participant1_name as string
    const p2 = target.participant2_name as string

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    const row = matchRow(page, p1, p2)
    await expect(row).toContainText('Not scheduled')

    const dialog = await openMatchDetail(page, row)
    const actions = await openAdminActions(dialog)

    // `handleSchedule` sends `new Date(<local input>).toISOString()`, so the
    // expected instant is computed with the browser's own timezone rather than
    // the node process's.
    const localInput = '2032-04-17T19:45'
    const expectedIso = await page.evaluate((s) => new Date(s).toISOString(), localInput)

    await actions.locator('input[type="datetime-local"]').fill(localInput)
    await actions.getByLabel('Notes (optional)').fill('E2E override window')
    await actions.getByRole('button', { name: 'Schedule', exact: true }).click()

    await expect(page.locator('.v-snackbar').getByText('Match scheduled')).toBeVisible()

    // API cross-check: the instant landed and the match moved to `scheduled`
    // (`SchedulingService::admin_schedule` writes both).
    const scheduled = await getOverrideMatch(adminToken, scenario.tournamentId, target.id)
    expect(scheduled.status).toBe('scheduled')
    expect(new Date(scheduled.scheduled_at as string).toISOString()).toBe(expectedIso)

    // UI: the Overview metadata table renders the new time via `formatDateTime`
    // (`toLocaleString()`), computed here in the same browser context.
    const expectedLabel = await page.evaluate((iso) => new Date(iso).toLocaleString(), expectedIso)
    await dialog.getByRole('tab', { name: 'Overview' }).click()
    const overview = activePanel(dialog)
    await expect(overview.locator('tr').filter({ hasText: 'Scheduled At' })).toContainText(
      expectedLabel,
    )

    // …and the Matches table row no longer says "Not scheduled".
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText(expectedLabel)
  })

  test('admin forfeits one participant and the opponent is awarded the match', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const target = matchAt(scenario.matches, 'R1M1')
    const p1 = target.participant1_name as string
    const p2 = target.participant2_name as string
    // `TournamentMatchStatus::can_forfeit()` starts at `scheduled`.
    await transitionMatchViaApi(adminToken, scenario.tournamentId, target.id, 'scheduled')

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    const row = matchRow(page, p1, p2)
    const dialog = await openMatchDetail(page, row)
    const actions = await openAdminActions(dialog)

    const forfeitCard = actions.locator('.v-card').filter({ hasText: 'Forfeit Match' })
    await chooseOption(page, forfeitCard.locator('.v-select').first(), p1)
    await chooseOption(page, forfeitCard.locator('.v-select').nth(1), 'Disqualification')
    await forfeitCard.getByLabel('Reason *').fill('Cheating confirmed by admin review')
    await forfeitCard.getByRole('button', { name: 'Forfeit', exact: true }).click()

    const confirm = confirmOverlay(page, 'The match is decided immediately.')
    await expect(confirm).toContainText(`Forfeit ${p1} (disqualification)?`)
    await confirm.getByRole('button', { name: 'Forfeit', exact: true }).click()

    await expect(page.locator('.v-snackbar').getByText('Match forfeited')).toBeVisible()

    // API cross-check: forfeited, with the opponent recorded as winner.
    const forfeited = await getOverrideMatch(adminToken, scenario.tournamentId, target.id)
    expect(forfeited.status).toBe('forfeit')
    expect(forfeited.winner_registration_id).toBe(target.participant2_registration_id)

    // UI: the Overview tab names the winner and the row chip reads "Forfeit".
    await dialog.getByRole('tab', { name: 'Overview' }).click()
    const overview = activePanel(dialog)
    await expect(overview.locator('tr').filter({ hasText: 'Winner' })).toContainText(p2)
    await expect(overview.locator('.v-chip').filter({ hasText: 'Forfeit' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row.locator('.v-chip').filter({ hasText: 'Forfeit' })).toBeVisible()
  })

  test('admin double-forfeits a match and neither participant is awarded it', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const target = matchAt(scenario.matches, 'R1M1')
    const p1 = target.participant1_name as string
    const p2 = target.participant2_name as string
    await transitionMatchViaApi(adminToken, scenario.tournamentId, target.id, 'scheduled')

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    const row = matchRow(page, p1, p2)
    const dialog = await openMatchDetail(page, row)
    const actions = await openAdminActions(dialog)

    const doubleCard = actions.locator('.v-card').filter({ hasText: 'Double Forfeit' })
    await doubleCard.getByLabel('Reason *').fill('Both rosters failed to appear')
    await doubleCard.getByRole('button', { name: 'Double Forfeit', exact: true }).click()

    const confirm = confirmOverlay(page, 'Neither advances, and the match is closed immediately.')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Double Forfeit', exact: true }).click()

    await expect(page.locator('.v-snackbar').getByText('Double forfeit processed')).toBeVisible()

    // API cross-check: `process_double_forfeit` cancels the match, no winner.
    const cancelled = await getOverrideMatch(adminToken, scenario.tournamentId, target.id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.winner_registration_id ?? null).toBeNull()

    // UI: no Winner row on the Overview tab, and the row chip reads "Cancelled".
    await dialog.getByRole('tab', { name: 'Overview' }).click()
    const overview = activePanel(dialog)
    await expect(overview.locator('.v-chip').filter({ hasText: 'Cancelled' })).toBeVisible()
    await expect(overview.locator('tr').filter({ hasText: 'Winner' })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row.locator('.v-chip').filter({ hasText: 'Cancelled' })).toBeVisible()
  })

  test('admin processes bracket progression, then reapplies it to the other participant', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const semi = matchAt(scenario.matches, 'R1M1')
    const final = matchAt(scenario.matches, 'R2M1')
    const p1 = semi.participant1_name as string
    const p2 = semi.participant2_name as string

    // Precondition: a completed semi-final whose bracket never advanced —
    // exactly what the Process Progression control exists to repair.
    await completeMatchViaApi(adminToken, scenario.tournamentId, semi.id)
    const finalBefore = await getOverrideMatch(adminToken, scenario.tournamentId, final.id)
    expect(finalBefore.participant1_registration_id ?? null).toBeNull()

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    // The final's slot 1 is sourced from `WinnerOf(R1M1)`
    // (`bracket_generator/single_elimination.rs:69`), so before progression it
    // renders as TBD vs TBD.
    const finalRow = () => matchRow(page, 'TBD')
    await expect(finalRow()).toHaveCount(1)

    const semiRow = matchRow(page, p1, p2)
    let dialog = await openMatchDetail(page, semiRow)
    let actions = await openAdminActions(dialog)

    const progression = actions.locator('.v-card').filter({ hasText: 'Bracket Progression' })
    await expect(progression).toBeVisible()

    // --- Process: advance p1 into the final -------------------------------
    await chooseOption(page, progression.locator('.v-select').first(), p1)
    await progression.getByRole('button', { name: 'Process', exact: true }).click()

    let confirm = confirmOverlay(page, `Advance ${p1} as winner over ${p2}?`)
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Process', exact: true }).click()
    await expect(page.locator('.v-snackbar').getByText('Progression processed')).toBeVisible()

    // API: the bracket moved — p1 now occupies the final's first slot.
    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
          .participant1_registration_id,
      )
      .toBe(semi.participant1_registration_id)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)

    // UI: the final row is now "p1 vs TBD".
    await expect(matchRow(page, p1, 'TBD')).toHaveCount(1)

    // --- Reapply: replace the advanced winner with p2 ----------------------
    dialog = await openMatchDetail(page, semiRow)
    actions = await openAdminActions(dialog)
    const progression2 = actions.locator('.v-card').filter({ hasText: 'Bracket Progression' })
    await chooseOption(page, progression2.locator('.v-select').nth(1), p2)
    await progression2.getByRole('button', { name: 'Reapply', exact: true }).click()

    confirm = confirmOverlay(page, 'Downstream bracket slots are rewritten.')
    await expect(confirm).toContainText(`Replace the advanced winner with ${p2}?`)
    await confirm.getByRole('button', { name: 'Reapply', exact: true }).click()
    await expect(page.locator('.v-snackbar').getByText('Progression reapplied')).toBeVisible()

    // API: the same slot now holds p2, not p1.
    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
          .participant1_registration_id,
      )
      .toBe(semi.participant2_registration_id)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)

    // UI: the final row moved with it — "p2 vs TBD", and p1 is no longer there.
    await expect(matchRow(page, p2, 'TBD')).toHaveCount(1)
    await expect(matchRow(page, p1, 'TBD')).toHaveCount(0)
  })

  test('admin reverts bracket progression and the recorded result is rolled back', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()

    // Round robin: the only bracket family whose revert actually rolls back
    // (see the file header). Four players ⇒ six matches, all `ready`.
    const scenario = await createStartedTournament(adminToken, {
      format: 'round_robin',
      playerCount: 4,
    })
    const [bracketId] = await listBracketIds(adminToken, scenario.tournamentId)
    const target = scenario.matches[0]
    const p1 = target.participant1_name as string
    const p2 = target.participant2_name as string
    const p1Reg = target.participant1_registration_id as string

    await completeMatchViaApi(adminToken, scenario.tournamentId, target.id)
    expect(await matchesWon(scenario.tournamentId, bracketId, p1Reg)).toBe(0)

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)

    const dialog = await openMatchDetail(page, matchRow(page, p1, p2))
    const actions = await openAdminActions(dialog)
    const progression = actions.locator('.v-card').filter({ hasText: 'Bracket Progression' })

    // --- Process: p1 wins, standings credit the win ------------------------
    await chooseOption(page, progression.locator('.v-select').first(), p1)
    await progression.getByRole('button', { name: 'Process', exact: true }).click()
    await confirmOverlay(page, `Advance ${p1} as winner over ${p2}?`)
      .getByRole('button', { name: 'Process', exact: true })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Progression processed')).toBeVisible()

    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, target.id))
          .winner_registration_id,
      )
      .toBe(p1Reg)
    expect(await matchesWon(scenario.tournamentId, bracketId, p1Reg)).toBe(1)

    // UI: the Overview tab now names the winner.
    await dialog.getByRole('tab', { name: 'Overview' }).click()
    await expect(activePanel(dialog).locator('tr').filter({ hasText: 'Winner' })).toContainText(p1)

    // --- Revert: the same state must come back off the bracket -------------
    await dialog.getByRole('tab', { name: 'Admin Actions' }).click()
    await activePanel(dialog)
      .locator('.v-card')
      .filter({ hasText: 'Bracket Progression' })
      .getByRole('button', { name: 'Revert', exact: true })
      .click()
    await confirmOverlay(page, 'Undo bracket advancement for this match?')
      .getByRole('button', { name: 'Revert', exact: true })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Progression reverted')).toBeVisible()

    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, target.id))
          .winner_registration_id ?? null,
      )
      .toBeNull()
    expect(await matchesWon(scenario.tournamentId, bracketId, p1Reg)).toBe(0)

    // UI: the Winner row is gone again.
    await dialog.getByRole('tab', { name: 'Overview' }).click()
    await expect(activePanel(dialog).locator('tr').filter({ hasText: 'Winner' })).toHaveCount(0)
  })

  /**
   * P-72 — a confirmed-but-wrong score was PERMANENTLY UNCORRECTABLE.
   *
   * `MatchResultsTab.vue` was 119 lines with zero handlers, and no admin
   * result route existed (`routes/admin.rs` had result-*reviews* only). The
   * one score-writing admin path, `POST /v1/admin/disputes/{id}/resolve/adjusted`,
   * requires a dispute row to exist. So the case reproduced below — both
   * parties confirm a wrong score, nobody disputes — left a bracket
   * progressing on bad data that no operator could repair by any means.
   * `revert`/`reapply` exist and move the bracket, but they replay the
   * recorded score; they cannot change it.
   *
   * The result here is created through the REAL claim flow (p1 submits, p2
   * confirms) rather than written into the database, so the starting state is
   * exactly the one the finding describes, dispute row absent and all.
   */
  test('admin corrects a wrong score that both parties confirmed, with no dispute', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 2,
    })
    const target = matchAt(scenario.matches, 'R1M1')
    const p1Name = target.participant1_name as string
    const p2Name = target.participant2_name as string
    const p1Reg = target.participant1_registration_id as string
    const p2Reg = target.participant2_registration_id as string
    const p1 = scenario.players.find((p) => p.registrationId === p1Reg)!
    const p2 = scenario.players.find((p) => p.registrationId === p2Reg)!

    // Both parties agree on the WRONG scoreline: 1-0 to participant 1.
    await recordConfirmedResult(adminToken, scenario, target.id, p1, p2)

    const before = await getOverrideMatch(adminToken, scenario.tournamentId, target.id)
    expect(before.status).toBe('completed')
    expect(before.winner_registration_id).toBe(p1Reg)
    expect([before.participant1_score, before.participant2_score]).toEqual([1, 0])

    // No dispute — which is precisely why nothing could fix this before.
    const disputeResp = await fetch(
      `${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/tournaments/${scenario.tournamentId}/matches/${target.id}/dispute`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(
      disputeResp.status,
      'the scenario must have NO dispute — the adjusted-resolution path is unreachable without one',
    ).toBe(404)

    // --- Correct it through the UI, on the Results tab -------------------
    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)
    const dialog = await openMatchDetail(page, matchRow(page, p1Name, p2Name))
    await dialog.getByRole('tab', { name: 'Results' }).click()
    const results = activePanel(dialog)

    await expect(results.getByTestId('recorded-p1-score')).toHaveText('1')
    await expect(results.getByTestId('recorded-p2-score')).toHaveText('0')
    await expect(results.getByTestId('recorded-winner')).toHaveText(p1Name)
    await expect(
      results.locator('[data-testid="override-row"]'),
      'a match nobody has corrected must show no corrections',
    ).toHaveCount(0)

    const scoreInputs = results.locator('input[type="number"]')
    await scoreInputs.first().fill('0')
    await scoreInputs.nth(1).fill('2')
    await results.getByLabel('Reason *').fill('Demo review: participant 2 won 2-0.')
    await results.getByRole('button', { name: 'Correct Score' }).click()

    await confirmOverlay(page, `Overwrite the official result with 0-2, making ${p2Name} the winner?`)
      .getByRole('button', { name: 'Correct Score' })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Score corrected')).toBeVisible()

    // --- The UI reflects the correction ---------------------------------
    await expect(results.getByTestId('recorded-p1-score')).toHaveText('0')
    await expect(results.getByTestId('recorded-p2-score')).toHaveText('2')
    await expect(results.getByTestId('recorded-winner')).toHaveText(p2Name)

    // …including the audit trail, naming a person rather than a truncated id.
    const auditRow = results.locator('[data-testid="override-row"]')
    await expect(auditRow).toHaveCount(1)
    await expect(auditRow).toContainText('1–0')
    await expect(auditRow).toContainText('0–2')
    await expect(auditRow).toContainText('Demo review: participant 2 won 2-0.')
    await expect(auditRow).not.toContainText('Unknown admin')

    // --- …and so does the API (§1.4) ------------------------------------
    const after = await getOverrideMatch(adminToken, scenario.tournamentId, target.id)
    expect([after.participant1_score, after.participant2_score]).toEqual([0, 2])
    expect(after.winner_registration_id).toBe(p2Reg)
    expect(after.status).toBe('completed')

    const overrides = await listResultOverrides(adminToken, scenario.tournamentId, target.id)
    expect(overrides).toHaveLength(1)
    expect(overrides[0]!.previous_participant1_score).toBe(1)
    expect(overrides[0]!.previous_participant2_score).toBe(0)
    expect(overrides[0]!.new_participant1_score).toBe(0)
    expect(overrides[0]!.new_participant2_score).toBe(2)
    expect(overrides[0]!.new_winner_registration_id).toBe(p2Reg)
    expect(overrides[0]!.reason).toBe('Demo review: participant 2 won 2-0.')
    expect(overrides[0]!.changed_by_name, 'the audit row must name the operator').toBeTruthy()
  })

  /**
   * P-169 — the correction and the bracket, on the same match.
   *
   * P-72 gave admins a way to correct a confirmed-but-wrong score, and a
   * correction can flip which participant won. The correction deliberately does
   * NOT re-run progression, so at that moment the bracket has the *loser* of
   * the corrected match standing in the next round, and Revert is the control
   * that takes them out.
   *
   * It did not. `revert_progression` withdrew `match_.winner_registration_id` —
   * the *currently recorded* winner, which the correction had just flipped to
   * someone who was never advanced. It found them nowhere, left the wrong
   * player in the final, and returned 200 with a "Progression reverted"
   * snackbar. That is the whole finding: a success that does nothing, on the
   * only control that could undo the damage.
   *
   * The result is created through the REAL claim flow so the completion saga
   * does the advancing, exactly as a live event would.
   */
  test('admin corrects a score that flips the winner, then reverts the advancement it made', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const adminToken = await getAdminToken()

    const scenario = await createStartedTournament(adminToken, {
      format: 'single_elimination',
      playerCount: 4,
    })
    const semi = matchAt(scenario.matches, 'R1M1')
    const final = matchAt(scenario.matches, 'R2M1')
    const p1Name = semi.participant1_name as string
    const p2Name = semi.participant2_name as string
    const p1Reg = semi.participant1_registration_id as string
    const p2Reg = semi.participant2_registration_id as string
    const p1 = scenario.players.find((p) => p.registrationId === p1Reg)!
    const p2 = scenario.players.find((p) => p.registrationId === p2Reg)!

    // Both parties confirm 1-0 to p1; `MatchCompletionSaga` advances p1 into
    // the final.
    await recordConfirmedResult(adminToken, scenario, semi.id, p1, p2)
    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
          .participant1_registration_id,
      )
      .toBe(p1Reg)

    await loginAsAdmin(page)
    await openMatchesTab(page, scenario.tournamentId)
    await expect(
      matchRow(page, p1Name, 'TBD'),
      'precondition: the final renders the advanced player against a TBD slot',
    ).toHaveCount(1)

    const dialog = await openMatchDetail(page, matchRow(page, p1Name, p2Name))

    // --- Correct the score so the OTHER player won -------------------------
    await dialog.getByRole('tab', { name: 'Results' }).click()
    const results = activePanel(dialog)
    const scoreInputs = results.locator('input[type="number"]')
    await scoreInputs.first().fill('0')
    await scoreInputs.nth(1).fill('2')
    await results.getByLabel('Reason *').fill('Demo review: participant 2 won 2-0.')
    await results.getByRole('button', { name: 'Correct Score' }).click()
    await confirmOverlay(page, `Overwrite the official result with 0-2, making ${p2Name} the winner?`)
      .getByRole('button', { name: 'Correct Score' })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Score corrected')).toBeVisible()
    await expect(results.getByTestId('recorded-winner')).toHaveText(p2Name)

    // The bracket is untouched by the correction — the player who is now
    // recorded as having LOST is still standing in the final. This is the state
    // the finding is about.
    expect(
      (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
        .participant1_registration_id,
      'a score correction must not silently reshape downstream pairings',
    ).toBe(p1Reg)

    // --- Revert: the wrongly-advanced player must come back out ------------
    await dialog.getByRole('tab', { name: 'Admin Actions' }).click()
    await activePanel(dialog)
      .locator('.v-card')
      .filter({ hasText: 'Bracket Progression' })
      .getByRole('button', { name: 'Revert', exact: true })
      .click()
    await confirmOverlay(page, 'Undo bracket advancement for this match?')
      .getByRole('button', { name: 'Revert', exact: true })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Progression reverted')).toBeVisible()

    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
          .participant1_registration_id ?? null,
      )
      .toBeNull()

    // UI: the final is a clean TBD vs TBD again, and the corrected winner was
    // NOT quietly seated in the loser's place — revert undoes, it does not
    // re-progress.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(
      matchRow(page, p1Name, 'TBD'),
      'the player the correction demoted must no longer be in the final',
    ).toHaveCount(0)
    await expect(matchRow(page, p2Name, 'TBD')).toHaveCount(0)

    // --- Reapply finishes the repair: the corrected winner advances --------
    const reopened = await openMatchDetail(page, matchRow(page, p1Name, p2Name))
    const actions = await openAdminActions(reopened)
    const progression = actions.locator('.v-card').filter({ hasText: 'Bracket Progression' })
    await chooseOption(page, progression.locator('.v-select').nth(1), p2Name)
    await progression.getByRole('button', { name: 'Reapply', exact: true }).click()
    await confirmOverlay(page, 'Downstream bracket slots are rewritten.')
      .getByRole('button', { name: 'Reapply', exact: true })
      .click()
    await expect(page.locator('.v-snackbar').getByText('Progression reapplied')).toBeVisible()

    await expect
      .poll(async () =>
        (await getOverrideMatch(adminToken, scenario.tournamentId, final.id))
          .participant1_registration_id,
      )
      .toBe(p2Reg)

    await reopened.getByRole('button', { name: 'Close' }).click()
    await expect(reopened).toHaveCount(0)
    await expect(matchRow(page, p2Name, 'TBD')).toHaveCount(1)
  })

})

import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { primeAuthStorage } from './fixtures/checkin.fixture'
import {
  createDemoBrowserMatch,
  linkCatalogDemoViaApi,
  listEvidenceViaApi,
  listLinkedDemosViaApi,
  seedCatalogDemo,
} from './fixtures/demo-browser.fixture'

/**
 * What "Unlink" means, and whether it detaches the demo the operator pointed at.
 *
 * **P-159** — the evidence id could be mapped onto the WRONG link.
 * `stores/evidence.ts linkDiscoveredDemo` recovered the link it had just created
 * with
 *
 *     linkedDemos.value.find(d => d.link.game_number === (gameNumber ?? null))
 *
 * and wrote the new evidence id against whatever came back. `find` returns the
 * first match, and `find_by_match` orders `ORDER BY game_number, linked_at` —
 * ascending — so with two demos on the same game number the first match is the
 * OLDER link. The new evidence record was therefore recorded against an existing
 * link, and the next Unlink on that row deleted a different demo's evidence
 * while removing this one from the list. A destructive action aimed by a guess.
 *
 * Two demos on a match is not an exotic setup: `DemoBrowser.linkDemo` sends
 * `game_number: 1` for every demo on a bo1, and `undefined` for every demo on a
 * series until the operator picks from the Game select — either way both links
 * share a game number and `find` cannot tell them apart.
 *
 * **P-158** — the same gesture meant two different things.
 * `MatchEvidenceTab`'s Unlink called `demosStore.unlinkFromMatch`
 * (`DELETE /v1/admin/demos/{demo_id}/link/{match_id}`), which removes only the
 * `demo_match_link`; the participant surfaces' Unlink called
 * `evidenceStore.unlinkDemoEvidence` (`DELETE .../evidence/{evidence_id}`),
 * which removes the evidence row too. Same button, same component
 * (`EvidenceDisplay`), two outcomes — and the admin's outcome left the demo
 * listed in the Evidence Records table immediately below the row it had just
 * removed, with nothing on screen explaining the difference.
 *
 * Preconditions go through the API; every action under test goes through the UI.
 */

test.describe('Evidence — what Unlink means', () => {
  /**
   * P-159. Link two demos through the browser, unlink the FIRST, and prove the
   * second is untouched.
   *
   * The assertion that matters is which evidence id the DELETE carries: before
   * the fix it carried the *second* demo's, so the operator detached demo one
   * from the UI and demo two from the database.
   */
  test('unlinking one of two linked demos detaches that demo, not the other', async ({ page }) => {
    test.setTimeout(180_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)

    // Two demos, both discoverable for this match (both participants' Steam IDs
    // and a `match_date` on the match's reference instant).
    const demoOne = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
      team1Score: 13,
      team2Score: 7,
    })
    const demoTwo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
      team1Score: 13,
      team2Score: 11,
    })

    const participant = scenario.ordered[0]
    await primeAuthStorage(page, participant.token, participant.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    const linkButtons = browser.getByRole('button', { name: 'Link demo', exact: true })
    await expect(linkButtons).toHaveCount(2, { timeout: 15000 })

    // Link them one at a time. Each link removes its own suggestion, so the
    // count going 2 → 1 → 0 is also the proof that two distinct demos landed.
    await linkButtons.first().click()
    await expect(linkButtons).toHaveCount(1, { timeout: 15000 })
    await linkButtons.first().click()
    await expect(linkButtons).toHaveCount(0, { timeout: 15000 })
    await expect(browser.getByText('Linked Demos')).toBeVisible({ timeout: 15000 })

    // Read the real pairing off the server. Both links carry the same game
    // number, which is precisely the state the old `find` could not resolve.
    //
    // `GET /v1/matches/{id}/demos` orders `game_number, linked_at` ASCENDING
    // (`portal-db/src/adapters/demo.rs find_by_match`), so `linked[0]` is the
    // link `find` used to return — and therefore the row the last link call
    // wrote the WRONG evidence id against. Targeting it by position rather than
    // by demo matters: the suggestion list's order decides which demo is linked
    // first, so picking a demo by name would only sometimes hit the mis-mapped
    // row and the test would pass half the time on broken code.
    const linked = await listLinkedDemosViaApi(participant.token, scenario.matchId)
    expect(linked).toHaveLength(2)
    expect(new Set(linked.map((l) => l.link.demo_id))).toEqual(
      new Set([demoOne.id, demoTwo.id]),
    )
    const [oldest, newest] = linked
    expect(oldest!.evidence_id).toBeTruthy()
    expect(newest!.evidence_id).toBeTruthy()
    expect(oldest!.evidence_id).not.toBe(newest!.evidence_id)

    // Unlink the oldest link from its own card. The request has to name that
    // link's evidence row; the defect made it name the other demo's.
    const oldestCard = browser.locator(`[data-testid="linked-demo-${oldest!.link.id}"]`)
    await expect(oldestCard).toBeVisible({ timeout: 15000 })
    const [deleteRequest] = await Promise.all([
      page.waitForRequest(
        (r) => r.method() === 'DELETE' && r.url().includes('/evidence/'),
        { timeout: 15000 },
      ),
      oldestCard.getByRole('button', { name: 'Unlink demo' }).click(),
    ])
    expect(
      deleteRequest.url(),
      'the DELETE must name the evidence row of the demo whose Unlink was pressed',
    ).toContain(`/v1/matches/${scenario.matchId}/evidence/${oldest!.evidence_id}`)
    expect((await deleteRequest.response())?.status()).toBe(204)

    await expect(oldestCard).toHaveCount(0, { timeout: 15000 })
    await expect(browser.locator('[data-testid="demo-browser-error"]')).toHaveCount(0)

    // Reload: the list is rebuilt from the server, so this is the state that
    // survives the session rather than the one the click left in memory.
    await page.reload()
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()
    await expect(
      browser.locator(`[data-testid="linked-demo-${newest!.link.id}"]`),
    ).toBeVisible({ timeout: 15000 })
    await expect(browser.locator(`[data-testid="linked-demo-${oldest!.link.id}"]`)).toHaveCount(0)

    // Backend cross-check on both rows of both demos: exactly the other demo
    // survives, with exactly its own evidence record.
    const remaining = await listLinkedDemosViaApi(participant.token, scenario.matchId)
    expect(remaining.map((l) => l.link.demo_id)).toEqual([newest!.link.demo_id])
    const evidence = await listEvidenceViaApi(participant.token, scenario.matchId)
    expect(evidence.map((e) => e.id)).toEqual([newest!.evidence_id])
  })

  /**
   * P-158. The admin match-detail Evidence tab, which renders the demo in TWO
   * tables — Linked Demos and Evidence Records — and used to remove it from only
   * the first.
   */
  test('an admin unlink on the Evidence tab removes the demo from both tables', async ({ page }) => {
    test.setTimeout(150_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
    })
    await linkCatalogDemoViaApi(scenario.ordered[0].token, scenario.matchId, demo.id)

    const linked = await listLinkedDemosViaApi(adminToken, scenario.matchId)
    expect(linked).toHaveLength(1)
    const linkId = linked[0]!.link.id
    const evidenceId = linked[0]!.evidence_id
    expect(evidenceId).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)
    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 15000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()

    // Both representations of the same fact are on screen. That is the whole
    // problem: removing one and leaving the other tells the admin two things.
    await expect(dialog.getByText('Linked Demos (1)')).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByText('Evidence Records (1)')).toBeVisible()
    await expect(dialog.locator(`[data-testid="demo-link-row-${linkId}"]`)).toBeVisible()
    await expect(dialog.locator(`[data-testid="evidence-row-${evidenceId}"]`)).toBeVisible()

    // Arm the wire watch before the click, but assert on what the OPERATOR sees
    // first — the symptom was a table that kept listing a demo they had just
    // detached, and a failure should say that rather than talk about URLs.
    const deleteRequestPromise = page.waitForRequest(
      (r) => r.method() === 'DELETE',
      { timeout: 15000 },
    )
    await dialog
      .locator(`[data-testid="demo-link-row-${linkId}"]`)
      .getByRole('button', { name: 'Unlink demo' })
      .click()

    // Neither table still claims the demo, and the surface says so plainly.
    await expect(dialog.locator(`[data-testid="demo-link-row-${linkId}"]`)).toHaveCount(0, {
      timeout: 15000,
    })
    await expect(
      dialog.locator(`[data-testid="evidence-row-${evidenceId}"]`),
      'Evidence Records must not keep listing a demo that was just detached',
    ).toHaveCount(0)
    await expect(dialog.getByText('No Evidence Linked')).toBeVisible({ timeout: 15000 })

    // And the gesture is the SAME request the participant panel sends. The
    // admin-only link-delete route removes one row of the two, and pressing it
    // from here is what made the button's meaning depend on who was looking.
    const deleteRequest = await deleteRequestPromise
    expect(deleteRequest.url()).toContain(
      `/v1/matches/${scenario.matchId}/evidence/${evidenceId}`,
    )
    expect((await deleteRequest.response())?.status()).toBe(204)

    // Reopening reads both lists back off the server: the row that used to
    // survive an admin unlink is gone there too.
    await page.reload()
    const reopenedRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(reopenedRow).toBeVisible({ timeout: 15000 })
    await reopenedRow.getByRole('button', { name: 'View match details' }).click()
    const reopened = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await reopened.getByRole('tab', { name: 'Evidence' }).click()
    await expect(reopened.getByText('No Evidence Linked')).toBeVisible({ timeout: 15000 })

    expect(await listLinkedDemosViaApi(adminToken, scenario.matchId)).toHaveLength(0)
    expect(await listEvidenceViaApi(adminToken, scenario.matchId)).toHaveLength(0)
  })
})

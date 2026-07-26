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
 * The two things an operator DOES to evidence — open it, and detach it — driven
 * through the surfaces that offer them.
 *
 * **P-136** — an admin could not access any evidence file at all.
 * `MatchEvidenceTab.vue:3` mounted `<EvidenceDisplay>` without `:match-id`,
 * despite holding a `matchId` prop it used four lines later. `matchId` was an
 * *optional* prop on `EvidenceDisplay`, and the entire Actions column plus
 * `getAccessUrl` were gated on it (`v-if="matchId"`, and an early `return`).
 * So on the admin match-detail Evidence tab — the surface a dispute is resolved
 * from — the column simply did not render, and nothing anywhere reported a
 * problem. The prop is required now: the same omission is a compile error.
 *
 * **P-135** — unlinking a demo reported success without doing anything.
 * `stores/evidence.ts unlinkDemoEvidence` read the evidence id out of
 * `evidenceIdMap`, an in-memory ref written only by `linkDemoEvidence` in the
 * same session, and then pruned `linkedDemos` *unconditionally*:
 *
 *     if (evidenceId) { ...DELETE... }
 *     linkedDemos.value = linkedDemos.value.filter(...)
 *
 * After any page reload the map is empty, so no DELETE was sent, the row still
 * vanished from the list, and the action resolved. The operator watched the
 * demo disappear and believed it gone; it was untouched on the server and came
 * back on the next refresh. The reload is the whole point of the test — before
 * the fix the same click in the same session worked, which is exactly why this
 * survived.
 *
 * Preconditions go through the API; every action under test goes through the UI.
 */

test.describe('Evidence — operator actions', () => {
  /**
   * P-136. The admin match-detail Evidence tab, from the row to the opened file.
   */
  test('admin opens an evidence file from the match-detail Evidence tab', async ({ page }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
    })
    await linkCatalogDemoViaApi(scenario.ordered[0].token, scenario.matchId, demo.id)

    const evidence = await listEvidenceViaApi(adminToken, scenario.matchId)
    expect(evidence).toHaveLength(1)
    const evidenceId = evidence[0]!.id

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)
    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 15000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()
    await expect(dialog.getByText('Evidence Records (1)')).toBeVisible({ timeout: 15000 })

    // The column itself. It was absent entirely — not disabled, not erroring,
    // just not rendered — so an admin had no control to press.
    const evidenceRow = dialog.locator(`[data-testid="evidence-row-${evidenceId}"]`)
    await expect(evidenceRow).toBeVisible()
    const viewButton = dialog.locator(`[data-testid="view-evidence-${evidenceId}"]`)
    await expect(viewButton).toBeVisible()

    // Pressing it reaches the access endpoint with THIS match's id and opens
    // what comes back. Both halves matter: without the match id the request
    // cannot even be addressed, which is what the missing prop caused.
    const [accessResponse, popup] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/matches/${scenario.matchId}/evidence/${evidenceId}/access`) &&
          r.request().method() === 'GET',
        { timeout: 15000 },
      ),
      page.waitForEvent('popup', { timeout: 15000 }),
      viewButton.click(),
    ])

    expect(accessResponse.status()).toBe(200)
    const body = (await accessResponse.json()) as { data: { url: string } }
    expect(body.data.url).toContain(demo.s3_key)

    // The browser was actually sent there — the store's `window.open`, not just
    // a fetch whose result was dropped on the floor.
    await popup.waitForLoadState('domcontentloaded').catch(() => {})
    expect(popup.url()).toBe(body.data.url)
    await popup.close()
  })

  /**
   * P-135. Link through the UI, RELOAD, then unlink — and prove the DELETE went
   * out rather than trusting the row's disappearance.
   */
  test('unlinking a demo after a reload really deletes it', async ({ page }) => {
    test.setTimeout(150_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    // Both participants' Steam IDs, so the demo arrives as a *suggestion* and
    // the only "Link demo" on the page is the one under test.
    await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
    })

    const participant = scenario.ordered[0]
    await primeAuthStorage(page, participant.token, participant.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    const linkButton = browser.getByRole('button', { name: 'Link demo', exact: true })
    await expect(linkButton).toHaveCount(1, { timeout: 15000 })
    await linkButton.click()
    await expect(browser.getByText('Linked Demos')).toBeVisible({ timeout: 15000 })

    const linked = await listLinkedDemosViaApi(participant.token, scenario.matchId)
    expect(linked).toHaveLength(1)
    const linkId = linked[0]!.link.id
    // The server names the evidence row behind the link — the field P-135
    // needed, and the reason a reload-fresh page can now unlink at all.
    const evidenceId = linked[0]!.evidence_id
    expect(evidenceId).toBeTruthy()

    // THE RELOAD. `evidenceIdMap` is a plain Pinia ref: everything the link
    // click put in it is gone from here on, which is the state every operator
    // who did not link the demo in this very tab is already in.
    await page.reload()
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const linkedCard = browser.locator(`[data-testid="linked-demo-${linkId}"]`)
    await expect(linkedCard).toBeVisible({ timeout: 15000 })

    // Watch the wire, not the DOM. The defect was precisely that the row
    // disappeared and the operator was told it worked while nothing was sent —
    // so the row disappearing proves nothing on its own.
    const [deleteRequest] = await Promise.all([
      page.waitForRequest(
        (r) =>
          r.method() === 'DELETE' &&
          r.url().includes(`/v1/matches/${scenario.matchId}/evidence/${evidenceId}`),
        { timeout: 15000 },
      ),
      linkedCard.getByRole('button', { name: 'Unlink demo' }).click(),
    ])
    expect(deleteRequest.method()).toBe('DELETE')
    const deleteResponse = await deleteRequest.response()
    expect(deleteResponse?.status()).toBe(204)

    await expect(linkedCard).toHaveCount(0, { timeout: 15000 })
    // No error surfaced — the alert exists (P-135 added it), so its absence is
    // a real signal rather than "there was nowhere to say so".
    await expect(browser.locator('[data-testid="demo-browser-error"]')).toHaveCount(0)

    // It stays gone across a second reload — the assertion the old code could
    // never satisfy, because the link was still there and came straight back.
    await page.reload()
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()
    await expect(browser.getByText('Discover Demos for This Match')).toBeVisible({ timeout: 15000 })
    await expect(browser.locator(`[data-testid="linked-demo-${linkId}"]`)).toHaveCount(0)

    // Backend cross-check: both rows the DELETE is responsible for.
    expect(await listLinkedDemosViaApi(participant.token, scenario.matchId)).toHaveLength(0)
    expect(await listEvidenceViaApi(participant.token, scenario.matchId)).toHaveLength(0)
  })
})

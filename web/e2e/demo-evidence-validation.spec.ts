import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  createDemoBrowserMatch,
  linkCatalogDemoViaApi,
  listEvidenceViaApi,
  listLinkedDemosViaApi,
  recordMatchResult,
  seedCatalogDemo,
} from './fixtures/demo-browser.fixture'

/**
 * The evidence surface an admin resolving a dispute actually uses — the
 * Evidence tab of the admin match-detail modal (`AdminMatchDetailModal.vue:45`
 * → `MatchEvidenceTab` → `EvidenceDisplay`) — and the demo-validation path
 * that feeds it.
 *
 * Two findings meet here:
 *
 * **P-109** — a linked demo was invisible on every evidence surface.
 * `EvidenceService::link_discovered` stamped the row
 * `EvidenceSource::PluginDiscovery` even though a human had clicked "Link
 * demo", and `list_evidence` drops those rows unless `include_discovered=true`,
 * which no frontend caller sends. So attaching a demo wrote a record the
 * Evidence tab could never display: during a dispute, the evidence was
 * invisible to the person resolving it. Human-initiated links are now stamped
 * `ManualUpload`, so the "Evidence Records" table renders at all.
 *
 * **P-111** — nothing in the product ever validated a demo against a result.
 * `DemoMatchLinkRepository::mark_validated` had no caller anywhere in the
 * workspace, so `demo_match_links.validated` was `false` on every row that has
 * ever existed and the "Validated" column was dead template. Every validation
 * route also went through the external CS2 stats service, which no deployment
 * here runs — while the portal already stores the demo's parsed result in its
 * own catalog. Validation now compares against that, and writes the verdict to
 * both the evidence row and the demo link.
 *
 * Preconditions go through the API; the actions under test — opening the
 * Evidence tab and pressing Validate — go through the UI.
 */

/** The demo's scores, in the match's participant order. */
const DEMO_P1_SCORE = 13
const DEMO_P2_SCORE = 7

test.describe('Match evidence — demo validation', () => {
  test('admin sees the linked demo on the Evidence tab and validates it against the result', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)

    // The demo's team 1 is the match's participant 1: `seedCatalogDemo` puts
    // the first Steam ID on team 1, and `scenario.ordered` is the match's own
    // participant order. Without that the Steam-ID join would orient the demo
    // against the wrong side and the comparison would be a coin flip.
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
      team1Score: DEMO_P1_SCORE,
      team2Score: DEMO_P2_SCORE,
    })

    await linkCatalogDemoViaApi(scenario.ordered[0].token, scenario.matchId, demo.id)
    await recordMatchResult(scenario, DEMO_P1_SCORE, DEMO_P2_SCORE)

    const linkedBefore = await listLinkedDemosViaApi(adminToken, scenario.matchId)
    expect(linkedBefore).toHaveLength(1)
    const linkId = linkedBefore[0].link.id
    // Precondition stated rather than assumed: nothing has validated anything.
    expect(linkedBefore[0].link.validated).toBe(false)

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)

    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 15000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()

    // ---- P-109 -------------------------------------------------------------
    // The evidence record the link wrote is on the page. Before the fix this
    // whole section was absent: `fetchEvidence` sends no `include_discovered`,
    // so the list came back empty and `v-if="evidence.length > 0"` never fired.
    await expect(dialog.getByText('Evidence Records (1)')).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByText('Linked Demos (1)')).toBeVisible()
    const evidenceRow = dialog.locator('tbody tr').filter({ hasText: demo.file_name })
    await expect(evidenceRow).toHaveCount(2) // one linked-demo row, one evidence row

    // ---- P-111 -------------------------------------------------------------
    const validatedCell = dialog.locator(`[data-testid="demo-link-validated-${linkId}"]`)
    await expect(validatedCell).toHaveText('Not validated')

    await dialog.locator(`[data-testid="validate-demo-${linkId}"]`).click()

    const verdict = dialog.locator(`[data-testid="demo-link-verdict-${linkId}"]`)
    await expect(verdict).toBeVisible({ timeout: 15000 })
    await expect(verdict).toContainText(`${demo.file_name} matches the recorded result`)
    // The Steam-ID join resolved, so no "could not map demo teams" caveat.
    await expect(verdict).not.toContainText('Could not map demo teams')

    // The column the finding is about now reads true, off a server re-read.
    await expect(validatedCell).toHaveText('Validated')

    // Backend cross-check: BOTH rows the verdict has to reach.
    const linkedAfter = await listLinkedDemosViaApi(adminToken, scenario.matchId)
    expect(linkedAfter[0].link.validated).toBe(true)
    expect(linkedAfter[0].link.validated_at).not.toBeNull()

    const evidence = await listEvidenceViaApi(adminToken, scenario.matchId)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].name).toBe(demo.file_name)
    expect(evidence[0].validated).toBe(true)

    // P-138 positive control: the evidence row reads "Validated" too, and
    // carries no failure reason. Without this the failing-validation test
    // below could pass on a UI that simply never says "Validated" anywhere.
    const evidenceCell = dialog.locator(`[data-testid="evidence-validated-${evidence[0].id}"]`)
    await expect(evidenceCell).toContainText('Validated')
    await expect(evidenceCell).not.toContainText('Validation failed')
    expect(evidence[0].validation_errors).toEqual([])
  })

  test('a demo that contradicts the recorded result is reported, and does not read as validated', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)

    // The demo says 13-7; the match will be made to say 16-14. This is the
    // case the whole feature exists for — a demo that does not support the
    // score it was attached to — and the one where an unconditional
    // `validated = true` would have been actively harmful.
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
      team1Score: DEMO_P1_SCORE,
      team2Score: DEMO_P2_SCORE,
    })

    await linkCatalogDemoViaApi(scenario.ordered[0].token, scenario.matchId, demo.id)
    await recordMatchResult(scenario, 16, 14)

    const linkedBefore = await listLinkedDemosViaApi(adminToken, scenario.matchId)
    const linkId = linkedBefore[0].link.id
    const evidenceBefore = await listEvidenceViaApi(adminToken, scenario.matchId)
    const evidenceId = evidenceBefore[0]!.id

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)
    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 15000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()
    await expect(dialog.getByText('Linked Demos (1)')).toBeVisible({ timeout: 15000 })

    // ---- P-138 -------------------------------------------------------------
    // Precondition, stated rather than assumed: nothing has been checked yet,
    // so the "not yet validated" state is what is on screen. The whole finding
    // is that this must not be what a FAILED validation also looks like.
    const evidenceCell = dialog.locator(`[data-testid="evidence-validated-${evidenceId}"]`)
    await expect(evidenceCell).toContainText('Not validated')

    await dialog.locator(`[data-testid="validate-demo-${linkId}"]`).click()

    const verdict = dialog.locator(`[data-testid="demo-link-verdict-${linkId}"]`)
    await expect(verdict).toBeVisible({ timeout: 15000 })
    await expect(verdict).toContainText(`${demo.file_name} does not match the recorded result`)
    // The operator is told what the demo actually records, not just "invalid".
    const contradiction = `Demo on ${demo.mapName} records ${DEMO_P1_SCORE} - ${DEMO_P2_SCORE}, but the claimed result is 16 - 14`
    await expect(verdict).toContainText(contradiction)

    // P-138. This assertion used to read 'Not validated', which was correct for
    // the two-state UI of the time and is a genuine SPEC CHANGE, not a
    // relaxation: "we checked and this demo contradicts the score" and "nobody
    // has checked" were rendered identically, and on the dispute-resolution
    // surface those are opposite facts. Three states now, and the failing one
    // says so.
    const linkCell = dialog.locator(`[data-testid="demo-link-validated-${linkId}"]`)
    await expect(linkCell).toContainText('Validation failed')
    await expect(linkCell).not.toContainText('Not validated')

    // The evidence row is the row P-138 is really about: `mark_validated` wrote
    // `validated = true` whatever the verdict said, so this cell showed a green
    // "Validated" tick on a demo that contradicts the recorded score — an
    // assertion of a guarantee that is false, on the exact surface an admin
    // uses to resolve the dispute.
    await expect(evidenceCell).toContainText('Validation failed')
    await expect(evidenceCell).not.toContainText('Not validated')
    // ...and WHY, on the row itself, not only in the transient verdict alert.
    await expect(evidenceCell).toContainText(contradiction)

    // ...and the backend agrees, while still keeping the verdict on record.
    const linkedAfter = await listLinkedDemosViaApi(adminToken, scenario.matchId)
    expect(linkedAfter[0].link.validated).toBe(false)
    expect(linkedAfter[0].link.validation_result).not.toBeNull()

    const evidenceAfter = await listEvidenceViaApi(adminToken, scenario.matchId)
    expect(evidenceAfter[0].validated).toBe(false)
    // A failed validation stays distinguishable from one that never ran.
    expect(evidenceAfter[0].validated_at).not.toBeNull()
    expect(evidenceAfter[0].validation_errors).toEqual([contradiction])
  })

  /**
   * P-138, on a fresh page load.
   *
   * The verdict alert is component state — it exists only for as long as the
   * tab that produced it. An admin who opens the dispute tomorrow sees only
   * what the *rows* say, so the failed state and its reason have to survive a
   * reload. This is the read that decides a dispute.
   */
  test('a failed validation still reads as failed, with its reason, after a reload', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)

    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.ordered[0].steamId, scenario.ordered[1].steamId],
      matchDate: scenario.referenceTime,
      team1Score: DEMO_P1_SCORE,
      team2Score: DEMO_P2_SCORE,
    })

    await linkCatalogDemoViaApi(scenario.ordered[0].token, scenario.matchId, demo.id)
    await recordMatchResult(scenario, 16, 14)

    const linkId = (await listLinkedDemosViaApi(adminToken, scenario.matchId))[0]!.link.id
    const evidenceId = (await listEvidenceViaApi(adminToken, scenario.matchId))[0]!.id

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=matches`)
    const matchRow = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRow).toBeVisible({ timeout: 15000 })
    await matchRow.getByRole('button', { name: 'View match details' }).click()

    let dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()
    await expect(dialog.getByText('Linked Demos (1)')).toBeVisible({ timeout: 15000 })
    await dialog.locator(`[data-testid="validate-demo-${linkId}"]`).click()
    await expect(dialog.locator(`[data-testid="demo-link-verdict-${linkId}"]`)).toBeVisible({
      timeout: 15000,
    })

    // Everything in-page is discarded; only what the server persisted survives.
    await page.reload()
    const matchRowAgain = page.locator('tr').filter({ hasText: scenario.p1.username })
    await expect(matchRowAgain).toBeVisible({ timeout: 15000 })
    await matchRowAgain.getByRole('button', { name: 'View match details' }).click()
    dialog = page.locator('.v-overlay--active').filter({ hasText: 'Match Detail' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Evidence' }).click()
    await expect(dialog.getByText('Linked Demos (1)')).toBeVisible({ timeout: 15000 })

    const contradiction = `Demo on ${demo.mapName} records ${DEMO_P1_SCORE} - ${DEMO_P2_SCORE}, but the claimed result is 16 - 14`
    const evidenceCell = dialog.locator(`[data-testid="evidence-validated-${evidenceId}"]`)
    await expect(evidenceCell).toContainText('Validation failed')
    await expect(evidenceCell).toContainText(contradiction)

    const linkCell = dialog.locator(`[data-testid="demo-link-validated-${linkId}"]`)
    await expect(linkCell).toContainText('Validation failed')
    await expect(linkCell).toContainText(contradiction)
  })
})

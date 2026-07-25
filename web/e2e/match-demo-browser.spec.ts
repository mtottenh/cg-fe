import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { primeAuthStorage } from './fixtures/checkin.fixture'
import { deleteDemoViaApi } from './fixtures/demo-admin.fixture'
import {
  browseDemosViaApi,
  createDemoBrowserMatch,
  discoverViaApi,
  listEvidenceViaApi,
  listLinkedDemosViaApi,
  seedCatalogDemo,
  uniqueMapName,
} from './fixtures/demo-browser.fixture'

/**
 * The match-evidence **demo browser** — `DemoBrowser.vue`, mounted from
 * `EvidenceAttachmentPanel.vue:83` behind the "Browse Demos" tab of the result
 * submission panel. Nothing drove it before: `evidence.spec.ts` covers the
 * Link-URL and file-upload tabs, `uploads.spec.ts` covers image uploads, and
 * both stop at the tab selector.
 *
 * Handlers exercised here:
 *   - `refresh`/`onMounted` → `evidence.discoverDemos` (`stores/evidence.ts:55`)
 *     → `GET /v1/matches/{id}/evidence/discover`
 *   - `linkDemo`            → `evidence.linkDiscoveredDemo` (`:78`)
 *     → `POST /v1/matches/{id}/evidence/link-discovered`
 *   - `searchDemos`         → `evidence.fetchBrowseDemos` (`:118`)
 *     → `GET /v1/demos`
 *   - `linkManualDemo`      → `evidence.linkManualDemo` (`:140`)
 *     → `POST /v1/matches/{id}/evidence/link-demo`
 *   - the empty/error states the component renders off `discoverState` and
 *     `linkDemoState`.
 *
 * P-110 fixed: `linkManualDemo` was previously undrivable. `link_demo` resolved
 * the demo by **file name against the external demo-stats service** and 404'd
 * when it was absent — while holding the `demo_id` it then used anyway — so the
 * button offered every catalogued demo and refused the ones whose `.stats.json`
 * was missing, which in this stack (no stats service) is all of them. It now
 * resolves from the catalog the list itself came from.
 *
 * Demo *validation* lives in `demo-evidence-validation.spec.ts` — it needs a
 * recorded result to validate against, which this surface precedes.
 */

test.describe('Match evidence — demo browser', () => {
  test('participant links a discovered demo to the match', async ({ page }) => {
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.p1SteamId, scenario.p2SteamId],
      matchDate: scenario.referenceTime,
    })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    await expect(browser.getByText('Discover Demos for This Match')).toBeVisible({ timeout: 15000 })
    await expect(browser.getByText('Suggested Demos')).toBeVisible({ timeout: 15000 })

    // The suggestion renders "<map> - <team1> vs <team2>", the raw file name
    // underneath, and the relevance score as a percentage. Both participants'
    // Steam IDs are in the demo and match_date == the match's reference
    // instant, so every term of `compute_relevance` is maximal: 100%.
    await expect(
      browser.getByText(`${demo.mapName} - ${demo.team1Name} vs ${demo.team2Name}`),
    ).toBeVisible()
    await expect(browser.getByText(demo.file_name)).toBeVisible()
    await expect(browser.getByText('100%', { exact: true })).toBeVisible()

    const linkButton = browser.getByRole('button', { name: 'Link demo', exact: true })
    await expect(linkButton).toHaveCount(1)
    await linkButton.click()

    // The suggestion moves into "Linked Demos"; the match is bo1 so the link
    // carries game 1.
    await expect(browser.getByText('Linked Demos')).toBeVisible({ timeout: 15000 })
    const linkedCard = browser.locator('.v-card').filter({ hasText: demo.mapName })
    await expect(linkedCard.getByText('Game 1', { exact: true })).toBeVisible()
    await expect(
      linkedCard.getByText(
        `${demo.team1Name} ${demo.team1Score} : ${demo.team2Score} ${demo.team2Name}`,
      ),
    ).toBeVisible()

    // ...and it is gone from the suggestion list, which now shows its empty state.
    await expect(browser.getByRole('button', { name: 'Link demo', exact: true })).toHaveCount(0)
    await expect(
      browser.getByText('No demo suggestions found for this match.'),
    ).toBeVisible()

    // The linked demo reaches the score form: the result panel names it and
    // pre-fills game 1 from its metadata.
    await expect(page.getByText(`Demo: ${demo.mapName}`)).toBeVisible()
    await expect(page.getByText('Auto-filled', { exact: true })).toBeVisible()

    // Backend cross-check: one demo_match_link and one evidence row.
    const linked = await listLinkedDemosViaApi(scenario.p1.token, scenario.matchId)
    expect(linked).toHaveLength(1)
    expect(linked[0].link.demo_id).toBe(demo.id)
    expect(linked[0].link.game_number).toBe(1)
    expect(linked[0].link.link_type).toBe('evidence')

    // The evidence row exists — but only `include_discovered=true` can see it
    // (see the fixture's note on `listEvidenceViaApi`). Nothing asserts the
    // default listing here: it hides this row, and pinning that would certify
    // the defect rather than report it.
    const evidence = await listEvidenceViaApi(scenario.p1.token, scenario.matchId)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].evidence_type).toBe('demo')

    // And the demo is no longer offered: discovery excludes demos already
    // linked to this match.
    const stillDiscovered = await discoverViaApi(scenario.p1.token, scenario.matchId)
    expect(stillDiscovered).toHaveLength(0)
  })

  test('a catalogued demo without a participant Steam ID is not suggested', async ({ page }) => {
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)

    // A demo that is in the right game and inside the time window, but was
    // played by strangers. Discovery must reject it on the Steam-ID join —
    // the positive control for the empty state (otherwise "no suggestions"
    // would pass merely because the catalog is empty).
    const strangersDemo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: ['76561198000000111', '76561198000000222'],
      matchDate: scenario.referenceTime,
    })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    await expect(browser.getByText('Discover Demos for This Match')).toBeVisible({ timeout: 15000 })
    await expect(
      browser.getByText('No demo suggestions found for this match. Try searching the demo catalog below.'),
    ).toBeVisible({ timeout: 15000 })
    await expect(browser.getByText('Suggested Demos')).toHaveCount(0)
    await expect(browser.getByRole('button', { name: 'Link demo', exact: true })).toHaveCount(0)

    // The demo exists and is `ready` — it is the join that excluded it.
    const catalogued = await browseDemosViaApi(adminToken, strangersDemo.mapName)
    expect(catalogued.map((d) => d.id)).toContain(strangersDemo.id)
    expect(await discoverViaApi(scenario.p1.token, scenario.matchId)).toHaveLength(0)
  })

  test('a link that the backend rejects surfaces the error and links nothing', async ({ page }) => {
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: [scenario.p1SteamId, scenario.p2SteamId],
      matchDate: scenario.referenceTime,
    })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    const linkButton = browser.getByRole('button', { name: 'Link demo', exact: true })
    await expect(linkButton).toHaveCount(1, { timeout: 15000 })

    // Retire the demo behind the browser's back — the catalog row a stale
    // suggestion points at can be deleted by an admin at any moment. The link
    // then hits `link_discovered_evidence`'s `get_demo` (404, real backend
    // error), which is what the panel's error alert exists to show.
    await deleteDemoViaApi(adminToken, demo.id)
    await linkButton.click()

    await expect(browser.getByText(`Demo not found: ${demo.id}`)).toBeVisible({ timeout: 15000 })

    // The failure is reported as a failure: nothing linked, nothing recorded,
    // and the suggestion is still on offer rather than silently consumed.
    await expect(browser.getByText('Linked Demos')).toHaveCount(0)
    await expect(linkButton).toHaveCount(1)
    expect(await listLinkedDemosViaApi(scenario.p1.token, scenario.matchId)).toHaveLength(0)
    expect(await listEvidenceViaApi(scenario.p1.token, scenario.matchId)).toHaveLength(0)
  })

  test('participant searches the demo catalog by map name', async ({ page }) => {
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      // Strangers again: this test is about the catalog search, which is not
      // scoped to the match, so the demo must not also arrive as a suggestion.
      steamIds: ['76561198000000333', '76561198000000444'],
      matchDate: scenario.referenceTime,
    })
    const missingMapName = uniqueMapName()

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    await expect(browser.getByText('Browse Demo Catalog')).toBeVisible({ timeout: 15000 })

    // A map nothing was played on: the search runs and reports emptiness.
    await browser.getByRole('textbox', { name: 'Map name' }).fill(missingMapName)
    await browser.getByRole('button', { name: 'Search' }).click()
    await expect(browser.getByText('No demos found matching your search.')).toBeVisible({
      timeout: 15000,
    })
    expect(await browseDemosViaApi(adminToken, missingMapName)).toHaveLength(0)

    // The real map: the catalogued demo comes back with its metadata.
    await browser.getByRole('textbox', { name: 'Map name' }).fill(demo.mapName)
    await browser.getByRole('button', { name: 'Search' }).click()

    const resultCard = browser.locator('.v-card').filter({ hasText: demo.file_name })
    await expect(resultCard).toHaveCount(1, { timeout: 15000 })
    await expect(resultCard.getByText(demo.mapName, { exact: true })).toBeVisible()
    await expect(
      resultCard.getByText(
        `${demo.team1Name} ${demo.team1Score} : ${demo.team2Score} ${demo.team2Name}`,
      ),
    ).toBeVisible()
    // `catalogDemoViaApi` seeds 12_345_678 bytes → formatFileSize → "11.8 MB".
    await expect(resultCard.getByText('11.8 MB', { exact: true })).toBeVisible()
    await expect(browser.getByText('No demos found matching your search.')).toHaveCount(0)

    // Backend cross-check: the search is the API filter, not client-side.
    const viaApi = await browseDemosViaApi(scenario.p1.token, demo.mapName)
    expect(viaApi.map((d) => d.id)).toEqual([demo.id])
  })

  /**
   * P-110. The Browse-catalog "Link demo" button, driven end to end for the
   * first time. The catalogued demo here has no `.stats.json` anywhere — no
   * stats service runs in this stack at all — which is exactly the case the
   * old handler refused: it resolved `demo_name` against the stats service and
   * 404'd, despite the request carrying the catalog `demo_id` it then used to
   * build the link.
   */
  test('participant links a demo from the browse catalog, not just from suggestions', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await createDemoBrowserMatch(adminToken)
    // Strangers' Steam IDs: this demo must reach the panel through the catalog
    // search, not through discovery, or the test would be driving the other
    // button. With no suggestions, the only "Link demo" on the page is the
    // browse one.
    const demo = await seedCatalogDemo(adminToken, {
      gameId: scenario.gameId,
      steamIds: ['76561198000000555', '76561198000000666'],
      matchDate: scenario.referenceTime,
    })

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await expect(page.getByText('Submit Match Result')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Browse Demos' }).click()

    const browser = page.locator('.demo-browser')
    await expect(
      browser.getByText('No demo suggestions found for this match. Try searching the demo catalog below.'),
    ).toBeVisible({ timeout: 15000 })

    await browser.getByRole('textbox', { name: 'Map name' }).fill(demo.mapName)
    await browser.getByRole('button', { name: 'Search' }).click()

    const resultCard = browser.locator('.v-card').filter({ hasText: demo.file_name })
    await expect(resultCard).toHaveCount(1, { timeout: 15000 })

    const linkButton = browser.getByRole('button', { name: 'Link demo', exact: true })
    await expect(linkButton).toHaveCount(1)
    await linkButton.click()

    // The catalog row moves into Linked Demos with its parsed metadata, which
    // only a real `demo_match_link` read back from the server can supply — the
    // store used to fabricate this entry client-side.
    await expect(browser.getByText('Linked Demos')).toBeVisible({ timeout: 15000 })
    const linkedCard = browser.locator('.v-card').filter({ hasText: demo.mapName })
    await expect(linkedCard.getByText('Game 1', { exact: true })).toBeVisible()
    await expect(
      linkedCard.getByText(
        `${demo.team1Name} ${demo.team1Score} : ${demo.team2Score} ${demo.team2Name}`,
      ),
    ).toBeVisible()
    // ...and it is consumed from the browse results, so it cannot be linked twice.
    await expect(browser.getByRole('button', { name: 'Link demo', exact: true })).toHaveCount(0)

    // Backend cross-check: a real link row, and an evidence row the DEFAULT
    // listing can see (P-109 on this path).
    const linked = await listLinkedDemosViaApi(scenario.p1.token, scenario.matchId)
    expect(linked).toHaveLength(1)
    expect(linked[0].link.demo_id).toBe(demo.id)
    expect(linked[0].link.game_number).toBe(1)
    expect(linked[0].link.link_type).toBe('evidence')

    const evidence = await listEvidenceViaApi(scenario.p1.token, scenario.matchId)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].name).toBe(demo.file_name)
    expect(evidence[0].evidence_type).toBe('demo')
  })
})

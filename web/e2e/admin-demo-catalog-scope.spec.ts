import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  catalogDemoViaApi,
  demoStatusCountsViaApi,
  getDemoGame,
  getOtherDemoGame,
  uniqueDemoFileName,
} from './fixtures/demo-admin.fixture'

/**
 * P-144 — the demo-catalog counts were global while the table under them was
 * not.
 *
 * `AdminDemosPage` renders five status cards above a table that has its own Game
 * filter. The cards came from `GET /v1/admin/demos/stats`, whose query was
 * `SELECT status, COUNT(*) FROM demos GROUP BY status` — no game predicate, and
 * no parameter to supply one. So a CS2 admin who filtered the table to CS2 read
 * CS2 rows beneath totals summed over every game in the catalog, and nothing on
 * the page said the two were describing different populations.
 *
 * The same un-scoped count also fed `GET /v1/admin/pipeline/overview`, where it
 * was worse: the tracking-health and discovered-match stages on that response
 * ARE filtered by `game`, so selecting a game narrowed two of three stages and
 * silently left the third global — in the one view whose purpose is localising
 * which stage ingestion stopped at. That half is covered by
 * `api/crates/portal-api/tests/integration/demos.rs`
 * (`test_pipeline_overview_demo_counts_are_scoped_to_the_selected_game`), since
 * `AdminPipelinePage` reads it through the same store action.
 *
 * Parallel-safe by construction: other workers catalog demos only against the
 * primary game, so the second game's demos are this spec's alone and its scoped
 * count can be asserted exactly. Everything asserted about the primary game is a
 * strict inequality, which concurrent seeding cannot break.
 */

test.describe('Admin demo management — catalog counts', () => {
  test('the status cards follow the Game filter instead of totalling every game', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const primary = await getDemoGame()
    const other = await getOtherDemoGame()

    // Demos in BOTH games. With one game populated, a global count and a scoped
    // count are the same number and the defect is invisible — which is exactly
    // how it survived.
    const otherDemoCount = 3
    for (let i = 0; i < otherDemoCount; i++) {
      await catalogDemoViaApi(adminToken, other.id, uniqueDemoFileName('e2e-p144-other'))
    }
    await catalogDemoViaApi(adminToken, primary.id, uniqueDemoFileName('e2e-p144-primary'))
    await catalogDemoViaApi(adminToken, primary.id, uniqueDemoFileName('e2e-p144-primary'))

    await loginAsAdmin(page)
    await page.goto('/admin/demos')

    const scope = page.locator('[data-testid="demo-counts-scope"]')
    const pendingCard = page.locator('[data-testid="demo-count-pending"]')

    // ---- Unfiltered: every game, and the page says so --------------------
    await expect(scope).toHaveText('Demo catalog — all games', { timeout: 20000 })
    await expect(pendingCard).not.toHaveText('', { timeout: 20000 })
    const allPending = Number(await pendingCard.innerText())
    expect(allPending).toBeGreaterThanOrEqual(otherDemoCount + 2)

    // ---- Filter to the second game --------------------------------------
    await page.locator('.v-select').filter({ hasText: 'Game' }).click()
    // Substring match, deliberately: `admin-games-config.spec.ts` renames this
    // game by appending a suffix, and Playwright's accessible-name matching is
    // substring-based, so the prefix keeps matching either way.
    const option = page.getByRole('option', { name: 'Age of Empires II' })
    await expect(option).toBeVisible({ timeout: 20000 })
    const [statsRequest] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes('/v1/admin/demos/stats') && r.url().includes('game_id='),
        { timeout: 20000 },
      ),
      option.click(),
    ])
    expect(
      statsRequest.url(),
      'the count request must carry the selected game — a request without it cannot be scoped',
    ).toContain(`game_id=${other.id}`)

    // The cards now name what they are counting. Before the fix they carried
    // the same five numbers under every filter, with no caption at all.
    await expect(scope).toHaveText(`Demo catalog — ${other.displayName}`, { timeout: 20000 })

    // Exact, because nothing else in the suite catalogs demos for this game.
    const otherCounts = await demoStatusCountsViaApi(adminToken, other.id)
    await expect(pendingCard).toHaveText(String(otherCounts.pending), { timeout: 20000 })

    // The load-bearing assertion. Pre-fix the scoped card showed the global
    // total, so these two were equal; the primary game's demos must not be in
    // this number.
    const scopedPending = Number(await pendingCard.innerText())
    expect(
      scopedPending,
      'a game-scoped count that equals the all-games count is not scoped',
    ).toBeLessThan(allPending)

    // ---- Clearing the filter widens the cards back ------------------------
    // Compared against the SCOPED number, not the earlier all-games one: other
    // workers catalog and delete demos in the primary game throughout, so the
    // all-games total is not stable across the test. What is stable is that this
    // spec's two primary-game demos exist and are excluded from the scoped
    // count, so widening must strictly increase it.
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(scope).toHaveText('Demo catalog — all games', { timeout: 20000 })
    await expect
      .poll(async () => Number(await pendingCard.innerText()), { timeout: 20000 })
      .toBeGreaterThan(scopedPending)
  })
})

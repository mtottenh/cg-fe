import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import {
  MUTABLE_GAME_NAME,
  MUTABLE_GAME_SHORT_NAME,
  MUTABLE_GAME_SLUG,
  MUTABLE_GAME_SORT_ORDER,
  MUTABLE_GAME_TEAM_SIZE,
  MUTABLE_GAME_TIER_BASELINE,
  PLUGIN_GAME_NAME,
  PLUGIN_GAME_SLUG,
  getGameDetailViaApi,
  getGameMapsViaApi,
  getGameRankTiersViaApi,
  listGamesViaApi,
  restoreMutableGame,
  setRankTiersViaApi,
} from './fixtures/game-config.fixture'

/**
 * The admin game-configuration surface (`/admin/games`), driven through the UI.
 *
 * COVERED — each handler is reachable from a control, and each assertion pairs a UI
 * check with an API cross-check:
 *
 *   - `POST /v1/games/{game_id}/disable`      AdminGamesPage.handleDisableGame
 *   - `POST /v1/games/{game_id}/enable`       AdminGamesPage.handleEnableGame
 *   - `GET  /v1/games?include_inactive=true`  AdminGamesPage list (P-88)
 *   - `PATCH /v1/games/{game_id}`             GameEditModal.save, incl. sort order (P-90)
 *   - `PUT  /v1/games/{game_id}/rank-tiers`   GameConfigDialog rank-tier editor (P-92)
 *   - `PATCH /v1/games/{game_id}/team-size`   GameConfigDialog team-size editor (P-92)
 *   - `GameConfigDialog` load path            GET maps · rank-tiers · game detail
 *
 * ## What these tests used to be unable to say, and now can
 *
 * **P-88 — a disabled game could never be re-enabled.** `AdminGamesPage` listed from
 * `GET /v1/games`, i.e. `GameRepository::list_active()` (`WHERE status = 'active'`),
 * and the Enable button exists only *inside* a row. Disabling a game therefore deleted
 * the control that undoes the disable: the row left the table on the next fetch and the
 * game was unreachable from the portal for good. The old disable→enable test passed
 * only because `stores/games.ts` patched the row in place client-side, so the button
 * survived until something refetched — press Refresh, or reload, and it was gone.
 * Fixed: `GET /v1/games` takes `include_inactive` (admin-gated), the admin table reads
 * the unfiltered catalog through `games.fetchAllGames`, and the test below now
 * **reloads the page** between the disable and the re-enable, which is precisely the
 * step the old one could not survive.
 *
 * **P-90 — Sort Order was fabricated, and 0 was unsettable.** `GameSummaryResponse`
 * carried no `sort_order`, so `GameEditModal` seeded the field to a hardcoded `0` —
 * a number that was never the game's own (cs2 is 1, aoe4 is 2) — and then only sent
 * the field when it was non-zero, so no game's sort order could ever be set to 0.
 * Fixed: the DTO returns `sort_order`, the modal seeds from it, and "changed" is the
 * send condition.
 *
 * **P-92 — rank tiers and team size had no editing surface at all.**
 * `games.setRankTiers` and `games.updateTeamSize` had zero component consumers; the
 * Rank Tiers tab was a read-only `v-list` and the Team Size tab was a `readonly` field
 * captioned "Team size is managed via the game plugin configuration" — pointing at a
 * plugin-config surface that does not exist anywhere in the app. Both tabs are editors
 * now, over those two existing store actions.
 *
 * Two chip assertions below were also stale: P-91's fix (`b992f2a`) routed the status
 * chip through `gameStatusMap`, so it renders "Active"/"Disabled" rather than the raw
 * `active`/`maintenance`, and this spec was not updated with it. Corrected under ground
 * rule 9 — the specification changed, and rendering a human label is the entire point
 * of that fix. The raw values are still asserted, against the API, where they belong.
 *
 * Row action buttons are located by **accessible name** now that P-89 is fixed
 * (`b137146`): the four `aria-label`s used to be rotated one position off their
 * handlers, so "Enable game" disabled the game and the old tests had to fall back to
 * `title`. Locating by the accessible name makes any recurrence a test failure.
 */

/**
 * Serial, file-wide. There is one `aoe4` row and no way to make a second one, so
 * `fullyParallel: true` runs these tests against the *same* record: the first run of
 * this spec had the disable/enable test's restore hook reset `display_name` while the
 * edit-modal test was still asserting its rename, and the validation test read the
 * rename as its baseline. Both failures were the harness, not the app. Precedent:
 * `team-roster.spec.ts:33`.
 */
test.describe.configure({ mode: 'serial' })

test.describe('Admin games — enable/disable', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test.afterEach(async () => {
    // Games are global config with no create endpoint (see the fixture header):
    // put the shared row back whatever the test did to it.
    await restoreMutableGame(adminToken)
  })

  test('admin disables a game and re-enables it from the games table', async ({ page }) => {
    test.setTimeout(60_000)
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('active')

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const row = table.getByRole('row').filter({ hasText: MUTABLE_GAME_NAME })
    await expect(row.locator('.v-chip')).toHaveText('Active')

    // ---- Disable, through the UI -------------------------------------------
    await row.getByRole('button', { name: 'Disable game', exact: true }).click()

    await expect(page.getByText('Game disabled')).toBeVisible()
    // UI assert: `disable` writes 'maintenance', which `gameStatusMap` labels "Disabled".
    await expect(row.locator('.v-chip')).toHaveText('Disabled')
    // API cross-check on the raw value. `GET /v1/games/{id}` is not status-filtered,
    // so it can still read the row the *public* list endpoint has just dropped.
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('maintenance')

    // ---- Re-enable, through the UI -----------------------------------------
    await row.getByRole('button', { name: 'Enable game', exact: true }).click()

    await expect(page.getByText('Game enabled')).toBeVisible()
    await expect(row.locator('.v-chip')).toHaveText('Active')
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('active')
  })

  /**
   * P-88. The assertion that matters is the one after `page.reload()`: a full round
   * trip to the API, with no client-side patch left to prop the row up. That is the
   * step the pre-fix UI could not survive, and it is the difference between "a game
   * can be disabled" and "a game can be disabled *and then un-disabled*".
   *
   * It also pins the half of the fix that is easy to get wrong in the other
   * direction — the *public* catalog must still hide the disabled game.
   */
  test('a disabled game survives a reload in the admin table, and is re-enabled there', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('active')

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const row = () => table.getByRole('row').filter({ hasText: MUTABLE_GAME_NAME })
    await expect(row().locator('.v-chip')).toHaveText('Active')

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/${MUTABLE_GAME_SLUG}/disable`) || r.url().includes('/disable'),
      ),
      row().getByRole('button', { name: 'Disable game', exact: true }).click(),
    ])
    await expect(page.getByText('Game disabled')).toBeVisible()

    // The public catalog — `GET /v1/games` with no parameters — must NOT list it.
    // Widening the admin list must not have widened everyone else's.
    const publicCatalog = await listGamesViaApi()
    expect(publicCatalog.some((g) => g.slug === MUTABLE_GAME_SLUG)).toBe(false)

    // ---- The reload the old UI could not survive ----------------------------
    await page.reload()
    await expect(table).toBeVisible({ timeout: 10_000 })
    await expect(row()).toBeVisible()
    await expect(row().locator('.v-chip')).toHaveText('Disabled')

    // ...and the control that undoes it is here, and it works.
    const enable = row().getByRole('button', { name: 'Enable game', exact: true })
    await expect(enable).toBeVisible()
    await enable.click()

    await expect(page.getByText('Game enabled')).toBeVisible()
    await expect(row().locator('.v-chip')).toHaveText('Active')
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('active')
    expect((await listGamesViaApi()).some((g) => g.slug === MUTABLE_GAME_SLUG)).toBe(true)
  })
})

test.describe('Admin games — GameEditModal', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test.afterEach(async () => {
    await restoreMutableGame(adminToken)
  })

  test('admin edits a game display name, short name and featured flag', async ({ page }) => {
    test.setTimeout(60_000)
    const before = await getGameDetailViaApi(MUTABLE_GAME_SLUG)
    expect(before.display_name).toBe(MUTABLE_GAME_NAME)
    expect(before.is_featured).toBe(true)

    // The new name *extends* the seeded one. `admin-management.spec.ts` asserts
    // `getByText('Age of Empires IV')` is visible, and Playwright matches on
    // substring, so a concurrent worker still sees what it expects while this
    // rename is in flight. See the fixture header.
    const newName = `${MUTABLE_GAME_NAME} ${uniqueId()}`
    const newShortName = 'AoE4-E2E'

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const row = table.getByRole('row').filter({ hasText: MUTABLE_GAME_NAME })
    // Featured is rendered as a filled star; the un-featured state is the outline.
    await expect(row.locator('.mdi-star')).toBeVisible()

    await row.getByRole('button', { name: 'Edit game', exact: true }).click()

    const modal = page.getByRole('dialog').filter({ hasText: 'Edit Game:' })
    await expect(modal).toBeVisible()
    await expect(modal.getByLabel('Display Name')).toHaveValue(MUTABLE_GAME_NAME)
    await expect(modal.getByLabel('Short Name')).toHaveValue(MUTABLE_GAME_SHORT_NAME)

    await modal.getByLabel('Display Name').fill(newName)
    await modal.getByLabel('Short Name').fill(newShortName)
    // `is_featured: true -> false`; the switch label is the human string.
    await modal.getByLabel('Featured on homepage').uncheck()
    await modal.getByRole('button', { name: 'Save Changes' }).click()

    // UI assert: the modal closes, the page confirms, and the table row re-renders
    // from the refetch `onGameSaved` triggers.
    await expect(modal).toBeHidden()
    await expect(page.getByText('Game updated')).toBeVisible()
    const renamedRow = table.getByRole('row').filter({ hasText: newName })
    await expect(renamedRow).toBeVisible()
    await expect(renamedRow.locator('.mdi-star-outline')).toBeVisible()
    await expect(renamedRow.locator('.mdi-star')).toHaveCount(0)

    // API cross-check: all three fields were actually persisted.
    const after = await getGameDetailViaApi(MUTABLE_GAME_SLUG)
    expect(after.display_name).toBe(newName)
    expect(after.short_name).toBe(newShortName)
    expect(after.is_featured).toBe(false)
    // ...and nothing else moved. The modal sends only changed fields, and the
    // pre-P-90 version smuggled a fabricated sort order into every save it made.
    expect(after.sort_order).toBe(MUTABLE_GAME_SORT_ORDER)

    // ...and it survives a reload, i.e. the table was not merely patched locally.
    await page.reload()
    await expect(table.getByRole('row').filter({ hasText: newName })).toBeVisible()
  })

  test('the edit modal blocks a save with an empty display name', async ({ page }) => {
    test.setTimeout(60_000)

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    await table
      .getByRole('row')
      .filter({ hasText: MUTABLE_GAME_NAME })
      .getByRole('button', { name: 'Edit game', exact: true })
      .click()

    const modal = page.getByRole('dialog').filter({ hasText: 'Edit Game:' })
    await expect(modal).toBeVisible()
    const displayName = modal.getByLabel('Display Name')
    const save = modal.getByRole('button', { name: 'Save Changes' })

    // A real edit first, so the form has validated and Save is genuinely live —
    // otherwise "disabled" below would be indistinguishable from Vuetify's
    // not-yet-validated initial state.
    await displayName.fill(`${MUTABLE_GAME_NAME} Draft`)
    await expect(save).toBeEnabled()

    // Now clear it. `rules.required` (composables/useFormRules.ts:3-4) rejects ''.
    await displayName.fill('')
    await expect(modal.getByText('Required')).toBeVisible()
    await expect(save).toBeDisabled()

    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()

    // API cross-check: nothing was written — neither the draft nor the empty name.
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).display_name).toBe(MUTABLE_GAME_NAME)
  })

  /**
   * P-90, both halves in one flow: the field must show the game's *actual* sort
   * order (it showed a hardcoded 0 for every game), and 0 must be a value the
   * admin can choose (the "only send when non-zero" guard made it unreachable).
   *
   * The reopen at the end matters: seeding from a real value is what makes 0
   * distinguishable from the old fabrication, so the test has to see the modal
   * report a stored 0 rather than merely accept one.
   */
  test('the edit modal shows the real sort order, and can set it to 0', async ({ page }) => {
    test.setTimeout(60_000)
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).sort_order).toBe(MUTABLE_GAME_SORT_ORDER)

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    await table
      .getByRole('row')
      .filter({ hasText: MUTABLE_GAME_NAME })
      .getByRole('button', { name: 'Edit game', exact: true })
      .click()

    const modal = page.getByRole('dialog').filter({ hasText: 'Edit Game:' })
    await expect(modal).toBeVisible()
    // The load-bearing assertion: pre-fix this read '0' for cs2 and aoe4 alike.
    await expect(modal.getByLabel('Sort Order')).toHaveValue(String(MUTABLE_GAME_SORT_ORDER))

    await modal.getByLabel('Sort Order').fill('0')
    await modal.getByRole('button', { name: 'Save Changes' }).click()

    await expect(modal).toBeHidden()
    await expect(page.getByText('Game updated')).toBeVisible()

    // API cross-check: 0 reached storage, rather than being dropped by the guard.
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).sort_order).toBe(0)

    // Reopen: the modal reports the stored 0 rather than a fabricated one.
    await table
      .getByRole('row')
      .filter({ hasText: MUTABLE_GAME_NAME })
      .getByRole('button', { name: 'Edit game', exact: true })
      .click()
    await expect(modal).toBeVisible()
    await expect(modal.getByLabel('Sort Order')).toHaveValue('0')
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()
  })
})

test.describe('Admin games — GameConfigDialog', () => {
  test('the config dialog shows the game map catalog, default pool, rank tiers and team size', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    // Read-only throughout: `cs2` is the game whose plugin supplies a map catalog and
    // rank tiers, and this test never writes, so it is safe on the shared row.
    const detail = await getGameDetailViaApi(PLUGIN_GAME_SLUG)
    const maps = await getGameMapsViaApi(PLUGIN_GAME_SLUG)
    const tiers = await getGameRankTiersViaApi(PLUGIN_GAME_SLUG)
    // Preconditions: the dialog has something to render on all three tabs.
    expect(maps.length).toBeGreaterThan(0)
    expect(tiers.length).toBeGreaterThan(0)

    await loginAsAdmin(page)
    await page.goto('/admin/games')

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    await table
      .getByRole('row')
      .filter({ hasText: PLUGIN_GAME_NAME })
      .getByRole('button', { name: 'Configure game', exact: true })
      .click()

    const dialog = page.getByRole('dialog').filter({ hasText: `Configure: ${PLUGIN_GAME_NAME}` })
    await expect(dialog).toBeVisible()

    // ---- Maps tab (the default) --------------------------------------------
    // Every catalogued map gets a card; the picker header counts pool vs catalog.
    for (const map of maps) {
      await expect(dialog.getByText(map.display_name, { exact: true }).first()).toBeVisible()
    }
    await expect(dialog.getByText('Default Competitive Pool')).toBeVisible()
    await expect(
      dialog.locator('.v-chip').filter({ hasText: 'maps' }),
    ).toHaveText(`${detail.map_pool.length} / ${maps.length} maps`)

    // ---- Rank Tiers tab ----------------------------------------------------
    await dialog.getByRole('tab', { name: 'Rank Tiers' }).click()
    const tierRows = dialog.locator('[data-testid^="rank-tier-row-"]')
    await expect(tierRows).toHaveCount(tiers.length)
    // Exact set, in order, seeded from the API's own values.
    for (const [index, tier] of tiers.entries()) {
      await expect(tierRows.nth(index).getByLabel('Tier Name')).toHaveValue(tier.display_name)
      await expect(tierRows.nth(index).getByLabel('Tier ID')).toHaveValue(tier.id)
    }
    await expect(tierRows.nth(0).getByLabel('Min Rating')).toHaveValue(String(tiers[0].min_rating))
    // An untouched editor offers no write — the Save is gated on being dirty.
    await expect(dialog.getByRole('button', { name: 'Save Rank Tiers' })).toBeDisabled()

    // ---- Team Size tab -----------------------------------------------------
    await dialog.getByRole('tab', { name: 'Team Size' }).click()
    // `exact` matters: the Maps tab stays mounted behind the window and carries a
    // "Default Competitive Pool" heading.
    await expect(dialog.getByLabel('Minimum')).toHaveValue(String(detail.team_size.min))
    await expect(dialog.getByLabel('Default', { exact: true })).toHaveValue(
      String(detail.team_size.default),
    )
    await expect(dialog.getByLabel('Maximum')).toHaveValue(String(detail.team_size.max))
    await expect(dialog.getByRole('button', { name: 'Save Team Size' })).toBeDisabled()
  })

  /**
   * P-92, rank tiers. `games.setRankTiers` worked and had no caller: a game's rank
   * tiers — which gate league entry and feed seeding — could only be changed with SQL.
   *
   * The test renames an existing tier *and* adds a new one in a single save, because
   * an editor that can only append is a different (and much easier) feature than one
   * that can correct what is already there. The added tier is left with a blank Max
   * Rating, which must reach the API as `null` ("no upper limit") rather than 0.
   */
  test('admin renames a rank tier and adds another through the config dialog', async ({ page }) => {
    test.setTimeout(60_000)
    const adminToken = await getAdminToken()
    // Establish the baseline explicitly — `aoe4` ships with no tiers, and the API
    // cannot express "none", so this spec owns that state. See the fixture header.
    await setRankTiersViaApi(adminToken, MUTABLE_GAME_SLUG, MUTABLE_GAME_TIER_BASELINE)

    try {
      await loginAsAdmin(page)
      await page.goto('/admin/games')

      const table = page.getByRole('table')
      await expect(table).toBeVisible({ timeout: 10_000 })
      await table
        .getByRole('row')
        .filter({ hasText: MUTABLE_GAME_NAME })
        .getByRole('button', { name: 'Configure game', exact: true })
        .click()

      const dialog = page.getByRole('dialog').filter({ hasText: `Configure: ${MUTABLE_GAME_NAME}` })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('tab', { name: 'Rank Tiers' }).click()

      const rows = dialog.locator('[data-testid^="rank-tier-row-"]')
      await expect(rows).toHaveCount(MUTABLE_GAME_TIER_BASELINE.length)
      await expect(rows.nth(0).getByLabel('Tier Name')).toHaveValue('E2E Bronze')

      const save = dialog.getByRole('button', { name: 'Save Rank Tiers' })
      await expect(save).toBeDisabled()

      // Correct an existing tier...
      await rows.nth(0).getByLabel('Tier Name').fill('E2E Bronze Renamed')
      // ...and append a new one.
      await dialog.getByRole('button', { name: 'Add Tier' }).click()
      await expect(rows).toHaveCount(3)
      const added = rows.nth(2)
      await added.getByLabel('Tier ID').fill('e2e_gold')
      await added.getByLabel('Tier Name').fill('E2E Gold')
      await added.getByLabel('Min Rating').fill('2000')
      await added.getByLabel('Order').fill('3')
      // Max Rating deliberately left blank — "no upper limit".

      await expect(save).toBeEnabled()
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/rank-tiers') && r.request().method() === 'PUT',
        ),
        save.click(),
      ])
      await expect(page.getByText('Rank tiers saved')).toBeVisible()
      // Saved state is not dirty state.
      await expect(save).toBeDisabled()

      // ---- API cross-check ---------------------------------------------------
      const after = await getGameRankTiersViaApi(MUTABLE_GAME_SLUG)
      expect(after.map((t) => t.id)).toEqual(['e2e_bronze', 'e2e_silver', 'e2e_gold'])
      expect(after[0].display_name).toBe('E2E Bronze Renamed')
      expect(after[2].display_name).toBe('E2E Gold')
      expect(after[2].min_rating).toBe(2000)
      // Blank means unbounded, not zero.
      expect(after[2].max_rating).toBeNull()

      // ---- ...and it is stored, not merely held in the component -------------
      await page.reload()
      await expect(table).toBeVisible({ timeout: 10_000 })
      await table
        .getByRole('row')
        .filter({ hasText: MUTABLE_GAME_NAME })
        .getByRole('button', { name: 'Configure game', exact: true })
        .click()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('tab', { name: 'Rank Tiers' }).click()
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0).getByLabel('Tier Name')).toHaveValue('E2E Bronze Renamed')
      await expect(rows.nth(2).getByLabel('Max Rating')).toHaveValue('')
    } finally {
      await setRankTiersViaApi(adminToken, MUTABLE_GAME_SLUG, MUTABLE_GAME_TIER_BASELINE)
    }
  })

  /**
   * P-92, team size. The tab used to be a `readonly` field captioned "Team size is
   * managed via the game plugin configuration" — a caption pointing at a surface that
   * does not exist, while `PATCH /v1/games/{id}/team-size` sat live and unreachable.
   *
   * Also pins the client-side consistency gate (min ≤ default ≤ max), which mirrors the
   * server's own check so the operator gets the reason before the round trip.
   */
  test('admin changes a game team size through the config dialog', async ({ page }) => {
    test.setTimeout(60_000)
    const adminToken = await getAdminToken()
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).team_size).toEqual(MUTABLE_GAME_TEAM_SIZE)

    try {
      await loginAsAdmin(page)
      await page.goto('/admin/games')

      const table = page.getByRole('table')
      await expect(table).toBeVisible({ timeout: 10_000 })
      const row = table.getByRole('row').filter({ hasText: MUTABLE_GAME_NAME })
      // Column order is icon · ID · Name · Short Name · Team Size · Status ·
      // Featured · Actions (`AdminGamesPage.vue` headers).
      const teamSizeCell = row.getByRole('cell').nth(4)
      await expect(teamSizeCell).toHaveText(String(MUTABLE_GAME_TEAM_SIZE.default))

      await row.getByRole('button', { name: 'Configure game', exact: true }).click()

      const dialog = page.getByRole('dialog').filter({ hasText: `Configure: ${MUTABLE_GAME_NAME}` })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('tab', { name: 'Team Size' }).click()

      const min = dialog.getByLabel('Minimum')
      const def = dialog.getByLabel('Default', { exact: true })
      const max = dialog.getByLabel('Maximum')
      await expect(min).toHaveValue(String(MUTABLE_GAME_TEAM_SIZE.min))
      await expect(def).toHaveValue(String(MUTABLE_GAME_TEAM_SIZE.default))
      await expect(max).toHaveValue(String(MUTABLE_GAME_TEAM_SIZE.max))

      const save = dialog.getByRole('button', { name: 'Save Team Size' })
      await expect(save).toBeDisabled()

      // ---- The gate refuses an inconsistent triple ---------------------------
      await min.fill('4')
      await def.fill('3')
      await expect(dialog.getByText('Minimum (4) must be at most the default (3).')).toBeVisible()
      await expect(save).toBeDisabled()

      // ---- A legal one saves --------------------------------------------------
      await min.fill('2')
      await def.fill('3')
      await max.fill('4')
      await expect(save).toBeEnabled()
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/team-size') && r.request().method() === 'PATCH',
        ),
        save.click(),
      ])
      await expect(page.getByText('Team size saved')).toBeVisible()

      // API cross-check.
      expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).team_size).toEqual({
        min: 2,
        default: 3,
        max: 4,
      })

      // UI cross-check: the table renders `team_size_default`, so the dialog has to
      // tell the page its row is stale. A snackbar over an unchanged table would be
      // the "reports success, does nothing" shape this campaign keeps finding.
      await expect(teamSizeCell).toHaveText('3')
    } finally {
      await restoreMutableGame(adminToken)
    }
  })
})

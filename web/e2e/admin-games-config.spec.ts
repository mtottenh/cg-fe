import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import {
  MUTABLE_GAME_NAME,
  MUTABLE_GAME_SHORT_NAME,
  MUTABLE_GAME_SLUG,
  PLUGIN_GAME_NAME,
  PLUGIN_GAME_SLUG,
  getGameDetailViaApi,
  getGameMapsViaApi,
  getGameRankTiersViaApi,
  restoreMutableGame,
} from './fixtures/game-config.fixture'

/**
 * The admin game-configuration surface (`/admin/games`), driven through the UI.
 * Previously zero coverage beyond `admin-management.spec.ts`'s read-only Games section.
 *
 * COVERED — the handler is reachable from a control and is asserted on the UI and the API:
 *
 *   - `POST /v1/games/{game_id}/disable`   AdminGamesPage.handleDisableGame
 *   - `POST /v1/games/{game_id}/enable`    AdminGamesPage.handleEnableGame
 *   - `PATCH /v1/games/{game_id}`          GameEditModal.save
 *   - `GameConfigDialog` load path         GET maps · rank-tiers · game detail
 *
 * NOT COVERED, and that is the finding rather than a gap in this spec (COVERAGE-PLAN
 * §4-F: "when a handler cannot be driven, that is the finding"). Three separate causes:
 *
 * 1. **Every game-config write 404s when called from the UI.** `games.id` became a UUID
 *    in `migrations/0024_restructure_games_uuid.sql`; `slug` ('cs2'/'aoe4') is the human
 *    key. `GameSummaryResponse.id` is the UUID and it is what `GameConfigDialog` passes
 *    (`GameConfigDialog.vue:323,330,359,375` → `stores/games.ts:106,116,126,136,155,167`).
 *    `update_game` / `enable_game` / `disable_game` resolve it with `resolve_game_slug`
 *    (`api/crates/portal-api/src/handlers/games.rs:339,551,609`) — which is why the three
 *    tests below pass. The six config handlers do not: they read the game with
 *    `find_by_id_or_slug` and then write with `game_repo.update(&game_id, ..)`
 *    (`handlers/games.rs:508` set_map_pool, `:778` add_map, `:851` update_map,
 *    `:902` remove_map, `:989` set_rank_tiers, `:1055` update_team_size), and `update` is
 *    `WHERE slug = $1` → `RepositoryError::not_found`
 *    (`api/crates/portal-db/src/repositories/game.rs:106,151-153`). Verified against a
 *    live stack: the same body is `200` on `/v1/games/aoe4/maps/catalog` and `404 "Game
 *    not found: db15451c-…"` on `/v1/games/{uuid}/maps/catalog`. So **Add Map, Edit Map,
 *    Delete Map and Save Pool are all dead from the portal** — they pop the failure
 *    snackbar every time. A test of any of them would have to assert the failure, i.e.
 *    certify the bug.
 *
 * 2. **Rank tiers and team size have no write control at all.** `games.setRankTiers`
 *    (`stores/games.ts:153`) and `games.updateTeamSize` (`:165`) have zero component
 *    consumers. `GameConfigDialog.vue:162-184` renders the tiers as a read-only
 *    `v-list`, and `:186-204` renders team size as a `readonly` text field captioned
 *    "Team size is managed via the game plugin configuration" — with no plugin-config
 *    surface anywhere in the app. Both handlers are additionally blocked by (1).
 *
 * 3. **A disabled game cannot be re-enabled after a reload.** `AdminGamesPage` lists
 *    games from `GET /v1/games`, which is `list_active()` (`WHERE status = 'active'`,
 *    `portal-db/src/repositories/game.rs:71-79`). Disabling drops the row from that list,
 *    and the Enable button only exists *inside* a row. The disable→enable test below
 *    works only because `disableGame` patches the row in place client-side
 *    (`stores/games.ts:88`), so the control survives until the next fetch — press
 *    Refresh, or reload, and the game is gone from the admin UI permanently.
 *
 * Smaller observations, asserted where they are load-bearing and noted where they are not:
 *   - `POST /disable` writes status **`maintenance`**, not `disabled`
 *     (`portal-db/src/repositories/game.rs:182`), and the status chip prints the raw enum
 *     (`AdminGamesPage.vue:55` `{{ item.status }}`) instead of a human label, unlike every
 *     other admin table. The tests assert what the page actually shows.
 *   - The four row action buttons carry `aria-label`s shifted by one from their `title`s
 *     (`AdminGamesPage.vue:65,74,83,95`): the cog is labelled "Edit game", the pencil
 *     "Disable game", the Disable button "Enable game" and the Enable button "Configure
 *     game". `aria-label` wins over `title` for the accessible name, so a screen-reader
 *     user who activates "Enable game" disables the game. The tests locate by `title`
 *     deliberately, because the accessible name is wrong.
 *   - `GameEditModal`'s Sort Order field is always seeded to `0` (`GameEditModal.vue:148`)
 *     — `GameSummaryResponse` has no `sort_order`, so the modal cannot show the real value
 *     (`cs2` is 1, `aoe4` is 2) — and `:183` only sends the field when it is non-zero, so
 *     no game's sort order can ever be set to 0 through the UI.
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
    // The chip prints the raw enum — see the header note.
    await expect(row.locator('.v-chip')).toHaveText('active')

    // ---- Disable, through the UI -------------------------------------------
    // Located by `title`, not by accessible name: the aria-labels are shifted by
    // one and this button announces itself as "Enable game" (header note).
    await row.locator('button[title="Disable"]').click()

    await expect(page.getByText('Game disabled')).toBeVisible()
    // UI assert: `disable` writes 'maintenance', and the chip shows it verbatim.
    await expect(row.locator('.v-chip')).toHaveText('maintenance')
    // API cross-check. `GET /v1/games/{id}` is not status-filtered, so it can still
    // read the row the list endpoint has just dropped.
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('maintenance')

    // ---- Re-enable, through the UI -----------------------------------------
    // Only reachable because the store patched the row in place rather than
    // refetching; a reload here would lose the control entirely (header note 3).
    await row.locator('button[title="Enable"]').click()

    await expect(page.getByText('Game enabled')).toBeVisible()
    await expect(row.locator('.v-chip')).toHaveText('active')
    expect((await getGameDetailViaApi(MUTABLE_GAME_SLUG)).status).toBe('active')
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

    await row.locator('button[title="Edit"]').click()

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
      .locator('button[title="Edit"]')
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
      .locator('button[title="Configure"]')
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
    // Exact list, in order: the dialog maps `display_name` -> its local `name`
    // (GameConfigDialog.vue:278-285) and renders them in the API's order.
    await expect(dialog.locator('.v-list-item-title')).toHaveText(
      tiers.map((tier) => tier.display_name),
    )
    const first = tiers[0]
    await expect(
      dialog.getByText(`Rating: ${first.min_rating} - ${first.max_rating}`),
    ).toBeVisible()

    // ---- Team Size tab -----------------------------------------------------
    await dialog.getByRole('tab', { name: 'Team Size' }).click()
    // `exact` matters: the Maps tab stays mounted behind the window and carries a
    // "Default Competitive Pool" heading.
    const defaultField = dialog.getByLabel('Default', { exact: true })
    await expect(defaultField).toHaveValue(String(detail.team_size.default))
    // Read-only, and the caption points at a plugin-config surface that does not
    // exist anywhere in the app — see header note 2.
    await expect(defaultField).toHaveJSProperty('readOnly', true)
    await expect(
      dialog.getByText('Team size is managed via the game plugin configuration.'),
    ).toBeVisible()
  })
})

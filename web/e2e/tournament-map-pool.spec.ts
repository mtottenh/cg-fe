import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { createDraftTournament } from './fixtures/tournament-lifecycle.fixture'
import { uniqueId } from './fixtures/test-data'
import {
  fetchEffectiveMapPool,
  fetchGameCatalog,
  fetchTournamentIdBySlug,
  mapIdByDisplayName,
  setMapPoolViaApi,
  type GameMapCatalog,
} from './fixtures/map-pool.fixture'

/**
 * Tournament map pool — the UI save path.
 *
 * `MapPoolPicker` mounts twice. This file drives ONLY the tournament mount
 * (`TournamentForm.vue:321`), which is reached from both the create modal
 * (`TournamentCreateModal.vue:20`) and the edit modal
 * (`TournamentEditModal.vue:20`), and which persists through:
 *
 *   - create  → `map_pool` inside `POST /v1/tournaments`
 *   - edit    → `PUT    /v1/tournaments/{id}/map-pool`   (`_seeding.ts:80`)
 *   - reset   → `DELETE /v1/tournaments/{id}/map-pool`   (`_seeding.ts:90`)
 *
 * The other mount (`GameConfigDialog.vue:138`, the *game* pool) is deliberately
 * untested: `PUT /v1/games/{id}/maps` 404s because the handler hands a UUID to
 * a slug-keyed update — already registered as P-87.
 *
 * WHY EVERY POOL ASSERTION IS DOUBLED
 * -----------------------------------
 * `TournamentEditModal.vue:107` swallows the DELETE
 * (`.catch(() => {})`), so a failed reset still closes the modal and shows the
 * success snackbar. The UI can therefore report a pool change that never
 * happened; only `GET /map-pool` (and specifically its `source` field, which
 * is what distinguishes "override written" from "override removed") can tell
 * the difference. Every test here asserts the picker *and* that endpoint.
 *
 * Other specs (`veto-flow`, `veto-bo3`, `veto-realtime-full`, `tournament-admin`)
 * seed pools over the API; none of them clicks a map.
 */

/** The picker's state chip — "Using game default" or "Custom (N maps)"
 *  (`MapPoolPicker.vue:6-18`). Scoped to the picker header so the modal's
 *  status chip (`TournamentEditModal.vue:30`) can't be mistaken for it. */
function poolChip(modal: Locator): Locator {
  return modal.locator('.d-flex.justify-space-between:has-text("Tournament Map Pool") .v-chip')
}

/** One selectable map card (`MapPoolPicker.vue:34-55`), located by its label. */
function mapCard(page: Page, modal: Locator, displayName: string): Locator {
  return modal
    .locator('.pool-card')
    .filter({ has: page.getByText(displayName, { exact: true }) })
}

/** Vuetify marks unselected cards with `pool-card--inactive` (`:38`). */
async function expectSelected(card: Locator, selected: boolean): Promise<void> {
  if (selected) {
    await expect(card).not.toHaveClass(/pool-card--inactive/)
  } else {
    await expect(card).toHaveClass(/pool-card--inactive/)
  }
}

async function openEditModal(page: Page, tournamentId: string): Promise<Locator> {
  await page.goto(`/admin/tournaments/${tournamentId}`)
  await page.getByRole('button', { name: 'Edit Tournament' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  // The picker only renders once the game detail has loaded.
  await expect(modal.getByText('Tournament Map Pool')).toBeVisible({ timeout: 15_000 })
  return modal
}

/** Save the edit modal, asserting the success path the app itself claims. */
async function saveEditModal(page: Page, modal: Locator): Promise<void> {
  // Arm the snackbar assertion BEFORE the click — it auto-dismisses after 3s.
  const snackbar = expect(
    page.locator('.v-snackbar').getByText('Tournament updated successfully'),
  ).toBeVisible({ timeout: 15_000 })
  await modal.getByRole('button', { name: 'Save Changes' }).click()
  await snackbar
  await expect(modal).not.toBeVisible({ timeout: 15_000 })
}

test.describe('Tournament map pool', () => {
  let catalog: GameMapCatalog

  test.beforeAll(async () => {
    catalog = await fetchGameCatalog('cs2')
  })

  test('admin narrows a tournament map pool to a custom subset', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken, {
      name: `E2E Map Pool Custom ${uniqueId()}`,
    })

    // Precondition: the tournament starts on the game's competitive default.
    const before = await fetchEffectiveMapPool(tournament.id)
    expect([...before.maps].sort()).toEqual([...catalog.defaultPool].sort())

    const dropped = ['Vertigo', 'Anubis']
    const keptIds = catalog.defaultPool.filter(
      (id) => !dropped.map((n) => mapIdByDisplayName(catalog, n)).includes(id),
    )

    await loginAsAdmin(page)
    const modal = await openEditModal(page, tournament.id)

    await expect(modal.locator('.pool-card')).toHaveCount(catalog.maps.length)
    await expect(poolChip(modal)).toHaveText('Using game default')

    for (const name of dropped) {
      await mapCard(page, modal, name).click()
    }
    await expect(poolChip(modal)).toHaveText(`Custom (${keptIds.length} maps)`)
    await expectSelected(mapCard(page, modal, 'Vertigo'), false)
    await expectSelected(mapCard(page, modal, 'Mirage'), true)

    await saveEditModal(page, modal)

    // Backend: the PUT really wrote a tournament-level override with exactly
    // the maps left selected.
    const after = await fetchEffectiveMapPool(tournament.id)
    expect(after.source).toBe('tournament')
    expect([...after.maps].sort()).toEqual([...keptIds].sort())

    // UI: reopening the modal remounts the form and refetches the pool, so
    // the chip is reading persisted state, not leftover local state.
    const reopened = await openEditModal(page, tournament.id)
    await expect(poolChip(reopened)).toHaveText(`Custom (${keptIds.length} maps)`)
    await expectSelected(mapCard(page, reopened, 'Anubis'), false)
    await expectSelected(mapCard(page, reopened, 'Nuke'), true)

    // Leave nothing dirty behind.
    await reopened.getByRole('button', { name: 'Cancel' }).click()
    await expect(reopened).not.toBeVisible()
  })

  test('admin resets a customised pool back to the game default', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()
    const tournament = await createDraftTournament(adminToken, {
      name: `E2E Map Pool Reset ${uniqueId()}`,
    })

    const seeded = ['Dust II', 'Mirage', 'Inferno'].map((n) => mapIdByDisplayName(catalog, n))
    await setMapPoolViaApi(adminToken, tournament.id, seeded)
    const before = await fetchEffectiveMapPool(tournament.id)
    expect(before.source).toBe('tournament')
    expect([...before.maps].sort()).toEqual([...seeded].sort())

    await loginAsAdmin(page)
    const modal = await openEditModal(page, tournament.id)

    await expect(poolChip(modal)).toHaveText('Custom (3 maps)')
    await expectSelected(mapCard(page, modal, 'Nuke'), false)

    await modal.getByRole('button', { name: 'Reset to default' }).click()
    await expect(poolChip(modal)).toHaveText('Using game default')
    await expectSelected(mapCard(page, modal, 'Nuke'), true)
    // The button only exists while the pool is custom (`MapPoolPicker.vue:23`).
    await expect(modal.getByRole('button', { name: 'Reset to default' })).toHaveCount(0)

    await saveEditModal(page, modal)

    // Backend: the override row is GONE, not merely rewritten to the same
    // values — `source` flipping back to `game` is the only proof the DELETE
    // landed, and the modal swallows that call's failure.
    const after = await fetchEffectiveMapPool(tournament.id)
    expect(after.source).toBe('game')
    expect([...after.maps].sort()).toEqual([...catalog.defaultPool].sort())

    // UI: the reopened form reads the fallback pool back.
    const reopened = await openEditModal(page, tournament.id)
    await expect(poolChip(reopened)).toHaveText('Using game default')
    await expectSelected(mapCard(page, reopened, 'Nuke'), true)
    await reopened.getByRole('button', { name: 'Cancel' }).click()
    await expect(reopened).not.toBeVisible()
  })

  test('an empty map pool blocks tournament creation', async ({ page }) => {
    test.setTimeout(90_000)
    const suffix = uniqueId()
    const name = `E2E Map Pool Gate ${suffix}`
    const slug = `e2e-map-pool-gate-${suffix}`

    await loginAsAdmin(page)
    await page.goto('/admin/tournaments')
    await page.getByRole('button', { name: 'Create Tournament' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // P-100: a Vuetify `v-select` exposes no accessible name, so the game
    // select is addressed positionally — it is the first one in create mode
    // (the league/season selects only appear once a game is chosen).
    await modal.locator('.v-select').first().click()
    await page.getByRole('option', { name: catalog.display_name }).click()

    await modal.getByRole('textbox', { name: /Tournament Name/ }).fill(name)
    await modal.getByRole('textbox', { name: /URL Slug/ }).fill(slug)

    const submit = modal.getByRole('button', { name: 'Create Tournament' })
    const emptyPoolWarning = modal.getByText(
      'Select at least one map - a tournament cannot be created without a map pool.',
    )

    // The picker pre-seeds the game default, so the form starts submittable.
    await expect(modal.locator('.pool-card')).toHaveCount(catalog.maps.length)
    await expect(poolChip(modal)).toHaveText('Using game default')
    await expect(emptyPoolWarning).toHaveCount(0)
    await expect(submit).toBeEnabled()

    // Empty the pool: the gate (`TournamentForm.vue:329` +
    // `TournamentCreateModal.vue:38`) must both warn and block.
    for (const map of catalog.maps) {
      await mapCard(page, modal, map.display_name).click()
    }
    await expect(emptyPoolWarning).toBeVisible()
    await expect(submit).toBeDisabled()

    // One map is enough to clear it.
    await mapCard(page, modal, 'Nuke').click()
    await expect(emptyPoolWarning).toHaveCount(0)
    await expect(submit).toBeEnabled()

    const snackbar = expect(
      page.locator('.v-snackbar').getByText('Tournament created successfully'),
    ).toBeVisible({ timeout: 15_000 })
    await submit.click()
    await snackbar
    await expect(modal).not.toBeVisible({ timeout: 15_000 })

    // Backend: the tournament was created with the pool that was on screen —
    // not the game default it was seeded with.
    const createdId = await fetchTournamentIdBySlug(slug)
    const pool = await fetchEffectiveMapPool(createdId)
    expect(pool.source).toBe('tournament')
    expect(pool.maps).toEqual([mapIdByDisplayName(catalog, 'Nuke')])
  })
})

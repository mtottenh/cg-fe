import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { createLeague } from './fixtures/league-season-extra.fixture'
import {
  associateDemoViaApi,
  catalogDemoViaApi,
  getDemoGame,
  getDemoViaApi,
  type DemoGame,
} from './fixtures/demo-admin.fixture'

/**
 * P-75 — the repair path for a mis-associated demo.
 *
 * `POST /v1/admin/demos/{id}/associate` has existed the whole time and
 * `demos.associate` (`stores/demos.ts`) wrapped it, but **nothing called it**:
 * the Association card on `AdminDemoDetailPage` was read-only, and it printed
 * the raw `league_id` / `tournament_id` UUIDs, so an admin could not even tell
 * *which* league or tournament a demo had been stamped onto without going to
 * the database. That matters because the stamp is applied automatically — P-42
 * was auto-linked demos landing on the wrong target — and this is the only way
 * to undo it.
 *
 * The wrong stamp is seeded through the API (that is the precondition, and it
 * is what the auto-linker does); the correction is driven through the UI.
 */

test.describe('Admin demo detail — association', () => {
  let adminToken: string
  let game: DemoGame

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    game = await getDemoGame()
  })

  test('admin re-associates a demo stamped onto the wrong league, and can clear it', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const wrongLeague = await createLeague(adminToken, {
      gameId: game.id,
      namePrefix: 'E2E Wrongly Stamped League',
    })
    const rightLeague = await createLeague(adminToken, {
      gameId: game.id,
      namePrefix: 'E2E Correct Home League',
    })

    const demo = await catalogDemoViaApi(adminToken, game.id)
    await associateDemoViaApi(adminToken, demo.id, { league_id: wrongLeague.leagueId })

    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demo.id}`)
    await expect(page.getByRole('heading', { name: demo.file_name })).toBeVisible()

    const card = page.locator('[data-testid="association-card"]')
    const leagueValue = card.locator('[data-testid="association-league"]')
    const tournamentValue = card.locator('[data-testid="association-tournament"]')

    // ---- The card names the league, instead of printing its id ------------
    await expect(leagueValue).toHaveText(wrongLeague.leagueName, { timeout: 15000 })
    await expect(leagueValue).not.toContainText(wrongLeague.leagueId)
    await expect(tournamentValue).toHaveText('None')

    // ---- Correct it through the UI ----------------------------------------
    await card.getByRole('button', { name: 'Edit' }).click()

    const leagueInput = card.getByRole('combobox', { name: 'Associated league' })
    await expect(leagueInput).toBeVisible()
    await leagueInput.fill(rightLeague.leagueName)
    await page.getByRole('option', { name: rightLeague.leagueName }).click()

    await card.getByRole('button', { name: 'Save Association' }).click()
    await expect(page.getByText('Association updated')).toBeVisible({ timeout: 15000 })

    await expect(leagueValue).toHaveText(rightLeague.leagueName)
    // API cross-check: re-association replaces, it does not merge.
    expect((await getDemoViaApi(adminToken, demo.id)).league_id).toBe(rightLeague.leagueId)

    // Survives a reload — the label is resolved from the server row, not from
    // the option the admin happened to click.
    await page.reload()
    await expect(page.locator('[data-testid="association-league"]')).toHaveText(
      rightLeague.leagueName,
      { timeout: 15000 },
    )

    // ---- And it can be taken off entirely ---------------------------------
    // A demo stamped onto a league it was never played in has to be removable,
    // not merely movable.
    await card.getByRole('button', { name: 'Edit' }).click()
    const leagueField = card
      .locator('.v-input')
      .filter({ has: page.getByRole('combobox', { name: 'Associated league' }) })
    await leagueField.getByRole('button', { name: 'Clear' }).click()
    await card.getByRole('button', { name: 'Save Association' }).click()
    await expect(page.getByText('Association updated')).toBeVisible({ timeout: 15000 })

    await expect(leagueValue).toHaveText('None')
    expect((await getDemoViaApi(adminToken, demo.id)).league_id).toBeNull()
  })
})

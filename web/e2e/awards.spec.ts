import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createAwardsScenario,
  createAwardsAdminScope,
  createTournamentAward,
  submitLinkedDemo,
  getTournamentAwards,
  getPlayerTrophies,
  type AwardsScenario,
} from './fixtures/awards.fixture'
import { uniqueId } from './fixtures/test-data'

/**
 * Awards end-to-end flow.
 *
 * Backend facts are seeded through the admin API exactly like the backend's
 * own integration tests (`tests/integration/awards.rs`):
 *
 *   tournament + match (checkin fixture) → players link their own Steam IDs
 *   via `PATCH /v1/players/me` (UpdateProfileRequest.steam_id) → demo stats
 *   submitted via the admin pipeline auto-link into the tournament scope.
 *
 * The UI is then exercised for award authoring (admin), public standings,
 * finalization, and the winner's trophy case.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

test.describe('Awards', () => {
  let adminToken: string
  let scenario: AwardsScenario

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createAwardsScenario(adminToken)
    // p1 dominates MAG-7 kills and headshots; p2 trails.
    await submitLinkedDemo(adminToken, scenario, [
      {
        steamId: scenario.p1SteamId,
        playerName: 'Player1',
        kills: 20,
        headshotKills: 12,
        mag7Kills: 7,
      },
      {
        steamId: scenario.p2SteamId,
        playerName: 'Player2',
        kills: 10,
        headshotKills: 4,
        mag7Kills: 2,
      },
    ])
  })

  test('organizer authors awards, public sees live standings, finalize awards a trophy', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)

    // ---- Organizer: add the Swag 7 template award -------------------------
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=awards`)
    const swagChip = page.locator('[data-testid="template-chip"]', { hasText: 'Swag 7' })
    await expect(swagChip).toBeVisible()
    await swagChip.click()

    const swagRow = page.locator('[data-testid="admin-award-row"]', { hasText: 'Swag 7' })
    await expect(swagRow).toBeVisible()
    await expect(swagRow.getByText('kills.weapon.mag7')).toBeVisible()
    // The used template disappears from the picker.
    await expect(
      page.locator('[data-testid="template-chip"]', { hasText: 'Swag 7' }),
    ).toHaveCount(0)

    // ---- Organizer: create a custom award over a catalog stat -------------
    await page.getByTestId('add-custom-award').click()
    const dialog = page.getByTestId('custom-award-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Award Name' }).fill('Headshot Hero')
    // Stat autocomplete: type to filter, pick "Headshot Kills".
    const statInput = dialog.getByLabel('Stat *')
    await statInput.click()
    await statInput.fill('Headshot')
    await page.getByRole('option', { name: /Headshot Kills/ }).first().click()
    await dialog.getByTestId('custom-award-submit').click()

    const heroRow = page.locator('[data-testid="admin-award-row"]', { hasText: 'Headshot Hero' })
    await expect(heroRow).toBeVisible()
    await expect(heroRow.getByText('headshot_kills')).toBeVisible()

    // API assert: both awards exist and are active.
    const awards = await getTournamentAwards(scenario.tournamentId)
    expect(awards.map((a) => a.name).sort()).toEqual(['Headshot Hero', 'Swag 7'])
    expect(awards.every((a) => a.status === 'active')).toBe(true)

    // ---- Public: Awards tab shows live standings with the expected leader --
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await page.getByTestId('awards-tab').click()

    const swagCard = page.locator('[data-testid="award-card"]', { hasText: 'Swag 7' })
    await expect(swagCard).toBeVisible()
    await expect(swagCard.getByTestId('award-live-chip')).toBeVisible()
    // p1 leads MAG-7 kills with 7. The leaderboard shows player display
    // names ("CheckIn Tester <suffix>"); match on p1's unique suffix.
    const p1Suffix = scenario.p1.username.replace(/^ci_/, '')
    const swagPodium = swagCard.locator('[data-testid="podium-entry"]')
    await expect(swagPodium.first()).toContainText(p1Suffix)
    await expect(swagPodium.first().getByTestId('podium-value')).toHaveText('7')

    const heroCard = page.locator('[data-testid="award-card"]', { hasText: 'Headshot Hero' })
    await expect(heroCard).toBeVisible()
    await expect(heroCard.locator('[data-testid="podium-entry"]').first()).toContainText(p1Suffix)

    // ---- Organizer: finalize Swag 7 with confirmation ---------------------
    await page.goto(`/admin/tournaments/${scenario.tournamentId}?tab=awards`)
    const rowToFinalize = page.locator('[data-testid="admin-award-row"]', { hasText: 'Swag 7' })
    await rowToFinalize.getByTestId('finalize-award').click()
    const confirmOverlay = page.locator('.v-overlay--active', { hasText: 'Finalize Award' })
    await expect(confirmOverlay).toBeVisible()
    await confirmOverlay.getByRole('button', { name: 'Finalize', exact: true }).click()
    await expect(rowToFinalize.getByTestId('award-status-finalized')).toBeVisible()

    // API assert: the award flipped to finalized and the winner has a trophy.
    const finalized = await getTournamentAwards(scenario.tournamentId)
    expect(finalized.find((a) => a.name === 'Swag 7')?.status).toBe('finalized')
    const trophies = await getPlayerTrophies(scenario.p1PlayerId)
    expect(trophies.map((t) => t.award.name)).toContain('Swag 7')
    expect(trophies.find((t) => t.award.name === 'Swag 7')?.result.rank).toBe(1)

    // ---- Public: finalized trophy styling ---------------------------------
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await page.getByTestId('awards-tab').click()
    const finalizedCard = page.locator('[data-testid="award-card"]', { hasText: 'Swag 7' })
    await expect(finalizedCard.getByTestId('award-finalized-chip')).toBeVisible()

    // ---- Winner's public profile shows the trophy case --------------------
    await page.goto(`/players/${scenario.p1PlayerId}`)
    const trophyCase = page.getByTestId('trophy-case')
    await expect(trophyCase).toBeVisible()
    const trophyItem = trophyCase.locator('[data-testid="trophy-item"]', { hasText: 'Swag 7' })
    await expect(trophyItem).toBeVisible()
    await expect(trophyItem.getByTestId('trophy-rank')).toHaveText('Rank 1')
  })

  test('RBAC: non-organizer cannot author awards, non-admin cannot manage demo links', async () => {
    // Non-organizer participant gets 403 on award creation.
    const createResp = await fetch(`${API_URL}/v1/tournaments/${scenario.tournamentId}/awards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scenario.p1.token}`,
      },
      body: JSON.stringify({ name: 'Not Allowed', stat_key: 'kills' }),
    })
    expect(createResp.status).toBe(403)

    // Non-admin gets 403 on demo link management.
    const { demoId } = await submitLinkedDemo(
      adminToken,
      scenario,
      [
        { steamId: scenario.p1SteamId, playerName: 'Player1', kills: 5, headshotKills: 2, mag7Kills: 1 },
        { steamId: scenario.p2SteamId, playerName: 'Player2', kills: 3, headshotKills: 1, mag7Kills: 0 },
      ],
    )
    const linkResp = await fetch(`${API_URL}/v1/admin/demos/${demoId}/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scenario.p1.token}`,
      },
      body: JSON.stringify({ match_id: scenario.matchId, link_type: 'manual' }),
    })
    expect(linkResp.status).toBe(403)

    const unlinkResp = await fetch(
      `${API_URL}/v1/admin/demos/${demoId}/link/${scenario.matchId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${scenario.p1.token}` },
      },
    )
    expect(unlinkResp.status).toBe(403)
  })
})

/**
 * Award MANAGEMENT (edit + void) — `AwardsTab.handleSaveEdit` and `confirmVoid`,
 * neither of which the authoring flow above touches.
 *
 * A separate describe so these do NOT pay the `Awards` beforeAll, which builds
 * two Steam-identified players, a started match and an auto-linked demo.
 * Neither surface below needs a single stat: they own a cheap scope
 * (`createAwardsAdminScope`) and their own awards, so nothing they rename or
 * void can disturb the authoring test.
 */
test.describe('Award management', () => {
  test('organizer edits an award\'s presentation and the change persists', async ({ page }) => {
    test.setTimeout(60_000)
    const token = await getAdminToken()
    const scope = await createAwardsAdminScope(token)
    const suffix = uniqueId()
    const originalName = `Original Alpha ${suffix}`
    const renamed = `Renamed Bravo ${suffix}`
    const award = await createTournamentAward(token, scope.tournamentId, originalName)
    expect(award.description).toBeNull()

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scope.tournamentId}?tab=awards`)

    const row = page.locator('[data-testid="admin-award-row"]', { hasText: originalName })
    await expect(row).toBeVisible({ timeout: 15_000 })
    // Edit is offered on `active` awards only (AwardsTab.vue:82-92).
    await expect(row.getByTestId('award-status-active')).toBeVisible()

    await row.getByTestId('edit-award').click()
    const dialog = page.getByTestId('edit-award-dialog')
    await expect(dialog).toBeVisible()
    // The dialog opens PRE-FILLED from the award (AwardsTab.vue:298-308) —
    // a blank form would silently blank the record on save.
    await expect(dialog.getByLabel('Name *')).toHaveValue(originalName)

    await dialog.getByLabel('Name *').fill(renamed)
    await dialog.getByLabel('Description').fill('E2E edited description')
    // Accent colour picker: each swatch is a button labelled with its hex
    // (AwardsTab.vue:173-184).
    await dialog.getByRole('button', { name: 'Select color #1E88E5' }).click()

    const editSnackbar = expect(
      page.locator('.v-snackbar').getByText(`"${renamed}" updated`),
    ).toBeVisible({ timeout: 15_000 })
    await dialog.getByTestId('edit-award-save').click()
    await editSnackbar
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // UI: the row carries the new name and the old one is gone.
    await expect(
      page.locator('[data-testid="admin-award-row"]', { hasText: renamed }),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="admin-award-row"]', { hasText: originalName }),
    ).toHaveCount(0)

    // API: the PATCH really landed, on the same award id, and left the
    // non-presentation fields (stat key, status) alone.
    const afterEdit = await getTournamentAwards(scope.tournamentId)
    const updated = afterEdit.find((a) => a.id === award.id)
    expect(updated?.name).toBe(renamed)
    expect(updated?.description).toBe('E2E edited description')
    expect(updated?.color).toBe('#1E88E5')
    expect(updated?.stat_key).toBe('kills')
    expect(updated?.status).toBe('active')

    // ...and a reload proves it is persisted, not just patched into the store.
    await page.reload()
    await expect(
      page.locator('[data-testid="admin-award-row"]', { hasText: renamed }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('organizer voids an award and it disappears from the public awards tab', async ({ page }) => {
    test.setTimeout(60_000)
    const token = await getAdminToken()
    const scope = await createAwardsAdminScope(token)
    const suffix = uniqueId()
    // Two awards: voiding one must remove exactly that one. A single-award
    // test cannot tell "voided" from "the list stopped rendering".
    const doomedName = `Doomed Charlie ${suffix}`
    const keptName = `Kept Delta ${suffix}`
    const doomed = await createTournamentAward(token, scope.tournamentId, doomedName)
    const kept = await createTournamentAward(token, scope.tournamentId, keptName, 'headshot_kills')

    await loginAsAdmin(page)
    await page.goto(`/admin/tournaments/${scope.tournamentId}?tab=awards`)

    const doomedRow = page.locator('[data-testid="admin-award-row"]', { hasText: doomedName })
    const keptRow = page.locator('[data-testid="admin-award-row"]', { hasText: keptName })
    await expect(doomedRow).toBeVisible({ timeout: 15_000 })
    await expect(keptRow).toBeVisible()

    // Void is confirm-gated (AwardsTab.vue:346-361).
    await doomedRow.getByTestId('void-award').click()
    const confirmOverlay = page.locator('.v-overlay--active', { hasText: 'Void Award' })
    await expect(confirmOverlay).toBeVisible()
    await expect(confirmOverlay.getByText(doomedName)).toBeVisible()

    const voidSnackbar = expect(
      page.locator('.v-snackbar').getByText(`"${doomedName}" voided`),
    ).toBeVisible({ timeout: 15_000 })
    await confirmOverlay.getByRole('button', { name: 'Void', exact: true }).click()
    await voidSnackbar

    // UI: the voided award leaves the admin list; its neighbour stays.
    await expect(doomedRow).toHaveCount(0)
    await expect(keptRow).toBeVisible()

    // API: soft delete — the row still exists, flipped to `void`.
    const afterVoid = await getTournamentAwards(scope.tournamentId)
    expect(afterVoid.find((a) => a.id === doomed.id)?.status).toBe('void')
    expect(afterVoid.find((a) => a.id === kept.id)?.status).toBe('active')

    // Public: the void award is not published (AwardsPanel.vue:71).
    await page.goto(`/tournaments/${scope.tournamentSlug}`)
    await page.getByTestId('awards-tab').click()
    await expect(
      page.locator('[data-testid="award-card"]', { hasText: keptName }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('[data-testid="award-card"]', { hasText: doomedName }),
    ).toHaveCount(0)
  })
})

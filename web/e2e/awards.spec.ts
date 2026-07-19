import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createAwardsScenario,
  submitLinkedDemo,
  getTournamentAwards,
  getPlayerTrophies,
  type AwardsScenario,
} from './fixtures/awards.fixture'

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

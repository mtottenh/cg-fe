import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createAwardsScenario,
  submitLinkedDemo,
  getTournamentAwards,
  type AwardsScenario,
} from './fixtures/awards.fixture'

/**
 * Combined player-stats leaderboard end-to-end flow.
 *
 * Seeds a CS2 tournament with two Steam-identified players (awards fixture),
 * submits ONE demo with KNOWN per-player stats that auto-links into the
 * tournament scope, and - crucially - creates NO awards. The public tournament
 * page's Stats tab must still render the leaderboard with the expected rows.
 *
 * The demo stats (see `awardsStatsBody`) fix deaths=5, assists=2 per player;
 * kills are set distinctly per player below.
 */

test.describe('Stats leaderboard', () => {
  let adminToken: string
  let scenario: AwardsScenario

  const P1_KILLS = 21
  const P2_KILLS = 11

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createAwardsScenario(adminToken)
    await submitLinkedDemo(adminToken, scenario, [
      { steamId: scenario.p1SteamId, playerName: 'Player1', kills: P1_KILLS, headshotKills: 10, mag7Kills: 3 },
      { steamId: scenario.p2SteamId, playerName: 'Player2', kills: P2_KILLS, headshotKills: 4, mag7Kills: 1 },
    ])
  })

  test('shows the combined player-stats leaderboard with no awards defined', async ({ page }) => {
    test.setTimeout(120_000)

    // Pre-condition: no awards exist for this tournament. The leaderboard is
    // independent of awards and must render anyway.
    expect(await getTournamentAwards(scenario.tournamentId)).toHaveLength(0)

    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)

    // ---- Open the Stats tab ------------------------------------------------
    await page.getByTestId('stats-tab').click()

    const table = page.getByTestId('stats-leaderboard-table')
    await expect(table).toBeVisible()

    // Column headers are present.
    for (const col of ['Player', 'Kills', 'Deaths', 'Assists', 'Damage', 'ADR', 'Demos']) {
      await expect(table).toContainText(col)
    }

    // The leaderboard rendered even though NO awards are defined.
    await expect(page.getByTestId('stats-leaderboard-empty')).toHaveCount(0)

    // ---- Player rows carry the expected stats ------------------------------
    // Leaderboard display names are "CheckIn Tester <suffix>"; match on suffix.
    const p1Suffix = scenario.p1.username.replace(/^ci_/, '')
    const p2Suffix = scenario.p2.username.replace(/^ci_/, '')

    const p1Row = table.locator('tr', { hasText: p1Suffix })
    await expect(p1Row).toBeVisible()
    await expect(p1Row.getByTestId('stat-kills')).toHaveText(String(P1_KILLS))
    await expect(p1Row.getByTestId('stat-deaths')).toHaveText('5')
    await expect(p1Row.getByTestId('stat-assists')).toHaveText('2')
    // Damage is a positive integer, ADR is rendered to one decimal place.
    await expect(p1Row.getByTestId('stat-damage')).toHaveText(/^\d+$/)
    await expect(p1Row.getByTestId('stat-adr')).toHaveText(/^\d+\.\d$/)
    await expect(p1Row.getByTestId('stat-demos')).toHaveText('1')

    const p2Row = table.locator('tr', { hasText: p2Suffix })
    await expect(p2Row).toBeVisible()
    await expect(p2Row.getByTestId('stat-kills')).toHaveText(String(P2_KILLS))

    // Player cells link to the player profile route.
    await expect(p1Row.getByTestId('stats-player-link')).toHaveAttribute(
      'href',
      new RegExp(`/players/${scenario.p1PlayerId}$`),
    )
  })
})

import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createLeagueSeasonScenario,
  advanceSeason,
  type LeagueSeasonScenario,
} from './fixtures/league-season-extra.fixture'
import { createTeamWithMembers, type TeamRosterScenario } from './fixtures/team-roster.fixture'

/**
 * League Season Lifecycle E2E Tests
 *
 * Fully self-contained: each describe block builds its own league + season
 * (+ registered team where needed) through the admin API via
 * league-season-extra.fixture.ts, so nothing depends on globally seeded state
 * and every test always runs.
 *
 * Coverage:
 * - Public league detail page: season selector + per-season status chips
 * - Registration phase: Create Team CTA, registered team cards
 * - Admin league management: list, search, season details modal
 * - Season status transitions: registration → active → completed
 */

test.describe('League Season Lifecycle', () => {
  test.describe('Season Browsing', () => {
    let scenario: LeagueSeasonScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
    })

    test('should display league with seasons', async ({ page }) => {
      await loginAsAdmin(page)

      // Public leagues list loads.
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Leagues' })).toBeVisible()

      // The list is paginated server-side (ordered by name, no server search),
      // so a fresh league is not guaranteed to sit on page 1 of a long-lived
      // dev DB — navigate to the league detail page directly by id.
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      await expect(page.getByText(scenario.leagueName)).toBeVisible()

      // Season selector MUST be visible with our season auto-selected.
      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()
      await expect(seasonSelect).toContainText(scenario.seasonName)
    })

    test('should display season status indicator', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      // Each option in the season selector carries a status chip.
      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()
      await seasonSelect.click()

      const option = page.getByRole('option', { name: new RegExp(scenario.seasonName) })
      await expect(option).toBeVisible()
      await expect(option.getByText('registration', { exact: true })).toBeVisible()
    })
  })

  test.describe('Season Registration Phase', () => {
    let scenario: LeagueSeasonScenario
    let roster: TeamRosterScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
      // Register a team (fresh owner user) into the season via the API.
      roster = await createTeamWithMembers({
        leagueId: scenario.leagueId,
        seasonId: scenario.seasonId,
        memberCount: 0,
        teamNamePrefix: 'Season Phase Team',
      })
    })

    test('should show team creation during registration phase', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      // The admin created the league (league admin member) and has no team in
      // the season, so the Create Team CTA MUST be available.
      await expect(page.getByRole('button', { name: /Create Team/i }).first()).toBeVisible()
    })

    test('should show teams registered for the season', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      // The registered team MUST appear as a card with its member count chip.
      const teamCard = page.locator('.v-card').filter({ hasText: roster.teamName }).first()
      await expect(teamCard).toBeVisible()
      await expect(teamCard.getByText(/members/i)).toBeVisible()
      await expect(teamCard.getByText(`[${roster.teamTag}]`)).toBeVisible()
    })
  })

  test.describe('Admin Season Management', () => {
    let scenario: LeagueSeasonScenario

    test.beforeAll(async () => {
      const adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken)
    })

    test('should access league management in admin panel', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // Admin leagues page should load
      await expect(page.getByRole('heading', { name: /Leagues/i })).toBeVisible()
    })

    test('should see created league in admin list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // The admin owns the fresh league, so it MUST show up in the (client-
      // side searchable) admin list. Search first: the per-game data tables
      // paginate at 10 rows.
      await page.getByRole('textbox', { name: /Search leagues/i }).fill(scenario.leagueName)
      await expect(page.getByText(scenario.leagueName)).toBeVisible()
      await expect(page.getByText(scenario.leagueSlug)).toBeVisible()
    })

    test('should display season details for admin', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // Narrow the table to our league, then open "Manage Seasons & Teams".
      await page.getByRole('textbox', { name: /Search leagues/i }).fill(scenario.leagueName)
      const leagueRow = page.locator('tr').filter({ hasText: scenario.leagueName })
      await expect(leagueRow).toBeVisible()
      await leagueRow.locator('button[title="Manage Seasons & Teams"]').click()

      // The detail modal opens on the Seasons tab and MUST list our season.
      const dialog = page.locator('.v-overlay--active', { hasText: scenario.leagueName })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('tab', { name: /Seasons/i })).toBeVisible()
      await expect(dialog.getByText(scenario.seasonName)).toBeVisible()
    })
  })

  test.describe('Season Transition States', () => {
    let adminToken: string
    let scenario: LeagueSeasonScenario

    test.beforeAll(async () => {
      adminToken = await getAdminToken()
      scenario = await createLeagueSeasonScenario(adminToken) // registration
    })

    // Single test walks the whole chain so it stays valid regardless of
    // worker scheduling (the backend only allows forward one-step moves).
    test('should reflect season status transitions in the season selector', async ({ page }) => {
      await loginAsAdmin(page)

      // registration → active
      await advanceSeason(adminToken, scenario, 'active')
      await page.goto(`/leagues/${scenario.leagueId}`)
      await page.waitForLoadState('networkidle')

      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()
      await expect(seasonSelect).toContainText(scenario.seasonName)
      await seasonSelect.click()
      const option = page.getByRole('option', { name: new RegExp(scenario.seasonName) })
      await expect(option).toBeVisible()
      await expect(option.getByText('active', { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')

      // active → completed
      await advanceSeason(adminToken, scenario, 'completed')
      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(seasonSelect).toBeVisible()
      await seasonSelect.click()
      await expect(option).toBeVisible()
      await expect(option.getByText('completed', { exact: true })).toBeVisible()
    })
  })
})

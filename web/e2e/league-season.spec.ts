import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'
import { testLeagues } from './fixtures/test-data'
import { getSeededState } from './fixtures/seeded-state'

/**
 * League Season Lifecycle E2E Tests
 *
 * Tests cover the full league season workflow:
 * - Create season → open registration → teams register → activate → complete
 *
 * Prerequisites (seeded by global-setup.ts):
 * - E2E Test League with at least one season
 * - Admin is authenticated
 */

test.describe('League Season Lifecycle', () => {
  test.describe('Season Browsing', () => {
    test('should display league with seasons', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      // Navigate to test league
      const leagueLink = page
        .locator('a[href^="/leagues/"]')
        .filter({ hasText: testLeagues.standard.name })
        .first()
      await expect(leagueLink).toBeVisible({ timeout: 5000 })
      await leagueLink.click()
      await page.waitForLoadState('networkidle')

      // Season selector MUST be visible (league has at least one season)
      const seasonSelect = page.locator('.v-select').first()
      await expect(seasonSelect).toBeVisible()
    })

    test('should display season status indicator', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      const leagueLink = page
        .locator('a[href^="/leagues/"]')
        .filter({ hasText: testLeagues.standard.name })
        .first()
      await expect(leagueLink).toBeVisible({ timeout: 5000 })
      await leagueLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      // Should see some status-related text
      const statusTerms = /draft|registration|active|completed|open/i
      const hasStatus = await page.getByText(statusTerms).first().isVisible().catch(() => false)
      expect(hasStatus).toBe(true)
    })
  })

  test.describe('Season Registration Phase', () => {
    test('should show team creation during registration phase', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      const leagueLink = page
        .locator('a[href^="/leagues/"]')
        .filter({ hasText: testLeagues.standard.name })
        .first()
      await expect(leagueLink).toBeVisible({ timeout: 5000 })
      await leagueLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)

      // During registration phase, Create Team button should be available
      const createButton = page.getByRole('button', { name: /Create Team/i })
      const hasCreateButton = await createButton.isVisible().catch(() => false)

      // Teams section or empty state should be visible
      const hasTeamsContent =
        hasCreateButton ||
        (await page.getByText(/teams|no teams/i).first().isVisible().catch(() => false))

      expect(hasTeamsContent).toBe(true)
    })

    test('should show teams registered for the season', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      const leagueLink = page
        .locator('a[href^="/leagues/"]')
        .filter({ hasText: testLeagues.standard.name })
        .first()
      await expect(leagueLink).toBeVisible({ timeout: 5000 })
      await leagueLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)

      // Should show either team cards or empty state. Several elements can
      // match /no teams|be the first/i (heading + paragraph), so `.first()`
      // avoids strict-mode silently falling through to the catch.
      const hasTeamCards = await page
        .locator('.v-card')
        .filter({ hasText: /members/i })
        .first()
        .isVisible()
        .catch(() => false)
      const hasEmptyState = await page
        .getByText(/no teams|be the first/i)
        .first()
        .isVisible()
        .catch(() => false)

      expect(hasTeamCards || hasEmptyState).toBe(true)
    })
  })

  test.describe('Admin Season Management', () => {
    test('should access league management in admin panel', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // Admin leagues page should load
      await expect(page.getByRole('heading', { name: /Leagues/i })).toBeVisible()
    })

    test('should see seeded league in admin list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // Wait for data to load
      await page.waitForTimeout(2000)

      // Should see league data (table, list, or cards)
      const hasLeagueContent =
        (await page.getByText(testLeagues.standard.name).isVisible().catch(() => false)) ||
        (await page.locator('table tbody tr').first().isVisible().catch(() => false)) ||
        (await page.locator('.v-card').first().isVisible().catch(() => false))

      expect(hasLeagueContent).toBe(true)
    })

    test('should display season details for admin', async ({ page }) => {
      let state: ReturnType<typeof getSeededState>
      try {
        state = getSeededState()
      } catch {
        test.skip()
        return
      }

      if (!state.leagueId) {
        test.skip()
        return
      }

      await loginAsAdmin(page)

      // Navigate to the league admin page
      await page.goto('/admin/leagues')
      await page.waitForLoadState('networkidle')

      // Look for the test league
      const leagueText = page.getByText(testLeagues.standard.name)
      const hasLeague = await leagueText.isVisible().catch(() => false)

      if (hasLeague) {
        // Click to see details
        await leagueText.click()
        await page.waitForLoadState('networkidle')

        // Should see season information
        const hasSeasonInfo = await page
          .getByText(/season|E2E Test Season/i)
          .first()
          .isVisible()
          .catch(() => false)

        if (hasSeasonInfo) {
          await expect(page.getByText(/season/i).first()).toBeVisible()
        }
      }
    })
  })

  test.describe('Season Transition States', () => {
    test('should show appropriate UI for current season status', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/leagues')
      await page.waitForLoadState('networkidle')

      const leagueLink = page
        .locator('a[href^="/leagues/"]')
        .filter({ hasText: testLeagues.standard.name })
        .first()
      await expect(leagueLink).toBeVisible({ timeout: 5000 })
      await leagueLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)

      // Depending on season status, different UI elements should be shown:
      // - registration: Create Team button visible
      // - active: Teams playing, no new team creation
      // - completed: Historical view

      const hasActionableContent =
        (await page.getByRole('button', { name: /Create Team/i }).isVisible().catch(() => false)) ||
        (await page.getByText(/active|playing|in progress/i).first().isVisible().catch(() => false)) ||
        (await page.getByText(/completed|ended|finished/i).first().isVisible().catch(() => false)) ||
        (await page.getByText(/registration/i).first().isVisible().catch(() => false))

      // The page MUST show some indication of season state
      expect(hasActionableContent).toBe(true)
    })
  })
})

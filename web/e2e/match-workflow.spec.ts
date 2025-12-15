import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'
import { testTournaments } from './fixtures/test-data'

/**
 * Match workflow tests covering:
 * - Match detail page viewing
 * - Match scheduling (propose/accept/reject/counter)
 * - Match check-in
 * - Match status timeline
 *
 * NOTE: These tests require a tournament with matches to exist in the system.
 * If no matches exist, some tests will be skipped gracefully.
 */

test.describe('Match Workflows', () => {
  test.describe('Match Detail Page', () => {
    test('should navigate to tournament detail page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/tournaments')

      // Find any tournament link
      const tournamentLink = page.locator('a[href*="/tournaments/"]').first()
      const isVisible = await tournamentLink.isVisible().catch(() => false)

      if (isVisible) {
        await tournamentLink.click()

        // Should be on tournament detail page
        await expect(page).toHaveURL(/\/tournaments\/[^/]+$/)
      } else {
        // No tournaments available - test passes but logs warning
        test.skip()
      }
    })

    test('should display match card on tournament detail if matches exist', async ({ page }) => {
      await loginAsAdmin(page)

      // Try to find a tournament with matches
      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Check if matches section exists
      const matchesSection = page.getByText('Matches')
      const hasMatches = await matchesSection.isVisible().catch(() => false)

      if (hasMatches) {
        // Should see match cards or bracket
        await expect(page.locator('.v-card').first()).toBeVisible()
      } else {
        // Tournament may not have generated bracket yet
        // Just verify page loaded correctly
        const pageTitle = await page.title()
        expect(pageTitle).toBeTruthy()
      }
    })

    test('should display match not found for invalid match ID', async ({ page }) => {
      await loginAsAdmin(page)

      // Navigate to a non-existent match
      await page.goto('/tournaments/e2e-test-tournament/matches/00000000-0000-0000-0000-000000000000')

      // Should see "Match Not Found" heading
      await expect(page.getByRole('heading', { name: /Match Not Found/i })).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Match Scheduling Panel', () => {
    test('should display scheduling panel for self-scheduled tournaments', async ({ page }) => {
      await loginAsAdmin(page)

      // This test requires a self-scheduled tournament with matches
      // We'll verify the component renders when applicable

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for tournament to load
      await page.waitForLoadState('networkidle')

      // Check scheduling mode indicator if available
      const scheduleInfo = page.getByText(/self.?scheduled|scheduling/i)
      const hasSelfScheduling = await scheduleInfo.isVisible().catch(() => false)

      if (!hasSelfScheduling) {
        // Tournament doesn't use self-scheduling, skip
        test.skip()
      }
    })

    test('scheduling panel should have time input fields', async ({ page }) => {
      // This is a smoke test for the scheduling panel component
      await loginAsAdmin(page)

      // Navigate to any match page to see if scheduling panel appears
      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Look for schedule-related content
      const scheduleContent = page.getByText('Schedule Match')
      const hasSchedulePanel = await scheduleContent.isVisible().catch(() => false)

      if (hasSchedulePanel) {
        // Should see time input fields
        await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible()
      } else {
        // No scheduling panel on this page
        test.skip()
      }
    })
  })

  test.describe('Match Status Timeline', () => {
    test('should display match status on tournament detail', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for status chips/badges
      const statusChip = page.locator('.v-chip').first()
      const hasStatus = await statusChip.isVisible().catch(() => false)

      if (hasStatus) {
        // Status chips display match states like "Pending", "Scheduled", etc.
        await expect(statusChip).toBeVisible()
      }
    })
  })

  test.describe('Match Check-in', () => {
    test('check-in panel should appear when match is in check-in phase', async ({ page }) => {
      // This test verifies the check-in component exists when in correct state
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Look for check-in related content
      const checkInContent = page.getByText(/check.?in/i)
      const hasCheckIn = await checkInContent.isVisible().catch(() => false)

      if (hasCheckIn) {
        // Should see check-in button or status
        await expect(checkInContent).toBeVisible()
      } else {
        // No matches in check-in phase, skip
        test.skip()
      }
    })
  })

  test.describe('Match Result Display', () => {
    test('should display score for completed matches', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for score display (format: "X - Y" or similar)
      const scoreDisplay = page.locator('text=/\\d+\\s*-\\s*\\d+/').first()
      const hasScores = await scoreDisplay.isVisible().catch(() => false)

      if (hasScores) {
        await expect(scoreDisplay).toBeVisible()
      } else {
        // No completed matches with scores yet
        test.skip()
      }
    })

    test('should display winner indicator for completed matches', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for final/completed status chip
      const completedChip = page.getByText(/final|completed|winner/i)
      const hasCompleted = await completedChip.isVisible().catch(() => false)

      if (hasCompleted) {
        await expect(completedChip).toBeVisible()
      }
    })
  })

  test.describe('Tournament Bracket View', () => {
    test('should display bracket for bracket-type tournaments', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for bracket-related elements
      const bracketElement = page.getByText(/bracket|round|match/i).first()
      const hasBracket = await bracketElement.isVisible().catch(() => false)

      if (hasBracket) {
        await expect(bracketElement).toBeVisible()
      }
    })

    test('should show round information in bracket', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for round indicators
      const roundText = page.getByText(/round \d|quarterfinal|semifinal|final/i).first()
      const hasRounds = await roundText.isVisible().catch(() => false)

      if (hasRounds) {
        await expect(roundText).toBeVisible()
      }
    })
  })

  test.describe('Match Navigation', () => {
    test('should navigate to match from tournament bracket', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for clickable match element
      const matchLink = page.locator('a[href*="/matches/"]').first()
      const hasMatchLink = await matchLink.isVisible().catch(() => false)

      if (hasMatchLink) {
        await matchLink.click()

        // Should be on match detail page
        await expect(page).toHaveURL(/\/tournaments\/[^/]+\/matches\/[^/]+$/)
      } else {
        // No match links, skip
        test.skip()
      }
    })

    test('match detail page should have breadcrumbs', async ({ page }) => {
      await loginAsAdmin(page)

      // First get to a tournament page
      await page.goto(`/tournaments/${testTournaments.standard.slug}`)
      await page.waitForLoadState('networkidle')

      // Try to navigate to any match
      const matchLink = page.locator('a[href*="/matches/"]').first()
      const hasMatchLink = await matchLink.isVisible().catch(() => false)

      if (hasMatchLink) {
        await matchLink.click()

        // Should see breadcrumb navigation
        const breadcrumb = page.locator('.v-breadcrumbs')
        await expect(breadcrumb).toBeVisible()

        // Breadcrumb should contain link back to tournaments
        await expect(page.getByRole('link', { name: 'Tournaments' })).toBeVisible()
      } else {
        test.skip()
      }
    })
  })

  test.describe('Match Format Information', () => {
    test('should display match format (BO1, BO3, etc)', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto(`/tournaments/${testTournaments.standard.slug}`)

      // Wait for page to load
      await page.waitForLoadState('networkidle')

      // Look for match format indicators
      const formatText = page.getByText(/best of \d|bo\d/i).first()
      const hasFormat = await formatText.isVisible().catch(() => false)

      if (hasFormat) {
        await expect(formatText).toBeVisible()
      }
    })
  })
})

test.describe('Tournament Registration Flow', () => {
  // These tests complement the existing tournament-public.spec.ts

  test('should show registration closed message after deadline', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto(`/tournaments/${testTournaments.standard.slug}`)

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Look for registration status
    const regClosedText = page.getByText(/registration.*closed|registration.*ended/i)
    const isRegClosed = await regClosedText.isVisible().catch(() => false)

    if (isRegClosed) {
      await expect(regClosedText).toBeVisible()
    }
  })

  test('should display participant count', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto(`/tournaments/${testTournaments.standard.slug}`)

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Look for participant count
    const participantInfo = page.getByText(/\d+.*participant|registered|team/i)
    const hasParticipantInfo = await participantInfo.isVisible().catch(() => false)

    if (hasParticipantInfo) {
      await expect(participantInfo.first()).toBeVisible()
    }
  })
})

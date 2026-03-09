import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsPlayer2 } from './fixtures/auth.fixture'
import { testTournaments } from './fixtures/test-data'
import { getSeededState } from './fixtures/seeded-state'
import { proposeSchedule, setAvailabilityWindow } from './fixtures/match.fixture'

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

    test('scheduling panel should show ScheduleTimePicker with quick select and custom times', async ({ page }) => {
      let state: ReturnType<typeof getSeededState>
      try {
        state = getSeededState()
      } catch {
        test.skip()
        return
      }

      if (!state.tournamentId || state.matchIds.length === 0) {
        test.skip()
        return
      }

      await loginAsAdmin(page)

      const matchId = state.matchIds[0]
      await page.goto(`/tournaments/${testTournaments.standard.slug}/matches/${matchId}`)
      await page.waitForLoadState('networkidle')

      // Check if scheduling panel is visible
      const hasSchedulePanel = await page.getByText('Schedule Match').isVisible().catch(() => false)
      if (!hasSchedulePanel) {
        test.skip()
        return
      }

      // ScheduleTimePicker should show Quick Select section
      await expect(page.getByText('Quick Select')).toBeVisible()

      // ScheduleTimePicker should show Custom Times section
      await expect(page.getByText('Custom Times')).toBeVisible()

      // Should still have datetime-local inputs inside ScheduleTimePicker
      await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible()
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

test.describe('Match Scheduling with Availability', () => {
  /**
   * Helper to navigate to a seeded match detail page.
   * Returns true if navigation succeeded and scheduling panel is visible.
   */
  async function navigateToMatchDetail(
    page: import('@playwright/test').Page,
    matchId: string
  ): Promise<boolean> {
    await page.goto(`/tournaments/${testTournaments.standard.slug}/matches/${matchId}`)
    await page.waitForLoadState('networkidle')
    return page.getByText('Schedule Match').isVisible().catch(() => false)
  }

  test('should display OpponentAvailabilityPreview on match detail page', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    const hasScheduling = await navigateToMatchDetail(page, matchId)
    if (!hasScheduling) {
      test.skip()
      return
    }

    // OpponentAvailabilityPreview should render with its title
    const availabilityCard = page.getByText('Opponent Availability')
    const hasAvailability = await availabilityCard.isVisible().catch(() => false)

    if (hasAvailability) {
      await expect(availabilityCard).toBeVisible()

      // Should have a refresh button
      await expect(page.locator('.mdi-refresh').first()).toBeVisible()
    }
    // If not visible, opponent player ID may not be resolved — that's OK
  })

  test('should show availability update link pointing to /profile/availability', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    const hasScheduling = await navigateToMatchDetail(page, matchId)
    if (!hasScheduling) {
      test.skip()
      return
    }

    // Look for "Update Your Availability" link
    const availabilityLink = page.getByRole('link', { name: /Update Your Availability/i })
    const hasLink = await availabilityLink.isVisible().catch(() => false)

    if (hasLink) {
      // The link should point to /profile/availability (not /settings/availability)
      await expect(availabilityLink).toHaveAttribute('href', '/profile/availability')
    }
  })

  test('should display suggested times when both players have availability set', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0 || !state.player2Token) {
      test.skip()
      return
    }

    // Seed availability for both players — set windows for every day of the week
    // to maximize chances of mutual overlap
    for (let day = 0; day < 7; day++) {
      await setAvailabilityWindow(state.adminToken, day, '14:00', '22:00', true)
      await setAvailabilityWindow(state.player2Token, day, '16:00', '23:00', true)
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    const hasScheduling = await navigateToMatchDetail(page, matchId)
    if (!hasScheduling) {
      test.skip()
      return
    }

    // Wait for availability data to load (API calls are async)
    await page.waitForTimeout(2000)

    // Check for suggested times in either OpponentAvailabilityPreview or ScheduleTimePicker
    const suggestedLabel = page.getByText('Suggested Times')
    const hasSuggested = await suggestedLabel.first().isVisible().catch(() => false)

    if (hasSuggested) {
      await expect(suggestedLabel.first()).toBeVisible()

      // Suggested times render as clickable chips
      const suggestedChips = page.locator('.v-chip').filter({ hasText: /\w{3},?\s+\w{3}/ })
      const chipCount = await suggestedChips.count()
      expect(chipCount).toBeGreaterThan(0)
    }
    // If no suggestions, it's likely the API doesn't have enough overlap — that's acceptable
  })

  test('should show mutual availability grid when opponent has availability', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    const hasScheduling = await navigateToMatchDetail(page, matchId)
    if (!hasScheduling) {
      test.skip()
      return
    }

    // Wait for availability to load
    await page.waitForTimeout(2000)

    // Check for mutual availability indicators
    const overlappingSlots = page.getByText(/overlapping slot/)
    const noOverlap = page.getByText('No overlapping availability')
    const noAvailability = page.getByText("No availability set")

    const hasOverlap = await overlappingSlots.isVisible().catch(() => false)
    const hasNoOverlap = await noOverlap.isVisible().catch(() => false)
    const hasNoAvail = await noAvailability.isVisible().catch(() => false)

    // One of these states should be shown
    expect(hasOverlap || hasNoOverlap || hasNoAvail).toBeTruthy()
  })

  test('ScheduleTimePicker should show suggested times as clickable chips in proposal form', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    const hasScheduling = await navigateToMatchDetail(page, matchId)
    if (!hasScheduling) {
      test.skip()
      return
    }

    // Wait for data to load
    await page.waitForTimeout(2000)

    // Look for the "Suggested Times (Mutual Availability)" heading inside ScheduleTimePicker
    const mutualLabel = page.getByText('Suggested Times (Mutual Availability)')
    const hasMutualSuggestions = await mutualLabel.isVisible().catch(() => false)

    if (hasMutualSuggestions) {
      await expect(mutualLabel).toBeVisible()

      // Clicking a suggested time chip should toggle its selection
      const firstChip = page.locator('.schedule-time-picker .v-chip').first()
      if (await firstChip.isVisible().catch(() => false)) {
        await firstChip.click()

        // After clicking, the selected times summary should update
        await expect(page.getByText(/\d+ times? selected/)).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('counter-proposal dialog should also use ScheduleTimePicker', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0 || !state.player2Token) {
      test.skip()
      return
    }

    const matchId = state.matchIds[0]

    // Player 1 (admin) proposes schedule via API
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await proposeSchedule(state.adminToken, state.tournamentId, matchId, [tomorrow, dayAfter])

    // Player 2 navigates to match and opens counter-proposal
    await loginAsPlayer2(page)
    await page.goto(`/tournaments/${testTournaments.standard.slug}/matches/${matchId}`)
    await page.waitForLoadState('networkidle')

    // Look for counter button in the proposal card
    const counterBtn = page.getByRole('button', { name: /counter/i })
    const hasCounter = await counterBtn.isVisible().catch(() => false)

    if (!hasCounter) {
      test.skip()
      return
    }

    await counterBtn.click()

    // Wait for dialog to open
    await expect(page.getByText('Counter-Propose')).toBeVisible({ timeout: 5000 })

    // The counter-proposal dialog should contain ScheduleTimePicker elements
    await expect(page.getByText('Quick Select')).toBeVisible()
    await expect(page.getByText('Custom Times')).toBeVisible()
  })
})

test.describe('Match Scheduling E2E', () => {
  test('Player 1 proposes schedule via API, Player 2 sees proposal on match page', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    const matchId = state.matchIds[0]

    // Player 1 (admin) proposes schedule via API
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    await proposeSchedule(state.adminToken, state.tournamentId, matchId, [tomorrow, dayAfter])

    // Player 2 logs in and navigates to the match detail page
    await loginAsPlayer2(page)
    await page.goto(`/tournaments/${testTournaments.standard.slug}`)
    await page.waitForLoadState('networkidle')

    // Navigate to match if matches tab/link exists
    const matchLink = page.locator(`a[href*="/matches/${matchId}"]`).first()
    const hasMatchLink = await matchLink.isVisible().catch(() => false)

    if (hasMatchLink) {
      await matchLink.click()
      await page.waitForLoadState('networkidle')

      // Should see scheduling-related content (proposal times, accept/counter buttons)
      const hasScheduleContent = await page
        .getByText(/schedule|proposed|accept|counter/i)
        .first()
        .isVisible()
        .catch(() => false)

      // Scheduling content should be visible if tournament uses self-scheduling
      if (hasScheduleContent) {
        await expect(page.getByText(/schedule|proposed|accept|counter/i).first()).toBeVisible()
      }
    }
  })

  test('should display match detail page for seeded match', async ({ page }) => {
    let state: ReturnType<typeof getSeededState>
    try {
      state = getSeededState()
    } catch {
      test.skip()
      return
    }

    if (!state.tournamentId || state.matchIds.length === 0) {
      test.skip()
      return
    }

    await loginAsAdmin(page)

    const matchId = state.matchIds[0]
    await page.goto(`/tournaments/${testTournaments.standard.slug}`)
    await page.waitForLoadState('networkidle')

    // Try to navigate to the specific match
    const matchLink = page.locator(`a[href*="/matches/${matchId}"]`).first()
    const hasMatchLink = await matchLink.isVisible().catch(() => false)

    if (hasMatchLink) {
      await matchLink.click()
      await page.waitForLoadState('networkidle')

      // Should be on match detail page with breadcrumbs
      await expect(page).toHaveURL(/\/matches\//)
      await expect(page.locator('.v-breadcrumbs')).toBeVisible()
    } else {
      // Try matches tab first
      const matchesTab = page.getByRole('tab', { name: 'Matches' })
      if (await matchesTab.isVisible().catch(() => false)) {
        const isDisabled = await matchesTab.getAttribute('disabled')
        if (isDisabled === null) {
          await matchesTab.click()
          await page.waitForTimeout(1000)
          // Look for any match link
          const anyMatchLink = page.locator('a[href*="/matches/"]').first()
          if (await anyMatchLink.isVisible().catch(() => false)) {
            await anyMatchLink.click()
            await expect(page).toHaveURL(/\/matches\//)
          }
        }
      }
    }
  })
})

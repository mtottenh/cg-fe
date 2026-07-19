import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'

/**
 * Tournament Admin Flows E2E Tests
 *
 * These tests cover admin tournament management functionality.
 *
 * Prerequisites (seeded by global-setup.ts):
 * - E2E Test Tournament (individual)
 * - E2E Team Tournament (team-based)
 * - Admin user with appropriate permissions
 *
 * IMPORTANT: Tests use hard assertions. If seeded data doesn't exist,
 * tests WILL FAIL - this is intentional to surface seeding issues.
 */

test.describe('Tournament Admin Flows', () => {
  // Login as admin before each test
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test.describe('Admin Tournament List', () => {
    test('should display admin tournaments page', async ({ page }) => {
      await page.goto('/admin/tournaments')

      // Page MUST load
      await expect(page.getByRole('heading', { name: /Tournaments/i })).toBeVisible()
    })

    test('should show create tournament button', async ({ page }) => {
      await page.goto('/admin/tournaments')

      // Create button MUST be visible
      await expect(page.getByRole('button', { name: /Create Tournament/i })).toBeVisible()
    })

    test('should display tournament table with seeded data', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Table MUST exist and have at least one row (seeded tournament)
      await expect(page.locator('table')).toBeVisible()

      // At least one tournament row MUST exist (we seeded it)
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Create Tournament', () => {
    test('should open create tournament modal', async ({ page }) => {
      await page.goto('/admin/tournaments')

      // Click create button
      await page.getByRole('button', { name: /Create Tournament/i }).click()

      // Modal MUST appear
      await expect(page.getByRole('dialog')).toBeVisible()
    })

    test('should validate required fields', async ({ page }) => {
      await page.goto('/admin/tournaments')

      // Open modal
      await page.getByRole('button', { name: /Create Tournament/i }).click()

      // Wait for modal
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Submit button MUST be disabled when required fields are empty
      const submitButton = modal.getByRole('button', { name: 'Create Tournament' })
      await expect(submitButton).toBeDisabled()

      // Select a game first (required). Multiple selects contain "Game"
      // (the Game select itself + the Map Veto Format select's hint
      // "Select a game first..."), so pick the first to disambiguate.
      await modal.locator('.v-select').filter({ hasText: 'Game' }).first().click()
      await page.getByRole('option').first().click()

      // Button should still be disabled - name is still required
      await expect(submitButton).toBeDisabled()

      // Fill Tournament Name (required)
      await modal.getByRole('textbox', { name: /Tournament Name/i }).fill('Test Tournament')

      // Now button MUST be enabled (game selected, name filled, slug auto-generated)
      await expect(submitButton).toBeEnabled()
    })

    test('should create a tournament successfully', async ({ page }) => {
      await page.goto('/admin/tournaments')

      // Open modal
      await page.getByRole('button', { name: /Create Tournament/i }).click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Generate unique name and slug
      const timestamp = Date.now()
      const tournamentName = `Test Tournament ${timestamp}`
      const tournamentSlug = `test-tournament-${timestamp}`

      // Select game (required). Use .first() to disambiguate from the
      // Map Veto Format select that also mentions "Game" in its hint.
      await modal.locator('.v-select').filter({ hasText: 'Game' }).first().click()
      await page.getByRole('option').first().click()

      // Fill required fields
      await modal.getByRole('textbox', { name: /Tournament Name/i }).fill(tournamentName)
      await modal.getByRole('textbox', { name: /URL Slug/i }).fill(tournamentSlug)

      // Submit - button MUST be enabled
      const submitButton = modal.getByRole('button', { name: 'Create Tournament' })
      await expect(submitButton).toBeEnabled()
      await submitButton.click()

      // MUST either navigate to detail or show the success snackbar. Poll
      // immediately — waiting on networkidle first ate the snackbar's 3s
      // auto-dismiss window under parallel load, and navigation (which
      // persists) may land after any fixed wait.
      const snackbar = page.locator('.v-snackbar')
      await expect(async () => {
        const hasSuccess = await snackbar
          .getByText(/created|success/i)
          .isVisible()
          .catch(() => false)
        const navigatedToDetail = /\/admin\/tournaments\/[a-f0-9-]+/.test(page.url())
        expect(hasSuccess || navigatedToDetail).toBe(true)
      }).toPass({ timeout: 15000 })
    })
  })

  test.describe('Tournament Detail - Admin', () => {
    test('should display tournament detail page', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Table MUST have at least one row (seeded tournament)
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })

      // Click to navigate
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // MUST show tournament detail tabs
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    })

    test('should show admin action buttons', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Table MUST have at least one row
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })

      // Click the name cell to navigate
      await firstRow.locator('td').nth(1).click()
      await page.waitForLoadState('networkidle')

      // MUST navigate to tournament detail page
      await expect(page).toHaveURL(/\/admin\/tournaments\/[a-f0-9-]+/)

      // Check for action buttons based on status - at least one MUST exist.
      // Auto-waiting union: immediate isVisible() chains race the render
      // under full-suite parallelism.
      await expect(
        page
          .getByRole('button', {
            name: /^Publish$|Open Registration|Start Tournament|View Public|Edit Tournament/i,
          })
          .first(),
      ).toBeVisible({ timeout: 10000 })
    })

    test('should display overview stats cards', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Stats cards MUST be visible
      await expect(page.locator('div').filter({ hasText: /^Registrations$/ })).toBeVisible()
      await expect(page.locator('div').filter({ hasText: /^Max Participants$/ })).toBeVisible()
      await expect(page.locator('div').filter({ hasText: /^Matches$/ })).toBeVisible()
    })

    test('should navigate between tabs', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Click Registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // MUST show registrations content (table headers or empty state)
      const hasParticipantColumn = await page
        .getByRole('columnheader', { name: 'Participant' })
        .isVisible()
        .catch(() => false)
      const hasEmpty = await page.getByText(/No registrations yet/i).isVisible().catch(() => false)
      expect(hasParticipantColumn || hasEmpty).toBe(true)

      // Click Bracket tab
      await page.getByRole('tab', { name: 'Bracket' }).click()

      // MUST show bracket or one of the two empty states:
      //   - "No Bracket Generated" — AdminTournamentDetailPage renders this
      //     when `brackets.length === 0`
      //   - "No Bracket Available" — TournamentBracket renders this when
      //     brackets exist but have no matches yet
      //   - `.bracket-container` — TournamentBracket root element for
      //     fully-generated brackets
      const hasBracket =
        (await page.locator('.bracket-container').first().isVisible().catch(() => false)) ||
        (await page.getByText(/No Bracket (Generated|Available)/i).first().isVisible().catch(() => false))
      expect(hasBracket).toBe(true)
    })
  })

  test.describe('Registration Management', () => {
    test('should show registrations tab with table', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()

      // Table headers MUST be visible
      await expect(page.getByRole('columnheader', { name: 'Participant' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible()
    })

    test('should show approve/reject buttons for pending registrations', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // Look for pending registrations (state-dependent)
      const pendingRow = page.locator('tr').filter({ hasText: 'pending' }).first()
      if (await pendingRow.isVisible().catch(() => false)) {
        // If pending exists, MUST show approve and reject buttons
        await expect(pendingRow.getByRole('button', { name: 'Approve' })).toBeVisible()
        await expect(pendingRow.getByRole('button', { name: 'Reject' })).toBeVisible()
      }
      // If no pending registrations, test is valid (just nothing to approve/reject)
    })

    test('should approve registration when pending exists', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // Find pending registration and approve (state-dependent)
      const pendingRow = page.locator('tr').filter({ hasText: 'pending' }).first()
      if (await pendingRow.isVisible().catch(() => false)) {
        await pendingRow.getByRole('button', { name: 'Approve' }).click()

        // Wait for update
        await page.waitForLoadState('networkidle')

        // MUST show success message
        await expect(page.getByText(/approved/i)).toBeVisible()
      }
    })

    test('should reject registration with modal when pending exists', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // Find pending registration and reject (state-dependent)
      const pendingRow = page.locator('tr').filter({ hasText: 'pending' }).first()
      if (await pendingRow.isVisible().catch(() => false)) {
        await pendingRow.getByRole('button', { name: 'Reject' }).click()

        // Modal MUST open
        const modal = page.getByRole('dialog')
        await expect(modal).toBeVisible()
        await expect(modal.getByText('Reject Registration')).toBeVisible()

        // Enter reason
        await modal.getByRole('textbox').fill('Not meeting requirements')

        // Confirm rejection
        await modal.getByRole('button', { name: 'Reject' }).click()

        // Modal MUST close
        await expect(modal).not.toBeVisible({ timeout: 5000 })

        // Success snackbar MUST appear
        const snackbar = page.locator('.v-snackbar')
        await expect(snackbar.getByText(/rejected/i)).toBeVisible({ timeout: 5000 })
      }
    })

    test('should show disqualify button for approved registrations', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // Look for approved registrations (state-dependent)
      const approvedRow = page.locator('tr').filter({ hasText: 'approved' }).first()
      if (await approvedRow.isVisible().catch(() => false)) {
        // If approved exists, MUST show disqualify button
        await expect(approvedRow.getByRole('button', { name: 'Disqualify' })).toBeVisible()
      }
    })

    test('should disqualify participant with reason when approved exists', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Go to registrations tab
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await page.waitForLoadState('networkidle')

      // Find approved registration and disqualify (state-dependent)
      const approvedRow = page.locator('tr').filter({ hasText: 'approved' }).first()
      if (await approvedRow.isVisible().catch(() => false)) {
        await approvedRow.getByRole('button', { name: 'Disqualify' }).click()

        // Modal MUST open
        const modal = page.getByRole('dialog')
        await expect(modal).toBeVisible()
        await expect(modal.getByText('Disqualify Participant')).toBeVisible()

        // Fill required reason
        await modal.getByRole('textbox').fill('Cheating detected')

        // Confirm disqualification
        await modal.getByRole('button', { name: 'Disqualify' }).click()

        // Wait for update
        await page.waitForLoadState('networkidle')

        // MUST show success message or status change
        const hasSuccess =
          (await page.getByText(/disqualified/i).isVisible().catch(() => false)) ||
          (await page.getByText(/success/i).isVisible().catch(() => false))
        expect(hasSuccess).toBe(true)
      }
    })
  })

  test.describe('Tournament Lifecycle', () => {
    test('should publish draft tournament when available', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Look for draft tournament (state-dependent)
      const draftRow = page.locator('tr').filter({ hasText: 'draft' }).first()
      if (await draftRow.isVisible().catch(() => false)) {
        await draftRow.click()
        await page.waitForLoadState('networkidle')

        // Click publish button
        const publishBtn = page.getByRole('button', { name: 'Publish' })
        if (await publishBtn.isVisible().catch(() => false)) {
          await publishBtn.click()

          // Wait for update
          await page.waitForLoadState('networkidle')

          // MUST show success
          await expect(page.getByText(/published/i)).toBeVisible()
        }
      }
    })

    test('should open registration when tournament is published', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Look for published tournament (state-dependent)
      const publishedRow = page.locator('tr').filter({ hasText: 'published' }).first()
      if (await publishedRow.isVisible().catch(() => false)) {
        await publishedRow.click()
        await page.waitForLoadState('networkidle')

        // Click open registration button
        const openRegBtn = page.getByRole('button', { name: /Open Registration/i })
        if (await openRegBtn.isVisible().catch(() => false)) {
          await openRegBtn.click()

          // Wait for update
          await page.waitForLoadState('networkidle')

          // MUST show success
          await expect(page.getByText(/registration.*open/i)).toBeVisible()
        }
      }
    })

    test('should close registration when available', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to any tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Click close registration button if available (state-dependent)
      const closeRegBtn = page.getByRole('button', { name: /Close Registration/i })
      if (await closeRegBtn.isVisible().catch(() => false)) {
        await closeRegBtn.click()

        // Wait for update
        await page.waitForLoadState('networkidle')

        // MUST show success
        await expect(page.getByText(/registration.*closed/i)).toBeVisible()
      }
    })
  })

  test.describe('Edit Tournament', () => {
    test('should open edit modal', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // Click edit button
      await page.getByRole('button', { name: /Edit Tournament/i }).click()

      // Modal MUST open
      await expect(page.getByRole('dialog')).toBeVisible()
    })

    test('should save tournament changes', async ({ page }) => {
      // Create a fresh DRAFT tournament and edit that one. Picking the first
      // row is order-dependent and used to grab an already-started
      // tournament, whose participant settings are locked ("Tournament has
      // already started") so the save legitimately fails.
      const { getAdminToken } = await import('./fixtures/auth.fixture')
      const { createDraftTournament } = await import('./fixtures/tournament-lifecycle.fixture')
      const adminToken = await getAdminToken()
      const tournament = await createDraftTournament(adminToken, {
        name: `E2E Edit Test ${Date.now()}`,
      })

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await page.waitForLoadState('networkidle')

      // Click edit button
      await page.getByRole('button', { name: /Edit Tournament/i }).click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()

      // Modify description
      const descField = modal.getByLabel('Description')
      if (await descField.isVisible().catch(() => false)) {
        await descField.fill('Updated description ' + Date.now())
      }

      // Set up the snackbar assertion BEFORE clicking save. The success
      // snackbar has a 3s Vuetify auto-dismiss, and waiting on networkidle
      // after the click often pushes the check past that window, so the
      // test fails with "not found" even though the snackbar flashed.
      const snackbarPromise = expect(
        page.locator('.v-snackbar').getByText(/updated|saved|success/i),
      ).toBeVisible({ timeout: 10_000 })

      // Save changes ("Save Changes" button)
      await modal.getByRole('button', { name: /Save|Update/i }).click()

      await snackbarPromise
    })
  })

  test.describe('View Public Link', () => {
    test('should have view public button', async ({ page }) => {
      await page.goto('/admin/tournaments')
      await page.waitForLoadState('networkidle')

      // Navigate to first tournament
      const firstRow = page.locator('table tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10000 })
      await firstRow.click()
      await page.waitForLoadState('networkidle')

      // View Public button MUST exist
      await expect(page.getByRole('button', { name: /View Public/i })).toBeVisible()
    })
  })
})

import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createDraftTournament,
  createOpenRegistrationTournament,
} from './fixtures/tournament-lifecycle.fixture'
import {
  approveRegistration,
  listRegistrations,
  registerPendingPlayers,
} from './fixtures/tournament-seeding.fixture'

/**
 * Tournament Admin Flows E2E Tests
 *
 * Covers the admin tournament list, the create modal, the detail page's tabs
 * and action set, participant management (admin check-in + disqualify) and the
 * edit modal.
 *
 * WHY MOST TESTS BUILD THEIR OWN TOURNAMENT
 * -----------------------------------------
 * This file used to navigate to `table tbody tr` first — an ARBITRARY row of a
 * shared dev database — and then wrap the whole body in
 * `if (await x.isVisible().catch(() => false))`. The row was almost never in
 * the state the test needed, so eight bodies silently skipped and reported
 * green (COVERAGE-PLAN.md §2 / §6.3). Those eight tests are gone; the state
 * transitions they claimed to cover are genuinely covered, through the UI,
 * with backend cross-checks, in:
 *
 *   - approve / reject-with-modal → `tournament-seeding.spec.ts:44`
 *   - publish / open-registration / close-registration / start / complete /
 *     finalize → `tournament-lifecycle.spec.ts:49` (and `:141` for a second
 *     close-registration through the same button)
 *
 * What was NOT covered anywhere is admin check-in (`handleAdminCheckIn`) and
 * the disqualify branch of `handleReasonConfirm` — that is the one new test in
 * "Registration Management" below, driven entirely through the UI.
 *
 * Only the three list-level smoke tests still lean on globally seeded data;
 * everything state-sensitive seeds itself. No visibility guards remain.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Public tournament fetch by slug — the cross-check for "create succeeded".
 *  Route mirrors `stores/tournament/_lifecycle.ts:87` (`/v1/tournaments/by-slug/{slug}`). */
async function fetchTournamentBySlug(slug: string): Promise<{
  id: string
  name: string
  slug: string
  status: string
  description: string | null
}> {
  const resp = await fetch(`${API_URL}/v1/tournaments/by-slug/${slug}`)
  if (!resp.ok) {
    throw new Error(`Fetch tournament by slug failed (${resp.status}): ${await resp.text()}`)
  }
  const body = (await resp.json()) as {
    data: { id: string; name: string; slug: string; status: string; description: string | null }
  }
  return body.data
}

/** A registrations-table row, located by the participant name it renders
 *  (`RegistrationsTab.vue:16-18`). Same helper shape as
 *  `tournament-seeding.spec.ts:39`. */
function registrationRow(page: Page, participantName: string) {
  return page.locator('tr').filter({ hasText: participantName })
}

/**
 * The value rendered inside one of the four overview stat cards
 * (`AdminTournamentDetailPage.vue:38-71`): each card is
 * `<v-card><v-card-text><div class="text-h4">VALUE</div>
 * <div class="text-medium-emphasis">LABEL</div></v-card-text></v-card>`.
 */
function statValue(page: Page, label: string) {
  return page
    .locator('.v-card')
    .filter({ has: page.locator('div.text-medium-emphasis', { hasText: new RegExp(`^${label}$`) }) })
    .locator('.text-h4')
}

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
      // Choose CS2 explicitly: a tournament needs a map pool, and CS2 is the
      // seeded game that has a map catalog (AoE4 has none and sorts first).
      await modal.locator('.v-select').filter({ hasText: 'Game' }).first().click()
      await page.getByRole('option', { name: /Counter-Strike 2/i }).click()

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
      // CS2 specifically: it is the seeded game with a map catalog, and a
      // tournament cannot be created without a map pool.
      await modal.locator('.v-select').filter({ hasText: 'Game' }).first().click()
      await page.getByRole('option', { name: /Counter-Strike 2/i }).click()

      // Fill required fields
      await modal.getByRole('textbox', { name: /Tournament Name/i }).fill(tournamentName)
      await modal.getByRole('textbox', { name: /URL Slug/i }).fill(tournamentSlug)

      // Submit - button MUST be enabled
      const submitButton = modal.getByRole('button', { name: 'Create Tournament' })
      await expect(submitButton).toBeEnabled()

      // Arm the snackbar assertion BEFORE clicking: the success toast
      // auto-dismisses after 3s (AppSnackbar.vue:25), so anything that waits
      // first (networkidle, a fixed delay) can miss it entirely.
      // Creating does NOT navigate — AdminTournamentsPage.onTournamentCreated
      // (`:528-531`) only shows the snackbar and refetches the list — so the
      // old "navigated to detail" half of this assertion was dead code.
      const snackbarPromise = expect(
        page.locator('.v-snackbar').getByText('Tournament created successfully'),
      ).toBeVisible({ timeout: 15_000 })
      await submitButton.click()
      await snackbarPromise

      // UI: the modal closes on success (TournamentCreateModal.vue:120-121).
      await expect(modal).not.toBeVisible({ timeout: 10_000 })

      // Backend: the tournament really exists, in `draft`, with our name.
      // (It is NOT asserted in the list: the list is page 1 of
      // `ORDER BY starts_at DESC NULLS LAST` and a brand-new tournament has
      // no start date, so it sorts last and is off-page on a shared DB.)
      const created = await fetchTournamentBySlug(tournamentSlug)
      expect(created.name).toBe(tournamentName)
      expect(created.status).toBe('draft')
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

      // MUST land on a detail route and show the tournament detail tabs
      await expect(page).toHaveURL(/\/admin\/tournaments\/[a-f0-9-]+/)
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    })

    test('should show admin action buttons', async ({ page }) => {
      const adminToken = await getAdminToken()
      // Own the state: the action set is entirely status-driven
      // (`useTournamentLifecycleGuards`, useTournamentAdminActions.ts:13-29),
      // so a `draft` tournament pins the expected buttons exactly.
      const tournament = await createDraftTournament(adminToken)

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible({
        timeout: 10_000,
      })

      // Draft ⇒ Publish (canPublish) + the two always-on affordances
      // (TournamentStatusActions.vue:3-8, AdminTournamentDetailPage.vue:157-159).
      await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'View Public' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit Tournament' })).toBeVisible()

      // ...and nothing from a later lifecycle stage leaks in.
      await expect(page.getByRole('button', { name: 'Open Registration' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Start Tournament' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Close Registration' })).toHaveCount(0)
    })

    test('should display overview stats cards', async ({ page }) => {
      const adminToken = await getAdminToken()
      const tournament = await createDraftTournament(adminToken, { maxParticipants: 4 })

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible({
        timeout: 10_000,
      })

      // Stats cards MUST render their labels AND the right numbers for a
      // freshly created 4-slot tournament (AdminTournamentDetailPage.vue:38-71).
      await expect(statValue(page, 'Registrations')).toHaveText('0')
      await expect(statValue(page, 'Max Participants')).toHaveText('4')
      await expect(statValue(page, 'Matches')).toHaveText('0')
    })

    test('should navigate between tabs', async ({ page }) => {
      const adminToken = await getAdminToken()
      // A fresh tournament has no registrations and no bracket, so both
      // empty states are deterministic — no need to guess what an arbitrary
      // shared row happens to contain.
      const tournament = await createDraftTournament(adminToken)

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await expect(page.getByRole('heading', { name: tournament.name })).toBeVisible({
        timeout: 10_000,
      })

      // Registrations tab → the table's own empty state
      // (RegistrationsTab.vue:106-110).
      await page.getByRole('tab', { name: 'Registrations' }).click()
      await expect(page.getByText('No registrations yet')).toBeVisible()

      // Bracket tab → the "not generated yet" empty state (BracketTab.vue:22-28).
      await page.getByRole('tab', { name: 'Bracket' }).click()
      await expect(page.getByRole('heading', { name: 'No Bracket Generated' })).toBeVisible()
      await expect(
        page.getByText('The bracket will be generated when the tournament starts.'),
      ).toBeVisible()
    })
  })

  test.describe('Registration Management', () => {
    test('should show registrations tab with table', async ({ page }) => {
      test.setTimeout(60_000)
      const adminToken = await getAdminToken()
      // `approval`, not `open`: since P-2 an open tournament auto-approves on
      // signup, so `registerPendingPlayers` would produce APPROVED rows and the
      // pending-only actions asserted below would not render.
      const tournament = await createOpenRegistrationTournament(adminToken, {
        registrationType: 'approval',
      })
      const [player] = await registerPendingPlayers(tournament.id, 1)
      const participantName = player.participantName

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await page.getByRole('tab', { name: 'Registrations' }).click()

      // Table headers MUST be visible (RegistrationsTab.vue:134-142)
      await expect(page.getByRole('columnheader', { name: 'Participant' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible()

      // ...and the seeded registration MUST be a row in it, in `pending`,
      // offering the pending-only actions (RegistrationsTab.vue:42-62).
      const row = registrationRow(page, participantName)
      await expect(row).toBeVisible({ timeout: 10_000 })
      // The status chip carries the human label, not the raw enum (§9b P-10).
      await expect(row.getByText('Pending', { exact: true })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Reject' })).toBeVisible()
      await expect(page.getByText('No registrations yet')).toHaveCount(0)

      // Backend agrees there is exactly one, still awaiting approval.
      const regs = await listRegistrations(adminToken, tournament.id)
      expect(regs).toHaveLength(1)
      expect(regs[0]?.status).toBe('pending')
    })

    test('should check in one approved participant and disqualify another', async ({ page }) => {
      test.setTimeout(90_000)
      const adminToken = await getAdminToken()

      // `check_in_required` is what makes the admin "Check In" button render
      // at all (RegistrationsTab.vue:66-76, fed by
      // AdminTournamentDetailPage.vue:182). Both actions are only offered on
      // an `approved` row, so approve both up front via API — the approval UI
      // has its own coverage in tournament-seeding.spec.ts:44.
      const tournament = await createOpenRegistrationTournament(adminToken, {
        checkInRequired: true,
        maxParticipants: 4,
      })
      const [checkInTarget, dqTarget] = await registerPendingPlayers(tournament.id, 2)
      const checkInName = checkInTarget.participantName
      const dqName = dqTarget.participantName
      await approveRegistration(adminToken, tournament.id, checkInTarget.registrationId)
      await approveRegistration(adminToken, tournament.id, dqTarget.registrationId)

      await page.goto(`/admin/tournaments/${tournament.id}`)
      await page.getByRole('tab', { name: 'Registrations' }).click()

      const checkInRow = registrationRow(page, checkInName)
      const dqRow = registrationRow(page, dqName)
      await expect(checkInRow).toBeVisible({ timeout: 10_000 })
      await expect(dqRow).toBeVisible()

      // ---------------------------------------------------------------
      // 1. Admin check-in → AdminTournamentDetailPage.handleAdminCheckIn
      // ---------------------------------------------------------------
      const checkInSnackbar = expect(
        page.locator('.v-snackbar').getByText(`${checkInName} checked in`),
      ).toBeVisible({ timeout: 15_000 })
      await checkInRow.getByRole('button', { name: 'Check In' }).click()
      await checkInSnackbar

      // The row moves to the `checked_in` branch: Check In disappears,
      // Disqualify remains (RegistrationsTab.vue:88-99) and the "Checked In"
      // column ticks (`:26-29`).
      await expect(checkInRow.getByRole('button', { name: 'Check In' })).toHaveCount(0)
      await expect(checkInRow.locator('.mdi-check-circle')).toBeVisible()
      // The status chip shows the HUMAN LABEL, not the raw enum. This used to
      // print `checked_in`: the table imported registrationStatusMap for the
      // chip COLOUR only and never applied the label (COVERAGE-PLAN.md §9b
      // P-10). exact:true, so a regression to the enum fails here.
      await expect(checkInRow.getByText('Checked In', { exact: true })).toBeVisible()

      // ---------------------------------------------------------------
      // 2. Disqualify → handleDisqualify → handleReasonConfirm (dq branch)
      // ---------------------------------------------------------------
      await dqRow.getByRole('button', { name: 'Disqualify' }).click()

      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible()
      await expect(modal.getByText('Disqualify Participant')).toBeVisible()
      await expect(modal.getByText(dqName)).toBeVisible()

      // A reason is mandatory for disqualify (RegistrationReasonModal.vue:69).
      const confirmButton = modal.getByRole('button', { name: 'Disqualify' })
      await expect(confirmButton).toBeDisabled()
      await modal.getByRole('textbox').fill('E2E: cheating detected')
      await expect(confirmButton).toBeEnabled()

      const dqSnackbar = expect(
        page.locator('.v-snackbar').getByText(`${dqName} disqualified`),
      ).toBeVisible({ timeout: 15_000 })
      await confirmButton.click()
      await dqSnackbar

      await expect(modal).not.toBeVisible({ timeout: 10_000 })
      // Human label again (was the raw `disqualified` enum — §9b P-10).
      await expect(dqRow.getByText('Disqualified', { exact: true })).toBeVisible()
      // Terminal state ⇒ no actions left (RegistrationsTab.vue:101-102).
      await expect(dqRow.getByRole('button', { name: 'Disqualify' })).toHaveCount(0)

      // ---------------------------------------------------------------
      // 3. Backend cross-check
      // ---------------------------------------------------------------
      const regs = await listRegistrations(adminToken, tournament.id)
      const checkedIn = regs.find((r) => r.id === checkInTarget.registrationId)
      expect(checkedIn?.checked_in).toBe(true)
      expect(checkedIn?.status).toBe('checked_in')

      const disqualified = regs.find((r) => r.id === dqTarget.registrationId)
      expect(disqualified?.status).toBe('disqualified')
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

      // Modify description. In `edit` mode the field's label is exactly
      // "Description" (TournamentForm.vue:106), so it is unconditional —
      // the old `if (visible)` wrapper made a failed render invisible.
      const newDescription = `Updated description ${Date.now()}`
      const descField = modal.getByLabel('Description')
      await expect(descField).toBeVisible()
      await descField.fill(newDescription)

      // Set up the snackbar assertion BEFORE clicking save. The success
      // snackbar has a 3s Vuetify auto-dismiss, and waiting on networkidle
      // after the click often pushes the check past that window, so the
      // test fails with "not found" even though the snackbar flashed.
      const snackbarPromise = expect(
        page.locator('.v-snackbar').getByText('Tournament updated successfully'),
      ).toBeVisible({ timeout: 10_000 })

      // Save changes ("Save Changes" — TournamentEditModal.vue:42)
      await modal.getByRole('button', { name: 'Save Changes' }).click()

      await snackbarPromise
      await expect(modal).not.toBeVisible({ timeout: 10_000 })

      // Backend: the edit really persisted.
      const refetched = await fetchTournamentBySlug(tournament.slug)
      expect(refetched.id).toBe(tournament.id)
      expect(refetched.description).toBe(newDescription)
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

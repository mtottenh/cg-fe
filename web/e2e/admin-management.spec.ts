import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin, register } from './fixtures/auth.fixture'
import { createLeague, createSeason } from './fixtures/league-season-extra.fixture'
import { testUsers, uniqueEmail, uniqueId, uniqueUsername } from './fixtures/test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface BanRecord {
  id: string
  user_id: string
  ban_type: string
  reason: string
  is_active: boolean
  is_permanent: boolean
  lifted_at: string | null
}

interface BanTarget {
  userId: string
  displayName: string
}

/**
 * Register a throwaway account for the ban tests and return its user id.
 *
 * Note: `user_id` and `player_id` are deliberately the SAME uuid for every
 * account (`make_shared_account_ids`, portal-domain/src/services/user.rs:73-77),
 * which is what lets `BanCreateModal` hand a player-search result straight to
 * `POST /v1/admin/bans` as `user_id`.
 */
async function registerBanTarget(): Promise<BanTarget> {
  const displayName = `BanTarget${uniqueId()}`
  const response = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUsername(),
      email: uniqueEmail(),
      password: 'TestPassword123!',
      display_name: displayName,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to register ban target (${response.status}): ${await response.text()}`)
  }
  const body = await response.json()
  return { userId: body.data.user.id, displayName }
}

/** GET /v1/admin/bans?user_id=… — backend handler `bans::list_bans`. */
async function listBansForUser(adminToken: string, userId: string): Promise<BanRecord[]> {
  const response = await fetch(`${API_URL}/v1/admin/bans?user_id=${userId}&per_page=50`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!response.ok) {
    throw new Error(`GET /v1/admin/bans failed (${response.status}): ${await response.text()}`)
  }
  return (await response.json()).data.items
}

/**
 * POST /v1/admin/bans — used ONLY to seed the precondition of the lift test.
 * The creation flow itself is covered through the UI in the test above.
 */
async function createBanViaApi(
  adminToken: string,
  userId: string,
  reason: string
): Promise<BanRecord> {
  const response = await fetch(`${API_URL}/v1/admin/bans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ user_id: userId, ban_type: 'chat', reason }),
  })
  if (!response.ok) {
    throw new Error(`POST /v1/admin/bans failed (${response.status}): ${await response.text()}`)
  }
  return (await response.json()).data
}

/** GET /v1/league-seasons/{id} — backend handler `league_teams::get_season`. */
async function getSeason(
  adminToken: string,
  seasonId: string
): Promise<{ status: string; roster_lock_status: string }> {
  const response = await fetch(`${API_URL}/v1/league-seasons/${seasonId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `GET /v1/league-seasons/${seasonId} failed (${response.status}): ${await response.text()}`
    )
  }
  return (await response.json()).data
}

test.describe('Admin Management', () => {
  test.describe('Admin Dashboard', () => {
    test('should display dashboard page for admin user', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Should see the dashboard heading
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })

    test('should display platform statistics cards', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Should see stat cards
      await expect(page.getByText('Total Users')).toBeVisible()
      await expect(page.getByText('Total Players')).toBeVisible()
      await expect(page.getByText('Active Teams')).toBeVisible()
      await expect(page.getByText('Active Games')).toBeVisible()
    })

    test('should display recent activity section', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Should see recent activity card
      await expect(page.getByText('Recent Activity')).toBeVisible()
      await expect(page.getByText('Last 24 hours')).toBeVisible()
      // Use first() since "Last 7 days" appears twice (for users and teams)
      await expect(page.getByText('Last 7 days').first()).toBeVisible()
    })

    test('should display moderation section with active bans', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Should see moderation card (exact match to avoid sidebar)
      await expect(page.getByText('Moderation', { exact: true })).toBeVisible()
      await expect(page.getByText('active bans')).toBeVisible()

      // Should have link to view all bans (may be uppercase)
      await expect(page.getByRole('link', { name: /view all bans/i })).toBeVisible()
    })

    test('should display quick actions section', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Should see quick actions card
      await expect(page.getByText('Quick Actions')).toBeVisible()

      // Should see action buttons - scope to main content to avoid sidebar duplicates
      const mainContent = page.getByRole('main')
      await expect(mainContent.getByRole('link', { name: 'Manage Leagues' })).toBeVisible()
      await expect(mainContent.getByRole('link', { name: 'Tournaments' })).toBeVisible()
      await expect(mainContent.getByRole('button', { name: 'Ban Player' })).toBeVisible()
      await expect(mainContent.getByRole('link', { name: 'Manage Games' })).toBeVisible()
    })

    test('should navigate to bans page from dashboard', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Click view all bans link (may be uppercase)
      await page.getByRole('link', { name: /view all bans/i }).click()

      // Should be on bans page
      await expect(page).toHaveURL('/admin/bans')
      await expect(page.getByRole('heading', { name: 'Bans Management' })).toBeVisible()
    })

    test('should navigate to games page from dashboard', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Click manage games link
      await page.getByRole('link', { name: 'Manage Games' }).click()

      // Should be on games page
      await expect(page).toHaveURL('/admin/games')
      await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible()
    })

    test('should open ban player modal from dashboard', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin')

      // Click ban player button - scope to main content to avoid sidebar duplicates
      await page.getByRole('main').getByRole('button', { name: 'Ban Player' }).click()

      // Should see ban modal dialog - v-card-title uses span, not heading role
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.locator('.v-card-title').filter({ hasText: 'Create Ban' })).toBeVisible()
    })
  })

  test.describe('Admin Bans Management', () => {
    test('should display bans management page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Should see the page heading
      await expect(page.getByRole('heading', { name: 'Bans Management' })).toBeVisible()

      // Should see create ban button
      await expect(page.getByRole('button', { name: 'Create Ban' })).toBeVisible()
    })

    test('should display filter options', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Should see filter controls - comboboxes may have hidden labels when values are selected
      // Check for visible filter elements
      await expect(page.getByText('Filter by Player').first()).toBeVisible()
      await expect(page.locator('.v-select').nth(1)).toBeVisible() // Ban Type select
      await expect(page.getByText('All').first()).toBeVisible() // Status shows "All"
      await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
    })

    test('should open create ban modal', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Click create ban button
      await page.getByRole('button', { name: 'Create Ban' }).click()

      // Should see the modal - v-card-title uses span, not heading role
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.locator('.v-card-title').filter({ hasText: 'Create Ban' })).toBeVisible()

      // Should see form fields - check for key form elements
      await expect(page.getByRole('dialog').locator('.v-select').first()).toBeVisible()
      await expect(page.getByPlaceholder(/why this player is being banned/i)).toBeVisible()

      // Should see duration options (radio buttons)
      await expect(page.getByRole('radio', { name: 'Permanent' })).toBeVisible()
      await expect(page.getByRole('radio', { name: 'Temporary' })).toBeVisible()
    })

    test('should close create ban modal on cancel', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Open modal
      await page.getByRole('button', { name: 'Create Ban' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Click cancel
      await page.getByRole('button', { name: 'Cancel' }).click()

      // Modal should close
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('should filter bans by type', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Click ban type filter - find the v-select containing "Ban Type"
      await page.locator('.v-select').filter({ hasText: 'Ban Type' }).click()

      // Should see type options in the dropdown menu
      await expect(page.getByRole('option', { name: 'Platform' })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Matchmaking' })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Chat' })).toBeVisible()
    })

    test('should filter bans by status', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Click status filter - find the v-select containing "Status"
      await page.locator('.v-select').filter({ hasText: 'Status' }).click()

      // Should see status options in the dropdown menu
      await expect(page.getByRole('option', { name: 'All' })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Active' })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Lifted' })).toBeVisible()
      await expect(page.getByRole('option', { name: 'Expired' })).toBeVisible()
    })

    test('should display empty state when no bans match the filters', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Wait for the table itself to render. This used to wait on
      // `.v-progress-circular`, which now resolves to TWO elements on this
      // page, so the wait died on a Playwright strict-mode violation before
      // the test's real assertion ever ran.
      await expect(page.locator('.v-data-table')).toBeVisible({ timeout: 10_000 })

      // Build the empty state instead of hoping for it: filter to a ban type
      // no test in this suite ever creates. (This test previously wrapped its
      // only assertion in `if (!hasBans)`, so it asserted nothing as soon as
      // any ban existed — which the two mutation tests below now guarantee.)
      await page.locator('.v-select').filter({ hasText: 'Ban Type' }).click()
      await page.getByRole('option', { name: 'League' }).click()

      // AdminBansPage.vue:199-215 — the `no-data` slot switches text once a
      // filter is active.
      await expect(page.getByText('No bans found matching your filters')).toBeVisible()
    })

    test('should show create ban validation errors', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/bans')

      // Open modal
      await page.getByRole('button', { name: 'Create Ban' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Try to click Create Ban without filling form - button should be disabled
      const createButton = page.getByRole('dialog').getByRole('button', { name: 'Create Ban' })
      await expect(createButton).toBeDisabled()

      // Fill reason with too short text using placeholder selector
      const reasonField = page.getByPlaceholder(/why this player is being banned/i)
      await reasonField.fill('short')

      // Should show validation error after blur
      await reasonField.blur()
      await expect(page.getByText('Must be at least 10 characters')).toBeVisible()
    })

    test('should create a ban through the create ban modal', async ({ page }) => {
      // Exercises BanCreateModal.submit (src/components/admin/BanCreateModal.vue:227-260)
      // → bansStore.createBan → POST /v1/admin/bans, and
      // AdminBansPage.onBanCreated (:394-397). Until now every ban test in this
      // file opened the modal and cancelled, so `submit` was never reached.
      const adminToken = await getAdminToken()
      const target = await registerBanTarget()
      expect(
        await listBansForUser(adminToken, target.userId),
        'a freshly registered account starts with no bans'
      ).toHaveLength(0)

      await loginAsAdmin(page)
      await page.goto('/admin/bans')

      await page.getByRole('button', { name: 'Create Ban' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Player: UserSearchAutocomplete → GET /v1/players?q=… which is a
      // display-name PREFIX match (portal-db/src/adapters/user.rs:436-441),
      // so typing the full generated name resolves to exactly this account.
      const playerInput = dialog.getByPlaceholder(/search by display name/i)
      await playerInput.click()
      await playerInput.fill(target.displayName)
      const playerOption = page.getByRole('option', { name: target.displayName })
      await expect(playerOption).toBeVisible({ timeout: 15_000 })
      await playerOption.click()

      // Ban type: 'chat' keeps the blast radius small — a 'platform' ban also
      // flips the account status and revokes refresh tokens.
      await dialog.locator('.v-select').filter({ hasText: 'Ban Type' }).click()
      await page.getByRole('option', { name: 'Chat Ban' }).click()

      // Keep the reason free of the words rendered by the other columns
      // ("Chat", "Active", "Permanent") — getByText is a case-insensitive
      // substring match, so a colliding reason would break strict mode.
      const reason = `E2E automated ban ${Date.now()}`
      await dialog.getByPlaceholder(/why this player is being banned/i).fill(reason)

      // Duration is left on the default "Permanent" radio (:82-85).
      const submitButton = dialog.getByRole('button', { name: 'Create Ban' })
      await expect(submitButton).toBeEnabled()

      const createPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/admin/bans') && resp.request().method() === 'POST'
      )
      await submitButton.click()
      const createResponse = await createPromise
      expect(createResponse.status(), 'POST /v1/admin/bans must return 201').toBe(201)

      // UI assertions: success toast, modal closed, row rendered in the table.
      await expect(page.locator('.v-snackbar').getByText('Ban created successfully')).toBeVisible()
      await expect(dialog).toBeHidden()

      const row = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row.getByText('Chat')).toBeVisible()
      await expect(row.getByText('Active')).toBeVisible()
      await expect(row.getByText('Permanent')).toBeVisible()

      // Backend assertion.
      const bans = await listBansForUser(adminToken, target.userId)
      expect(bans).toHaveLength(1)
      expect(bans[0]!.reason).toBe(reason)
      expect(bans[0]!.ban_type).toBe('chat')
      expect(bans[0]!.is_permanent).toBe(true)
      expect(bans[0]!.is_active).toBe(true)
    })

    test('should lift an active ban from the bans table', async ({ page }) => {
      // Exercises AdminBansPage.confirmLiftBan (:380-392) → bansStore.liftBan →
      // POST /v1/admin/bans/{id}/lift. The ban itself is seeded over the API:
      // the action under test here is the lift, not the create.
      const adminToken = await getAdminToken()
      const target = await registerBanTarget()
      // Reason avoids "Active"/"Lifted" so the status-chip assertions below
      // stay unambiguous (getByText matches substrings, case-insensitively).
      const reason = `E2E seeded ban ${Date.now()}`
      const seeded = await createBanViaApi(adminToken, target.userId, reason)
      expect(seeded.is_active, 'seeded ban must start active').toBe(true)

      await loginAsAdmin(page)
      await page.goto('/admin/bans')

      const row = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row.getByText('Active')).toBeVisible()

      // The lift action only renders for active bans (AdminBansPage.vue:186-196).
      await row.getByRole('button', { name: 'Lift ban' }).click()

      const confirmDialog = page
        .getByRole('dialog')
        .filter({ hasText: 'Are you sure you want to lift this ban' })
      await expect(confirmDialog).toBeVisible()

      const liftPromise = page.waitForResponse(
        (resp) =>
          /\/v1\/admin\/bans\/[^/]+\/lift/.test(resp.url()) &&
          resp.request().method() === 'POST'
      )
      // ConfirmDialog renders `action: 'Lift Ban'` as the confirm button.
      await confirmDialog.getByRole('button', { name: 'Lift Ban' }).click()
      const liftResponse = await liftPromise
      expect(liftResponse.ok(), 'POST /v1/admin/bans/{id}/lift must succeed').toBe(true)

      // UI assertions: toast, status chip flips to Lifted, lift action gone.
      await expect(page.locator('.v-snackbar').getByText('Ban lifted successfully')).toBeVisible()
      const liftedRow = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
      await expect(liftedRow.getByText('Lifted')).toBeVisible({ timeout: 15_000 })
      await expect(liftedRow.getByRole('button', { name: 'Lift ban' })).toBeHidden()

      // Backend assertion.
      const bans = await listBansForUser(adminToken, target.userId)
      expect(bans).toHaveLength(1)
      expect(bans[0]!.id).toBe(seeded.id)
      expect(bans[0]!.is_active).toBe(false)
      expect(bans[0]!.lifted_at).not.toBeNull()
    })
  })

  test.describe('Admin Games Management', () => {
    test('should display games management page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/games')

      // Should see the page heading
      await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible()

      // Should see search field using label
      await expect(page.getByLabel('Search games...')).toBeVisible()

      // The Refresh button is unconditional in the template
      // (src/pages/admin/AdminGamesPage.vue:23-31), so assert it outright.
      // This replaces a soft visibility probe feeding a tautological
      // assertion, which passed whether or not the button rendered.
      await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
    })

    test('should display games table with columns', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/games')

      // Wait for table to be present (loading complete)
      await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

      // Should see table headers - use text content since Vuetify tables may not use columnheader role
      await expect(page.getByText('Name').first()).toBeVisible()
      await expect(page.getByText('Status').first()).toBeVisible()
      await expect(page.getByText('Featured')).toBeVisible()
      await expect(page.getByText('Actions')).toBeVisible()
    })

    test('should filter games by search', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/games')

      // Wait for table to be present (loading complete)
      const table = page.getByRole('table')
      await expect(table).toBeVisible({ timeout: 10000 })

      // Both games are seeded by migration 0003_create_games.sql:68-70
      // ('cs2' / "Counter-Strike 2" and 'aoe4' / "Age of Empires IV"), so this
      // precondition holds on any migrated database.
      await expect(table.getByText('Counter-Strike 2')).toBeVisible()
      await expect(table.getByText('Age of Empires IV')).toBeVisible()

      // Type in search field using label
      await page.getByLabel('Search games...').fill('counter')

      // `filteredGames` matches id / display_name / short_name client-side
      // (src/pages/admin/AdminGamesPage.vue:169-177), so the matching row must
      // survive and the non-matching one must disappear. The old test typed
      // 'cs' and then asserted nothing at all.
      await expect(table.getByText('Counter-Strike 2')).toBeVisible()
      await expect(table.getByText('Age of Empires IV')).toBeHidden()
    })

    test('should show empty state when no games match search', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/games')

      // Wait for table to be present (loading complete)
      await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

      // Search for non-existent game using label
      await page.getByLabel('Search games...').fill('nonexistentgamexyz123')

      // Should show no games found
      await expect(page.getByText('No games found')).toBeVisible()
    })

    test('should refresh games list', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/admin/games')

      // Wait for table to be present (loading complete)
      await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

      // Click refresh
      await page.getByRole('button', { name: 'Refresh' }).click()

      // Should show loading indicator briefly (may be too fast to catch)
      // Just verify page doesn't crash
      await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible()
    })
  })

  test.describe('Admin League Seasons', () => {
    /**
     * Open /admin/leagues, reveal the league's row (the page groups leagues into
     * collapsed per-game expansion panels) and open the Seasons & Teams modal.
     * Returns the LeagueDetailModal dialog.
     */
    async function openSeasonsPanel(page: Page, leagueName: string) {
      await page.goto('/admin/leagues')

      // Search narrows `filteredGroups` to the groups that still contain a
      // match (AdminLeaguesPage.vue:287-300), leaving exactly one game panel.
      await page.getByLabel('Search leagues...').fill(leagueName)
      const gamePanel = page.locator('.v-expansion-panel-title')
      await expect(gamePanel).toHaveCount(1)
      await gamePanel.click()

      const leagueRow = page.locator('tbody tr').filter({ hasText: leagueName })
      await expect(leagueRow).toBeVisible({ timeout: 15_000 })
      await leagueRow.getByRole('button', { name: 'Manage seasons and teams' }).click()

      const detailDialog = page.getByRole('dialog').filter({ hasText: 'Seasons' })
      await expect(detailDialog).toBeVisible()
      return detailDialog
    }

    test('should label season status and roster lock instead of printing the enum', async ({
      page,
    }) => {
      // COVERAGE-PLAN §9b P-22. The Roster column compared against `'locked'`,
      // a value the CHECK constraint cannot produce
      // (api/migrations/0025_league_teams_and_seasons.sql:69 permits only
      // open / soft_lock / hard_lock), so it read "Open" for every season.
      //
      // Only the `open` state is reachable end-to-end: `roster_lock_status` is
      // validated by the update DTO but never forwarded to the repository, and
      // `update_roster_lock` has no HTTP route (§9b P-14). The soft_lock /
      // hard_lock / unknown-value rendering is covered where it can be driven
      // honestly — src/components/admin/__tests__/LeagueSeasonsPanel.spec.ts.
      const adminToken = await getAdminToken()
      const league = await createLeague(adminToken, { namePrefix: 'E2E Admin Seasons' })
      const season = await createSeason(adminToken, league.leagueId)

      await loginAsAdmin(page)
      const detailDialog = await openSeasonsPanel(page, league.leagueName)

      const seasonRow = detailDialog.locator('tbody tr').filter({ hasText: season.seasonName })
      await expect(seasonRow).toBeVisible({ timeout: 15_000 })
      // A newly created season is `draft` / `open`.
      await expect(seasonRow.getByText('Draft', { exact: true })).toBeVisible()
      await expect(seasonRow.getByText('Open', { exact: true })).toBeVisible()
    })

    test('should offer only real season statuses in the edit modal and persist the change', async ({
      page,
    }) => {
      // COVERAGE-PLAN §9b P-17. `statusOptions` offered `registration_open`,
      // `registration_closed` and `in_progress` — none of which parse into
      // `SeasonStatus`, so saving any of them returned
      // 400 "Invalid season status" (portal-api/src/dto/requests/league_team.rs:205-210).
      const adminToken = await getAdminToken()
      const league = await createLeague(adminToken, { namePrefix: 'E2E Admin Seasons' })
      const season = await createSeason(adminToken, league.leagueId)
      expect(season.status, 'a new season starts in draft').toBe('draft')

      await loginAsAdmin(page)
      const detailDialog = await openSeasonsPanel(page, league.leagueName)

      const seasonRow = detailDialog.locator('tbody tr').filter({ hasText: season.seasonName })
      await expect(seasonRow).toBeVisible({ timeout: 15_000 })
      await seasonRow.getByRole('button', { name: 'Edit season' }).click()

      const editDialog = page
        .getByRole('dialog')
        .filter({ hasText: `Edit Season: ${season.seasonName}` })
      await expect(editDialog).toBeVisible()

      // A freshly created season has `max_teams = null` (unlimited). The modal's
      // "Max Teams" field uses the `positiveNumber` rule, which — unlike the
      // sibling `nonNegativeNumber` / `maxGreaterThanMin` rules — does not
      // tolerate an empty value, so the form is invalid and Save is disabled
      // until this field holds a positive number. That is a SEPARATE product
      // bug (reported alongside this work), not the P-17 behaviour under test;
      // supply a valid value so we can exercise the status-persist path.
      await editDialog.getByLabel('Max Teams').fill('16')

      await editDialog.locator('.v-select').filter({ hasText: 'Status' }).click()
      // Exactly the six values of `SeasonStatus` / the CHECK constraint
      // (api/migrations/0025_league_teams_and_seasons.sql:61), in order.
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
        'Draft',
        'Registration Open',
        'Active',
        'Playoffs',
        'Completed',
        'Cancelled',
      ])

      await page.getByRole('option', { name: 'Active', exact: true }).click()

      const patchPromise = page.waitForResponse(
        (resp) =>
          /\/v1\/league-seasons\/[^/]+$/.test(resp.url()) && resp.request().method() === 'PATCH'
      )
      await editDialog.getByRole('button', { name: 'Save Changes' }).click()
      const patchResponse = await patchPromise
      expect(patchResponse.status(), 'PATCH /v1/league-seasons/{id} must succeed').toBe(200)

      // UI: modal closed and the table re-read the season.
      await expect(editDialog).toBeHidden()
      await expect(seasonRow.getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 })

      // Backend.
      const persisted = await getSeason(adminToken, season.seasonId)
      expect(persisted.status).toBe('active')
    })

    test('should offer the three real roster-lock states in the edit modal', async ({ page }) => {
      // COVERAGE-PLAN §9b P-17, second half: the list was [open, locked], and
      // `'locked'` fails `RosterLockStatus::from_str` → 400 "Invalid roster lock
      // status" (portal-api/src/dto/requests/league_team.rs:211-217).
      //
      // Only the option list is asserted: per §9b P-14 the API drops
      // `roster_lock_status` on update, so saving a lock here is a silent no-op
      // and there is nothing honest to assert about persistence yet.
      const adminToken = await getAdminToken()
      const league = await createLeague(adminToken, { namePrefix: 'E2E Admin Seasons' })
      const season = await createSeason(adminToken, league.leagueId)

      await loginAsAdmin(page)
      const detailDialog = await openSeasonsPanel(page, league.leagueName)

      const seasonRow = detailDialog.locator('tbody tr').filter({ hasText: season.seasonName })
      await expect(seasonRow).toBeVisible({ timeout: 15_000 })
      await seasonRow.getByRole('button', { name: 'Edit season' }).click()

      const editDialog = page
        .getByRole('dialog')
        .filter({ hasText: `Edit Season: ${season.seasonName}` })
      await expect(editDialog).toBeVisible()

      await editDialog.locator('.v-select').filter({ hasText: 'Roster Lock' }).click()
      await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
        'Open',
        'Roster Soft-Locked',
        'Roster Locked',
      ])
    })
  })

  test.describe('Admin Access Control', () => {
    test('should redirect non-admin users from admin pages', async ({ page }) => {
      // Register a standard user (not admin). `isAdmin` is derived from the
      // RBAC role assignments fetched from the server (src/stores/auth.ts:109-111),
      // and a fresh account holds none.
      const userData = testUsers.standard()
      await register(page, userData)

      // The admin section is mounted at `/admin` with `meta.requiresAdmin`
      // (src/router/index.ts:142-146); the dashboard is its child with
      // `path: ''` (:147-151). The guard at src/router/index.ts:246-249 sends
      // non-admins to the `home` route.
      //
      // The old assertion was `expect(currentUrl).not.toContain('/admin/dashboard')`
      // — a URL this app never produces — so it passed no matter what the
      // guard did, including doing nothing at all.
      await page.goto('/admin')

      await expect(page).not.toHaveURL(/\/admin/)
      await expect(page).toHaveURL('/')
      // …and the admin shell must not have rendered.
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeHidden()

      // A deep link to a child admin route is blocked the same way — the guard
      // is on the parent, so this is the case a naive per-page check misses.
      await page.goto('/admin/bans')

      await expect(page).not.toHaveURL(/\/admin/)
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('heading', { name: 'Bans Management' })).toBeHidden()
    })

    test('should redirect unauthenticated users from admin pages', async ({ page }) => {
      // Navigate to admin without being logged in
      await page.goto('/admin')

      // Should be redirected to login
      await expect(page).toHaveURL(/\/login/)
    })
  })
})

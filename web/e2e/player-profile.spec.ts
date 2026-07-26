import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, register, getAdminToken } from './fixtures/auth.fixture'
import { testUsers, uniqueId, CS2_MAP_POOL } from './fixtures/test-data'
import {
  createCheckInScenario,
  getMatch,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Read the session token the app itself stored at login/registration, so the
 * backend cross-checks below run as exactly the player under test.
 * (auth.fixture writes/clears `token` in localStorage — see clearAuthState.)
 */
async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token, 'the session should have stored an access token').toBeTruthy()
  return token as string
}

/** GET /v1/players/me — the authoritative view of the profile. */
async function fetchMyProfile(token: string): Promise<{ bio?: string | null }> {
  const response = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`GET /v1/players/me failed (${response.status}): ${await response.text()}`)
  }
  return (await response.json()).data
}

interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_preferred: boolean
  notes: string | null
}

/**
 * GET /v1/players/me/availability/windows — the endpoint
 * `stores/availability.ts:fetchWindows` reads and `createWindow` writes.
 */
async function fetchMyWindows(token: string): Promise<AvailabilityWindow[]> {
  const response = await fetch(`${API_URL}/v1/players/me/availability/windows`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(
      `GET /v1/players/me/availability/windows failed (${response.status}): ${await response.text()}`
    )
  }
  return (await response.json()).data
}

/**
 * A live (`in_progress`) tournament pinned to the top of the live list.
 *
 * The home page's "Upcoming Matches" widget reads
 * `GET /v1/tournaments?status=in_progress&per_page=5` and looks no further
 * (HomePage.vue:fetchUpcomingMatches). The backend orders that list
 * `starts_at DESC NULLS LAST, created_at DESC`
 * (api/crates/portal-db/src/adapters/tournament/tournament.rs:344) and every
 * other fixture leaves `starts_at` null, so pinning ours a year out guarantees
 * it is the first of the five the widget inspects. Without that, a tournament
 * created by a parallel worker could push ours out of the window and the test
 * would fail for a reason that has nothing to do with what it asserts.
 */
async function createLiveTournamentSortedFirst(
  adminToken: string,
): Promise<{ tournamentId: string; name: string }> {
  const gamesResponse = await fetch(`${API_URL}/v1/games`)
  if (!gamesResponse.ok) {
    throw new Error(`GET /v1/games failed (${gamesResponse.status})`)
  }
  const games = (await gamesResponse.json()).data as Array<{ id: string }>
  expect(games.length, 'the environment must expose at least one game').toBeGreaterThan(0)

  const suffix = uniqueId()
  const name = `E2E Home Widget Tournament ${suffix}`
  const now = Date.now()

  const createResponse = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name,
      slug: `e2e-home-widget-${suffix}`,
      game_id: games[0].id,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'individual',
      min_participants: 2,
      max_participants: 4,
      check_in_required: true,
      check_in_start: new Date(now - 60 * 60 * 1000).toISOString(),
      check_in_end: new Date(now + 60 * 60 * 1000).toISOString(),
      starts_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  })
  if (!createResponse.ok) {
    throw new Error(
      `POST /v1/tournaments failed (${createResponse.status}): ${await createResponse.text()}`
    )
  }
  const tournamentId = (await createResponse.json()).data.id as string

  for (const step of ['publish', 'open-registration']) {
    const response = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/${step}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!response.ok) {
      throw new Error(`POST /v1/tournaments/{id}/${step} failed (${response.status})`)
    }
  }

  return { tournamentId, name }
}

/** Admin override of a match's status (the fixture's own escape hatch). */
async function transitionMatch(
  adminToken: string,
  tournamentId: string,
  matchId: string,
  toStatus: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/admin/tournaments/${tournamentId}/matches/${matchId}/transition`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        to_status: toStatus,
        override_reason: `E2E: drive the match to ${toStatus}`,
      }),
    }
  )
  if (!response.ok) {
    throw new Error(
      `Admin transition to ${toStatus} failed (${response.status}): ${await response.text()}`
    )
  }
}

/**
 * Two registered players in a fresh live tournament, with their match driven to
 * `toStatus`. Returns the scenario plus the tournament name, which is what the
 * home-page list item is keyed on.
 */
async function liveMatchInStatus(
  adminToken: string,
  toStatus: string,
): Promise<{ scenario: CheckInScenario; tournamentName: string }> {
  const { tournamentId, name } = await createLiveTournamentSortedFirst(adminToken)
  const scenario = await createCheckInScenario(undefined, adminToken, {
    tournamentId,
    checkInRequired: true,
  })

  await transitionMatch(adminToken, tournamentId, scenario.matchId, toStatus)

  const match = await getMatch(undefined, adminToken, tournamentId, scenario.matchId)
  expect(match.status, `the match must actually be in ${toStatus} before the UI is asked`).toBe(
    toStatus
  )

  return { scenario, tournamentName: name }
}

/**
 * P-20 — the home page's "Upcoming Matches" widget filtered on a hand-written
 * status list that contained `scheduling` (never a backend status) and omitted
 * `ready`, `pick_ban` and `awaiting_result`. A player whose match was in map
 * veto, or waiting on them to report a score, saw "No upcoming matches" — the
 * widget went blank exactly when there was something to do. See
 * COVERAGE-PLAN.md §9b P-20.
 *
 * These tests assert PRESENCE first (the functional bug) and the rendered
 * label second (the raw-enum leak).
 */
test.describe('Home page — Upcoming Matches', () => {
  test('shows a participant their match while it is in map veto', async ({ page }) => {
    const adminToken = await getAdminToken()
    const { scenario, tournamentName } = await liveMatchInStatus(adminToken, 'pick_ban')

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const widget = page.locator('.v-card').filter({ hasText: 'Upcoming Matches' }).first()
    await expect(widget).toBeVisible()

    const row = widget.locator('.v-list-item').filter({ hasText: tournamentName })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText(scenario.p1.username)
    await expect(row).toContainText('Pick/Ban')
    await expect(row).not.toContainText('pick_ban')
  })

  test('shows a participant their match while it is awaiting a result', async ({ page }) => {
    const adminToken = await getAdminToken()
    const { scenario, tournamentName } = await liveMatchInStatus(adminToken, 'in_progress')
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'awaiting_result')

    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const widget = page.locator('.v-card').filter({ hasText: 'Upcoming Matches' }).first()
    const row = widget.locator('.v-list-item').filter({ hasText: tournamentName })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('Awaiting Result')
    await expect(row).not.toContainText('awaiting_result')
  })

  test('drops a match from the widget once it is completed', async ({ page }) => {
    const adminToken = await getAdminToken()
    const { scenario, tournamentName } = await liveMatchInStatus(adminToken, 'in_progress')

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const widget = page.locator('.v-card').filter({ hasText: 'Upcoming Matches' }).first()
    await expect(widget.locator('.v-list-item').filter({ hasText: tournamentName })).toBeVisible({
      timeout: 10000,
    })

    // Terminal states must NOT be treated as upcoming — the derived active list
    // has to exclude them, not just include everything in the shared map.
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'awaiting_result')
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'completed')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(widget.locator('.v-list-item').filter({ hasText: tournamentName })).toHaveCount(0)
  })
})

/*
 * P-29 — the profile's "Recent Matches" card (MatchHistoryList.vue) could not
 * be populated by anyone: `GET /v1/users/me/matches` returned 500 to every
 * caller. `list_by_player`
 * (api/crates/portal-db/src/adapters/tournament/match_.rs) did
 * `SELECT DISTINCT tm.*` and then ordered by a `CASE tm.status::text … END`
 * expression that was not in the select list, which Postgres rejects outright
 * ("for SELECT DISTINCT, ORDER BY expressions must appear in select list").
 * The ranking is now selected as a named column and ordered by that name.
 *
 * The card also rendered the empty state on failure, so the 500 was
 * indistinguishable from "no matches"; it now shows an error alert instead.
 * These tests therefore assert PRESENCE of the match (the 500), the absence of
 * the error alert (the endpoint really answered), and the humanised status
 * label (the raw-enum leak).
 */
test.describe('Player Profile — Recent Matches', () => {
  test('shows a participant their match in Recent Matches', async ({ page }) => {
    const adminToken = await getAdminToken()
    const { scenario } = await liveMatchInStatus(adminToken, 'in_progress')

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.v-card').filter({ hasText: 'Recent Matches' }).first()
    await expect(card).toBeVisible()

    // A failed fetch renders this alert instead of any rows — its absence is
    // what distinguishes "the endpoint answered" from "the endpoint 500'd".
    await expect(card.getByTestId('match-history-error')).toHaveCount(0)
    await expect(card.getByTestId('match-history-empty')).toHaveCount(0)

    const row = card.locator('.v-list-item').filter({ hasText: scenario.p1.username })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText(scenario.p2.username)
    await expect(row).toContainText('In Progress')
    await expect(row).not.toContainText('in_progress')
  })

  test('renders a humanised status label for a match awaiting a result', async ({ page }) => {
    const adminToken = await getAdminToken()
    const { scenario } = await liveMatchInStatus(adminToken, 'in_progress')
    await transitionMatch(adminToken, scenario.tournamentId, scenario.matchId, 'awaiting_result')

    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.v-card').filter({ hasText: 'Recent Matches' }).first()
    await expect(card.getByTestId('match-history-error')).toHaveCount(0)

    const row = card.locator('.v-list-item').filter({ hasText: scenario.p2.username })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row).toContainText('Awaiting Result')
    await expect(row).not.toContainText('awaiting_result')
  })
})

test.describe('Player Profile', () => {
  test.describe('Profile Viewing', () => {
    test('should display profile page for authenticated user', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile')

      // The display name renders as an h1; there's no literal "My Profile"
      // heading in the UI.
      await expect(page.locator('h1')).toBeVisible()

      // Should see account information card
      await expect(page.getByText('Account Information')).toBeVisible()

      // Should see settings card
      await expect(page.getByText('Settings')).toBeVisible()

      // Should see the edit profile button
      await expect(page.getByRole('link', { name: 'Edit Profile' })).toBeVisible()

      // Should see the availability button
      await expect(page.getByRole('link', { name: 'My Availability' })).toBeVisible()

      // Scope to main: the app bar also exposes an icon-only Logout button
      // (it gained an aria-label in the accessibility pass).
      await expect(page.getByRole('main').getByRole('button', { name: 'Logout' })).toBeVisible()
    })

    test('should display username and email on profile', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile')

      // Username renders inline as `@<name>` — no separate "Username" label
      // in the current UI. Assert the @-prefixed form is visible.
      await expect(page.getByText(/^@/)).toBeVisible()

      // Should see email label
      await expect(page.getByText('Email')).toBeVisible()
    })

    test('should navigate to edit profile page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile')

      // Click the edit profile button
      await page.getByRole('link', { name: 'Edit Profile' }).click()

      // Should be on edit profile page
      await expect(page).toHaveURL('/profile/edit')
      await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()
    })

    test('should navigate to availability page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile')

      // Click the availability button
      await page.getByRole('link', { name: 'My Availability' }).click()

      // Should be on availability page
      await expect(page).toHaveURL('/profile/availability')
      await expect(page.getByRole('heading', { name: 'My Availability' })).toBeVisible()
    })

    test('should logout from profile page', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile')

      // Two "Logout" buttons render on this page: one in PortalLayout's
      // header (pushes /login) and one in the Profile card body (pushes
      // /). Click the page-body one explicitly so the redirect target is
      // predictable — otherwise Playwright's first-match can land on
      // either.
      await page.locator('.v-card').getByRole('button', { name: 'Logout' }).click()

      // Redirects to home (ProfilePage.handleLogout calls router.push('/')).
      await expect(page).toHaveURL('/')
    })
  })

  test.describe('Profile Editing', () => {
    test('should display edit profile page with form fields', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/edit')

      // Should see the edit profile heading
      await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()

      // Should see profile images section
      await expect(page.getByText('Profile Images')).toBeVisible()

      // Should see basic information section
      await expect(page.getByText('Basic Information')).toBeVisible()

      // Should see display name field - use combobox role for v-text-field
      await expect(page.getByLabel('Display Name')).toBeVisible()

      // Should see bio field
      await expect(page.getByLabel('Bio')).toBeVisible()

      // Should see country field - use first() due to clear button having same label
      await expect(page.getByLabel('Country').first()).toBeVisible()

      // Should see timezone field - use first() due to clear button having same label
      await expect(page.getByLabel('Timezone').first()).toBeVisible()
    })

    test('should have back to profile link', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/edit')

      // Should see back link
      const backLink = page.getByRole('link', { name: 'Back to Profile' })
      await expect(backLink).toBeVisible()

      // Click back link
      await backLink.click()

      // Should be back on profile page
      await expect(page).toHaveURL('/profile')
    })

    test('should update display name successfully', async ({ page }) => {
      // Register a fresh user for this test
      const userData = testUsers.standard()
      await register(page, userData)

      await page.goto('/profile/edit')

      // Wait for form to load
      await expect(page.getByLabel('Display Name')).toBeVisible()

      // Clear and fill new display name with unique timestamp to avoid conflicts
      const uniqueName = `TestPlayer_${Date.now()}`
      const displayNameField = page.getByLabel('Display Name')
      await displayNameField.clear()
      await displayNameField.fill(uniqueName)

      // Click save changes button (in Basic Information section)
      await page.getByRole('button', { name: 'Save Changes' }).click()

      // Should see success message or profile page (may redirect)
      await expect(
        page.getByText(/Profile updated|saved|success/i).first()
      ).toBeVisible({ timeout: 5000 })
    })

    test('should update bio successfully', async ({ page }) => {
      // Register a fresh user for this test
      const userData = testUsers.standard()
      await register(page, userData)
      const token = await sessionToken(page)

      await page.goto('/profile/edit')

      // Wait for form to load
      await expect(page.getByLabel('Bio')).toBeVisible()

      // Fill in bio with unique content
      const bioContent = `This is my test bio for E2E testing - ${Date.now()}.`
      await page.getByLabel('Bio').fill(bioContent)

      // ProfileEditPage.saveBasicInfo → playersStore.updateMyProfile →
      // PATCH /v1/players/me (src/stores/players.ts:100-105).
      const savePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/players/me') && resp.request().method() === 'PATCH'
      )
      await page.getByRole('button', { name: 'Save Changes' }).click()
      const saveResponse = await savePromise
      expect(saveResponse.ok(), 'PATCH /v1/players/me must succeed').toBe(true)

      // UI assertion: the success alert really renders. `successMessage` is set
      // at src/pages/ProfileEditPage.vue:359 and rendered by the success
      // v-alert at :16-18.
      //
      // The previous version of this test fell through to
      // `expect(currentBio.length).toBeGreaterThan(0)` — i.e. it asserted that
      // the textarea it had just typed into was non-empty. That holds whether
      // or not the save worked, so the test could never fail.
      await expect(page.getByText('Profile updated successfully')).toBeVisible()

      // Backend assertion: the bio is actually persisted, not just echoed by
      // the form.
      const profile = await fetchMyProfile(token)
      expect(profile.bio).toBe(bioContent)
    })

    test('should show validation error for short display name', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/edit')

      // Wait for form to load
      await expect(page.getByLabel('Display Name')).toBeVisible()

      // Clear and fill too short display name
      const displayNameField = page.getByLabel('Display Name')
      await displayNameField.clear()
      await displayNameField.fill('AB')
      await displayNameField.blur()

      // Should see validation error (useFormRules.minLength returns
      // "Must be at least N characters").
      await expect(page.getByText('Must be at least 3 characters')).toBeVisible()
    })

    test('should show avatar and banner upload sections', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/edit')

      // The Avatar/Banner section labels are always present, but the
      // underlying ImageUpload component renders EITHER the placeholder
      // text ("Upload avatar") OR a preview image — not both. The test
      // asserts the section is mounted by looking at the labels + the
      // two hidden file inputs the component provides.
      await expect(page.getByText('Avatar').first()).toBeVisible()
      await expect(page.getByText('Banner').first()).toBeVisible()
      const fileInputs = page.locator('input[type="file"]')
      await expect(fileInputs).toHaveCount(2)
    })
  })

  test.describe('Player Availability', () => {
    test('should display availability page with tabs', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/availability')

      // Should see page heading
      await expect(page.getByRole('heading', { name: 'My Availability' })).toBeVisible()

      // Should see description text
      await expect(page.getByText('Set your weekly availability')).toBeVisible()

      // Should see tab options
      await expect(page.getByRole('tab', { name: 'Calendar View' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Weekly Schedule' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Date Overrides' })).toBeVisible()
    })

    test('should switch to weekly schedule tab', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/availability')

      // Click weekly schedule tab
      await page.getByRole('tab', { name: 'Weekly Schedule' }).click()

      // Should see weekly availability content - use exact match to avoid multiple matches
      await expect(page.getByText('Weekly Availability', { exact: true })).toBeVisible()

      // Should see add time slot button
      await expect(page.getByRole('button', { name: 'Add Time Slot' })).toBeVisible()
    })

    test('should open add availability dialog', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/availability')

      // Click weekly schedule tab
      await page.getByRole('tab', { name: 'Weekly Schedule' }).click()

      // Click add time slot button
      await page.getByRole('button', { name: 'Add Time Slot' }).click()

      // Wait for dialog to render fully
      await page.waitForTimeout(1000)

      // Should see dialog with "Add Availability" title
      await expect(page.getByText('Add Availability')).toBeVisible()

      // Should see "Monday" (default day of week selection) - label may be
      // hidden due to Vuetify floating. .first(): when the profile already
      // has availability rows, "Monday" also appears as a list subheader.
      await expect(page.getByText('Monday').first()).toBeVisible()

      // Dialog should have Cancel and Add buttons - use exact match for Add
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('should create availability window', async ({ page }) => {
      // Own the state: a freshly registered player has zero windows, so both
      // the "before" and "after" assertions below are exact rather than
      // "something is probably there". The admin account accumulates windows
      // across runs, which is why this test used to assert nothing.
      const userData = testUsers.standard()
      await register(page, userData)
      const token = await sessionToken(page)

      await page.goto('/profile/availability')

      // Click weekly schedule tab
      await page.getByRole('tab', { name: 'Weekly Schedule' }).click()

      // AvailabilityWindowsManager.vue:2-9 — the manager is the card titled
      // "Weekly Availability"; scope every list assertion to it so the
      // calendar tab (still mounted, hidden) can't satisfy them.
      const weeklyCard = page.locator('.v-card').filter({ hasText: 'Weekly Availability' })
      // Precondition, asserted rather than assumed (component :20-24).
      await expect(weeklyCard.getByText('No availability windows set.')).toBeVisible()

      // Click add time slot button
      await page.getByRole('button', { name: 'Add Time Slot' }).click()

      // The add/edit dialog (component :69-148).
      const dialog = page.getByRole('dialog').filter({ hasText: 'Add Availability' })
      await expect(dialog).toBeVisible()

      // Select day of week - click the v-select and choose an option
      await dialog.locator('.v-select').filter({ hasText: 'Day of Week' }).click()
      // The v-select menu is teleported to the overlay container, outside the dialog.
      await page.getByRole('option', { name: 'Tuesday' }).click()

      // Notes give the rendered row a unique, unambiguous string to assert on
      // (component :49-51 renders it as the list-item subtitle).
      const notes = `E2E slot ${Date.now()}`
      await dialog.getByLabel('Notes (Optional)').fill(notes)

      // saveWindow → store.createWindow → POST /v1/players/me/availability/windows
      // (src/stores/availability.ts:81-90).
      const createPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/players/me/availability/windows') &&
          resp.request().method() === 'POST'
      )
      // Times are pre-filled with the component defaults 18:00 / 22:00 (:189-195).
      await dialog.getByRole('button', { name: 'Add', exact: true }).click()
      const createResponse = await createPromise
      expect(createResponse.status(), 'window creation must return 201').toBe(201)

      // UI assertion: the dialog closed and the new slot is rendered in the
      // weekly list — day subheader (:30), formatted range (:43) and notes.
      // formatTimeRange('18:00:00','22:00:00') === '6:00 PM - 10:00 PM'
      // (src/stores/availability.ts:224-236).
      await expect(dialog).toBeHidden()
      await expect(weeklyCard.getByText('Tuesday')).toBeVisible()
      await expect(weeklyCard.getByText('6:00 PM - 10:00 PM')).toBeVisible()
      await expect(weeklyCard.getByText(notes)).toBeVisible()
      await expect(weeklyCard.getByText('No availability windows set.')).toBeHidden()

      // Backend assertion: exactly one window, with the values we entered.
      const windows = await fetchMyWindows(token)
      expect(windows).toHaveLength(1)
      expect(windows[0]!.day_of_week).toBe(2) // DAY_NAMES index for Tuesday
      expect(windows[0]!.start_time).toBe('18:00:00')
      expect(windows[0]!.end_time).toBe('22:00:00')
      expect(windows[0]!.notes).toBe(notes)
    })

    test('should cancel add availability dialog', async ({ page }) => {
      // Fresh player so "nothing was created" is a precise assertion.
      const userData = testUsers.standard()
      await register(page, userData)
      const token = await sessionToken(page)

      await page.goto('/profile/availability')

      // Click weekly schedule tab
      await page.getByRole('tab', { name: 'Weekly Schedule' }).click()

      // Click add time slot button
      await page.getByRole('button', { name: 'Add Time Slot' }).click()

      const dialog = page.getByRole('dialog').filter({ hasText: 'Add Availability' })
      await expect(dialog).toBeVisible()

      // Click cancel button (AvailabilityWindowsManager.vue:136 → closeDialog)
      await dialog.getByRole('button', { name: 'Cancel' }).click()

      // The contract of this test is "the dialog closes". Asserting the page
      // heading — as this test used to — is true before, during and after the
      // dialog is open, so it could not fail.
      await expect(dialog).toBeHidden()
      await expect(page.getByText('Add Availability')).toBeHidden()
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeHidden()

      // Cancelling must not have written anything.
      expect(await fetchMyWindows(token)).toHaveLength(0)
    })

    test('should show tips card', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/availability')

      // Should see tips section
      await expect(page.getByText('Tips for setting availability')).toBeVisible()

      // Should see tip items - use locator to find the strong tag specifically
      await expect(page.locator('strong').filter({ hasText: 'weekly schedule' })).toBeVisible()
      await expect(page.locator('strong').filter({ hasText: 'preferred times' })).toBeVisible()
    })

    test('should switch to date overrides tab', async ({ page }) => {
      await loginAsAdmin(page)

      await page.goto('/profile/availability')

      // Click date overrides tab
      await page.getByRole('tab', { name: 'Date Overrides' }).click()

      // Should be on overrides tab (content depends on component)
      // The tab should be active
      const overridesTab = page.getByRole('tab', { name: 'Date Overrides' })
      await expect(overridesTab).toHaveAttribute('aria-selected', 'true')
    })
  })
})

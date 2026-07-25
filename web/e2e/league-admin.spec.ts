import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { getCs2Game } from './fixtures/awards.fixture'
import { loginAsUser, registerAsRosterUser, type RosterUser } from './fixtures/team-roster.fixture'

/**
 * Admin league surfaces — the ORGANISER half of the league lifecycle.
 *
 * `league-join.spec.ts` and `invitations.spec.ts` both drive the *invitee*:
 * they seed an invitation through the admin API and then click accept/decline
 * as the recipient. Nothing had ever driven the surface that CREATES one, and
 * that is where the defects were:
 *
 *   P-95 — `InviteUserModal` demanded a raw UUID typed by hand
 *          (`rules.uuid`, hint "Enter the UUID of the user to invite"), and no
 *          surface in the product displays a user's UUID: the members table
 *          shows username/email, the invitations and applications tables
 *          truncate the id to 8 characters. The endpoint was live and correct
 *          the whole time; the control was simply unusable, which left
 *          `invite_only` — the one access type with no self-service join —
 *          with no human path in at all. P-47 fixed the *visibility* of
 *          invite-only leagues; this is the other half.
 *
 *   P-96 — the invitations and applications tables printed `item.status` raw
 *          while the members table beside them mapped roles through
 *          `formatRole`.
 *
 *   P-97 — `trg_leagues_create_default_season`
 *          (api/migrations/0028_fix_league_season_trigger.sql:49-53) creates a
 *          "Season 1" in status `registration` on every league INSERT, and
 *          `LeagueCreateModal` never mentioned it. An admin who created a
 *          league immediately owned an open-registration season they had never
 *          configured and had no reason to know existed.
 *
 * Ground rules (§1): every precondition is seeded through the API, the action
 * under test goes through the real UI, and each outcome is asserted on the UI
 * *and* cross-checked against the backend. The inviter and the invitee are
 * separate identities in separate browser contexts, so a test that collapsed
 * them could not pass.
 */

test.describe.configure({ timeout: 90_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface ApiEnvelope<T> {
  data: T
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

type LeagueAccessType = 'open' | 'application' | 'invite_only'

/**
 * `createLeague` in `league-season-extra.fixture.ts` hard-codes
 * `access_type: 'open'` and the shared fixtures belong to other workstreams,
 * so the access-type-parameterised builder is spec-local — the same compromise
 * `league-join.spec.ts` and `invitations.spec.ts` already make.
 */
async function createLeagueWithAccessType(
  adminToken: string,
  accessType: LeagueAccessType,
): Promise<{ leagueId: string; leagueName: string }> {
  const suffix = uniqueId()
  const leagueName = `E2E Admin ${accessType} League ${suffix}`
  const gameId = (await getCs2Game()).id

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: leagueName,
      slug: `e2e-admin-${accessType.replace('_', '-')}-${suffix}`,
      game_id: gameId,
      description: `League for the E2E admin league surfaces (${accessType}, ${suffix})`,
      access_type: accessType,
    }),
  })
  const body = await jsonOrThrow<ApiEnvelope<{ id: string }>>(resp, `Create ${accessType} league`)
  return { leagueId: body.data.id, leagueName }
}

interface LeagueInvitationRow {
  id: string
  user_id: string
  status: string
  message: string | null
  invitation_type: string
  league_name: string
}

/** `GET /v1/leagues/{league_id}/invitations` — pending invitations, bare array. */
async function listLeagueInvitations(
  adminToken: string,
  leagueId: string,
): Promise<LeagueInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueInvitationRow[]>(resp, 'List league invitations')
}

/** `POST /v1/leagues/{league_id}/apply` — seeds a pending application. */
async function applyToLeague(token: string, leagueId: string, message: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  })
  await jsonOrThrow<unknown>(resp, 'Apply to league')
}

interface SeasonRow {
  id: string
  name: string
  status: string
}

/** `GET /v1/league-seasons?league_id=…` — every season of a league. */
async function listSeasons(adminToken: string, leagueId: string): Promise<SeasonRow[]> {
  const resp = await fetch(`${API_URL}/v1/league-seasons?league_id=${leagueId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<SeasonRow[]>>(resp, 'List league seasons')
  return body.data
}

/** `GET /v1/leagues?search=…` — resolves a UI-created league back to its id. */
async function findLeagueByName(
  adminToken: string,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  const resp = await fetch(`${API_URL}/v1/leagues?search=${encodeURIComponent(name)}&per_page=50`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<ApiEnvelope<Array<{ id: string; name: string }>>>(
    resp,
    'Search leagues',
  )
  return body.data.find((l) => l.name === name)
}

/** The CS2 game as the admin create form labels it. */
async function cs2DisplayName(): Promise<string> {
  const cs2 = await getCs2Game()
  const resp = await fetch(`${API_URL}/v1/games`)
  const body = await jsonOrThrow<ApiEnvelope<Array<{ id: string; display_name: string }>>>(
    resp,
    'List games',
  )
  const game = body.data.find((g) => g.id === cs2.id)
  if (!game) throw new Error('CS2 game not present in /v1/games')
  return game.display_name
}

/**
 * Open `Manage Members` for a league on /admin/leagues. The per-game tables
 * paginate at 10 rows, so narrow by search first (same approach as
 * `league-season.spec.ts` and `league-join.spec.ts`).
 */
async function openMembersModal(page: Page, leagueName: string) {
  await page.goto('/admin/leagues')
  await page.waitForLoadState('networkidle')
  await page.getByRole('textbox', { name: /Search leagues/i }).fill(leagueName)

  const leagueRow = page.locator('tr').filter({ hasText: leagueName })
  await expect(leagueRow).toBeVisible({ timeout: 15_000 })
  await leagueRow.locator('button[title="Manage Members"]').click()

  const membersModal = page.locator('.v-overlay--active', {
    hasText: `Manage Members: ${leagueName}`,
  })
  await expect(membersModal).toBeVisible()
  return membersModal
}

test.describe('Admin league surfaces', () => {
  test('an admin invites a user to an invite-only league by NAME — no UUID anywhere (P-95)', async ({
    browser,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'invite_only')
    const invitee: RosterUser = await registerAsRosterUser()
    const message = `Come play in ${league.leagueName} — ${uniqueId()}`

    expect(
      await listLeagueInvitations(adminToken, league.leagueId),
      'a fresh league starts with no invitations',
    ).toHaveLength(0)

    const adminContext = await browser.newContext()
    const inviteeContext = await browser.newContext()
    try {
      const adminPage = await adminContext.newPage()
      await loginAsAdmin(adminPage)
      const membersModal = await openMembersModal(adminPage, league.leagueName)

      await membersModal.getByRole('tab', { name: /Invitations/ }).click()
      const invitationsTable = membersModal.getByTestId('league-invitations-table')
      await expect(invitationsTable.getByText('No pending invitations')).toBeVisible({
        timeout: 10_000,
      })

      await membersModal.getByRole('button', { name: 'Invite User' }).click()
      const inviteModal = adminPage.getByTestId('invite-user-modal')
      await expect(inviteModal).toBeVisible()

      // P-95, the fix itself: the UUID field is gone. The old control asked for
      // "the UUID of the user to invite" — a value the product never shows
      // anyone — so an organiser had literally nothing to type here.
      await expect(inviteModal.getByText(/UUID/i)).toHaveCount(0)

      // …and what replaced it searches the same population `BanCreateModal`
      // does: GET /v1/players?q=… , a display-name PREFIX match
      // (portal-db user adapter), so the full generated name resolves to
      // exactly this account.
      const playerInput = inviteModal.getByPlaceholder(/search by display name/i)
      await playerInput.click()
      await playerInput.fill(invitee.displayName)
      const playerOption = adminPage.getByRole('option', { name: invitee.displayName })
      await expect(playerOption).toBeVisible({ timeout: 15_000 })
      await playerOption.click()

      await inviteModal.getByLabel('Message (Optional)').fill(message)

      const sendButton = inviteModal.getByRole('button', { name: 'Send Invitation' })
      await expect(sendButton).toBeEnabled()

      // Await the mutation rather than networkidle — an already-idle page
      // satisfies networkidle before the click's request is even dispatched.
      const sendPromise = adminPage.waitForResponse(
        (resp) =>
          resp.url().includes(`/v1/leagues/${league.leagueId}/invitations`) &&
          resp.request().method() === 'POST',
      )
      await sendButton.click()
      const sendResponse = await sendPromise
      expect(sendResponse.status(), 'POST league invitation must return 201').toBe(201)

      // UI assertion 1: the modal closes and the parent reports success.
      await expect(inviteModal).toBeHidden()
      await expect(adminPage.locator('.v-snackbar').getByText('Invitation sent')).toBeVisible()

      // UI assertion 2: the invitations table, empty a moment ago, now holds
      // exactly one row — `onUserInvited` refetches the admin listing.
      const invitationRows = invitationsTable.locator('tbody tr')
      await expect(invitationRows).toHaveCount(1, { timeout: 10_000 })

      // UI assertion 3 (P-96): its status renders as the human label. `exact`
      // is case-SENSITIVE, so this distinguishes "Pending" from the raw
      // `pending` the table used to print.
      await expect(invitationRows.first().locator('.v-chip')).toHaveText('Pending')
      await expect(invitationRows.first().getByText('pending', { exact: true })).toHaveCount(0)

      // Backend assertion: the invitation is addressed to the account whose
      // NAME was typed — the whole point of P-95 — and carries the message.
      const invitations = await listLeagueInvitations(adminToken, league.leagueId)
      expect(invitations).toHaveLength(1)
      expect(invitations[0].user_id, 'invitation must target the searched user').toBe(
        invitee.userId,
      )
      expect(invitations[0].message).toBe(message)
      expect(invitations[0].status).toBe('pending')
      expect(invitations[0].invitation_type).toBe('invite')

      // End to end: the invitee — a different identity in a different context —
      // finds the invitation waiting on their own /invitations page. For an
      // invite_only league this is the only way in (LeagueDetailPage's
      // invite-only branch is a dead end pointing at a human).
      const inviteePage = await inviteeContext.newPage()
      await loginAsUser(inviteePage, { email: invitee.email, password: invitee.password })
      await inviteePage.goto('/invitations')
      await inviteePage.waitForLoadState('networkidle')

      const card = inviteePage.locator('.v-card').filter({ hasText: league.leagueName }).first()
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText(league.leagueName, { exact: true })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Accept' })).toBeVisible()
    } finally {
      await adminContext.close()
      await inviteeContext.close()
    }
  })

  test('the applications table renders a mapped status label, not the raw enum (P-96)', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'application')
    const applicant: RosterUser = await registerAsRosterUser()
    const message = `Application status chip probe ${uniqueId()}`

    // Seed through the API — applying is covered by league-join.spec.ts; what
    // is under test here is how the seeded row's STATUS renders.
    await applyToLeague(applicant.token, league.leagueId, message)

    await loginAsAdmin(page)
    const membersModal = await openMembersModal(page, league.leagueName)
    await membersModal.getByRole('tab', { name: /Applications/ }).click()

    const applicationRow = membersModal
      .getByTestId('league-applications-table')
      .locator('tbody tr')
      .filter({ hasText: message })
    await expect(applicationRow).toBeVisible({ timeout: 10_000 })

    // `LeagueInvitationStatus` (portal-domain/src/entities/league.rs:264) is
    // pending / accepted / rejected / expired; the applications table printed
    // whichever one the wire carried. `exact` is case-sensitive, so the raw
    // value and the label are genuinely distinguishable here.
    await expect(applicationRow.locator('.v-chip')).toHaveText('Pending')
    await expect(applicationRow.getByText('pending', { exact: true })).toHaveCount(0)

    // Cross-check: the backend really is holding `pending`, so the label above
    // is a mapping rather than a coincidence of seeding.
    const resp = await fetch(`${API_URL}/v1/leagues/${league.leagueId}/applications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const applications = await jsonOrThrow<LeagueInvitationRow[]>(resp, 'List applications')
    const seeded = applications.find((a) => a.user_id === applicant.userId)
    expect(seeded, 'application should be pending on the backend').toBeDefined()
    expect(seeded!.status).toBe('pending')
  })

  test('the create-league form warns that a Season 1 is created and open for registration (P-97)', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const gameName = await cs2DisplayName()
    const suffix = uniqueId()
    const leagueName = `E2E Default Season League ${suffix}`

    await loginAsAdmin(page)
    await page.goto('/admin/leagues')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Create League' }).first().click()
    const dialog = page.locator('.v-overlay--active', { hasText: 'Create New League' })
    await expect(dialog).toBeVisible()

    // The fix: the form states, before anything is created, what the INSERT
    // trigger is about to do behind it.
    const notice = dialog.getByTestId('default-season-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Season 1')
    await expect(notice).toContainText('open for registration immediately')

    await dialog.locator('.v-select').filter({ hasText: 'Game' }).click()
    await page.getByRole('option', { name: gameName, exact: true }).click()
    await dialog.getByRole('textbox', { name: /League Name/i }).fill(leagueName)

    const createPromise = page.waitForResponse(
      (resp) => resp.url().endsWith('/v1/leagues') && resp.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Create League' }).click()
    const createResponse = await createPromise
    expect(createResponse.status(), 'POST /v1/leagues must return 201').toBe(201)
    await expect(dialog).toBeHidden()

    // UI assertion: the new league is listed on the admin page.
    await page.getByRole('textbox', { name: /Search leagues/i }).fill(leagueName)
    await expect(page.locator('tr').filter({ hasText: leagueName })).toBeVisible({
      timeout: 15_000,
    })

    // Backend assertion — this is what makes the notice honest rather than
    // decorative: the league really does come with one season, named
    // "Season 1", already accepting registrations.
    const created = await findLeagueByName(adminToken, leagueName)
    expect(created, 'created league should be findable by name').toBeDefined()

    const seasons = await listSeasons(adminToken, created!.id)
    expect(seasons, 'the trigger creates exactly one default season').toHaveLength(1)
    expect(seasons[0].name).toBe('Season 1')
    expect(seasons[0].status).toBe('registration')
  })
})

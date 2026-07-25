import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { getCs2Game } from './fixtures/awards.fixture'
import { registerAsRosterUser, type RosterUser } from './fixtures/team-roster.fixture'

/**
 * The admin invitations/applications tables, read as a HUMAN would read them.
 *
 * `league-admin.spec.ts` already drives the *sending* of an invitation (P-95);
 * what nothing had ever asserted is whether the resulting ROW says anything a
 * person can act on. It did not:
 *
 *   P-114 — `invitationHeaders` (LeagueMembersModal.vue) had no Message
 *           column, while `applicationHeaders` right beside it did. P-94 had
 *           just finished making the organiser's message reach the API and the
 *           DTO returns it, so the message was being written and stored and
 *           then shown to nobody.
 *
 *   P-115 — both tables rendered `item.user_id.substring(0, 8)`. No surface in
 *           the product displays a user's UUID, so the row identified nobody —
 *           and because ids are UUID v7, whose leading characters encode the
 *           creation timestamp, two invitations sent seconds apart share their
 *           prefix. The truncation was not merely unhelpful, it was ambiguous.
 *           `LeagueInvitationResponse` now carries `username`/`display_name`
 *           the way `LeagueMemberResponse` always has.
 *
 * Why these assertions can fail: each one names a specific human string that
 * only exists if the identity reached the row (the invitee's generated display
 * name, their username, the organiser's message), and each is paired with an
 * inverse assertion that the truncated UUID is NOT on the page. Before the fix
 * the positive assertions find nothing and the inverse one finds the prefix.
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
 * The shared `createLeague` fixture hard-codes `access_type: 'open'`, which is
 * the one access type that has neither invitations nor applications. Same
 * spec-local builder `league-join.spec.ts` and `league-admin.spec.ts` use.
 */
async function createLeagueWithAccessType(
  adminToken: string,
  accessType: LeagueAccessType,
): Promise<{ leagueId: string; leagueName: string }> {
  const suffix = uniqueId()
  const leagueName = `E2E Identity ${accessType} League ${suffix}`
  const gameId = (await getCs2Game()).id

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: leagueName,
      slug: `e2e-identity-${accessType.replace('_', '-')}-${suffix}`,
      game_id: gameId,
      description: `League for the E2E invitation-identity surfaces (${accessType}, ${suffix})`,
      access_type: accessType,
    }),
  })
  const body = await jsonOrThrow<ApiEnvelope<{ id: string }>>(resp, `Create ${accessType} league`)
  return { leagueId: body.data.id, leagueName }
}

interface LeagueInvitationRow {
  id: string
  user_id: string
  username: string
  display_name?: string | null
  status: string
  message: string | null
  invitation_type: string
}

/** `POST /v1/leagues/{id}/invitations` — seeds a pending invitation. */
async function inviteUser(
  adminToken: string,
  leagueId: string,
  userId: string,
  message: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ user_id: userId, message }),
  })
  await jsonOrThrow<unknown>(resp, 'Invite user to league')
}

/** `POST /v1/leagues/{id}/apply` — seeds a pending application. */
async function applyToLeague(token: string, leagueId: string, message: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  })
  await jsonOrThrow<unknown>(resp, 'Apply to league')
}

async function listInvitations(
  adminToken: string,
  leagueId: string,
): Promise<LeagueInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/invitations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueInvitationRow[]>(resp, 'List league invitations')
}

async function listApplications(
  adminToken: string,
  leagueId: string,
): Promise<LeagueInvitationRow[]> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/applications`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return jsonOrThrow<LeagueInvitationRow[]>(resp, 'List league applications')
}

/** Open `Manage Members` for a league on /admin/leagues (per-game tables paginate at 10). */
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

test.describe('League invitation rows name a human', () => {
  test('the invitations table shows WHO was invited and WHAT the organiser wrote (P-114, P-115)', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'invite_only')
    const invitee: RosterUser = await registerAsRosterUser()
    const message = `Please join us for the ${uniqueId()} season`

    await inviteUser(adminToken, league.leagueId, invitee.userId, message)

    // Backend precondition: the identity and the message really are on the
    // wire, so anything missing below is a rendering failure, not a seeding one.
    const seeded = await listInvitations(adminToken, league.leagueId)
    expect(seeded, 'exactly one pending invitation seeded').toHaveLength(1)
    expect(seeded[0].user_id).toBe(invitee.userId)
    expect(seeded[0].username, 'DTO must carry the username').toBe(invitee.username)
    expect(seeded[0].display_name, 'DTO must carry the display name').toBe(invitee.displayName)
    expect(seeded[0].message).toBe(message)

    await loginAsAdmin(page)
    const membersModal = await openMembersModal(page, league.leagueName)
    await membersModal.getByRole('tab', { name: /Invitations/ }).click()

    const invitationRows = membersModal.getByTestId('league-invitations-table').locator('tbody tr')
    await expect(invitationRows).toHaveCount(1, { timeout: 10_000 })
    const row = invitationRows.first()

    // P-115: the row leads with the display name — the same name the organiser
    // typed into the invite search — with the username beneath it.
    const userCell = row.getByTestId('invitation-user')
    await expect(userCell).toContainText(invitee.displayName)
    await expect(userCell).toContainText(invitee.username)

    // ...and the truncated UUID that used to stand in for a person is gone.
    // UUID v7 prefixes are timestamps, so this string was shared by every
    // invitation created in the same moment.
    const uuidPrefix = invitee.userId.substring(0, 8)
    await expect(row.getByText(`${uuidPrefix}...`)).toHaveCount(0)

    // P-114: the message the organiser wrote is on the row. `applicationHeaders`
    // had a Message column all along; `invitationHeaders` did not, so this
    // string was stored and never displayed anywhere.
    await expect(row.getByTestId('invitation-message')).toHaveText(message)

    // The header itself must exist — a slot with no column renders nothing, so
    // asserting the header separately pins the actual defect.
    const invitationHeaderCells = membersModal
      .getByTestId('league-invitations-table')
      .locator('thead th')
    await expect(invitationHeaderCells.filter({ hasText: 'Message' })).toHaveCount(1)
    await expect(invitationHeaderCells.filter({ hasText: 'User ID' })).toHaveCount(0)
  })

  test('the applications table shows WHO applied, not eight characters of a UUID (P-115)', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const league = await createLeagueWithAccessType(adminToken, 'application')
    const applicant: RosterUser = await registerAsRosterUser()
    const message = `Application identity probe ${uniqueId()}`

    await applyToLeague(applicant.token, league.leagueId, message)

    const seeded = await listApplications(adminToken, league.leagueId)
    expect(seeded, 'exactly one pending application seeded').toHaveLength(1)
    expect(seeded[0].username, 'DTO must carry the username').toBe(applicant.username)
    expect(seeded[0].display_name, 'DTO must carry the display name').toBe(applicant.displayName)

    await loginAsAdmin(page)
    const membersModal = await openMembersModal(page, league.leagueName)
    await membersModal.getByRole('tab', { name: /Applications/ }).click()

    const applicationRow = membersModal
      .getByTestId('league-applications-table')
      .locator('tbody tr')
      .filter({ hasText: message })
    await expect(applicationRow).toBeVisible({ timeout: 10_000 })

    const userCell = applicationRow.getByTestId('application-user')
    await expect(userCell).toContainText(applicant.displayName)
    await expect(userCell).toContainText(applicant.username)

    const uuidPrefix = applicant.userId.substring(0, 8)
    await expect(applicationRow.getByText(`${uuidPrefix}...`)).toHaveCount(0)

    const applicationHeaderCells = membersModal
      .getByTestId('league-applications-table')
      .locator('thead th')
    await expect(applicationHeaderCells.filter({ hasText: 'User ID' })).toHaveCount(0)
  })
})

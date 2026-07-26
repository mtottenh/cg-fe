import { test, expect, type Page } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { registerAsRosterUser, type RosterUser } from './fixtures/team-roster.fixture'

/**
 * P-70 — granting a platform role to a PERSON.
 *
 * `AdminPermissionsPage` could author a role and hang permissions off it, but
 * had no surface that attached one to a human: `rbac.ts`'s `getUserRoles`,
 * `assignRoleToUser` and `revokeRoleFromUser` all had zero consumers, and
 * `AdminPlayersPage`'s role chips are TEAM roles, not platform ones. The net
 * effect was that admins, organisers and moderators could only be minted by
 * seed or by hand-written SQL — on day one nobody could onboard a moderator.
 *
 * Why this test can fail: it drives the real Users tab (search a person by
 * name, pick a role, assign, revoke through the confirm dialog) and
 * cross-checks `GET /v1/admin/users/{id}/roles` after each mutation. Reverting
 * the page leaves no Users tab, so every assertion below fails at the first
 * `getByRole('tab', { name: 'Users' })`.
 *
 * The revoke half is asserted separately from the grant half on purpose: a
 * grant-only fix would leave an operator able to create a moderator and never
 * unmake one, which is the same "half a control" shape the campaign keeps
 * finding.
 */

test.describe.configure({ timeout: 120_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface RoleRecord {
  id: string
  name: string
  display_name: string
  priority: number
}

interface UserRoleAssignment {
  id: string
  role: RoleRecord
  scope_type: string | null
  scope_id: string | null
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function listRoles(adminToken: string): Promise<RoleRecord[]> {
  const resp = await fetch(`${API_URL}/v1/admin/roles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return (await jsonOrThrow<{ data: RoleRecord[] }>(resp, 'List roles')).data
}

/** The backend cross-check: what roles does this USER actually hold? */
async function getUserRoles(adminToken: string, userId: string): Promise<UserRoleAssignment[]> {
  const resp = await fetch(`${API_URL}/v1/admin/users/${userId}/roles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return (await jsonOrThrow<{ data: UserRoleAssignment[] }>(resp, 'Get user roles')).data
}

/** Undo net, so a failed run never leaves a stray moderator behind. */
async function revokeRoleViaApi(
  adminToken: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await fetch(`${API_URL}/v1/admin/users/${userId}/roles/${roleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
}

/** Open the Users tab and select a person by their display name. */
async function selectUser(page: Page, displayName: string) {
  await page.goto('/admin/permissions')
  await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible()

  await page.getByRole('tab', { name: 'Users' }).click()

  const search = page.getByRole('combobox', { name: 'Find a user' })
  await expect(search).toBeVisible()
  await search.fill(displayName)
  await page.getByRole('option', { name: displayName }).click()

  // Picking an option leaves focus on the autocomplete's <input>, and the FIRST
  // click anywhere else is then swallowed — measured directly: with
  // `document.activeElement` on the INPUT a real mouse click on the revoke
  // button fires no handler; after focus moves to BODY the identical click
  // fires it. That is `SearchAutocomplete` behaviour shared by every
  // autocomplete surface in the product (BanCreateModal, InviteUserModal, the
  // bans player filter), not something this page introduces — reported
  // separately. Blurring here models the operator's own first click; no
  // assertion below is relaxed by it.
  await search.blur()

  // The tab resolves player id -> user id before it can read anything, so
  // wait for the subject line rather than racing the lookup.
  await expect(page.getByTestId('role-subject')).toHaveText(displayName, { timeout: 15_000 })
}

test.describe('Platform role assignment (P-70)', () => {
  test('an admin grants a platform role to a person, then revokes it', async ({ page }) => {
    const adminToken = await getAdminToken()
    const target: RosterUser = await registerAsRosterUser()

    const roles = await listRoles(adminToken)
    const moderator = roles.find((r) => r.name === 'moderator')
    expect(moderator, 'the seeded moderator role must exist').toBeDefined()

    // Precondition, asserted against the API rather than assumed: registration
    // grants the default `user` role and nothing else. If this ever changes the
    // test says so instead of silently comparing against the wrong baseline.
    const before = await getUserRoles(adminToken, target.userId)
    expect(
      before.map((a) => a.role.name),
      'a freshly registered user holds only the default role',
    ).toEqual(['user'])

    try {
      await loginAsAdmin(page)
      await selectUser(page, target.displayName)

      // ── The gap itself: no row for moderator exists yet ──────────────────
      await expect(
        page.getByTestId('user-roles-table').locator('tbody tr'),
      ).toHaveCount(1)
      await expect(page.getByTestId('revoke-role-moderator')).toHaveCount(0)

      // ── Grant ───────────────────────────────────────────────────────────
      await page.getByTestId('role-to-assign').click()
      await page.getByRole('option', { name: `${moderator!.display_name} (moderator)` }).click()

      const assignResponse = page.waitForResponse(
        (resp) =>
          resp.url().endsWith(`/v1/admin/users/${target.userId}/roles`) &&
          resp.request().method() === 'POST',
      )
      await page.getByTestId('assign-role').click()
      expect((await assignResponse).status(), 'POST .../roles must create').toBe(201)

      await expect(
        page.locator('.v-snackbar').getByText(`Granted ${moderator!.display_name}`),
      ).toBeVisible()

      // UI assertion...
      const moderatorRow = page
        .getByTestId('user-roles-table')
        .locator('tbody tr')
        .filter({ hasText: moderator!.display_name })
      await expect(moderatorRow).toBeVisible()
      await expect(moderatorRow).toContainText('moderator')

      // ...and the backend cross-check. This is the assertion that proves the
      // control does the work rather than merely reporting success — the
      // "renders, says success, does nothing" shape this campaign keeps hitting.
      const afterGrant = await getUserRoles(adminToken, target.userId)
      expect(
        afterGrant.map((a) => a.role.name).sort(),
        'the role must actually be granted server-side',
      ).toEqual(['moderator', 'user'])

      // ── Revoke — confirm-gated, and the dialog must name both parties ────
      await page.getByTestId('revoke-role-moderator').click()

      const dialog = page.getByRole('dialog').filter({ hasText: 'Revoke Role' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(moderator!.display_name)
      await expect(dialog).toContainText(target.displayName)

      const revokeResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/v1/admin/users/${target.userId}/roles/${moderator!.id}`) &&
          resp.request().method() === 'DELETE',
      )
      await dialog.getByRole('button', { name: 'Revoke', exact: true }).click()
      expect((await revokeResponse).status(), 'DELETE .../roles/{id} must succeed').toBe(204)

      await expect(page.getByTestId('revoke-role-moderator')).toHaveCount(0)
      await expect(
        page.getByTestId('user-roles-table').locator('tbody tr'),
      ).toHaveCount(1)

      const afterRevoke = await getUserRoles(adminToken, target.userId)
      expect(
        afterRevoke.map((a) => a.role.name),
        'revoking must actually remove the assignment server-side',
      ).toEqual(['user'])
    } finally {
      if (moderator) await revokeRoleViaApi(adminToken, target.userId, moderator.id)
    }
  })

  test('cancelling the revoke confirmation leaves the role in place', async ({ page }) => {
    // Revocation is a privilege change, so it is confirm-gated. A gate that
    // cannot be declined is not a gate — this pins that Cancel really cancels,
    // which is the half a "does the dialog appear?" assertion misses.
    const adminToken = await getAdminToken()
    const target: RosterUser = await registerAsRosterUser()

    const roles = await listRoles(adminToken)
    const moderator = roles.find((r) => r.name === 'moderator')!

    const grant = await fetch(`${API_URL}/v1/admin/users/${target.userId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ role_id: moderator.id }),
    })
    await jsonOrThrow<unknown>(grant, 'Seed moderator role')

    try {
      await loginAsAdmin(page)
      await selectUser(page, target.displayName)

      await expect(page.getByTestId('revoke-role-moderator')).toBeVisible()
      await page.getByTestId('revoke-role-moderator').click()

      const dialog = page.getByRole('dialog').filter({ hasText: 'Revoke Role' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()

      await expect(page.getByTestId('revoke-role-moderator')).toBeVisible()
      expect(
        (await getUserRoles(adminToken, target.userId)).map((a) => a.role.name).sort(),
        'a declined confirmation must not revoke anything',
      ).toEqual(['moderator', 'user'])
    } finally {
      await revokeRoleViaApi(adminToken, target.userId, moderator.id)
    }
  })
})

import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueEmail, uniqueId, uniqueUsername } from './fixtures/test-data'

/**
 * Admin routes that no e2e test had ever loaded (COVERAGE-PLAN §8):
 * `/admin/permissions`, `/admin/players`, `/admin/settings`.
 *
 * `/admin/permissions` is the only one of the three with mutating actions, so
 * it gets a real action test: create a role → grant it a permission → delete
 * it, entirely through the UI. That covers three §7 Tier 2 items in one pass
 * (`RoleCreateEditModal.submitForm`, `RolePermissionsModal`,
 * `AdminPermissionsPage.confirmDeleteRole`) and leaves the DB as it found it.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface RoleRecord {
  id: string
  name: string
  display_name: string
  category: string
  priority: number
  is_system: boolean
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function listRoles(adminToken: string): Promise<RoleRecord[]> {
  const resp = await fetch(`${API_URL}/v1/admin/roles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return (await jsonOrThrow<{ data: RoleRecord[] }>(resp, 'List roles')).data ?? []
}

/** GET /v1/admin/roles/{id} — includes the role's granted permissions. */
async function getRoleWithPermissions(
  adminToken: string,
  roleId: string,
): Promise<{ id: string; permissions: Array<{ name: string }> }> {
  const resp = await fetch(`${API_URL}/v1/admin/roles/${roleId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return (
    await jsonOrThrow<{ data: { id: string; permissions: Array<{ name: string }> } }>(
      resp,
      'Get role',
    )
  ).data
}

/** Cleanup net so a failed run never leaves a test role behind. */
async function deleteRoleIfPresent(adminToken: string, roleName: string): Promise<void> {
  const role = (await listRoles(adminToken)).find((r) => r.name === roleName)
  if (!role) return
  await fetch(`${API_URL}/v1/admin/roles/${role.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
}

interface RegisteredPlayer {
  playerId: string
  displayName: string
  token: string
}

async function registerPlayer(): Promise<RegisteredPlayer> {
  const displayName = `AdminDir${uniqueId()}`
  const resp = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUsername(),
      email: uniqueEmail(),
      password: 'TestPassword123!',
      display_name: displayName,
    }),
  })
  const body = await jsonOrThrow<{ data: { access_token: string; user: { id: string } } }>(
    resp,
    'Register player',
  )
  return {
    playerId: body.data.user.id,
    displayName,
    token: body.data.access_token,
  }
}

test.describe('Admin roles & permissions', () => {
  test('lists the seeded roles and the permission catalogue', async ({ page }) => {
    const adminToken = await getAdminToken()
    const roles = await listRoles(adminToken)
    const superAdmin = roles.find((r) => r.name === 'super_admin')
    expect(superAdmin, 'the seeded super_admin role must exist').toBeDefined()

    await loginAsAdmin(page)
    await page.goto('/admin/permissions')

    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible()

    // Roles tab: the row carries the display name, the machine name and the
    // System badge that marks it undeletable.
    const superAdminRow = page.locator('.v-data-table tbody tr').filter({ hasText: 'super_admin' })
    await expect(superAdminRow).toBeVisible({ timeout: 15_000 })
    await expect(superAdminRow.getByText(superAdmin!.display_name, { exact: true })).toBeVisible()
    await expect(superAdminRow.getByText('System', { exact: true })).toBeVisible()
    // System roles must not offer a delete action (AdminPermissionsPage.vue:119-129).
    await expect(superAdminRow.getByRole('button', { name: 'Delete role' })).toHaveCount(0)

    // Permissions tab: grouped accordion, one panel per category.
    await page.getByRole('tab', { name: 'Permissions' }).click()
    const moderationPanel = page
      .locator('.v-expansion-panel')
      .filter({ hasText: 'moderation' })
      .first()
    await expect(moderationPanel).toBeVisible()
    await moderationPanel.click()
    await expect(moderationPanel.getByText('mod.warn_users')).toBeVisible()
    await expect(moderationPanel.getByText('Warn Users', { exact: true })).toBeVisible()
  })

  test('creates a role, grants it a permission, then deletes it', async ({ page }) => {
    test.setTimeout(90_000)
    const adminToken = await getAdminToken()
    const suffix = uniqueId().toLowerCase().replace(/[^a-z0-9]/g, '')
    const roleName = `e2e_role_${suffix}`
    const roleDisplayName = `E2E Role ${suffix}`

    expect(
      (await listRoles(adminToken)).map((r) => r.name),
      'the role under test must not already exist',
    ).not.toContain(roleName)

    try {
      await loginAsAdmin(page)
      await page.goto('/admin/permissions')

      // ── Create ────────────────────────────────────────────────────────────
      await page.getByRole('button', { name: 'Create Role' }).click()
      const createDialog = page.getByRole('dialog').filter({ hasText: 'Create Role' })
      await expect(createDialog).toBeVisible()

      await createDialog.getByRole('textbox', { name: 'Machine Name' }).fill(roleName)
      await createDialog.getByRole('textbox', { name: 'Display Name' }).fill(roleDisplayName)
      await createDialog.locator('.v-select').filter({ hasText: 'Category' }).click()
      await page.getByRole('option', { name: 'Platform' }).click()
      await createDialog.getByRole('spinbutton', { name: 'Priority' }).fill('7')

      const createPromise = page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/v1/admin/roles') && resp.request().method() === 'POST',
      )
      await createDialog.getByRole('button', { name: 'Create Role' }).click()
      const createResponse = await createPromise
      expect(createResponse.ok(), 'POST /v1/admin/roles must succeed').toBe(true)

      await expect(page.locator('.v-snackbar').getByText('Role saved successfully')).toBeVisible()
      await expect(createDialog).toBeHidden()

      const roleRow = page.locator('.v-data-table tbody tr').filter({ hasText: roleName })
      await expect(roleRow).toBeVisible({ timeout: 15_000 })
      await expect(roleRow.getByText(roleDisplayName, { exact: true })).toBeVisible()

      const created = (await listRoles(adminToken)).find((r) => r.name === roleName)
      expect(created, 'the role must exist server-side').toBeDefined()
      expect(created!.display_name).toBe(roleDisplayName)
      expect(created!.category).toBe('platform')
      expect(created!.priority).toBe(7)
      expect(created!.is_system, 'admin-created roles are not system roles').toBe(false)
      expect(
        (await getRoleWithPermissions(adminToken, created!.id)).permissions,
        'a new role starts with no permissions',
      ).toHaveLength(0)

      // ── Grant a permission ───────────────────────────────────────────────
      await roleRow.getByRole('button', { name: 'Manage permissions' }).click()
      const permDialog = page
        .getByRole('dialog')
        .filter({ hasText: `Manage Permissions for ${roleDisplayName}` })
      await expect(permDialog).toBeVisible()
      await expect(permDialog.getByText('No permissions assigned to this role.')).toBeVisible()

      // The search box narrows the accordion to a single candidate, so the
      // click below is unambiguous.
      await permDialog.getByRole('textbox', { name: 'Search permissions...' }).fill('mod.warn_users')
      const candidate = permDialog.locator('.v-expansion-panel').filter({ hasText: 'moderation' })
      await expect(candidate).toBeVisible()
      await candidate.click()

      const grantPromise = page.waitForResponse(
        (resp) =>
          /\/v1\/admin\/roles\/[^/]+\/permissions$/.test(resp.url()) &&
          resp.request().method() === 'POST',
      )
      await candidate.getByRole('button', { name: 'Add permission' }).first().click()
      const grantResponse = await grantPromise
      expect(grantResponse.ok(), 'POST …/permissions must succeed').toBe(true)

      // UI: the granted permission now shows as a current-permission chip.
      await expect(permDialog.getByText('Current Permissions (1)')).toBeVisible()
      await expect(permDialog.locator('.v-chip').filter({ hasText: 'Warn Users' })).toBeVisible()

      // Backend cross-check.
      const withPerm = await getRoleWithPermissions(adminToken, created!.id)
      expect(withPerm.permissions.map((p) => p.name)).toEqual(['mod.warn_users'])

      // Scoped to the card actions: the granted-permission chip is `closable`
      // and exposes its own "Close" control.
      await permDialog.locator('.v-card-actions').getByRole('button', { name: 'Close' }).click()
      await expect(permDialog).toBeHidden()

      // ── Delete ───────────────────────────────────────────────────────────
      await roleRow.getByRole('button', { name: 'Delete role' }).click()
      const confirmDialog = page
        .getByRole('dialog')
        .filter({ hasText: `Are you sure you want to delete the role ${roleDisplayName}` })
      await expect(confirmDialog).toBeVisible()

      const deletePromise = page.waitForResponse(
        (resp) =>
          /\/v1\/admin\/roles\/[^/]+$/.test(resp.url()) && resp.request().method() === 'DELETE',
      )
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()
      const deleteResponse = await deletePromise
      expect(deleteResponse.ok(), 'DELETE /v1/admin/roles/{id} must succeed').toBe(true)

      await expect(page.locator('.v-snackbar').getByText('Role deleted successfully')).toBeVisible()
      await expect(page.locator('.v-data-table tbody tr').filter({ hasText: roleName })).toHaveCount(
        0,
      )
      expect((await listRoles(adminToken)).map((r) => r.name)).not.toContain(roleName)
    } finally {
      // Never leave a stray role on the shared dev DB.
      await deleteRoleIfPresent(adminToken, roleName)
    }
  })
})

test.describe('Admin players directory', () => {
  test('searches the directory and opens a player detail', async ({ page }) => {
    const player = await registerPlayer()

    await loginAsAdmin(page)
    await page.goto('/admin/players')

    await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible()

    // The directory is paginated 20-at-a-time over a large shared DB, so the
    // search is the only deterministic way to reach a specific account — and
    // it is the behaviour under test (`fetchPlayers` re-queries with `q`).
    await page.getByRole('textbox', { name: 'Search by display name...' }).fill(player.displayName)

    const row = page.locator('.v-data-table tbody tr').filter({ hasText: player.displayName })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('.v-data-table tbody tr'),
      'a full display-name search must resolve to exactly one player',
    ).toHaveCount(1)

    // The active-filter chip reflects the query that produced this result set.
    await expect(page.locator('.v-chip').filter({ hasText: `Name: ${player.displayName}` })).toBeVisible()

    // Detail modal: fetched from /v1/players/{id}, not from the row.
    await row.getByRole('button', { name: 'View player details' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Player Details' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: player.displayName })).toBeVisible()
    await expect(dialog.getByText(player.playerId, { exact: true })).toBeVisible()
    await expect(dialog.getByText('No bio set')).toBeVisible()
    await expect(dialog.getByText('No team memberships')).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'View Public Profile' })).toHaveAttribute(
      'href',
      `/players/${player.playerId}`,
    )
  })

  test('a search with no matches shows the empty state and clears back', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/players')

    await page.getByRole('textbox', { name: 'Search by display name...' }).fill(`nosuchplayer-${uniqueId()}`)
    await expect(page.getByText('No players found matching your filters')).toBeVisible({
      timeout: 15_000,
    })

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByText('No players found matching your filters')).toBeHidden()
    await expect(page.locator('.v-data-table tbody tr').first()).toBeVisible()
  })
})

test.describe('Admin settings', () => {
  test('is an unbuilt placeholder, and the sidebar says so', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/settings')

    // The route resolves and renders AdminPlaceholder rather than 404ing.
    await expect(page.getByRole('heading', { name: 'Platform Settings' })).toBeVisible()
    await expect(page.getByText('Coming Soon')).toBeVisible()
    await expect(
      page.getByText('This admin feature is planned but requires additional backend APIs.'),
    ).toBeVisible()
    await expect(page.getByText('Maintenance mode toggle')).toBeVisible()

    // AdminSidebar.vue:82-88 marks the Settings entry `disabled`, so the page
    // is reachable by URL only. Pin that: an enabled link would promise a
    // feature that does not exist.
    const settingsLink = page.locator('.v-navigation-drawer .v-list-item').filter({
      hasText: 'Settings',
    })
    await expect(settingsLink).toHaveClass(/v-list-item--disabled/)
  })
})

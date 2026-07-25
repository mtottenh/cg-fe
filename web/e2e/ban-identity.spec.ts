import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { uniqueId } from './fixtures/test-data'
import { registerAsRosterUser, type RosterUser } from './fixtures/team-roster.fixture'

/**
 * P-123 — the ban-lift confirm dialog has to name a human.
 *
 * `AdminBansPage.vue:137` rendered `item.user_id.substring(0, 8)` as the whole
 * User column, and `:385` put that same string INSIDE the confirm dialog:
 * "Are you sure you want to lift this ban for user 019f993f...?". An operator
 * was being asked to approve a destructive moderation action against an
 * identifier that is ambiguous by construction — ids are UUID v7, whose
 * leading characters encode the creation timestamp, so two bans created
 * minutes apart share their prefix. This is not "cryptic but precise"; it is
 * genuinely not a unique reference.
 *
 * Same fix P-115 took for league invitations: `BanResponse` now carries
 * `username`/`display_name`, joined in the ban adapter.
 *
 * The load-bearing assertion is the CONFIRM DIALOG one. A fix that only
 * humanised the table would leave the dangerous surface untouched, so the
 * dialog is asserted on its own terms — positively (the name is there) and
 * negatively (the truncated UUID is not).
 */

test.describe.configure({ timeout: 90_000 })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface BanRow {
  id: string
  user_id: string
  username: string
  display_name?: string | null
  ban_type: string
  reason: string
  lifted_at?: string | null
  is_active: boolean
}

async function jsonOrThrow<T>(resp: Response, context: string): Promise<T> {
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${context} failed (${resp.status}): ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * Seed a ban over the API — the action under test is the LIFT, not the issue.
 * `chat` rather than `platform` on purpose: a platform ban flips the target's
 * account status and revokes their sessions, which is a bigger blast radius
 * than this test needs.
 */
async function createBan(
  adminToken: string,
  userId: string,
  reason: string,
): Promise<BanRow> {
  const resp = await fetch(`${API_URL}/v1/admin/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ user_id: userId, ban_type: 'chat', reason }),
  })
  return (await jsonOrThrow<{ data: BanRow }>(resp, 'Create ban')).data
}

async function getBan(adminToken: string, banId: string): Promise<BanRow> {
  const resp = await fetch(`${API_URL}/v1/admin/bans/${banId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  return (await jsonOrThrow<{ data: BanRow }>(resp, 'Get ban')).data
}

test.describe('Ban rows and the lift dialog name a human (P-123)', () => {
  test('the lift confirm dialog names the banned user, not eight characters of their UUID', async ({
    page,
  }) => {
    const adminToken = await getAdminToken()
    const target: RosterUser = await registerAsRosterUser()
    const reason = `P-123 identity probe ${uniqueId()}`

    const seeded = await createBan(adminToken, target.userId, reason)

    // Backend precondition: the identity really is on the wire, so anything
    // missing below is a rendering failure and not a seeding one.
    expect(seeded.username, 'DTO must carry the username').toBe(target.username)
    expect(seeded.display_name, 'DTO must carry the display name').toBe(target.displayName)

    await loginAsAdmin(page)
    await page.goto('/admin/bans')
    await expect(page.getByRole('heading', { name: 'Bans Management' })).toBeVisible()

    const banRow = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
    await expect(banRow).toBeVisible({ timeout: 15_000 })

    // The table leads with the display name — the same name
    // `UserSearchAutocomplete` showed the admin who issued the ban.
    const userCell = banRow.getByTestId('ban-user')
    await expect(userCell).toContainText(target.displayName)
    await expect(userCell).toContainText(target.username)

    const uuidPrefix = target.userId.substring(0, 8)
    await expect(banRow.getByText(`${uuidPrefix}...`)).toHaveCount(0)

    // The column header stopped claiming to be an id.
    const headerCells = page.locator('.v-data-table thead th')
    await expect(headerCells.filter({ hasText: 'User ID' })).toHaveCount(0)

    // ── The finding itself: the confirm dialog ──────────────────────────────
    await banRow.getByRole('button', { name: 'Lift ban', exact: true }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Lift Ban' })
    await expect(dialog).toBeVisible()
    await expect(dialog, 'the dialog must name the person whose ban is being lifted')
      .toContainText(target.displayName)
    await expect(dialog, 'and the username, which is what an operator can act on')
      .toContainText(target.username)
    await expect(
      dialog.getByText(`${uuidPrefix}...`),
      'the ambiguous UUID prefix must be gone from the dialog',
    ).toHaveCount(0)

    // Confirming still lifts the right ban — the identity fix must not have
    // changed which row the action targets.
    const liftResponse = page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/v1/admin/bans/${seeded.id}/lift`) &&
        resp.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Lift Ban', exact: true }).click()
    expect((await liftResponse).ok(), 'the lift must succeed').toBe(true)

    await expect(page.locator('.v-snackbar').getByText('Ban lifted successfully')).toBeVisible()

    const after = await getBan(adminToken, seeded.id)
    expect(after.lifted_at, 'the ban must actually be lifted server-side').toBeTruthy()
    expect(after.is_active).toBe(false)
  })

  test('the ban detail modal names the user too', async ({ page }) => {
    // The modal previously led with the raw `user_id`. That is unambiguous,
    // unlike the truncation, but it still names nobody — an operator reading a
    // ban had to leave the moderation surface to find out whose it was.
    const adminToken = await getAdminToken()
    const target: RosterUser = await registerAsRosterUser()
    const reason = `P-123 detail probe ${uniqueId()}`

    await createBan(adminToken, target.userId, reason)

    await loginAsAdmin(page)
    await page.goto('/admin/bans')

    const banRow = page.locator('.v-data-table tbody tr').filter({ hasText: reason })
    await expect(banRow).toBeVisible({ timeout: 15_000 })
    await banRow.getByRole('button', { name: 'View ban details', exact: true }).click()

    const modal = page.getByRole('dialog').filter({ hasText: 'Ban Details' })
    await expect(modal).toBeVisible()

    const userLine = modal.getByTestId('ban-detail-user')
    await expect(userLine).toContainText(target.displayName)
    await expect(userLine).toContainText(target.username)
  })
})

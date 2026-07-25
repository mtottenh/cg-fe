import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { createTestUser } from './fixtures/checkin.fixture'
import { uniqueId } from './fixtures/test-data'
import {
  catalogDemoViaApi,
  deleteDemoViaApi,
  getDemoGame,
  getDemoReadStatus,
  getDemoViaApi,
  listDemosViaApi,
  uniqueDemoFileName,
  type AdminDemo,
  type DemoGame,
} from './fixtures/demo-admin.fixture'

/**
 * Admin demo-management surfaces, driven through the UI.
 *
 * `admin-demo-links.spec.ts` covers linking/unlinking and the auto-link
 * toggle; this spec covers the rest of the admin demo write paths:
 *
 *   - categorize   POST /v1/admin/demos/{id}/categorize   (Quick Actions select)
 *   - visibility   POST /v1/admin/demos/{id}/visibility   (Hide/Unhide button)
 *   - notes        PATCH /v1/admin/demos/{id}/notes       (Admin Notes card)
 *   - catalog      POST /v1/admin/demos                   (DemoCatalogModal, single)
 *   - batch        POST /v1/admin/demos/batch             (DemoCatalogModal, batch)
 *
 * The Association card (`POST /v1/admin/demos/{id}/associate`) was in this
 * spec's "not covered" list as P-75 — read-only, printing raw UUIDs, with
 * `demos.associate` reaching no control. It is fixed and driven by
 * `admin-demo-association.spec.ts`.
 *
 * NOT covered, deliberately — the handlers exist but no control reaches them,
 * which is the finding rather than a test (COVERAGE-PLAN §4-F):
 *
 *   - `POST /v1/admin/demos/{id}/stats` — `demos.submitStats` (stores/demos.ts:252)
 *     likewise has no consumer. `AdminDemoDetailPage.handleReprocess` (:461-466) is
 *     the "Retry Processing" button's handler and it calls NO API at all: it pops a
 *     `Demo queued for reprocessing` success snackbar and returns. Any test of that
 *     button either asserts the lie or asserts nothing.
 *   - `POST /v1/admin/demos/{id}/stats-failed` — `demos.markFailed` (stores/demos.ts:265)
 *     has no consumer either, so `status === 'failed'` is unreachable from the UI and
 *     the "Retry Processing" button (rendered only for failed demos) can never even
 *     appear in a UI-only flow.
 */

test.describe('Admin demo detail — categorize, visibility, notes', () => {
  let adminToken: string
  let game: DemoGame

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    game = await getDemoGame()
  })

  test('admin categorizes a demo from the Quick Actions select', async ({ page }) => {
    test.setTimeout(60_000)
    const demo: AdminDemo = await catalogDemoViaApi(adminToken, game.id)
    // Precondition, from the API: a freshly catalogued demo is uncategorized.
    expect(demo.category).toBe('uncategorized')

    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demo.id}`)

    await expect(page.getByRole('heading', { name: demo.file_name })).toBeVisible()
    // Header chips are the human labels from `demoCategoryMap`/`demoStatusMap`.
    await expect(page.locator('.v-chip').filter({ hasText: 'Uncategorized' })).toBeVisible()
    await expect(page.locator('.v-chip').filter({ hasText: 'Pending' })).toBeVisible()

    // ---- Categorize through the UI ----------------------------------------
    await page.locator('.v-select').filter({ hasText: 'Category' }).click()
    // Exactly the five values of `DemoCategory`
    // (api/crates/portal-core/src/types/demo.rs:14-26), in the page's order.
    await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
      'Uncategorized',
      'PUG',
      'League',
      'Scrim',
      'Ignored',
    ])
    await page.getByRole('option', { name: 'Scrim', exact: true }).click()

    // UI assert: the header chip flips to the human label.
    await expect(page.locator('.v-chip').filter({ hasText: 'Scrim' })).toBeVisible()
    await expect(page.locator('.v-chip').filter({ hasText: 'Uncategorized' })).toHaveCount(0)

    // API cross-check: the category was actually persisted.
    expect((await getDemoViaApi(adminToken, demo.id)).category).toBe('scrim')

    // Survives a reload — the select is re-hydrated from the server row.
    await page.reload()
    await expect(page.locator('.v-chip').filter({ hasText: 'Scrim' })).toBeVisible()
    await expect(
      page.locator('.v-select').filter({ hasText: 'Category' }),
    ).toContainText('Scrim')
  })

  test('admin hides a demo, which removes it from a non-admin player view, then unhides it', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const demo = await catalogDemoViaApi(adminToken, game.id)
    const bystander = await createTestUser()

    // Precondition: an unhidden, uncategorized demo is readable by any player
    // (handlers/demos.rs:1241 `authorize_demo_read` → `Demo::is_visible`).
    expect(await getDemoReadStatus(bystander.token, demo.id)).toBe(200)

    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demo.id}`)
    await expect(page.getByRole('heading', { name: demo.file_name })).toBeVisible()

    // `Hide Demo` is a substring of `Unhide Demo`, so both need exact matching.
    const hideButton = page.getByRole('button', { name: 'Hide Demo', exact: true })
    const unhideButton = page.getByRole('button', { name: 'Unhide Demo', exact: true })
    const hiddenChip = page.locator('.v-chip').filter({ hasText: 'Hidden' })

    await expect(hideButton).toBeVisible()
    await expect(hiddenChip).toHaveCount(0)

    // ---- Hide ---------------------------------------------------------------
    await hideButton.click()
    await expect(page.getByText('Demo hidden')).toBeVisible()
    await expect(unhideButton).toBeVisible()
    await expect(hiddenChip).toBeVisible()

    // API cross-check: the flag is set, and the gate now refuses a player who
    // is neither an admin nor a participant on the demo.
    expect((await getDemoViaApi(adminToken, demo.id)).is_hidden).toBe(true)
    expect(await getDemoReadStatus(bystander.token, demo.id)).toBe(403)

    // ---- Unhide -------------------------------------------------------------
    await unhideButton.click()
    await expect(page.getByText('Demo unhidden')).toBeVisible()
    await expect(hideButton).toBeVisible()
    await expect(hiddenChip).toHaveCount(0)

    expect((await getDemoViaApi(adminToken, demo.id)).is_hidden).toBe(false)
    expect(await getDemoReadStatus(bystander.token, demo.id)).toBe(200)
  })

  test('admin writes, persists and clears admin notes', async ({ page }) => {
    test.setTimeout(60_000)
    const demo = await catalogDemoViaApi(adminToken, game.id)
    expect(demo.admin_notes).toBeNull()

    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demo.id}`)
    await expect(page.getByRole('heading', { name: demo.file_name })).toBeVisible()

    const notes = page.getByRole('textbox', { name: 'Admin notes' })
    const saveNotes = page.getByRole('button', { name: 'Save Notes' })

    // Nothing typed yet ⇒ nothing to save.
    await expect(notes).toHaveValue('')
    await expect(saveNotes).toBeDisabled()

    // ---- Write --------------------------------------------------------------
    const noteText = `Reviewed by e2e ${uniqueId()} — overtime demo, keep.`
    await notes.fill(noteText)
    await expect(saveNotes).toBeEnabled()
    await saveNotes.click()
    await expect(page.getByText('Notes saved')).toBeVisible()
    // Saving makes the field pristine again.
    await expect(saveNotes).toBeDisabled()

    expect((await getDemoViaApi(adminToken, demo.id)).admin_notes).toBe(noteText)

    // ---- Persisted across a reload ------------------------------------------
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Admin notes' })).toHaveValue(noteText)

    // ---- Clear --------------------------------------------------------------
    await page.getByRole('textbox', { name: 'Admin notes' }).fill('')
    await expect(saveNotes).toBeEnabled()
    await saveNotes.click()
    await expect(page.getByText('Notes saved')).toBeVisible()

    // An emptied textarea is sent as `notes: null`, not `""`
    // (AdminDemoDetailPage.vue:454).
    expect((await getDemoViaApi(adminToken, demo.id)).admin_notes).toBeNull()
  })
})

test.describe('Admin demos — catalog modal', () => {
  let adminToken: string
  let game: DemoGame
  const createdDemoIds: string[] = []

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    game = await getDemoGame()
  })

  test.afterAll(async () => {
    for (const id of createdDemoIds) {
      await deleteDemoViaApi(adminToken, id)
    }
  })

  test('admin catalogs a single demo through the modal', async ({ page }) => {
    test.setTimeout(60_000)
    const fileName = uniqueDemoFileName('e2e-single')

    await loginAsAdmin(page)
    await page.goto('/admin/demos')
    await expect(page.getByRole('heading', { name: 'Demo Management' })).toBeVisible()

    await page.getByRole('button', { name: 'Catalog Demo' }).click()
    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Catalog Demo' })
    await expect(dialog).toBeVisible()

    await dialog.locator('.v-select').click()
    await page.getByRole('option', { name: game.displayName }).click()
    await dialog.getByRole('textbox', { name: 'S3 Bucket' }).fill('e2e-demo-admin')
    await dialog.getByRole('textbox', { name: 'S3 Key' }).fill(`e2e/single/${fileName}`)
    await dialog.getByRole('textbox', { name: 'File Name' }).fill(fileName)
    await dialog.getByRole('spinbutton', { name: 'File Size (bytes)' }).fill('4096')

    await dialog.getByRole('button', { name: 'Catalog', exact: true }).click()

    // UI: the modal closes and the new demo lands in the table.
    await expect(page.getByText('Demo cataloged successfully')).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const row = page.locator('.v-data-table tbody tr').filter({ hasText: fileName })
    await expect(row).toBeVisible()
    await expect(row.locator('.v-chip').filter({ hasText: 'Pending' })).toBeVisible()
    await expect(row.locator('.v-chip').filter({ hasText: 'Uncategorized' })).toBeVisible()

    // API cross-check: the row exists server-side with the values submitted.
    const listed = await listDemosViaApi(adminToken, game.id)
    const created = listed.find((d) => d.file_name === fileName)
    expect(created).toBeDefined()
    createdDemoIds.push(created!.id)
    expect(created!.s3_bucket).toBe('e2e-demo-admin')
    expect(created!.s3_key).toBe(`e2e/single/${fileName}`)
    expect(created!.status).toBe('pending')
    expect(created!.category).toBe('uncategorized')
  })

  test('admin batch-catalogs S3 keys, and a re-submit reports them as existing', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const suffix = uniqueId()
    const fileNames = [`e2e-batch-${suffix}-1.dem`, `e2e-batch-${suffix}-2.dem`]
    const batchInput = fileNames.map((f) => `s3://e2e-demo-admin/batch/${suffix}/${f}`).join('\n')

    await loginAsAdmin(page)
    await page.goto('/admin/demos')
    await expect(page.getByRole('heading', { name: 'Demo Management' })).toBeVisible()

    // ---- First submit: both created ---------------------------------------
    await page.getByRole('button', { name: 'Catalog Demo' }).click()
    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Catalog Demo' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Batch', exact: true }).click()
    await dialog.locator('.v-select').click()
    await page.getByRole('option', { name: game.displayName }).click()
    await dialog.locator('textarea').fill(batchInput)
    // The `s3://bucket/key` parser (DemoCatalogModal.vue:167-186) resolved both lines.
    await expect(dialog.getByText('2 entries parsed')).toBeVisible()

    await dialog.getByRole('button', { name: 'Batch Catalog', exact: true }).click()
    await expect(dialog.getByText('2 demos cataloged')).toBeVisible()
    await expect(dialog.getByText('already existed')).toHaveCount(0)

    // API cross-check: both rows exist, with the bucket/key split out of the URI.
    const afterCreate = await listDemosViaApi(adminToken, game.id)
    const created = afterCreate.filter((d) => fileNames.includes(d.file_name))
    expect(created).toHaveLength(2)
    for (const demo of created) {
      createdDemoIds.push(demo.id)
      expect(demo.s3_bucket).toBe('e2e-demo-admin')
      expect(demo.s3_key).toBe(`batch/${suffix}/${demo.file_name}`)
      expect(demo.status).toBe('pending')
    }

    // The parent page reloaded its table off the `cataloged` emit.
    for (const fileName of fileNames) {
      await expect(page.locator('.v-data-table tbody tr').filter({ hasText: fileName })).toBeVisible()
    }

    // ---- Second submit of the same keys: idempotent ------------------------
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Catalog Demo' }).click()
    const reopened = page.locator('.v-overlay--active').filter({ hasText: 'Catalog Demo' })
    await expect(reopened).toBeVisible()
    await reopened.getByRole('button', { name: 'Batch', exact: true }).click()
    await reopened.locator('.v-select').click()
    await page.getByRole('option', { name: game.displayName }).click()
    await reopened.locator('textarea').fill(batchInput)
    await reopened.getByRole('button', { name: 'Batch Catalog', exact: true }).click()

    await expect(reopened.getByText('2 already existed')).toBeVisible()
    await expect(reopened.getByText('demos cataloged')).toHaveCount(0)

    // API cross-check: still exactly two rows — no duplicates were minted.
    const afterResubmit = await listDemosViaApi(adminToken, game.id)
    expect(afterResubmit.filter((d) => fileNames.includes(d.file_name))).toHaveLength(2)
  })
})

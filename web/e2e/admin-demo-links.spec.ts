import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import {
  createAwardsScenario,
  submitLinkedDemo,
  getDemo,
  getDemoLinks,
  awardsStatsBody,
  catalogDemo,
  submitDemoStats,
  getAutoLinkSetting,
  setAutoLinkSetting,
  type AwardsScenario,
} from './fixtures/awards.fixture'

/**
 * Admin demo-link correction flow.
 *
 * Seeds an auto-linked demo (stats submission auto-links against the
 * scenario's scheduled match via Steam-ID overlap), then drives the admin
 * demo detail page: inspect the auto link (type + confidence), unlink it
 * with confirmation, and re-link manually via the form.
 */

test.describe('Admin demo link management', () => {
  let adminToken: string
  let scenario: AwardsScenario
  let demoId: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    scenario = await createAwardsScenario(adminToken)
    const seeded = await submitLinkedDemo(adminToken, scenario, [
      { steamId: scenario.p1SteamId, playerName: 'Player1', kills: 15, headshotKills: 8, mag7Kills: 4 },
      { steamId: scenario.p2SteamId, playerName: 'Player2', kills: 9, headshotKills: 3, mag7Kills: 1 },
    ])
    demoId = seeded.demoId
  })

  test('unlink an auto-linked match, then re-link manually via the form', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demoId}`)

    // ---- Auto link is displayed with type + confidence --------------------
    const linkItem = page.locator('.v-list-item', {
      has: page.getByTestId('link-type-chip'),
    })
    await expect(linkItem.first()).toBeVisible()
    await expect(linkItem.first().getByTestId('link-type-chip')).toHaveText('auto_matched')
    await expect(linkItem.first().getByTestId('link-confidence-chip')).toContainText('100% confidence')

    // ---- Unlink with confirmation ----------------------------------------
    await linkItem.first().getByTestId('unlink-match').click()
    const confirmOverlay = page.locator('.v-overlay--active', { hasText: 'Unlink Match' })
    await expect(confirmOverlay).toBeVisible()
    await confirmOverlay.getByRole('button', { name: 'Unlink', exact: true }).click()

    await expect(page.getByText('No match links')).toBeVisible()

    // API asserts: link gone and the demo's tournament stamp cleared.
    expect(await getDemoLinks(adminToken, demoId)).toHaveLength(0)
    expect((await getDemo(adminToken, demoId)).tournament_id).toBeNull()

    // ---- Re-link manually via the form ------------------------------------
    await page.getByRole('button', { name: 'Link to Match' }).click()
    const linkDialog = page.locator('.v-overlay--active', { hasText: 'Link Demo to Match' })
    await expect(linkDialog).toBeVisible()
    await linkDialog.getByRole('textbox', { name: 'Match ID' }).fill(scenario.matchId)
    await linkDialog.getByRole('button', { name: 'Link', exact: true }).click()

    const manualItem = page.locator('.v-list-item', { has: page.getByTestId('link-type-chip') })
    await expect(manualItem.first().getByTestId('link-type-chip')).toHaveText('manual')

    // API assert: the link is back with link_type manual.
    const links = await getDemoLinks(adminToken, demoId)
    expect(links).toHaveLength(1)
    expect(links[0]!.link_type).toBe('manual')
    expect(links[0]!.match_id).toBe(scenario.matchId)
  })

  test('link form surfaces RFC 7807 problem details on failure', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/admin/demos/${demoId}`)

    await page.getByRole('button', { name: 'Link to Match' }).click()
    const linkDialog = page.locator('.v-overlay--active', { hasText: 'Link Demo to Match' })
    await expect(linkDialog).toBeVisible()
    // A syntactically valid UUID that doesn't exist -> backend problem detail.
    await linkDialog.getByRole('textbox', { name: 'Match ID' }).fill('00000000-0000-7000-8000-000000000000')
    await linkDialog.getByRole('button', { name: 'Link', exact: true }).click()

    // The dialog stays open and shows the backend's error detail.
    await expect(linkDialog.locator('.v-alert')).toBeVisible()
  })

  test('auto-link toggle disables the automatic pass and re-enables it', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    await page.goto('/admin/demos')

    const toggle = page.getByTestId('auto-link-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle.locator('input')).toBeChecked()

    try {
      // ---- Disable via the UI ---------------------------------------------
      await toggle.locator('input').click()
      await expect(page.getByText('Auto-linking disabled')).toBeVisible()
      expect(await getAutoLinkSetting(adminToken)).toBe(false)

      // Behavior: a full-overlap stats submission no longer auto-links.
      const demoFile = `e2e-toggle-${Date.now()}.dem`
      const unlinkedDemoId = await catalogDemo(adminToken, scenario.gameId, demoFile)
      const demo = await submitDemoStats(
        adminToken,
        unlinkedDemoId,
        awardsStatsBody(
          [
            { steamId: scenario.p1SteamId, playerName: 'Player1', kills: 5, headshotKills: 2, mag7Kills: 0 },
            { steamId: scenario.p2SteamId, playerName: 'Player2', kills: 3, headshotKills: 1, mag7Kills: 0 },
          ],
          scenario.matchDate,
          demoFile,
        ),
      )
      expect(demo.tournament_id).toBeNull()
      expect(await getDemoLinks(adminToken, unlinkedDemoId)).toHaveLength(0)

      // ---- Re-enable via the UI -------------------------------------------
      await toggle.locator('input').click()
      await expect(page.getByText('Auto-linking enabled')).toBeVisible()
      expect(await getAutoLinkSetting(adminToken)).toBe(true)
    } finally {
      // Never leave the suite's shared backend with auto-linking off.
      await setAutoLinkSetting(adminToken, true)
    }
  })

  test('auto-link setting endpoints are 403 for non-admins', async () => {
    const playerToken = scenario.p1.token
    const get = await fetch(`${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/admin/demos/auto-link`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    })
    expect(get.status).toBe(403)
    const put = await fetch(`${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/admin/demos/auto-link`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`,
      },
      body: JSON.stringify({ enabled: false }),
    })
    expect(put.status).toBe(403)
  })
})

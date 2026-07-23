import { test, expect } from '@playwright/test'
import { uniqueEmail, uniqueId, uniqueUsername } from './fixtures/test-data'

/**
 * `/players` — the public player directory. COVERAGE-PLAN §8 records it as a
 * route no test has ever loaded.
 *
 * It has no mutations, so the behaviour worth pinning is the search → result →
 * navigate path (and that it is genuinely public, i.e. usable signed-out).
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface DirectoryPlayer {
  playerId: string
  displayName: string
  countryCode: string
}

/** Register a player and set a country so the country column has real data. */
async function registerDirectoryPlayer(lookingForTeam = true): Promise<DirectoryPlayer> {
  const displayName = `Directory${uniqueId()}`
  const registerResp = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUsername(),
      email: uniqueEmail(),
      password: 'TestPassword123!',
      display_name: displayName,
    }),
  })
  if (!registerResp.ok) {
    throw new Error(`Register failed (${registerResp.status}): ${await registerResp.text()}`)
  }
  const registered = (await registerResp.json()) as {
    data: { access_token: string; user: { id: string } }
  }

  const countryCode = 'DE'
  const patchResp = await fetch(`${API_URL}/v1/players/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registered.data.access_token}`,
    },
    body: JSON.stringify({ country_code: countryCode, looking_for_team: lookingForTeam }),
  })
  if (!patchResp.ok) {
    throw new Error(`PATCH /v1/players/me failed (${patchResp.status}): ${await patchResp.text()}`)
  }

  return { playerId: registered.data.user.id, displayName, countryCode }
}

test.describe('Public players directory', () => {
  test('finds a player by name and links through to their profile', async ({ page }) => {
    const player = await registerDirectoryPlayer()

    // Signed out on purpose: /players carries no auth meta in the router, and a
    // regression that made it admin-only would otherwise go unnoticed.
    await page.goto('/players')
    await expect(page.getByRole('heading', { name: 'Players', level: 1 })).toBeVisible()

    await page.getByRole('textbox', { name: 'Search by display name...' }).fill(player.displayName)

    const row = page.locator('.v-data-table tbody tr').filter({ hasText: player.displayName })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('.v-data-table tbody tr'),
      'a full display-name search must resolve to exactly one player',
    ).toHaveCount(1)

    // The profile fields set over the API are the ones the row renders.
    await expect(row.getByText(player.countryCode, { exact: true })).toBeVisible()
    await expect(row.getByText('LFT', { exact: true })).toBeVisible()

    await row.getByRole('link', { name: player.displayName }).click()
    await expect(page).toHaveURL(`/players/${player.playerId}`)
    await expect(page.getByRole('heading', { name: player.displayName })).toBeVisible()
  })

  test('the LFT filter narrows the directory to players looking for a team', async ({ page }) => {
    const lft = await registerDirectoryPlayer()

    await page.goto('/players')

    await page.locator('.v-select').filter({ hasText: 'Team Status' }).click()
    await page.getByRole('option', { name: 'Looking for team' }).click()
    await expect(page.locator('.v-chip').filter({ hasText: 'Team: Looking for team' })).toBeVisible()

    // Narrow further by name so the assertion is about this known player rather
    // than about whatever the shared DB happens to hold on page 1.
    await page.getByRole('textbox', { name: 'Search by display name...' }).fill(lft.displayName)
    const row = page.locator('.v-data-table tbody tr').filter({ hasText: lft.displayName })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText('LFT', { exact: true })).toBeVisible()

    // Cross-check the filter is applied server-side, not just cosmetically.
    const resp = await fetch(
      `${API_URL}/v1/players?team_status=lft&q=${encodeURIComponent(lft.displayName)}`,
    )
    expect(resp.ok).toBe(true)
    const body = (await resp.json()) as { data: Array<{ id: string; looking_for_team: boolean }> }
    expect(body.data.map((p) => p.id)).toContain(lft.playerId)

    // A player who is NOT looking for a team must drop out of this filter:
    // same search term, opposite flag, empty result.
    const notLooking = await registerDirectoryPlayer(false)
    await page.getByRole('textbox', { name: 'Search by display name...' }).fill(notLooking.displayName)
    await expect(page.getByText('No players found matching your filters')).toBeVisible({
      timeout: 15_000,
    })

    // …and they ARE in the directory once the filter is cleared, so the empty
    // state above is the filter working, not the player missing.
    await page.locator('.v-chip').filter({ hasText: 'Team: Looking for team' }).getByRole('button').click()
    await expect(
      page.locator('.v-data-table tbody tr').filter({ hasText: notLooking.displayName }),
    ).toBeVisible({ timeout: 15_000 })
  })
})

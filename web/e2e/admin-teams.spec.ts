import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import { createTeamWithMembers, getTeamMembers } from './fixtures/team-roster.fixture'

/**
 * `/admin/teams` — a route COVERAGE-PLAN §8 records as never loaded, and the
 * only host of `LeagueTeamDetailModal` (§7 Tier 3): admin promote-to-captain
 * and demote-from-captain have no other entry point in the product.
 *
 * The demote menu item only renders for a captain when the team has MORE THAN
 * ONE captain (`LeagueTeamDetailModal.vue:143-148`), so the natural test is the
 * round trip: promote a player through the UI, then demote them again through
 * the UI, cross-checking the roster over the API at each step.
 */

test.describe('Admin teams', () => {
  test('promotes a member to captain and demotes them again', async ({ page }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()

    // The page lists teams for a season of a league the signed-in admin
    // administers (`AdminTeamsPage.fetchMyLeagues` keeps only owner/admin/
    // moderator memberships), so the league must be created by the admin.
    const scenario = await createLeagueSeasonScenario(adminToken)
    const team = await createTeamWithMembers({
      leagueId: scenario.leagueId,
      seasonId: scenario.seasonId,
      memberCount: 1,
      teamNamePrefix: 'Admin Teams',
    })
    const member = team.members[0]!

    const before = await getTeamMembers(team.teamSeasonId)
    expect(
      before.filter((m) => m.role === 'captain'),
      'the team starts with exactly one captain: its owner',
    ).toHaveLength(1)
    expect(before.find((m) => m.player_id === member.playerId)!.role).toBe('player')

    await loginAsAdmin(page)
    await page.goto('/admin/teams')

    await expect(page.getByRole('heading', { name: 'All Teams' })).toBeVisible()
    // Nothing is listed until a league AND a season are chosen — that gating is
    // the page's whole shape, so assert it before selecting.
    await expect(page.getByText('Select a League to View Teams')).toBeVisible()

    await page.locator('.v-select').filter({ hasText: 'Select League' }).click()
    await page.getByRole('option', { name: scenario.leagueName }).click()
    await expect(page.getByText('Select a Season')).toBeVisible()

    await page.locator('.v-select').filter({ hasText: 'Select Season' }).click()
    await page.getByRole('option', { name: scenario.seasonName }).click()

    const teamRow = page.locator('.v-data-table tbody tr').filter({ hasText: team.teamName })
    await expect(teamRow).toBeVisible({ timeout: 15_000 })
    await expect(teamRow.getByText(`[${team.teamTag}]`)).toBeVisible()
    await expect(teamRow.getByText('2 members')).toBeVisible()
    // The status column runs through `teamStatusMap`, so it must read as prose,
    // not as the raw `LeagueTeamStatus` enum.
    await expect(teamRow.getByText('Active', { exact: true })).toBeVisible()

    // ── Roster tab ─────────────────────────────────────────────────────────
    await teamRow.getByRole('button', { name: 'View team details' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: team.teamName })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`[${team.teamTag}]`)).toBeVisible()

    const memberRow = dialog.locator('tbody tr').filter({ hasText: member.displayName })
    await expect(memberRow).toBeVisible({ timeout: 15_000 })
    await expect(memberRow.getByText('Player', { exact: true })).toBeVisible()

    // ── Promote ────────────────────────────────────────────────────────────
    const promotePromise = page.waitForResponse(
      (resp) =>
        /\/members\/[^/]+\/promote$/.test(resp.url()) && resp.request().method() === 'POST',
    )
    await memberRow.getByRole('button', { name: 'Member actions' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Promote to Captain' }).click()
    const promoteResponse = await promotePromise
    expect(promoteResponse.ok(), 'POST …/promote must succeed').toBe(true)

    await expect(
      page.locator('.v-snackbar').getByText(`${member.displayName} promoted to captain`),
    ).toBeVisible()
    await expect(memberRow.getByText('Captain', { exact: true })).toBeVisible()

    const promoted = await getTeamMembers(team.teamSeasonId)
    expect(promoted.find((m) => m.player_id === member.playerId)!.role).toBe('captain')
    expect(
      promoted.filter((m) => m.role === 'captain'),
      'the team now has two captains',
    ).toHaveLength(2)

    // ── Demote (only offered while a second captain exists) ────────────────
    const demotePromise = page.waitForResponse(
      (resp) =>
        /\/members\/[^/]+\/demote$/.test(resp.url()) && resp.request().method() === 'POST',
    )
    await memberRow.getByRole('button', { name: 'Member actions' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Demote from Captain' }).click()
    const demoteResponse = await demotePromise
    expect(demoteResponse.ok(), 'POST …/demote must succeed').toBe(true)

    await expect(
      page.locator('.v-snackbar').getByText(`${member.displayName} demoted from captain`),
    ).toBeVisible()
    await expect(memberRow.getByText('Player', { exact: true })).toBeVisible()

    const demoted = await getTeamMembers(team.teamSeasonId)
    expect(demoted.find((m) => m.player_id === member.playerId)!.role).toBe('player')
    expect(
      demoted.filter((m) => m.role === 'captain'),
      'the owner is captain again, alone',
    ).toHaveLength(1)
  })

  test('renames a team from the detail modal settings tab', async ({ page }) => {
    test.setTimeout(120_000)
    const adminToken = await getAdminToken()
    const scenario = await createLeagueSeasonScenario(adminToken)
    const team = await createTeamWithMembers({
      leagueId: scenario.leagueId,
      seasonId: scenario.seasonId,
      memberCount: 0,
      teamNamePrefix: 'Admin Rename',
    })

    await loginAsAdmin(page)
    await page.goto('/admin/teams')

    await page.locator('.v-select').filter({ hasText: 'Select League' }).click()
    await page.getByRole('option', { name: scenario.leagueName }).click()
    await page.locator('.v-select').filter({ hasText: 'Select Season' }).click()
    await page.getByRole('option', { name: scenario.seasonName }).click()

    const teamRow = page.locator('.v-data-table tbody tr').filter({ hasText: team.teamName })
    await expect(teamRow).toBeVisible({ timeout: 15_000 })
    await teamRow.getByRole('button', { name: 'View team details' }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: team.teamName })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: 'Settings' }).click()

    const renamed = `${team.teamName} Renamed`
    await dialog.getByRole('textbox', { name: 'Team Name' }).fill(renamed)

    const savePromise = page.waitForResponse(
      (resp) =>
        /\/v1\/league-teams\/[^/]+$/.test(resp.url()) && resp.request().method() === 'PATCH',
    )
    await dialog.getByRole('button', { name: 'Save Settings' }).click()
    const saveResponse = await savePromise
    expect(saveResponse.ok(), 'PATCH /v1/league-teams/{id} must succeed').toBe(true)

    await expect(page.locator('.v-snackbar').getByText('Team settings saved')).toBeVisible()

    // The modal emits `updated`, which re-fetches the table behind it.
    await expect(
      page.locator('.v-data-table tbody tr').filter({ hasText: renamed }),
    ).toBeVisible({ timeout: 15_000 })

    const resp = await fetch(
      `${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/league-teams/${team.teamId}`,
    )
    expect(resp.ok, 'GET /v1/league-teams/{id} must succeed').toBe(true)
    const body = (await resp.json()) as { data: { name: string } }
    expect(body.data.name).toBe(renamed)
  })
})

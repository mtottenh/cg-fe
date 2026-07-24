import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  getTeamMembers,
  getTeam,
  promoteToCaptainApi,
  demoteFromCaptainApi,
  transferTeamOwnership,
  loginAsUser,
  type TeamRosterScenario,
} from './fixtures/team-roster.fixture'

/**
 * Team roster management E2E — picks up where `team-management.spec.ts`
 * leaves off: the existing suite covers team creation + invite/accept flows
 * but not captain-driven roster mutations.
 *
 * Scenarios:
 *   1. Captain promotes a member to captain (UI)
 *   2. Captain demotes a co-captain back to a regular member
 *      (API + UI reflection — no captain-facing demote control exists)
 *   3. Captain removes a member via the action menu + ConfirmDialog (UI)
 *   4. Owner transfers team ownership; edit access moves from old to new owner
 *      (API + UI reflection — no transfer-ownership control exists at all)
 *
 * Most setup happens via API (registering throwaway players + seeding team
 * rosters through the UI would be slow and brittle). The UI is exercised only
 * where the scenario requires it.
 */

test.describe.configure({ mode: 'serial' })

test.describe('Team Roster Management', () => {
  let leagueId: string
  let seasonId: string

  test.beforeAll(async () => {
    // Self-contained: build a fresh open league + registration-phase season via
    // the admin API so roster mutations run against known-good state without
    // depending on globally seeded singletons.
    const adminToken = await getAdminToken()
    const scenario = await createLeagueSeasonScenario(adminToken)
    leagueId = scenario.leagueId
    seasonId = scenario.seasonId
  })

  test('captain promotes member to co-captain via action menu', async ({ page }) => {
    // Arrange: owner + one other member on a fresh team
    const scenario: TeamRosterScenario = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 1,
    })
    const [promotee] = scenario.members

    // Act: log in as the owner (who is also captain by default) and open the team page
    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    // Ensure the roster rendered before we reach for the menu.
    await expect(page.getByText(scenario.owner.displayName, { exact: false })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText(promotee.displayName, { exact: false })).toBeVisible()

    // P-107: scope the action menu to the PROMOTEE's own row rather than taking
    // `.first()` of every three-dots icon on the page. The menu only renders for
    // non-current-user rows (TeamDetailPage.vue:248), so `.first()` happened to be
    // right for a two-person roster — but it is positional, and positional
    // locators are what the UUID-prefix trap in §2 warns about. Scope it.
    const promoteeRow = page
      .locator('.v-list-item')
      .filter({ hasText: promotee.displayName })
      .first()
    const menuTrigger = promoteeRow.getByRole('button', { name: 'Member actions' })
    await expect(menuTrigger).toBeVisible()
    await menuTrigger.click()

    const promoteOption = page.getByText(/Promote to Captain/i)
    await expect(promoteOption).toBeVisible()

    // P-107 (the actual full-suite failure): this used to
    // `waitForLoadState('networkidle')` after clicking. networkidle resolves once
    // the page has been quiet for 500ms — which, if the request has not been
    // dispatched yet, is satisfied IMMEDIATELY by the already-idle page. The API
    // cross-check below then read the roster before the promote landed and saw
    // `player`. It passed in isolation because the server was fast enough, and
    // failed only under full-suite load: a latent race, not a slow server.
    // Wait for the mutation itself.
    const promoteResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/members/${promotee.playerId}/promote`) && res.request().method() === 'POST',
    )
    await promoteOption.click()
    expect((await promoteResponse).status()).toBe(200)

    // Assert — via API cross-check: the member is now a captain.
    const members = await getTeamMembers(scenario.teamSeasonId, scenario.owner.token)
    const promotedRow = members.find((m) => m.player_id === promotee.playerId)
    expect(promotedRow, `promoted member should appear in roster`).toBeDefined()
    expect(promotedRow!.role.toLowerCase()).toBe('captain')
  })

  test('captain demotes a co-captain back to member (API — no captain-facing demote UI exists)', async ({ page }) => {
    // Verified 2026-07-22: the captain-facing roster menu on
    // `pages/TeamDetailPage.vue:170-190` offers only "Promote to Captain" and
    // "Remove from Team" — there is no demote item, and no other captain
    // surface calls `leagueTeamsStore.demoteFromCaptain` (stores/leagueTeams.ts:190).
    // The ONLY demote control in the app is the ADMIN one in
    // `components/admin/LeagueTeamDetailModal.vue:139-146` (reached from
    // /admin/teams), which is a different actor and a different scenario —
    // tracked as new coverage, not something this captain-side test can drive.
    // So the demote itself stays API-driven; the UI half below still asserts
    // that the roster renders the demoted role.
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 1 })
    const [coCaptain] = scenario.members

    // Arrange: promote the member to captain first.
    await promoteToCaptainApi(scenario.owner.token, scenario.teamSeasonId, coCaptain.playerId)
    {
      const roster = await getTeamMembers(scenario.teamSeasonId, scenario.owner.token)
      const row = roster.find((m) => m.player_id === coCaptain.playerId)
      expect(row?.role.toLowerCase()).toBe('captain')
    }

    // Act: demote via API (the domain action the owner actually performs).
    // coverage-plan-exempt: no captain-facing demote UI exists (see the note above);
    // this is a deliberate API-level action, not a bypassed UI control.
    await demoteFromCaptainApi(scenario.owner.token, scenario.teamSeasonId, coCaptain.playerId)

    // Assert (API): role is no longer captain.
    const rosterAfter = await getTeamMembers(scenario.teamSeasonId, scenario.owner.token)
    const demotedRow = rosterAfter.find((m) => m.player_id === coCaptain.playerId)
    expect(demotedRow, 'member should still be on the team').toBeDefined()
    expect(demotedRow!.role.toLowerCase()).not.toBe('captain')

    // Assert (UI): reload as owner, the member row no longer shows a captain chip.
    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(coCaptain.displayName, { exact: false })).toBeVisible({
      timeout: 5000,
    })

    // Count `captain` chips — owner is still a captain, so exactly 1 should
    // remain (not 2). The "Promote to Captain" action should be available
    // on the demoted member's row again.
    const captainChips = page.locator('.v-chip').filter({ hasText: /captain/i })
    await expect(captainChips).toHaveCount(1)
  })

  test('captain removes a member via confirmation dialog', async ({ page }) => {
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 1 })
    const [victim] = scenario.members

    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(victim.displayName, { exact: false })).toBeVisible({ timeout: 5000 })

    // Open the action menu on the member row.
    const menuTrigger = page.locator('.mdi-dots-vertical').first()
    await expect(menuTrigger).toBeVisible()
    await menuTrigger.click()

    const removeOption = page.getByText(/Remove from Team/i)
    await expect(removeOption).toBeVisible()
    await removeOption.click()

    // ConfirmDialog should appear asking for confirmation.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Remove/i }).click()

    // Wait for the store to filter the member out of local state → UI removes the row.
    await expect(page.getByText(victim.displayName, { exact: false })).toHaveCount(0, {
      timeout: 10_000,
    })

    // Assert — API cross-check: the member is gone.
    const roster = await getTeamMembers(scenario.teamSeasonId, scenario.owner.token)
    const stillOnTeam = roster.find((m) => m.player_id === victim.playerId)
    // Some services soft-delete (status=removed) rather than actually dropping
    // the row; accept either shape so the assertion doesn't flake on the
    // implementation detail.
    if (stillOnTeam) {
      expect(stillOnTeam.status.toLowerCase()).not.toBe('active')
    } else {
      expect(stillOnTeam).toBeUndefined()
    }

    // The removed user's membership shows on /my-teams with "Left" status
    // (the backend keeps historical memberships, it just marks them Left).
    await loginAsUser(page, { email: victim.email, password: victim.password })
    await page.goto('/my-teams')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(scenario.teamName, { exact: false })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.v-chip').filter({ hasText: 'Left' }).first()).toBeVisible()
  })

  test('owner transfers team ownership; edit access moves to new owner (API — no transfer-ownership UI exists)', async ({ page }) => {
    // Verified 2026-07-22: the frontend has NO transfer-ownership control
    // anywhere. `POST /v1/league-teams/{team_id}/transfer-ownership` appears
    // only in the generated client (`src/api/types.ts:1786-1796`); no store
    // action wraps it (nothing in stores/leagueTeams.ts) and no component
    // references it. Drive the transfer via API and assert the UI reflects
    // the new owner by checking who can reach `/teams/{id}/edit`.
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 1 })
    const [newOwner] = scenario.members

    // Sanity: the old owner is currently the team's owner_player_id.
    {
      const team = await getTeam(scenario.teamId)
      expect(team.owner_player_id).toBe(scenario.owner.playerId)
    }

    // Act: transfer ownership via API.
    // coverage-plan-exempt: no transfer-ownership UI exists anywhere in the app
    // (see the note above); this is a deliberate API-level action.
    await transferTeamOwnership(scenario.owner.token, scenario.teamId, newOwner.playerId)

    // Assert (API): backend has updated owner_player_id.
    const teamAfter = await getTeam(scenario.teamId)
    expect(teamAfter.owner_player_id).toBe(newOwner.playerId)

    // Assert (UI): old owner lands on `/teams/:id`. The Edit Team button
    // depends on `isCaptain`, which is derived from membership — the old
    // owner was also the captain, and ownership transfer promotes the new
    // owner to captain in the TeamSeasonService. Here we check that at
    // least the page still loads for the old owner (they retain membership)
    // and that the *new* owner CAN reach `/teams/:id/edit` without being
    // rejected.
    await loginAsUser(page, { email: newOwner.email, password: newOwner.password })
    await page.goto(`/teams/${scenario.teamId}/edit`)
    await page.waitForLoadState('networkidle')

    // The edit page only renders its form if the user is the owner — look
    // for the Edit Team Settings header or, at minimum, confirm we weren't
    // redirected off the edit route.
    expect(page.url()).toMatch(/\/teams\/.+\/edit/)
    // Pin the form's CARD TITLE (TeamEditPage.vue:35-38). A plain
    // `getByText(/Edit Team Settings/i)` also matches the non-owner alert
    // "Only the team owner can EDIT TEAM SETTINGS" — text matching is
    // substring + case-insensitive — so the `toHaveCount(0)` check below could
    // never pass, and the whole non-owner half of this test was permanently red.
    const editHeader = page.locator('.v-card-title').filter({ hasText: 'Edit Team Settings' })
    const ownerErrorAlert = page.getByText(/Only the team owner can edit/i)
    // The new owner sees the form, not the alert — and the form is populated,
    // which is what distinguishes "owner" from the P-13 blank-form bug below.
    await expect(editHeader).toBeVisible({ timeout: 5000 })
    await expect(ownerErrorAlert).toHaveCount(0)
    await expect(page.getByLabel('Team Name')).toHaveValue(scenario.teamName)

    // And the old owner should no longer be able to use the edit page.
    await loginAsUser(page, {
      email: scenario.owner.email,
      password: scenario.owner.password,
    })
    await page.goto(`/teams/${scenario.teamId}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/Only the team owner can edit/i)).toBeVisible({ timeout: 5000 })

    // COVERAGE-PLAN §9b P-13: the non-owner must get the notice INSTEAD of the
    // form. Previously `onMounted` returned before populating `form` while the
    // template's `v-if="team"` was already satisfied, so the old owner saw a
    // complete, blank, editable team form sitting under the "you are not the
    // owner" message. `TeamEditPage.vue` now gates the form on `isOwner`.
    await expect(editHeader).toHaveCount(0)
    await expect(page.getByLabel('Team Name')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(0)
  })
})

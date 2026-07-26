import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  getTeam,
  joinLeague,
  loginAsUser,
  registerAsRosterUser,
  transferTeamOwnership,
  type TeamRosterScenario,
} from './fixtures/team-roster.fixture'
import type { LeagueTeamStatus } from './fixtures/api-status'

/**
 * Team authority after an ownership transfer (P-113) and error reporting on
 * `TeamDetailPage` (P-116).
 *
 * P-113 is an AUTHORIZATION defect, so the assertions here are about what each
 * account can still DO, not about what the page shows. `owner_player_id` is
 * only half of what ownership is; the other half is the team-scoped
 * `team_captain` RBAC grant, and `update_team` / `disband_team` /
 * `register_team_for_season` all gate on that grant
 * (`require_team_settings_manage` → `team.settings.manage`), never on the
 * column. When the transfer moved the column alone, the new owner was handed a
 * team they could not edit and the previous owner kept the power to disband it.
 *
 * `team-ownership.spec.ts` already drives the transfer CONTROL through the UI;
 * it stops at "the column moved", which is exactly the assertion that let this
 * ship. So the transfer is a precondition here and the tests start where that
 * one ends.
 */

test.describe.configure({ mode: 'serial' })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function getTeamStatus(teamId: string): Promise<LeagueTeamStatus> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`)
  if (!resp.ok) throw new Error(`Get team failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as { data: { status: LeagueTeamStatus } }
  return body.data.status
}

/** Raw status of an owner-gated write, so a test can assert a refusal. */
async function updateTeamStatusCode(
  token: string,
  teamId: string,
  body: Record<string, unknown>,
): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return resp.status
}

async function disbandTeamStatusCode(token: string, teamId: string): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return resp.status
}

/** Pending invitations/requests on a team season (captain-visible). */
async function getTeamInvitations(
  captainToken: string,
  teamSeasonId: string,
): Promise<{ player_id: string; invitation_type: string; status: string }[]> {
  const resp = await fetch(`${API_URL}/v1/league-team-seasons/${teamSeasonId}/invitations`, {
    headers: { Authorization: `Bearer ${captainToken}` },
  })
  if (!resp.ok) throw new Error(`List invitations failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as {
    data: { player_id: string; invitation_type: string; status: string }[]
  }
  return body.data ?? []
}

test.describe('Team authority after transfer', () => {
  let adminToken: string
  let leagueId: string
  let seasonId: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    const scenario = await createLeagueSeasonScenario(adminToken)
    leagueId = scenario.leagueId
    seasonId = scenario.seasonId
  })

  test('the new owner can save team settings; the former owner is refused (P-113)', async ({
    page,
  }) => {
    const scenario: TeamRosterScenario = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 1,
    })
    const [heir] = scenario.members
    expect(heir, 'scenario should seed one non-owner member').toBeDefined()

    // Precondition: ownership really has moved (the control itself is covered
    // by team-ownership.spec.ts).
    await transferTeamOwnership(scenario.owner.token, scenario.teamId, heir!.playerId)
    expect((await getTeam(scenario.teamId)).owner_player_id).toBe(heir!.playerId)

    // The former owner is still a roster captain — which must NOT be enough.
    // These two probes are the whole finding: before the fix the first
    // returned 200 and the second 204, i.e. the person who gave the team away
    // could still rename it and disband it.
    expect(
      await updateTeamStatusCode(scenario.owner.token, scenario.teamId, {
        description: 'written by the former owner',
      }),
    ).toBe(403)
    expect(await disbandTeamStatusCode(scenario.owner.token, scenario.teamId)).toBe(403)
    expect(await getTeamStatus(scenario.teamId)).toBe('active')

    // ...and the new owner can actually use the form the page offers them.
    // `TeamEditPage` gates rendering on `owner_player_id`, so before the fix
    // this account was shown a complete, editable form whose Save 403'd.
    const newName = `${scenario.teamName} Reborn`
    await loginAsUser(page, { email: heir!.email, password: heir!.password })
    await page.goto(`/teams/${scenario.teamId}/edit`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Edit Team Settings', { exact: true })).toBeVisible({
      timeout: 5000,
    })

    // `exact: true` is unusable on a Vuetify text field (its accessible name is
    // the label twice over) — COVERAGE-PLAN §2.
    const nameField = page.getByRole('textbox', { name: 'Team Name' })
    await nameField.fill(newName)

    // Await the mutation: `networkidle` resolves before the click's request is
    // even dispatched (COVERAGE-PLAN §2).
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${scenario.teamId}`) &&
        res.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    expect((await saveResponse).status()).toBe(200)

    // Assert (UI) and assert (API) — the same write, seen from both sides.
    await expect(page.getByText('Team settings saved')).toBeVisible({ timeout: 5000 })
    expect((await getTeam(scenario.teamId)).name).toBe(newName)
  })

  test('the new owner can disband the team they now own (P-113)', async ({ page }) => {
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 1 })
    const [heir] = scenario.members
    expect(heir, 'scenario should seed one non-owner member').toBeDefined()

    await transferTeamOwnership(scenario.owner.token, scenario.teamId, heir!.playerId)
    expect(await getTeamStatus(scenario.teamId)).toBe('active')

    await loginAsUser(page, { email: heir!.email, password: heir!.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    const disbandButton = page.getByTestId('disband-team-btn')
    await expect(disbandButton).toBeVisible({ timeout: 5000 })
    await disbandButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const disbandResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${scenario.teamId}`) &&
        res.request().method() === 'DELETE',
    )
    await dialog.getByRole('button', { name: 'Disband Team', exact: true }).click()
    // Before the fix this was 403: the control rendered for the new owner
    // (it is gated on `owner_player_id`) and the backend refused it.
    expect((await disbandResponse).status()).toBe(204)

    await page.waitForURL((u) => u.pathname === '/my-teams', { timeout: 10_000 })
    expect(await getTeamStatus(scenario.teamId)).toBe('disbanded')
  })

  test('a refused application reports the backend reason, not a generic failure (P-116)', async ({
    page,
  }) => {
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 0 })

    const applicant = await registerAsRosterUser()
    await joinLeague(applicant.token, leagueId)

    await loginAsUser(page, { email: applicant.email, password: applicant.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    const applyEndpoint = `/v1/league-team-seasons/${scenario.teamSeasonId}/apply`

    // First application: accepted, so the SECOND one hits a real backend
    // refusal rather than a synthetic one.
    await page.getByRole('button', { name: 'Apply to Join', exact: true }).click()
    const firstApply = page.waitForResponse(
      (res) => res.url().includes(applyEndpoint) && res.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Submit Application', exact: true }).click()
    expect((await firstApply).status()).toBe(201)
    await expect(page.getByText('Application submitted!')).toBeVisible({ timeout: 5000 })

    // Second application: refused with "Player already has a pending
    // invitation". The handler read `teamsStore.error` — a computed alias over
    // `fetchMyTeamsState`, a different action entirely — so the reason never
    // reached this variable and the user was told only that something failed.
    await page.getByRole('button', { name: 'Apply to Join', exact: true }).click()
    const secondApply = page.waitForResponse(
      (res) => res.url().includes(applyEndpoint) && res.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Submit Application', exact: true }).click()
    expect((await secondApply).status()).toBe(409)

    await expect(page.getByText('Player already has a pending invitation')).toBeVisible({
      timeout: 5000,
    })
    // The generic fallback is what shipped; it must not be what renders now.
    await expect(page.getByText('Failed to apply to team')).toHaveCount(0)

    // Assert (API): the refusal was real — one pending request, not two.
    const invitations = await getTeamInvitations(scenario.owner.token, scenario.teamSeasonId)
    const mine = invitations.filter(
      (i) => i.player_id === applicant.playerId && i.invitation_type === 'request',
    )
    expect(mine).toHaveLength(1)
  })
})

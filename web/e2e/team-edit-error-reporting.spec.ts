import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  getTeam,
  loginAsUser,
} from './fixtures/team-roster.fixture'

/**
 * P-124 — `TeamEditPage` reports the wrong error, and P-126 — a disbanded team
 * can still be renamed.
 *
 * P-124 is P-116 recurring at six more sites. `leagueTeamsStore.error` is a
 * computed alias over `fetchMyTeamsState` (`stores/leagueTeams.ts:55`), the
 * state of an action `TeamEditPage` never calls — so it is permanently null
 * here and every failed save rendered the generic "Failed to save team
 * settings" while the backend's actual refusal sat one field away in
 * `updateTeamState`. The owner retyping the form was told nothing about what
 * to change.
 *
 * P-126 is why the second test exists at all: `disband_team` and
 * `withdraw_from_season` both refuse to act on a terminal row and
 * `update_team_authorized` did not, so a permanently disbanded team stayed
 * fully renameable — and, because the uniqueness probes are league-scoped, a
 * dead team could go on squatting a live team's name. The two findings are
 * tested together because the fixed backend is only half of it: a refusal the
 * UI cannot render is indistinguishable from the bug.
 *
 * Both tests drive a REAL backend refusal through the real form. Nothing is
 * mocked, and the assertion in each is the backend's own sentence.
 */

test.describe.configure({ mode: 'serial' })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function disbandTeam(token: string, teamId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`Disband team failed (${resp.status}): ${await resp.text()}`)
  }
}

async function getTeamStatus(teamId: string): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`)
  if (!resp.ok) throw new Error(`Get team failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as { data: { status: string } }
  return body.data.status
}

test.describe('Team edit error reporting', () => {
  let adminToken: string
  let leagueId: string
  let seasonId: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    const scenario = await createLeagueSeasonScenario(adminToken)
    leagueId = scenario.leagueId
    seasonId = scenario.seasonId
  })

  test('a rejected rename shows the backend reason, not the generic fallback (P-124)', async ({
    page,
  }) => {
    // Two teams in the same league, so the second one's rename hits a REAL
    // uniqueness refusal rather than a synthetic one.
    const incumbent = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 0,
      teamNamePrefix: 'Incumbent Squad',
    })
    const challenger = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 0,
      teamNamePrefix: 'Challenger Squad',
    })

    await loginAsUser(page, {
      email: challenger.owner.email,
      password: challenger.owner.password,
    })
    await page.goto(`/teams/${challenger.teamId}/edit`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Edit Team Settings', { exact: true })).toBeVisible({
      timeout: 10000,
    })

    // `exact: true` is unusable on a Vuetify text field (its accessible name
    // is the label twice over) — COVERAGE-PLAN §2.
    await page.getByRole('textbox', { name: 'Team Name' }).fill(incumbent.teamName)

    // Await the mutation: `networkidle` resolves before the click's request is
    // even dispatched (COVERAGE-PLAN §2).
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${challenger.teamId}`) &&
        res.request().method() === 'PATCH',
      { timeout: 15000 },
    )
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    expect((await saveResponse).status()).toBe(409)

    // The finding, stated as an assertion: the owner is told WHICH name is
    // taken, so they can pick another one.
    await expect(page.getByText(`already taken in this league`)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(incumbent.teamName).first()).toBeVisible()
    // The fallback is what shipped; it must not be what renders now.
    await expect(page.getByText('Failed to save team settings')).toHaveCount(0)

    // Assert (API): the refusal was real — the challenger kept its own name.
    expect((await getTeam(challenger.teamId)).name).toBe(challenger.teamName)
  })

  test('a disbanded team cannot be renamed, and the page says why (P-126, P-124)', async ({
    page,
  }) => {
    const doomed = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 0,
      teamNamePrefix: 'Doomed Squad',
    })

    await disbandTeam(doomed.owner.token, doomed.teamId)
    expect(await getTeamStatus(doomed.teamId)).toBe('disbanded')

    // The edit form still renders for a disbanded team — `TeamEditPage` gates
    // on ownership, and disbanding does not move `owner_player_id`. So the
    // backend is the only guard there is, which is exactly what P-126 was
    // missing.
    await loginAsUser(page, { email: doomed.owner.email, password: doomed.owner.password })
    await page.goto(`/teams/${doomed.teamId}/edit`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Edit Team Settings', { exact: true })).toBeVisible({
      timeout: 10000,
    })

    await page.getByRole('textbox', { name: 'Team Name' }).fill('Resurrected Squad')

    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${doomed.teamId}`) &&
        res.request().method() === 'PATCH',
      { timeout: 15000 },
    )
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    // Before the P-126 fix this was 200 and the rename went through.
    expect((await saveResponse).status()).toBe(400)

    await expect(page.getByText('disbanded and can no longer be modified')).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('Failed to save team settings')).toHaveCount(0)

    // Assert (API): the write was refused, not merely reported as refused.
    const after = await getTeam(doomed.teamId)
    expect(after.name).toBe(doomed.teamName)
    expect(await getTeamStatus(doomed.teamId)).toBe('disbanded')
  })
})

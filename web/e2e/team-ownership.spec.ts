import { test, expect } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createLeagueSeasonScenario,
  createSeason,
  advanceSeason,
} from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  getTeam,
  loginAsUser,
  type TeamRosterScenario,
} from './fixtures/team-roster.fixture'
import type { LeagueTeamStatus } from './fixtures/api-status'

/**
 * Team ownership lifecycle E2E — the three controls P-62 / P-63 / P-71 said
 * were missing.
 *
 * `team-roster.spec.ts:207` already proved the transfer ENDPOINT works; it had
 * to drive it over raw `fetch` and left a `coverage-plan-exempt` note saying
 * "no transfer-ownership UI exists anywhere in the app". Same story for
 * disband (no control at all) and for season re-registration (a store action
 * with zero component consumers). This spec drives all three through the UI,
 * which is the only instrument that distinguishes "endpoint works" from
 * "product works".
 *
 * Scenarios:
 *   1. Owner transfers ownership from the roster action menu (P-62)
 *   2. Owner disbands the team from the team header (P-63)
 *   3. A returning team enters the NEXT season without being re-created (P-71),
 *      reached the way a captain would reach it: /my-teams → View Team
 */

test.describe.configure({ mode: 'serial' })

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * `getTeam` in the roster fixture narrows to the ownership fields; disband
 * asserts on `status`, so read the row here rather than widening a fixture
 * another lane may be editing.
 */
async function getTeamStatus(teamId: string): Promise<LeagueTeamStatus> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`)
  if (!resp.ok) throw new Error(`Get team failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as { data: { status: LeagueTeamStatus } }
  return body.data.status
}

/** Team ids entered in a season, straight from the API. */
async function getSeasonTeamIds(seasonId: string): Promise<string[]> {
  const resp = await fetch(`${API_URL}/v1/league-seasons/${seasonId}/teams?page=1&per_page=100`)
  if (!resp.ok) throw new Error(`List season teams failed (${resp.status}): ${await resp.text()}`)
  const body = (await resp.json()) as { data: { team_id: string }[] }
  return (body.data ?? []).map((t) => t.team_id)
}

test.describe('Team Ownership & Season Registration', () => {
  let adminToken: string
  let leagueId: string
  let seasonId: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    const scenario = await createLeagueSeasonScenario(adminToken)
    leagueId = scenario.leagueId
    seasonId = scenario.seasonId
  })

  test('owner transfers ownership from the roster action menu (P-62)', async ({ page }) => {
    const scenario: TeamRosterScenario = await createTeamWithMembers({
      leagueId,
      seasonId,
      memberCount: 1,
    })
    const [heir] = scenario.members
    expect(heir, 'scenario should seed one non-owner member').toBeDefined()

    // Sanity: the creator owns the team before anything is clicked.
    expect((await getTeam(scenario.teamId)).owner_player_id).toBe(scenario.owner.playerId)

    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(heir!.displayName, { exact: false })).toBeVisible({ timeout: 5000 })

    // Scope the menu to the heir's own row — positional `.first()` is what the
    // UUID-prefix trap in COVERAGE-PLAN §2 warns against.
    const heirRow = page.locator('.v-list-item').filter({ hasText: heir!.displayName }).first()
    await heirRow.getByRole('button', { name: 'Member actions', exact: true }).click()

    await page.getByTestId(`transfer-ownership-${heir!.playerId}`).click()

    // Destructive → confirm-gated. The dialog is the control, not the menu item.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Transfer Ownership', { exact: true }).first()).toBeVisible()

    // Await the mutation itself: `networkidle` resolves on an already-quiet page
    // BEFORE the click's request is dispatched (COVERAGE-PLAN §2).
    const transferResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${scenario.teamId}/transfer-ownership`) &&
        res.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Transfer Ownership', exact: true }).click()
    expect((await transferResponse).status()).toBe(200)

    // Assert (UI): the page confirms by name...
    await expect(page.getByText(`${heir!.displayName} is now the team owner`)).toBeVisible({
      timeout: 5000,
    })
    // ...and the owner-only surfaces stop offering actions this account has just
    // given away. A stale `team` ref here is exactly how a control that 403s
    // gets left on screen.
    await expect(page.getByTestId('disband-team-btn')).toHaveCount(0)
    await expect(page.getByTestId('season-registration-card')).toHaveCount(0)

    // Assert (API): the backend really moved ownership.
    expect((await getTeam(scenario.teamId)).owner_player_id).toBe(heir!.playerId)
  })

  test('owner disbands the team from the team header (P-63)', async ({ page }) => {
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 0 })

    expect(await getTeamStatus(scenario.teamId)).toBe('active')

    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })
    await page.goto(`/teams/${scenario.teamId}?season=${scenario.teamSeasonId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(scenario.teamName, { exact: false }).first()).toBeVisible({
      timeout: 5000,
    })

    const disbandButton = page.getByTestId('disband-team-btn')
    await expect(disbandButton).toBeVisible()
    await disbandButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // The confirm copy must name the team being destroyed — a generic "are you
    // sure?" on an irreversible action is how the wrong team gets disbanded.
    await expect(dialog.getByText(scenario.teamName, { exact: false })).toBeVisible()

    const disbandResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-teams/${scenario.teamId}`) &&
        res.request().method() === 'DELETE',
    )
    await dialog.getByRole('button', { name: 'Disband Team', exact: true }).click()
    expect((await disbandResponse).status()).toBe(204)

    // Assert (UI): the captain is taken off the page for a team that no longer
    // competes, rather than left staring at a dead roster.
    await page.waitForURL((u) => u.pathname === '/my-teams', { timeout: 10_000 })

    // Assert (API): disband is a terminal STATUS flip, not a row delete — the
    // team keeps its history and its id resolves.
    expect(await getTeamStatus(scenario.teamId)).toBe('disbanded')
  })

  test('a returning team registers for the next season without being re-created (P-71)', async ({
    page,
  }) => {
    // A team that already played season 1 of this league...
    const scenario = await createTeamWithMembers({ leagueId, seasonId, memberCount: 0 })

    // ...and a season 2 the league has just opened for registration.
    const nextSeason = await createSeason(adminToken, leagueId, { namePrefix: 'E2E Next Season' })
    await advanceSeason(adminToken, nextSeason, 'registration')

    expect(await getSeasonTeamIds(nextSeason.seasonId)).not.toContain(scenario.teamId)

    await loginAsUser(page, { email: scenario.owner.email, password: scenario.owner.password })

    // Reach the team the way a captain does — "My Teams" had no link to the team
    // itself before this fix, so every owner control was unreachable from it.
    await page.goto('/my-teams')
    await page.waitForLoadState('networkidle')
    await page.getByTestId(`view-team-${scenario.teamId}`).click()
    await page.waitForURL((u) => u.pathname === `/teams/${scenario.teamId}`, { timeout: 10_000 })

    const registrationCard = page.getByTestId('season-registration-card')
    await expect(registrationCard).toBeVisible({ timeout: 5000 })

    // Season 1 is ALSO open for registration, but the team is already in it —
    // offering it would be a control that can only ever 409.
    await expect(page.getByTestId(`registerable-season-${seasonId}`)).toHaveCount(0)

    const registerButton = page.getByTestId(`register-season-${nextSeason.seasonId}`)
    await expect(registerButton).toBeVisible()

    const registerResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/v1/league-seasons/${nextSeason.seasonId}/teams/register`) &&
        res.request().method() === 'POST',
    )
    await registerButton.click()
    expect((await registerResponse).status()).toBe(201)

    // Assert (UI): confirmed by season name, and the entry is consumed so it
    // cannot be clicked into a 409.
    await expect(page.getByText(`Registered for ${nextSeason.seasonName}`)).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByTestId(`register-season-${nextSeason.seasonId}`)).toHaveCount(0)

    // Assert (API): the SAME team id is entered in season 2 — the whole point of
    // the finding is that the only previous route created a new team id and
    // orphaned the roster, trophies and match history behind it.
    expect(await getSeasonTeamIds(nextSeason.seasonId)).toContain(scenario.teamId)
  })
})

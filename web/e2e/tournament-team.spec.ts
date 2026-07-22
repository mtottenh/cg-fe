import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken } from './fixtures/auth.fixture'
import { uniqueId, CS2_MAP_POOL } from './fixtures/test-data'
import { createLeagueSeasonScenario } from './fixtures/league-season-extra.fixture'
import {
  createTeamWithMembers,
  loginAsUser,
  registerAsRosterUser,
  type RosterUser,
} from './fixtures/team-roster.fixture'
import { approveRegistration } from './fixtures/tournament-lifecycle.fixture'
import { listRegistrations } from './fixtures/team-tournament-extra.fixture'

/**
 * TEAM tournament registration — the captain-facing surface.
 *
 * SCOPE
 * -----
 * This file used to be 18 tests against the globally seeded team tournament
 * that mostly asserted `expect(page.locator('.v-card').first()).toBeVisible()`
 * — i.e. "the page rendered something" (COVERAGE-PLAN.md §6.4). Everything
 * generic about a team tournament's *rendering* is already covered properly
 * elsewhere and is not repeated here:
 *
 *   - team-based overview copy ("Teams (5 players)"), the Participants tab
 *     listing team names, and the Bracket tab rendering Swiss standings
 *     → `team-tournament.spec.ts:103-121`
 *   - the tournaments list page, the detail tabs, "Tournament Not Found", and
 *     the status chip → `tournament-public.spec.ts:67-201`
 *   - the admin tournament table → `tournament-admin.spec.ts`
 *
 * What NOTHING covered — and what this file is now about — is the team
 * registration flow through the UI: `TeamRegistrationModal.handleRegister`
 * and `TournamentDetailPage.handleTeamRegister` (COVERAGE-PLAN.md §7 Tier 1).
 *
 * WHY EVERY TEST BUILDS ITS OWN SCENARIO
 * --------------------------------------
 * Eligibility is a five-way conjunction (captain/manager · not already
 * registered · same league · same season · active membership —
 * `TeamRegistrationModal.vue:144-173`), so the only way to make the modal
 * deterministic is to own the league, the season, the team and the
 * tournament. The seeded singleton satisfied none of that reliably, which is
 * exactly why the old tests were wrapped in visibility guards. No guards
 * remain in this file.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** 5v5 — matches the team size used by the flagship team spec. */
const TEAM_SIZE = 5

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

interface TeamRegistrationScenario {
  tournamentId: string
  tournamentSlug: string
  tournamentName: string
  leagueId: string
  leagueName: string
  seasonId: string
  captain: RosterUser
  teamName: string
  teamTag: string
  teamSeasonId: string
}

/**
 * League (open) + season in `registration` + a one-person team whose owner is
 * its captain + a league/season-scoped TEAM tournament left in `registration`.
 *
 * The tournament body mirrors the proven one in
 * `fixtures/team-tournament-extra.fixture.ts:206-224` (participant_type=team,
 * team_size, league_id/season_id, open registration). It is built here rather
 * than in a fixture because the fixtures directory is owned by another
 * workstream — see the report for the extraction suggestion.
 */
async function createTeamRegistrationScenario(
  adminToken: string,
): Promise<TeamRegistrationScenario> {
  const ls = await createLeagueSeasonScenario(adminToken)
  const roster = await createTeamWithMembers({
    leagueId: ls.leagueId,
    seasonId: ls.seasonId,
    memberCount: 0,
    teamNamePrefix: 'E2E Reg Team',
  })

  const suffix = uniqueId()
  const tournamentName = `E2E Team Registration ${suffix}`
  const tournamentSlug = `e2e-team-registration-${suffix}`

  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: tournamentName,
      slug: tournamentSlug,
      game_id: ls.gameId,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'team',
      team_size: TEAM_SIZE,
      min_participants: 2,
      max_participants: 8,
      registration_type: 'open',
      scheduling_mode: 'live',
      default_match_format: 'bo1',
      league_id: ls.leagueId,
      season_id: ls.seasonId,
      description: 'Team registration coverage for E2E',
    }),
  })
  const created = await jsonOrThrow<ApiResult<{ id: string; slug: string }>>(
    createResp,
    'Create team tournament',
  )

  for (const action of ['publish', 'open-registration']) {
    const resp = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!resp.ok) {
      throw new Error(`Tournament ${action} failed (${resp.status}): ${await resp.text()}`)
    }
  }

  return {
    tournamentId: created.data.id,
    tournamentSlug: created.data.slug,
    tournamentName,
    leagueId: ls.leagueId,
    leagueName: ls.leagueName,
    seasonId: ls.seasonId,
    captain: roster.owner,
    teamName: roster.teamName,
    teamTag: roster.teamTag,
    teamSeasonId: roster.teamSeasonId,
  }
}

/** Register a team season into a tournament as its captain (API seeding only —
 *  the UI path is what the tests below drive).
 *  `POST /v1/tournaments/{id}/registrations/team` — RegisterTeamRequest. */
async function registerTeamViaApi(
  captainToken: string,
  tournamentId: string,
  teamSeasonId: string,
  participantName: string,
): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/registrations/team`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${captainToken}`,
    },
    body: JSON.stringify({ team_season_id: teamSeasonId, participant_name: participantName }),
  })
  const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Register team')
  return body.data.id
}

/**
 * The `TournamentRegistrationCard` root, located by copy only it renders
 * (title computed — TournamentRegistrationCard.vue:197-205). Scoping to this
 * card keeps chip/button assertions away from the header and the tabs card.
 */
function registrationCard(page: Page) {
  return page
    .locator('.v-card')
    .filter({
      hasText:
        /Join This Tournament|Registration Pending|You're Registered|Check-in Now Open|You're All Set!|Registration Opens Soon|Registration Closed/,
    })
    .first()
}

test.describe('Team Tournament Registration', () => {
  test('should show the team registration call-to-action to an eligible captain', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)
    await loginAsUser(page, scenario.captain)

    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })

    // The tournament renders as TEAM-based, not solo: the header chip uses
    // formatParticipantType(participant_type, team_size)
    // (TournamentHeader.vue:59, stores/tournaments.ts:199-205). It also
    // appears in the Overview details list, hence `.first()`.
    await expect(page.getByText(`Teams (${TEAM_SIZE} players)`).first()).toBeVisible()

    // Registration is open, and the card offers the TEAM call-to-action
    // ("Register Team", not "Register Now" — TournamentRegistrationCard.vue:23)
    // with the team-specific subtitle (`:213`).
    const card = registrationCard(page)
    await expect(card.getByText('Join This Tournament')).toBeVisible()
    await expect(card.getByText('Register your team to compete')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Team' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Now' })).toHaveCount(0)

    // Nothing has been registered by merely looking at the page.
    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })

  test("should list the captain's eligible team in the team registration modal", async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)
    await loginAsUser(page, scenario.captain)

    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })
    await registrationCard(page).getByRole('button', { name: 'Register Team' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    // Title, not the submit button — both read "Register Team"
    // (TeamRegistrationModal.vue:6 and :98).
    await expect(modal.locator('.v-card-title')).toContainText('Register Team')

    // The modal MUST name the tournament it is registering for
    // (TeamRegistrationModal.vue:40-42)...
    await expect(modal.getByText(scenario.tournamentName)).toBeVisible()

    // ...and list the captain's team with its tag, league and role
    // (`:44-71`). The "No Eligible Teams" alert (`:19-36`) MUST NOT show.
    await expect(modal.getByText('No Eligible Teams')).toHaveCount(0)
    await expect(modal.getByText(scenario.teamName)).toBeVisible()
    await expect(modal.getByText(`[${scenario.teamTag}]`)).toBeVisible()
    await expect(modal.getByText(scenario.leagueName)).toBeVisible()
    await expect(modal.locator('.v-chip').filter({ hasText: 'captain' })).toBeVisible()

    // Submission is blocked until a team is picked (`canRegister`, `:181-183`).
    await expect(modal.getByRole('button', { name: 'Register Team' })).toBeDisabled()

    // Opening the modal MUST NOT have registered anything.
    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })

  test('should register a team through the registration modal', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)
    await loginAsUser(page, scenario.captain)

    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })
    await registrationCard(page).getByRole('button', { name: 'Register Team' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // Pick the team. Each option is an outlined v-card whose @click runs
    // selectTeam() (TeamRegistrationModal.vue:46-52, 186-189), which also
    // seeds the display name with the team name.
    await modal
      .locator('.v-card--variant-outlined')
      .filter({ hasText: scenario.teamName })
      .first()
      .click()

    const displayName = modal.getByLabel('Display Name')
    await expect(displayName).toHaveValue(scenario.teamName)

    // Override the bracket name to prove the field is actually submitted.
    const participantName = `${scenario.teamTag} Squad ${uniqueId()}`
    await displayName.fill(participantName)

    const submit = modal.getByRole('button', { name: 'Register Team' })
    await expect(submit).toBeEnabled()

    // Arm the snackbar before clicking — success toasts auto-dismiss after 3s
    // (AppSnackbar.vue:25). Copy from TournamentDetailPage.vue:534.
    const snackbarPromise = expect(
      page.locator('.v-snackbar').getByText('Team registered successfully!'),
    ).toBeVisible({ timeout: 15_000 })
    await submit.click()
    await snackbarPromise

    await expect(modal).not.toBeVisible({ timeout: 10_000 })

    // UI: the card flips to the pending state. Registrations always land in
    // `pending` (DB default; see COVERAGE-PLAN.md §9b P-2), so the card shows
    // the Awaiting Approval chip (TournamentRegistrationCard.vue:28-45).
    const card = registrationCard(page)
    await expect(card.getByText('Registration Pending')).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('.v-chip').filter({ hasText: 'Awaiting Approval' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Team' })).toHaveCount(0)

    // UI: and the team shows up in the Participants tab under the name we
    // typed, with the mapped status label (TournamentDetailPage.vue:185-189).
    await page.getByRole('tab', { name: /Participants/ }).click()
    const participantRow = page.locator('tr').filter({ hasText: participantName })
    await expect(participantRow).toBeVisible()
    await expect(participantRow.locator('.v-chip').filter({ hasText: 'Pending' })).toBeVisible()

    // Backend: exactly one registration, bound to THIS team season.
    const regs = await listRegistrations(adminToken, scenario.tournamentId)
    expect(regs).toHaveLength(1)
    expect(regs[0]?.team_season_id).toBe(scenario.teamSeasonId)
    expect(regs[0]?.participant_name).toBe(participantName)
    expect(regs[0]?.status).toBe('pending')
  })

  test('should show "No Eligible Teams" to a user who captains no team', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)

    // A brand-new player: registered, authenticated, but on no roster at all.
    const outsider = await registerAsRosterUser()
    await loginAsUser(page, outsider)

    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })

    // `hasEligibleTeams === false` suppresses the CTA and swaps in the
    // explanatory chip (TournamentRegistrationCard.vue:91-96, driven by
    // useTournamentContext.ts:46-60).
    const card = registrationCard(page)
    await expect(card.locator('.v-chip').filter({ hasText: 'No Eligible Teams' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Team' })).toHaveCount(0)

    expect(await listRegistrations(adminToken, scenario.tournamentId)).toHaveLength(0)
  })

  test('should show the registered state and withdraw option once the team is approved', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)

    // Seed an APPROVED team registration (the register + approve UI paths have
    // their own tests above / in tournament-seeding.spec.ts:44).
    const registrationId = await registerTeamViaApi(
      scenario.captain.token,
      scenario.tournamentId,
      scenario.teamSeasonId,
      scenario.teamName,
    )
    await approveRegistration(adminToken, scenario.tournamentId, registrationId)

    await loginAsUser(page, scenario.captain)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })

    // Approved + tournament still in `registration` ⇒ the "You're Registered"
    // branch with the Withdraw affordance (TournamentRegistrationCard.vue:70-88;
    // `canWithdraw` at `:163-167`). Check-in is not open, so no Check In button.
    const card = registrationCard(page)
    await expect(card.getByText("You're Registered")).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('.v-chip').filter({ hasText: 'Registered' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Withdraw' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Register Team' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Check In' })).toHaveCount(0)

    // Backend agrees.
    const regs = await listRegistrations(adminToken, scenario.tournamentId)
    expect(regs.find((r) => r.id === registrationId)?.status).toBe('approved')
  })

  test('should link back to the tournament league from the breadcrumb', async ({ page }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)

    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })

    // A league-scoped tournament gets a League crumb ahead of Tournaments
    // (TournamentDetailPage.vue:391-403). Clicking it MUST reach that league.
    const breadcrumbs = page.locator('.v-breadcrumbs')
    await expect(breadcrumbs.getByText('Tournaments')).toBeVisible()
    await expect(breadcrumbs.getByText(scenario.tournamentName)).toBeVisible()

    await breadcrumbs.getByText('League', { exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/leagues/${scenario.leagueId}`))
    // LeagueDetailPage renders the name in a v-card-title, not a heading
    // element (LeagueDetailPage.vue:31), so match on text.
    await expect(page.getByText(scenario.leagueName).first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Team Tournament Organizer', () => {
  test('should let an organizer approve a pending team registration from the participants tab', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const adminToken = await getAdminToken()
    const scenario = await createTeamRegistrationScenario(adminToken)
    const participantName = `${scenario.teamTag} Squad ${uniqueId()}`
    const registrationId = await registerTeamViaApi(
      scenario.captain.token,
      scenario.tournamentId,
      scenario.teamSeasonId,
      participantName,
    )

    // Admin is an organizer of every tournament (useTournamentContext.ts:64-69).
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: scenario.tournamentName })).toBeVisible({
      timeout: 15_000,
    })

    // The organizer toolbar renders with the pending-approval nudge
    // (OrganizerToolbar.vue:2-6, 55-58).
    const toolbar = page.locator('.v-card').filter({ hasText: 'Tournament Management' }).first()
    await expect(toolbar.getByText('Organizer')).toBeVisible()
    await expect(toolbar.getByText('1 pending approvals')).toBeVisible()

    // Approve through the participants table's organizer-only Actions column
    // (TournamentDetailPage.vue:202-223 → handleApproveRegistration `:594`).
    await page.getByRole('tab', { name: /Participants/ }).click()
    const row = page.locator('tr').filter({ hasText: participantName })
    await expect(row).toBeVisible()
    await expect(row.locator('.v-chip').filter({ hasText: 'Pending' })).toBeVisible()

    const snackbarPromise = expect(
      page.locator('.v-snackbar').getByText(`${participantName} approved`),
    ).toBeVisible({ timeout: 15_000 })
    await row.getByRole('button', { name: 'Approve' }).click()
    await snackbarPromise

    // UI: the row flips to Approved and loses its pending actions; the
    // toolbar's pending counter disappears.
    await expect(row.locator('.v-chip').filter({ hasText: 'Approved' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0)
    await expect(toolbar.getByText('1 pending approvals')).toHaveCount(0)

    // Backend agrees.
    const regs = await listRegistrations(adminToken, scenario.tournamentId)
    expect(regs.find((r) => r.id === registrationId)?.status).toBe('approved')
  })
})

import { test, expect } from '@playwright/test'
import { getAdminToken, loginAsAdmin } from './fixtures/auth.fixture'
import {
  createTeamSwissScenario,
  completeTeamMatchP1Wins,
  getTeamTournamentApi,
  listRegistrations,
  type TeamSwissScenario,
} from './fixtures/team-tournament-extra.fixture'
import {
  getBrackets,
  getMatches,
  getStandings,
  generateNextRound,
} from './fixtures/tournament-formats.fixture'

/**
 * End-to-end coverage for a TEAM-BASED tournament — a 5v5 Swiss with 4 teams.
 *
 * Every other e2e tournament is individual/1v1; this is the flagship team case.
 * It exercises the full team-registration chain (league → season → 4 teams of
 * 5, each registered into the season → team-scoped Swiss tournament → register
 * + approve each team_season → start) and then asserts, end to end:
 *
 *   1. API — the tournament is team/5v5/Swiss; 4 team registrations exist and
 *      are approved; after start a `swiss` bracket exists with 2 fully-assigned
 *      round-1 matches.
 *   2. UI  — `/tournaments/{slug}` renders as team-based (format "Swiss",
 *      "Teams (5 players)"), team participant names show in the Participants
 *      tab, and the Bracket tab renders the Swiss Standings table.
 *   3. Progression — completing both round-1 matches via the result-claim saga
 *      lets Swiss `generate-next-round` produce round-2 pairings, and standings
 *      reflect the round-1 results.
 *
 * Expected Swiss shape (4 teams) is derived from the backend generator
 * (`start_swiss` in crates/portal-domain/src/services/tournament/service.rs)
 * and mirrors `crates/portal-api/tests/integration/tournaments/brackets.rs`:
 * R1 = floor(n/2) matches, one `swiss` bracket, positions prefixed `SW1M`.
 */

const TEAM_COUNT = 4
const TEAM_SIZE = 5
const EXPECTED_R1_MATCHES = Math.floor(TEAM_COUNT / 2) // 2

test.describe('5v5 Swiss team tournament', () => {
  test('creates a team Swiss bracket, renders team-based UI, and progresses to round 2', async ({
    page,
  }) => {
    // Seeding 4 teams of 5 (20 users + invites) plus playing out the result
    // sagas is a lot of sequential HTTP; give it room beyond the 30s default.
    test.setTimeout(300_000)

    const adminToken = await getAdminToken()
    const scenario: TeamSwissScenario = await createTeamSwissScenario(adminToken, {
      teamCount: TEAM_COUNT,
      teamSize: TEAM_SIZE,
    })

    // =====================================================================
    // 1. API — team/5v5/Swiss, 4 approved registrations, 2 assigned R1 matches
    // =====================================================================
    const tournament = await getTeamTournamentApi(scenario.tournamentId)
    expect(tournament.participant_type).toBe('team')
    expect(tournament.team_size).toBe(TEAM_SIZE)
    expect(tournament.format).toBe('swiss')
    expect(tournament.status).toBe('in_progress')

    const registrations = await listRegistrations(adminToken, scenario.tournamentId)
    expect(registrations).toHaveLength(TEAM_COUNT)
    // Every registration is a team (has a team_season_id) and is approved.
    for (const reg of registrations) {
      expect(reg.status).toBe('approved')
      expect(reg.team_season_id).toBeTruthy()
    }

    const brackets = await getBrackets(adminToken, scenario.tournamentId)
    expect(brackets).toHaveLength(1)
    expect(brackets[0].bracket_type).toBe('swiss')

    const matches = await getMatches(adminToken, scenario.tournamentId)
    const round1 = matches.filter((m) => m.round === 1)
    expect(round1).toHaveLength(EXPECTED_R1_MATCHES)
    // Swiss only generates round 1 at start.
    expect(matches).toHaveLength(EXPECTED_R1_MATCHES)

    // Every R1 match is a fully-assigned team pairing.
    const registeredIds = new Set(scenario.teams.map((t) => t.registrationId))
    for (const m of round1) {
      expect(m.round).toBe(1)
      expect(m.bracket_position.startsWith('SW1M')).toBe(true)
      expect(m.participant1_registration_id).toBeTruthy()
      expect(m.participant2_registration_id).toBeTruthy()
      expect(m.participant1_name).toBeTruthy()
      expect(m.participant2_name).toBeTruthy()
      // Participants are our registered teams, not stray individual regs.
      expect(registeredIds.has(m.participant1_registration_id!)).toBe(true)
      expect(registeredIds.has(m.participant2_registration_id!)).toBe(true)
    }

    // =====================================================================
    // 2. UI — team-based rendering on the public detail page
    // =====================================================================
    // Tournament pages are members-only now.
    await loginAsAdmin(page)
    // Tournament pages are members-only now.
    await loginAsAdmin(page)
    await page.goto(`/tournaments/${scenario.tournamentSlug}`)
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()

    // Overview: format is Swiss, participant type surfaces the 5v5 team size.
    await expect(page.getByText('Swiss').first()).toBeVisible()
    await expect(page.getByText(`Teams (${TEAM_SIZE} players)`)).toBeVisible()

    // The Teams tab lists the registered TEAMS by their participant names.
    await page.getByRole('tab', { name: /^Teams/i }).click()
    for (const team of scenario.teams) {
      await expect(page.getByText(team.participantName).first()).toBeVisible()
    }

    // Bracket tab: a bracket exists (no empty state) and Swiss renders a
    // Standings table rather than an elimination grid.
    await page.getByRole('tab', { name: 'Bracket' }).click()
    await expect(page.getByRole('heading', { name: 'No Bracket Available' })).not.toBeVisible()
    await expect(page.getByText('Standings').first()).toBeVisible({ timeout: 10_000 })

    // =====================================================================
    // 3. Progression — complete round 1, generate round 2, check standings
    // =====================================================================
    for (const m of round1) {
      await completeTeamMatchP1Wins(adminToken, scenario.tournamentId, m, scenario.teams)
    }

    // Standings after round 1: at least one team has earned points (a win = 3).
    const standingsAfterR1 = await getStandings(adminToken, scenario.tournamentId, brackets[0].id)
    expect(standingsAfterR1).toHaveLength(TEAM_COUNT)
    expect(standingsAfterR1.some((s) => s.points > 0)).toBe(true)
    expect(standingsAfterR1.some((s) => s.matches_won >= 1)).toBe(true)

    // Swiss next-round generation pairs the round-1 results into round 2.
    const newMatches = await generateNextRound(adminToken, scenario.tournamentId)
    expect(newMatches.length).toBeGreaterThan(0)
    for (const m of newMatches) {
      expect(m.round).toBe(2)
    }

    const afterMatches = await getMatches(adminToken, scenario.tournamentId)
    const round2 = afterMatches.filter((m) => m.round === 2)
    expect(round2.length).toBeGreaterThan(0)
    // Round-2 pairings are drawn from the same registered teams.
    for (const m of round2) {
      if (m.participant1_registration_id) {
        expect(registeredIds.has(m.participant1_registration_id)).toBe(true)
      }
      if (m.participant2_registration_id) {
        expect(registeredIds.has(m.participant2_registration_id)).toBe(true)
      }
    }
  })
})

/**
 * Spec-specific builders for `team-management.spec.ts`.
 *
 * The "Team Invitation Lifecycle E2E" describe block needs a self-contained
 * starting point: a fresh league + season, a team with a captain (owner), and
 * a second player who has joined the league and is therefore eligible to be
 * invited. This mirrors the state that used to be produced by global-setup's
 * seeded singletons (admin captain + fixed player2 + seeded team), but built
 * per-run through the API so the spec no longer depends on `getSeededState()`.
 */

import { createLeagueSeasonScenario } from './league-season-extra.fixture'
import {
  createTeamWithMembers,
  registerAsRosterUser,
  joinLeague,
  type RosterUser,
  type TeamRosterScenario,
} from './team-roster.fixture'

export interface InvitationScenario {
  leagueId: string
  seasonId: string
  /** Team + owner (the captain who sends invitations). */
  team: TeamRosterScenario
  /** A second player who has joined the league and can be invited. */
  player2: RosterUser
}

/**
 * Build the state the invitation-lifecycle tests drive against:
 *   - a fresh open league + registration-phase season
 *   - a team whose owner is the acting captain
 *   - a second player registered + joined to the league (invite-eligible,
 *     but NOT yet on the team, so the invite/accept flow can be exercised)
 */
export async function createInvitationScenario(adminToken: string): Promise<InvitationScenario> {
  const scenario = await createLeagueSeasonScenario(adminToken)
  const team = await createTeamWithMembers({
    leagueId: scenario.leagueId,
    seasonId: scenario.seasonId,
    memberCount: 0,
    teamNamePrefix: 'Invite Lifecycle Team',
  })

  const player2 = await registerAsRosterUser()
  await joinLeague(player2.token, scenario.leagueId)

  return {
    leagueId: scenario.leagueId,
    seasonId: scenario.seasonId,
    team,
    player2,
  }
}

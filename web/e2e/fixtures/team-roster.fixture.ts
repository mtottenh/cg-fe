/**
 * Team roster fixtures for E2E tests.
 *
 * Provides API helpers for seeding a team with multiple members so roster
 * mutations (promote / demote / remove / transfer ownership) can be exercised
 * from a known good starting state without clicking through registration and
 * invite acceptance in the UI.
 *
 * Endpoint shapes verified against
 * `/api/crates/portal-api/src/routes/league_teams.rs` and the corresponding
 * handlers in `handlers/league_teams/`:
 *
 *   POST   /v1/leagues/{league_id}/join                                  (bearer; user join)
 *   POST   /v1/league-seasons/{season_id}/teams                          (bearer owner; create team)
 *   POST   /v1/league-seasons/{season_id}/teams/{team_season_id}/invitations
 *              body: { player_id, role }                                 (bearer captain)
 *   POST   /v1/league-team-invitations/{invitation_id}/accept            (bearer invitee)
 *   GET    /v1/league-team-seasons/{team_season_id}/members              (public)
 *   POST   /v1/league-team-seasons/{team_season_id}/members/{player_id}/promote
 *   POST   /v1/league-team-seasons/{team_season_id}/members/{player_id}/demote
 *   DELETE /v1/league-team-seasons/{team_season_id}/members/{player_id}
 *   POST   /v1/league-teams/{team_id}/transfer-ownership
 *              body: { new_owner_player_id }                             (bearer owner)
 */

import { createTestUser } from './checkin.fixture'
import { invitePlayer, acceptInvitation } from './team-member.fixture'
import { uniqueId } from './test-data'
import type { LeagueTeamMemberStatus } from './api-status'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface RosterUser {
  /** User ID (auth) */
  userId: string
  /** Player ID — this is what league-team APIs expect in paths/bodies */
  playerId: string
  username: string
  /** Display name as shown in the team roster UI ("CheckIn Tester <suffix>"). */
  displayName: string
  email: string
  password: string
  token: string
}

export interface TeamRosterScenario {
  teamId: string
  teamSeasonId: string
  teamName: string
  teamTag: string
  owner: RosterUser
  /** Additional members that have accepted their invitation. */
  members: RosterUser[]
}

export interface TeamMemberRow {
  id: string
  team_season_id: string
  player_id: string
  role: string
  status: LeagueTeamMemberStatus
  display_name: string
  joined_at: string
}

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(`${context}: failed to parse JSON (${String(err)}): ${text}`)
  }
}

/**
 * Promote `createTestUser()` output — which identifies users by `user_id` —
 * into a RosterUser with the corresponding `player_id` resolved via
 * `GET /v1/players/me`. Almost every league-team endpoint is player-scoped,
 * so tests need this id.
 */
export async function registerAsRosterUser(): Promise<RosterUser> {
  const base = await createTestUser()
  const meResp = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${base.token}` },
  })
  const me = await jsonOrThrow<ApiResult<{ id: string; user_id?: string }>>(meResp, 'Fetch /players/me')
  // createTestUser() sets username=ci_${suffix} and display_name=CheckIn Tester ${suffix}
  const displayName = `CheckIn Tester ${base.username.replace(/^ci_/, '')}`
  return {
    userId: base.userId,
    playerId: me.data.id,
    username: base.username,
    displayName,
    email: base.email,
    password: base.password,
    token: base.token,
  }
}

/**
 * Join an open league. Silently accepts 409 (already a member) so the helper
 * is safe to call repeatedly.
 */
export async function joinLeague(token: string, leagueId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/leagues/${leagueId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text()
    throw new Error(`Join league failed (${resp.status}): ${text}`)
  }
}

/**
 * Create a fresh team in the given season. The caller (`ownerToken`) becomes
 * the team owner + captain.
 */
async function createTeam(
  ownerToken: string,
  seasonId: string,
  teamData: { name: string; tag: string; description?: string },
): Promise<{ teamId: string; teamSeasonId: string }> {
  const resp = await fetch(`${API_URL}/v1/league-seasons/${seasonId}/teams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify(teamData),
  })
  const body = await jsonOrThrow<
    ApiResult<{ team: { id: string }; team_season: { id: string } }>
  >(resp, 'Create league team')
  return { teamId: body.data.team.id, teamSeasonId: body.data.team_season.id }
}

export interface CreateTeamWithMembersOptions {
  /** League whose open membership + season will host the team. */
  leagueId: string
  seasonId: string
  /** How many additional members to invite + accept onto the roster. */
  memberCount: number
  /** Override the owner — useful if the test already has a user. */
  owner?: RosterUser
  /** Optional team-name override (unique suffix is appended). */
  teamNamePrefix?: string
}

/**
 * Seed a brand-new team with a fresh owner and `memberCount` additional
 * members. Each participant joins the league first (required so captains
 * can invite them and invitees can accept).
 */
export async function createTeamWithMembers(
  opts: CreateTeamWithMembersOptions,
): Promise<TeamRosterScenario> {
  const owner = opts.owner ?? (await registerAsRosterUser())
  await joinLeague(owner.token, opts.leagueId)

  const suffix = uniqueId()
  const prefix = opts.teamNamePrefix ?? 'Roster Test Team'
  const teamName = `${prefix} ${suffix}`
  const teamTag = suffix.substring(0, 4).toUpperCase()

  const { teamId, teamSeasonId } = await createTeam(owner.token, opts.seasonId, {
    name: teamName,
    tag: teamTag,
    description: `E2E roster test team ${suffix}`,
  })

  const members: RosterUser[] = []
  for (let i = 0; i < opts.memberCount; i++) {
    const member = await registerAsRosterUser()
    await joinLeague(member.token, opts.leagueId)

    const invitation = await invitePlayer(owner.token, opts.seasonId, teamSeasonId, member.playerId)
    if (!invitation) {
      throw new Error(`Failed to invite player ${member.username} to team ${teamName}`)
    }
    const accepted = await acceptInvitation(member.token, invitation.id)
    if (!accepted) {
      throw new Error(`Failed to accept invitation for ${member.username}`)
    }
    members.push(member)
  }

  return { teamId, teamSeasonId, teamName, teamTag, owner, members }
}

/** Fetch the current roster for a team season. */
export async function getTeamMembers(
  teamSeasonId: string,
  token?: string,
): Promise<TeamMemberRow[]> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(`${API_URL}/v1/league-team-seasons/${teamSeasonId}/members`, { headers })
  const body = await jsonOrThrow<ApiResult<TeamMemberRow[]>>(resp, 'List team members')
  return body.data ?? []
}

/** Promote a member to captain via API (used when a test needs to arrange a co-captain). */
export async function promoteToCaptainApi(
  captainToken: string,
  teamSeasonId: string,
  playerId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/league-team-seasons/${teamSeasonId}/members/${playerId}/promote`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${captainToken}` },
    },
  )
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Promote to captain failed (${resp.status}): ${text}`)
  }
}

/** Demote a captain back to a regular member via API. */
export async function demoteFromCaptainApi(
  captainToken: string,
  teamSeasonId: string,
  playerId: string,
): Promise<void> {
  const resp = await fetch(
    `${API_URL}/v1/league-team-seasons/${teamSeasonId}/members/${playerId}/demote`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${captainToken}` },
    },
  )
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Demote from captain failed (${resp.status}): ${text}`)
  }
}

/** Fetch the persistent team record so callers can assert `owner_player_id`. */
export async function getTeam(
  teamId: string,
): Promise<{ id: string; owner_player_id: string; name: string; tag: string }> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}`)
  const body = await jsonOrThrow<
    ApiResult<{ id: string; owner_player_id: string; name: string; tag: string }>
  >(resp, 'Get league team')
  return body.data
}

/**
 * Transfer ownership of a team to another player. Frontend has no UI for this
 * yet (no button in TeamEditPage or store action), so tests exercise it via
 * API and then assert the UI reflects the new owner.
 */
export async function transferTeamOwnership(
  ownerToken: string,
  teamId: string,
  newOwnerPlayerId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/league-teams/${teamId}/transfer-ownership`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ new_owner_player_id: newOwnerPlayerId }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Transfer ownership failed (${resp.status}): ${text}`)
  }
}

/** Login a user via the UI login page, given their email + password. */
export async function loginAsUser(
  page: import('@playwright/test').Page,
  user: { email: string; password: string },
): Promise<void> {
  // Clear auth state first so we can cleanly log in as the target user.
  const currentUrl = page.url()
  if (currentUrl === 'about:blank' || !currentUrl.includes('localhost')) {
    await page.goto('/')
  }
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('player_id')
  })
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(user.email)
  await page.locator('input[type="password"]').first().fill(user.password)
  await page.getByRole('button', { name: 'Login' }).click()
  // Wait for navigation away from /login
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 10000 })
}

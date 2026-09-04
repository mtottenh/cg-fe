import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/api'
import {
  useLeagueTeamsStore,
  type LeagueTeamResponse,
  type LeagueTeamSummaryResponse,
  type LeagueTeamSeasonResponse,
  type LeagueTeamInvitationResponse,
  type LeagueTeamMemberWithPlayer,
  type PlayerLeagueTeamMembershipResponse,
} from '@/stores/leagueTeams'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeTeam(overrides: Partial<LeagueTeamResponse> = {}): LeagueTeamResponse {
  return {
    id: 'team-1',
    league_id: 'league-1',
    name: 'The Sharks',
    tag: 'SHRK',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueTeamResponse
}

function makeTeamSeason(
  overrides: Partial<LeagueTeamSeasonResponse> = {},
): LeagueTeamSeasonResponse {
  return {
    id: 'ts-1',
    team_id: 'team-1',
    season_id: 'season-1',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueTeamSeasonResponse
}

function makeMember(
  overrides: Partial<LeagueTeamMemberWithPlayer> = {},
): LeagueTeamMemberWithPlayer {
  return {
    id: 'member-1',
    team_season_id: 'ts-1',
    player_id: 'player-1',
    display_name: 'Player One',
    role: 'player',
    status: 'active',
    joined_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueTeamMemberWithPlayer
}

function makeInvitation(
  overrides: Partial<LeagueTeamInvitationResponse> = {},
): LeagueTeamInvitationResponse {
  return {
    id: 'inv-1',
    team_season_id: 'ts-1',
    player_id: 'player-2',
    player_display_name: 'Player Two',
    invitation_type: 'invite',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueTeamInvitationResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('League Teams Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchTeamsInSeason', () => {
    it('passes season path + pagination query and stores teams + pagination', async () => {
      const teams = [
        {
          team_id: 'team-1',
          team_name: 'The Sharks',
          team_status: 'active',
          league_id: 'league-1',
          owner_player_id: 'player-1',
          active_member_count: 5,
          captain_count: 1,
          player_count: 5,
          substitute_count: 0,
        } as LeagueTeamSummaryResponse,
      ]
      const pagination = { page: 2, per_page: 10, total_items: 15, total_pages: 2 }
      mockGet.mockResolvedValue({ data: { data: teams, pagination } })
      const store = useLeagueTeamsStore()

      const result = await store.fetchTeamsInSeason('season-1', 2, 10)

      expect(mockGet).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/teams', {
        params: {
          path: { season_id: 'season-1' },
          // Archived teams are opt-in, and this listing doubles as the
          // player-facing roster — see stores/__tests__/archiving.test.ts.
          query: { page: 2, per_page: 10, include_archived: false },
        },
      })
      expect(result).toEqual(teams)
      expect(store.teams).toEqual(teams)
      expect(store.pagination).toEqual(pagination)
    })
  })

  describe('fetchTeam', () => {
    it('fetches by id and sets currentTeam', async () => {
      const team = makeTeam()
      mockGet.mockResolvedValue({ data: { data: team } })
      const store = useLeagueTeamsStore()

      const result = await store.fetchTeam('team-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/league-teams/{team_id}', {
        params: { path: { team_id: 'team-1' } },
      })
      expect(result).toEqual(team)
      expect(store.currentTeam).toEqual(team)
    })

    it('records the error detail and rethrows on failure', async () => {
      mockGet.mockResolvedValue(apiError(404, 'Team not found'))
      const store = useLeagueTeamsStore()

      await expect(store.fetchTeam('missing')).rejects.toThrow(ApiError)
      expect(store.fetchTeamState.error).toBe('Team not found')
      expect(store.fetchTeamState.loading).toBe(false)
      expect(store.currentTeam).toBeNull()
    })

    it('does not let a slow earlier fetch clobber a newer one (latest-wins guard)', async () => {
      const store = useLeagueTeamsStore()
      const slowA = deferred<{ data: { data: LeagueTeamResponse } }>()
      const teamA = makeTeam({ id: 'team-a' })
      const teamB = makeTeam({ id: 'team-b' })

      mockGet.mockReturnValueOnce(slowA.promise)
      const first = store.fetchTeam('team-a')

      mockGet.mockResolvedValueOnce({ data: { data: teamB } })
      await store.fetchTeam('team-b')
      expect(store.currentTeam).toEqual(teamB)

      // Stale response for A arrives late — B must survive.
      slowA.resolve({ data: { data: teamA } })
      await expect(first).resolves.toEqual(teamA)
      expect(store.currentTeam).toEqual(teamB)
    })
  })

  describe('createTeam', () => {
    it('POSTs to the season and stores both team and team-season from the response', async () => {
      const team = makeTeam()
      const teamSeason = makeTeamSeason()
      mockPost.mockResolvedValue({ data: { data: { team, team_season: teamSeason } } })
      const store = useLeagueTeamsStore()

      const request = { name: 'The Sharks', tag: 'SHRK' } as never
      const result = await store.createTeam('season-1', request)

      expect(mockPost).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/teams', {
        params: { path: { season_id: 'season-1' } },
        body: request,
      })
      expect(result).toEqual({ team, team_season: teamSeason })
      expect(store.currentTeam).toEqual(team)
      expect(store.currentTeamSeason).toEqual(teamSeason)
    })

    it('records the error on failure', async () => {
      mockPost.mockResolvedValue(apiError(403, 'Must be a league member to create a team'))
      const store = useLeagueTeamsStore()

      await expect(store.createTeam('season-1', { name: 'X' } as never)).rejects.toThrow(ApiError)
      expect(store.createTeamState.error).toBe('Must be a league member to create a team')
      expect(store.currentTeam).toBeNull()
    })
  })

  describe('fetchMembers', () => {
    it('stores the roster for the team season', async () => {
      const members = [makeMember(), makeMember({ id: 'member-2', player_id: 'player-2', role: 'captain' })]
      mockGet.mockResolvedValue({ data: { data: members } })
      const store = useLeagueTeamsStore()

      const result = await store.fetchMembers('ts-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/league-team-seasons/{team_season_id}/members', {
        params: { path: { team_season_id: 'ts-1' } },
      })
      expect(result).toEqual(members)
      expect(store.members).toEqual(members)
    })
  })

  describe('fetchTeamInvitations', () => {
    it('stores invitations and passes player_display_name through', async () => {
      const invitations = [makeInvitation({ player_display_name: 'Player Two' })]
      mockGet.mockResolvedValue({ data: { data: invitations } })
      const store = useLeagueTeamsStore()

      const result = await store.fetchTeamInvitations('ts-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/league-team-seasons/{team_season_id}/invitations', {
        params: { path: { team_season_id: 'ts-1' } },
      })
      expect(result).toEqual(invitations)
      expect(store.invitations).toHaveLength(1)
      expect(store.invitations[0]!.player_display_name).toBe('Player Two')
    })

    it('records the error detail on failure', async () => {
      mockGet.mockResolvedValue(apiError(403, 'Only captains can view invitations'))
      const store = useLeagueTeamsStore()

      await expect(store.fetchTeamInvitations('ts-1')).rejects.toThrow(ApiError)
      expect(store.fetchTeamInvitationsState.error).toBe('Only captains can view invitations')
      expect(store.invitations).toHaveLength(0)
    })
  })

  describe('fetchMyTeams', () => {
    it('stores my memberships', async () => {
      const myTeams = [
        {
          team_season_id: 'ts-1',
          team_id: 'team-1',
          team_name: 'The Sharks',
          role: 'captain',
        } as PlayerLeagueTeamMembershipResponse,
      ]
      mockGet.mockResolvedValue({ data: { data: myTeams } })
      const store = useLeagueTeamsStore()

      const result = await store.fetchMyTeams()

      expect(mockGet).toHaveBeenCalledWith('/v1/players/me/league-teams')
      expect(result).toEqual(myTeams)
      expect(store.myTeams).toEqual(myTeams)
      expect(store.loading).toBe(false)
    })

    it('surfaces the failure through the legacy error alias', async () => {
      mockGet.mockResolvedValue(apiError(500, 'Upstream timeout'))
      const store = useLeagueTeamsStore()

      await expect(store.fetchMyTeams()).rejects.toThrow(ApiError)
      expect(store.fetchMyTeamsState.error).toBe('Upstream timeout')
      // `error` is a computed alias over fetchMyTeamsState for older consumers.
      expect(store.error).toBe('Upstream timeout')
    })
  })
})

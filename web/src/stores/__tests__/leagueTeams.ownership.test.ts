import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * P-62 / P-63 / P-71 — the three "endpoint live, control absent" team actions.
 *
 * These lock the WIRE CONTRACT of the store actions the new UI calls: the exact
 * path, the exact body key, and what each one prunes from local state. All three
 * endpoints were already live and e2e-proven; what was missing was anything in
 * the product that called them, so the risk being guarded here is a control that
 * calls the wrong shape and reports success anyway (the C5 defect class).
 *
 * Kept in its own file rather than appended to `leagueTeams.test.ts` because
 * four agents share this checkout — see COVERAGE-PLAN §2's multi-agent git trap.
 */

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
  type LeagueTeamSeasonResponse,
  type LeagueTeamSummaryResponse,
  type PlayerLeagueTeamMembershipResponse,
} from '@/stores/leagueTeams'

const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

function makeTeam(overrides: Partial<LeagueTeamResponse> = {}): LeagueTeamResponse {
  return {
    id: 'team-1',
    league_id: 'league-1',
    name: 'The Sharks',
    tag: 'SHRK',
    owner_player_id: 'player-1',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueTeamResponse
}

describe('League Teams Store — ownership & season registration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('transferOwnership (P-62)', () => {
    it('POSTs the new owner to the transfer endpoint and adopts the returned team', async () => {
      const transferred = makeTeam({ owner_player_id: 'player-2' })
      mockPost.mockResolvedValue({ data: { data: transferred } })
      const store = useLeagueTeamsStore()
      store.currentTeam = makeTeam()

      const result = await store.transferOwnership('team-1', 'player-2')

      expect(mockPost).toHaveBeenCalledWith('/v1/league-teams/{team_id}/transfer-ownership', {
        params: { path: { team_id: 'team-1' } },
        body: { new_owner_player_id: 'player-2' },
      })
      expect(result.owner_player_id).toBe('player-2')
      // The page renders its owner-only controls off `currentTeam`, so a stale
      // owner here is how the old owner keeps seeing controls they can no
      // longer use.
      expect(store.currentTeam?.owner_player_id).toBe('player-2')
    })

    it('surfaces the backend refusal and leaves the old owner in place', async () => {
      mockPost.mockResolvedValue(apiError(403, 'only the team owner can transfer ownership'))
      const store = useLeagueTeamsStore()
      store.currentTeam = makeTeam()

      await expect(store.transferOwnership('team-1', 'player-2')).rejects.toThrow(ApiError)
      expect(store.transferOwnershipState.error).toBe('only the team owner can transfer ownership')
      expect(store.transferOwnershipState.loading).toBe(false)
      expect(store.currentTeam?.owner_player_id).toBe('player-1')
    })
  })

  describe('disbandTeam (P-63)', () => {
    it('DELETEs the team and drops it from every list that could still render it', async () => {
      mockDelete.mockResolvedValue({ data: undefined })
      const store = useLeagueTeamsStore()
      store.currentTeam = makeTeam()
      store.currentTeamSeason = { id: 'ts-1', team_id: 'team-1' } as LeagueTeamSeasonResponse
      store.teams = [
        { team_id: 'team-1', team_name: 'The Sharks' } as LeagueTeamSummaryResponse,
        { team_id: 'team-2', team_name: 'The Rays' } as LeagueTeamSummaryResponse,
      ]
      store.myTeams = [
        { team_id: 'team-1', team_season_id: 'ts-1' } as PlayerLeagueTeamMembershipResponse,
        { team_id: 'team-2', team_season_id: 'ts-2' } as PlayerLeagueTeamMembershipResponse,
      ]

      await store.disbandTeam('team-1')

      expect(mockDelete).toHaveBeenCalledWith('/v1/league-teams/{team_id}', {
        params: { path: { team_id: 'team-1' } },
      })
      expect(store.currentTeam).toBeNull()
      expect(store.currentTeamSeason).toBeNull()
      expect(store.teams.map(t => t.team_id)).toEqual(['team-2'])
      expect(store.myTeams.map(t => t.team_id)).toEqual(['team-2'])
    })

    it('keeps local state intact when the backend refuses', async () => {
      mockDelete.mockResolvedValue(apiError(403, 'Insufficient permissions'))
      const store = useLeagueTeamsStore()
      store.currentTeam = makeTeam()
      store.myTeams = [
        { team_id: 'team-1', team_season_id: 'ts-1' } as PlayerLeagueTeamMembershipResponse,
      ]

      await expect(store.disbandTeam('team-1')).rejects.toThrow(ApiError)
      expect(store.disbandTeamState.error).toBe('Insufficient permissions')
      // A control that empties the UI on a 403 tells the user it worked.
      expect(store.currentTeam).not.toBeNull()
      expect(store.myTeams).toHaveLength(1)
    })
  })

  describe('registerTeamForSeason (P-71)', () => {
    it('POSTs the team id to the season register endpoint and adopts the new team season', async () => {
      const teamSeason = {
        id: 'ts-2',
        team_id: 'team-1',
        season_id: 'season-2',
        status: 'registered',
      } as LeagueTeamSeasonResponse
      mockPost.mockResolvedValue({ data: { data: teamSeason } })
      const store = useLeagueTeamsStore()

      const result = await store.registerTeamForSeason('season-2', 'team-1')

      expect(mockPost).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/teams/register', {
        params: { path: { season_id: 'season-2' } },
        body: { team_id: 'team-1' },
      })
      expect(result.id).toBe('ts-2')
      expect(store.currentTeamSeason).toEqual(teamSeason)
    })

    it('records the conflict detail so the page can show why registration failed', async () => {
      mockPost.mockResolvedValue(apiError(409, 'team is already registered for this season'))
      const store = useLeagueTeamsStore()

      await expect(store.registerTeamForSeason('season-2', 'team-1')).rejects.toThrow(ApiError)
      expect(store.registerTeamForSeasonState.error).toBe(
        'team is already registered for this season',
      )
      expect(store.currentTeamSeason).toBeNull()
    })
  })
})

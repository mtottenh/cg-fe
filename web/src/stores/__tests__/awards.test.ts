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

import { api } from '@/api'
import {
  useAwardsStore,
  type AwardResponse,
  type LeaderboardEntryResponse,
} from '@/stores/awards'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockPatch = api.PATCH as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock

function makeAward(overrides: Partial<AwardResponse> = {}): AwardResponse {
  return {
    id: 'award-1',
    scope_type: 'tournament',
    scope_id: 'tourn-1',
    game_id: 'game-1',
    template_id: null,
    name: 'Swag 7',
    description: 'Most MAG-7 kills',
    icon: 'mdi-spray',
    color: '#8E24AA',
    stat_key: 'kills.weapon.mag7',
    aggregation: 'sum',
    direction: 'desc',
    subject_type: 'player',
    min_qualifier_type: null,
    min_qualifier_value: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AwardResponse
}

function makeEntry(overrides: Partial<LeaderboardEntryResponse> = {}): LeaderboardEntryResponse {
  return {
    player_id: 'player-1',
    display_name: 'Player One',
    avatar_url: null,
    rank: 1,
    value: 7,
    demos_counted: 2,
    ...overrides,
  } as LeaderboardEntryResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('Awards Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchTemplates / fetchStatCatalog', () => {
    it('fetches templates for a game', async () => {
      const templates = [{ id: 't1', key: 'swag7', name: 'Swag 7' }]
      mockGet.mockResolvedValue({ data: { data: templates } })
      const store = useAwardsStore()

      const result = await store.fetchTemplates('cs2')

      expect(mockGet).toHaveBeenCalledWith('/v1/games/{game_id}/award-templates', {
        params: { path: { game_id: 'cs2' } },
      })
      expect(result).toEqual(templates)
      expect(store.templates).toEqual(templates)
    })

    it('fetches the stat catalog', async () => {
      const catalog = [{ key: 'headshot_kills', label: 'Headshot Kills', category: 'Combat', value_type: 'count', description: '' }]
      mockGet.mockResolvedValue({ data: { data: catalog } })
      const store = useAwardsStore()

      await store.fetchStatCatalog('cs2')

      expect(mockGet).toHaveBeenCalledWith('/v1/games/{game_id}/stat-catalog', {
        params: { path: { game_id: 'cs2' } },
      })
      expect(store.statCatalog).toEqual(catalog)
    })
  })

  describe('fetchAwards', () => {
    it('hits the tournament path for tournament scope', async () => {
      const awards = [makeAward()]
      mockGet.mockResolvedValue({ data: { data: awards } })
      const store = useAwardsStore()

      await store.fetchAwards('tournament', 'tourn-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards', {
        params: { path: { tournament_id: 'tourn-1' } },
      })
      expect(store.awards).toEqual(awards)
    })

    it('hits the league-season path for league_season scope', async () => {
      mockGet.mockResolvedValue({ data: { data: [] } })
      const store = useAwardsStore()

      await store.fetchAwards('league_season', 'season-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/awards', {
        params: { path: { season_id: 'season-1' } },
      })
    })

    it('captures the RFC 7807 detail on failure', async () => {
      mockGet.mockResolvedValue(apiError(404, 'Tournament not found'))
      const store = useAwardsStore()

      await expect(store.fetchAwards('tournament', 'missing')).rejects.toThrow()
      expect(store.fetchAwardsState.error).toBe('Tournament not found')
      expect(store.fetchAwardsState.loading).toBe(false)
    })
  })

  describe('fetchStandings', () => {
    it('stores standings keyed by award id', async () => {
      const standings = { award: makeAward(), entries: [makeEntry()] }
      mockGet.mockResolvedValue({ data: { data: standings } })
      const store = useAwardsStore()

      const result = await store.fetchStandings('tournament', 'tourn-1', 'award-1', 50)

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards/{award_id}/standings', {
        params: { path: { tournament_id: 'tourn-1', award_id: 'award-1' }, query: { limit: 50 } },
      })
      expect(result).toEqual(standings)
      expect(store.standings['award-1']).toEqual(standings)
    })
  })

  describe('createAward', () => {
    it('creates from a template key and appends to the list', async () => {
      const award = makeAward({ template_id: 'tpl-1' })
      mockPost.mockResolvedValue({ data: { data: award } })
      const store = useAwardsStore()

      const result = await store.createAward('tournament', 'tourn-1', { template_key: 'swag7' })

      expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards', {
        params: { path: { tournament_id: 'tourn-1' } },
        body: { template_key: 'swag7' },
      })
      expect(result).toEqual(award)
      expect(store.awards).toContainEqual(award)
    })

    it('surfaces duplicate-name conflicts as the action error', async () => {
      mockPost.mockResolvedValue(apiError(409, 'An award named "Swag 7" already exists'))
      const store = useAwardsStore()

      await expect(
        store.createAward('tournament', 'tourn-1', { template_key: 'swag7' }),
      ).rejects.toThrow()
      expect(store.createAwardState.error).toBe('An award named "Swag 7" already exists')
      expect(store.awards).toHaveLength(0)
    })
  })

  describe('updateAward', () => {
    it('patches presentation fields and replaces in place', async () => {
      const store = useAwardsStore()
      store.awards = [makeAward()]
      const renamed = makeAward({ name: 'Shotgun Star' })
      mockPatch.mockResolvedValue({ data: { data: renamed } })

      await store.updateAward('tournament', 'tourn-1', 'award-1', { name: 'Shotgun Star' })

      expect(mockPatch).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards/{award_id}', {
        params: { path: { tournament_id: 'tourn-1', award_id: 'award-1' } },
        body: { name: 'Shotgun Star' },
      })
      expect(store.awards[0]!.name).toBe('Shotgun Star')
    })
  })

  describe('voidAward', () => {
    it('marks the award void in the list', async () => {
      const store = useAwardsStore()
      store.awards = [makeAward()]
      mockDelete.mockResolvedValue({ data: { data: makeAward({ status: 'void' }) } })

      await store.voidAward('tournament', 'tourn-1', 'award-1')

      expect(mockDelete).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards/{award_id}', {
        params: { path: { tournament_id: 'tourn-1', award_id: 'award-1' } },
      })
      expect(store.awards[0]!.status).toBe('void')
    })

    it('captures the conflict detail when voiding a finalized award', async () => {
      mockDelete.mockResolvedValue(apiError(409, 'Finalized awards cannot be voided'))
      const store = useAwardsStore()

      await expect(store.voidAward('tournament', 'tourn-1', 'award-1')).rejects.toThrow()
      expect(store.voidAwardState.error).toBe('Finalized awards cannot be voided')
    })
  })

  describe('finalizeAward', () => {
    it('returns the podium and flips the stored award to finalized', async () => {
      const store = useAwardsStore()
      store.awards = [makeAward()]
      const finalized = {
        award: makeAward({ status: 'finalized' }),
        results: [
          { id: 'r1', award_id: 'award-1', player_id: 'player-1', rank: 1, value: 7, demos_counted: 2, finalized_at: '2026-01-02T00:00:00Z' },
        ],
      }
      mockPost.mockResolvedValue({ data: { data: finalized } })

      const result = await store.finalizeAward('tournament', 'tourn-1', 'award-1')

      expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/awards/{award_id}/finalize', {
        params: { path: { tournament_id: 'tourn-1', award_id: 'award-1' } },
      })
      expect(result.results).toHaveLength(1)
      expect(store.awards[0]!.status).toBe('finalized')
    })

    it('uses the league-season path for season awards', async () => {
      const store = useAwardsStore()
      mockPost.mockResolvedValue({
        data: { data: { award: makeAward({ scope_type: 'league_season', scope_id: 'season-1' }), results: [] } },
      })

      await store.finalizeAward('league_season', 'season-1', 'award-1')

      expect(mockPost).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/awards/{award_id}/finalize', {
        params: { path: { season_id: 'season-1', award_id: 'award-1' } },
      })
    })
  })

  describe('fetchPlayerTrophies', () => {
    it('fetches the trophy case', async () => {
      const trophies = [
        { award: makeAward({ status: 'finalized' }), result: { id: 'r1', award_id: 'award-1', player_id: 'p1', rank: 1, value: 7, demos_counted: 2, finalized_at: '2026-01-02T00:00:00Z' }, scope_name: 'Winter Cup' },
      ]
      mockGet.mockResolvedValue({ data: { data: trophies } })
      const store = useAwardsStore()

      const result = await store.fetchPlayerTrophies('p1')

      expect(mockGet).toHaveBeenCalledWith('/v1/players/{player_id}/awards', {
        params: { path: { player_id: 'p1' } },
      })
      expect(result).toEqual(trophies)
      expect(store.trophies).toEqual(trophies)
    })
  })

  describe('fetchLeaderboard', () => {
    it('queries the plain tournament leaderboard with filters', async () => {
      const entries = [makeEntry()]
      mockGet.mockResolvedValue({ data: { data: entries } })
      const store = useAwardsStore()

      const result = await store.fetchLeaderboard('tournament', 'tourn-1', {
        stat_key: 'headshot_kills',
        aggregation: 'sum',
        direction: 'desc',
        min_matches: 1,
        limit: 10,
      })

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/leaderboards', {
        params: {
          path: { tournament_id: 'tourn-1' },
          query: { stat_key: 'headshot_kills', aggregation: 'sum', direction: 'desc', min_matches: 1, limit: 10 },
        },
      })
      expect(result).toEqual(entries)
    })
  })

  describe('fetchPlayerStatsLeaderboard', () => {
    it('hits the tournament stats path with mapped query params', async () => {
      const rows = [
        {
          player_id: 'p1',
          display_name: 'Player One',
          avatar_url: null,
          kills: 20,
          deaths: 5,
          assists: 2,
          total_damage: 1600,
          adr: 80,
          rounds_played: 20,
          demos_counted: 1,
        },
      ]
      mockGet.mockResolvedValue({ data: { data: rows } })
      const store = useAwardsStore()

      const result = await store.fetchPlayerStatsLeaderboard('tournament', 'tourn-1', {
        sort: 'kills',
        minRounds: 5,
        minDemos: 1,
        limit: 50,
      })

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/stats-leaderboard', {
        params: {
          path: { tournament_id: 'tourn-1' },
          query: { sort: 'kills', min_rounds: 5, min_demos: 1, limit: 50 },
        },
      })
      expect(result).toEqual(rows)
    })

    it('hits the league-season stats path for season scope', async () => {
      mockGet.mockResolvedValue({ data: { data: [] } })
      const store = useAwardsStore()

      await store.fetchPlayerStatsLeaderboard('season', 'season-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/league-seasons/{season_id}/stats-leaderboard', {
        params: {
          path: { season_id: 'season-1' },
          query: { sort: undefined, min_rounds: undefined, min_demos: undefined, limit: undefined },
        },
      })
    })

    it('captures the RFC 7807 detail on failure', async () => {
      mockGet.mockResolvedValue(apiError(404, 'Tournament not found'))
      const store = useAwardsStore()

      await expect(
        store.fetchPlayerStatsLeaderboard('tournament', 'missing'),
      ).rejects.toThrow()
      expect(store.fetchStatsLeaderboardState.error).toBe('Tournament not found')
      expect(store.fetchStatsLeaderboardState.loading).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets all state', async () => {
      const store = useAwardsStore()
      store.awards = [makeAward()]
      store.standings = { 'award-1': { award: makeAward(), entries: [] } }
      store.trophies = []

      store.clear()

      expect(store.awards).toHaveLength(0)
      expect(store.standings).toEqual({})
      expect(store.error).toBeNull()
    })
  })
})

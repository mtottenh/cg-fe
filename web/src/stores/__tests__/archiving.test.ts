import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useTournamentsStore } from '@/stores/tournaments'

/**
 * Archiving is one concept across four entities, and the thing that makes it
 * safe is that it is *reversible and exact*: the same store action drives both
 * directions, choosing the endpoint, and nothing else about the row is
 * rewritten on the way. These tests pin the endpoint each direction calls —
 * an archive action that quietly called the wrong path would look identical
 * in the UI until someone tried to restore.
 */

const mockPost = api.POST as unknown as Mock
const mockGet = api.GET as unknown as Mock

beforeEach(() => {
  setActivePinia(createPinia())
  mockPost.mockResolvedValue({ data: { data: { id: 'x', archived_at: '2026-09-04T00:00:00Z' } } })
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, per_page: 20, total_items: 0, total_pages: 0 } },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('archive and restore call opposite endpoints', () => {
  it('leagues', async () => {
    const store = useLeaguesStore()

    await store.setLeagueArchived('league-1', true)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/leagues/{league_id}/archive', {
      params: { path: { league_id: 'league-1' } },
    })

    await store.setLeagueArchived('league-1', false)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/leagues/{league_id}/restore', {
      params: { path: { league_id: 'league-1' } },
    })
  })

  it('seasons', async () => {
    const store = useLeagueSeasonsStore()

    await store.setSeasonArchived('season-1', true)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/league-seasons/{season_id}/archive', {
      params: { path: { season_id: 'season-1' } },
    })

    await store.setSeasonArchived('season-1', false)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/league-seasons/{season_id}/restore', {
      params: { path: { season_id: 'season-1' } },
    })
  })

  it('teams', async () => {
    const store = useLeagueTeamsStore()

    await store.setTeamArchived('team-1', true)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/league-teams/{team_id}/archive', {
      params: { path: { team_id: 'team-1' } },
    })

    await store.setTeamArchived('team-1', false)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/league-teams/{team_id}/restore', {
      params: { path: { team_id: 'team-1' } },
    })
  })

  it('tournaments', async () => {
    const store = useTournamentsStore()

    await store.setTournamentArchived('t-1', true)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/tournaments/{tournament_id}/archive', {
      params: { path: { tournament_id: 't-1' } },
    })

    await store.setTournamentArchived('t-1', false)
    expect(mockPost).toHaveBeenLastCalledWith('/v1/tournaments/{tournament_id}/restore', {
      params: { path: { tournament_id: 't-1' } },
    })
  })
})

describe('moving between leagues', () => {
  it('sends the team and its destination season', async () => {
    const store = useLeagueTeamsStore()

    await store.moveTeam('team-1', 'league-2', 'season-9')

    expect(mockPost).toHaveBeenLastCalledWith('/v1/league-teams/{team_id}/move', {
      params: { path: { team_id: 'team-1' } },
      body: { league_id: 'league-2', season_id: 'season-9' },
    })
  })

  it('sends nulls when a tournament is detached from every league', async () => {
    const store = useTournamentsStore()

    await store.moveTournament('t-1', null, null)

    expect(mockPost).toHaveBeenLastCalledWith('/v1/tournaments/{tournament_id}/move', {
      params: { path: { tournament_id: 't-1' } },
      body: { league_id: null, season_id: null },
    })
  })
})

describe('listings ask for archived rows only when told to', () => {
  it('seasons default to the player-facing listing', async () => {
    const store = useLeagueSeasonsStore()

    await store.fetchSeasons('league-1')
    expect(mockGet).toHaveBeenLastCalledWith('/v1/league-seasons', {
      params: { query: { league_id: 'league-1', include_archived: false } },
    })

    await store.fetchSeasons('league-1', true)
    expect(mockGet).toHaveBeenLastCalledWith('/v1/league-seasons', {
      params: { query: { league_id: 'league-1', include_archived: true } },
    })
  })

  it('season rosters default to the player-facing listing', async () => {
    const store = useLeagueTeamsStore()

    await store.fetchTeamsInSeason('season-1')
    expect(mockGet).toHaveBeenLastCalledWith('/v1/league-seasons/{season_id}/teams', {
      params: {
        path: { season_id: 'season-1' },
        query: { page: 1, per_page: 20, include_archived: false },
      },
    })

    await store.fetchTeamsInSeason('season-1', 1, 20, true)
    expect(mockGet).toHaveBeenLastCalledWith('/v1/league-seasons/{season_id}/teams', {
      params: {
        path: { season_id: 'season-1' },
        query: { page: 1, per_page: 20, include_archived: true },
      },
    })
  })
})

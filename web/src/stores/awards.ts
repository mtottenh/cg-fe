import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

type AwardResponse = components['schemas']['AwardResponse']
type AwardTemplateResponse = components['schemas']['AwardTemplateResponse']
type AwardStandingsResponse = components['schemas']['AwardStandingsResponse']
type FinalizedAwardResponse = components['schemas']['FinalizedAwardResponse']
type LeaderboardEntryResponse = components['schemas']['LeaderboardEntryResponse']
type StatCatalogEntryResponse = components['schemas']['StatCatalogEntryResponse']
type PlayerTrophyResponse = components['schemas']['PlayerTrophyResponse']
type PlayerStatsEntryResponse = components['schemas']['PlayerStatsEntryResponse']
type CreateAwardRequest = components['schemas']['CreateAwardRequest']
type UpdateAwardRequest = components['schemas']['UpdateAwardRequest']

/** The two scopes an award can live in. Matches `AwardResponse.scope_type`. */
export type AwardScopeType = 'tournament' | 'league_season'

/** Scope for the combined player-stats leaderboard. */
export type StatsLeaderboardScope = 'tournament' | 'season'

/** Sortable columns for the combined player-stats leaderboard. */
export type StatsLeaderboardSort = 'kills' | 'deaths' | 'assists' | 'total_damage' | 'adr'

export interface StatsLeaderboardOptions {
  sort?: StatsLeaderboardSort
  minRounds?: number
  minDemos?: number
  limit?: number
}

export interface LeaderboardFilters {
  stat_key: string
  aggregation?: string | null
  direction?: string | null
  min_matches?: number | null
  min_rounds?: number | null
  limit?: number | null
}

export const useAwardsStore = defineStore('awards', () => {
  // State
  const templates = ref<AwardTemplateResponse[]>([])
  const statCatalog = ref<StatCatalogEntryResponse[]>([])
  const awards = ref<AwardResponse[]>([])
  /** Standings keyed by award id (for the currently viewed scope). */
  const standings = ref<Record<string, AwardStandingsResponse>>({})
  const trophies = ref<PlayerTrophyResponse[]>([])

  // Per-action states
  const fetchTemplatesState = createActionState()
  const fetchCatalogState = createActionState()
  const fetchAwardsState = createActionState()
  const fetchStandingsState = createActionState()
  const createAwardState = createActionState()
  const updateAwardState = createActionState()
  const voidAwardState = createActionState()
  const finalizeAwardState = createActionState()
  const fetchTrophiesState = createActionState()
  const fetchLeaderboardState = createActionState()
  const fetchStatsLeaderboardState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchTemplatesState, fetchCatalogState, fetchAwardsState, fetchStandingsState,
    createAwardState, updateAwardState, voidAwardState, finalizeAwardState,
    fetchTrophiesState, fetchLeaderboardState, fetchStatsLeaderboardState,
  ])

  async function fetchTemplates(gameIdOrSlug: string): Promise<AwardTemplateResponse[]> {
    return withActionState(fetchTemplatesState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}/award-templates', {
        params: { path: { game_id: gameIdOrSlug } },
      }))
      templates.value = result.data
      return templates.value
    }, 'Failed to fetch award templates')
  }

  async function fetchStatCatalog(gameIdOrSlug: string): Promise<StatCatalogEntryResponse[]> {
    return withActionState(fetchCatalogState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}/stat-catalog', {
        params: { path: { game_id: gameIdOrSlug } },
      }))
      statCatalog.value = result.data
      return statCatalog.value
    }, 'Failed to fetch stat catalog')
  }

  async function fetchAwards(scopeType: AwardScopeType, scopeId: string): Promise<AwardResponse[]> {
    return withActionState(fetchAwardsState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/awards', {
            params: { path: { tournament_id: scopeId } },
          }))
        : await unwrapApi(api.GET('/v1/league-seasons/{season_id}/awards', {
            params: { path: { season_id: scopeId } },
          }))
      awards.value = result.data
      // New scope, new award set — drop standings fetched for the old scope
      // so "for the currently viewed scope" (above) is enforced, not assumed.
      standings.value = {}
      return awards.value
    }, 'Failed to fetch awards')
  }

  async function fetchStandings(
    scopeType: AwardScopeType,
    scopeId: string,
    awardId: string,
    limit?: number,
  ): Promise<AwardStandingsResponse> {
    return withActionState(fetchStandingsState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/awards/{award_id}/standings', {
            params: { path: { tournament_id: scopeId, award_id: awardId }, query: { limit } },
          }))
        : await unwrapApi(api.GET('/v1/league-seasons/{season_id}/awards/{award_id}/standings', {
            params: { path: { season_id: scopeId, award_id: awardId }, query: { limit } },
          }))
      standings.value = { ...standings.value, [awardId]: result.data }
      return result.data
    }, 'Failed to fetch award standings')
  }

  async function createAward(
    scopeType: AwardScopeType,
    scopeId: string,
    request: CreateAwardRequest,
  ): Promise<AwardResponse> {
    return withActionState(createAwardState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/awards', {
            params: { path: { tournament_id: scopeId } },
            body: request,
          }))
        : await unwrapApi(api.POST('/v1/league-seasons/{season_id}/awards', {
            params: { path: { season_id: scopeId } },
            body: request,
          }))
      awards.value = [...awards.value, result.data]
      return result.data
    }, 'Failed to create award')
  }

  async function updateAward(
    scopeType: AwardScopeType,
    scopeId: string,
    awardId: string,
    request: UpdateAwardRequest,
  ): Promise<AwardResponse> {
    return withActionState(updateAwardState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.PATCH('/v1/tournaments/{tournament_id}/awards/{award_id}', {
            params: { path: { tournament_id: scopeId, award_id: awardId } },
            body: request,
          }))
        : await unwrapApi(api.PATCH('/v1/league-seasons/{season_id}/awards/{award_id}', {
            params: { path: { season_id: scopeId, award_id: awardId } },
            body: request,
          }))
      replaceById(awards.value, result.data)
      return result.data
    }, 'Failed to update award')
  }

  async function voidAward(
    scopeType: AwardScopeType,
    scopeId: string,
    awardId: string,
  ): Promise<AwardResponse> {
    return withActionState(voidAwardState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/awards/{award_id}', {
            params: { path: { tournament_id: scopeId, award_id: awardId } },
          }))
        : await unwrapApi(api.DELETE('/v1/league-seasons/{season_id}/awards/{award_id}', {
            params: { path: { season_id: scopeId, award_id: awardId } },
          }))
      replaceById(awards.value, result.data)
      return result.data
    }, 'Failed to void award')
  }

  async function finalizeAward(
    scopeType: AwardScopeType,
    scopeId: string,
    awardId: string,
  ): Promise<FinalizedAwardResponse> {
    return withActionState(finalizeAwardState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/awards/{award_id}/finalize', {
            params: { path: { tournament_id: scopeId, award_id: awardId } },
          }))
        : await unwrapApi(api.POST('/v1/league-seasons/{season_id}/awards/{award_id}/finalize', {
            params: { path: { season_id: scopeId, award_id: awardId } },
          }))
      replaceById(awards.value, result.data.award)
      return result.data
    }, 'Failed to finalize award')
  }

  async function fetchPlayerTrophies(playerId: string): Promise<PlayerTrophyResponse[]> {
    return withActionState(fetchTrophiesState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/{player_id}/awards', {
        params: { path: { player_id: playerId } },
      }))
      trophies.value = result.data
      return trophies.value
    }, 'Failed to fetch player trophies')
  }

  async function fetchLeaderboard(
    scopeType: AwardScopeType,
    scopeId: string,
    filters: LeaderboardFilters,
  ): Promise<LeaderboardEntryResponse[]> {
    return withActionState(fetchLeaderboardState, async () => {
      const result = scopeType === 'tournament'
        ? await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/leaderboards', {
            params: { path: { tournament_id: scopeId }, query: filters },
          }))
        : await unwrapApi(api.GET('/v1/league-seasons/{season_id}/leaderboards', {
            params: { path: { season_id: scopeId }, query: filters },
          }))
      return result.data
    }, 'Failed to fetch leaderboard')
  }

  async function fetchPlayerStatsLeaderboard(
    scope: StatsLeaderboardScope,
    id: string,
    opts: StatsLeaderboardOptions = {},
  ): Promise<PlayerStatsEntryResponse[]> {
    return withActionState(fetchStatsLeaderboardState, async () => {
      const query = {
        sort: opts.sort,
        min_rounds: opts.minRounds,
        min_demos: opts.minDemos,
        limit: opts.limit,
      }
      const result = scope === 'tournament'
        ? await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/stats-leaderboard', {
            params: { path: { tournament_id: id }, query },
          }))
        : await unwrapApi(api.GET('/v1/league-seasons/{season_id}/stats-leaderboard', {
            params: { path: { season_id: id }, query },
          }))
      return result.data
    }, 'Failed to fetch player stats leaderboard')
  }

  function clear() {
    templates.value = []
    statCatalog.value = []
    awards.value = []
    standings.value = {}
    trophies.value = []
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    templates,
    statCatalog,
    awards,
    standings,
    trophies,
    loading,
    error,

    // Per-action states
    fetchTemplatesState,
    fetchCatalogState,
    fetchAwardsState,
    fetchStandingsState,
    createAwardState,
    updateAwardState,
    voidAwardState,
    finalizeAwardState,
    fetchTrophiesState,
    fetchLeaderboardState,
    fetchStatsLeaderboardState,

    // Actions
    fetchTemplates,
    fetchStatCatalog,
    fetchAwards,
    fetchStandings,
    createAward,
    updateAward,
    voidAward,
    finalizeAward,
    fetchPlayerTrophies,
    fetchLeaderboard,
    fetchPlayerStatsLeaderboard,

    // Utility
    clear,
    $reset,
  }
})

export type {
  AwardResponse,
  AwardTemplateResponse,
  AwardStandingsResponse,
  FinalizedAwardResponse,
  LeaderboardEntryResponse,
  StatCatalogEntryResponse,
  PlayerTrophyResponse,
  PlayerStatsEntryResponse,
  CreateAwardRequest,
  UpdateAwardRequest,
}

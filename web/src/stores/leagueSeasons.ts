import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

// Use generated types
type LeagueSeasonResponse = components['schemas']['LeagueSeasonResponse']
type CreateLeagueSeasonRequest = components['schemas']['CreateLeagueSeasonRequest']
type UpdateLeagueSeasonRequest = components['schemas']['UpdateLeagueSeasonRequest']

export const useLeagueSeasonsStore = defineStore('leagueSeasons', () => {
  const seasons = ref<LeagueSeasonResponse[]>([])
  const currentSeason = ref<LeagueSeasonResponse | null>(null)

  // Per-action states
  const fetchSeasonsState = createActionState()
  const fetchSeasonState = createActionState()
  const createSeasonState = createActionState()
  const updateSeasonState = createActionState()

  // Computed aliases for backward compatibility
  const loading = computed(() => fetchSeasonsState.loading)
  const error = computed({
    get: () => fetchSeasonsState.error,
    set: (val: string | null) => { fetchSeasonsState.error = val },
  })

  async function fetchSeasons(leagueId: string): Promise<LeagueSeasonResponse[]> {
    return withActionState(fetchSeasonsState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-seasons', {
        params: { query: { league_id: leagueId } },
      }))
      seasons.value = result.data
      return seasons.value
    }, 'Failed to fetch seasons')
  }

  async function fetchSeason(seasonId: string): Promise<LeagueSeasonResponse> {
    return withActionState(fetchSeasonState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-seasons/{season_id}', {
        params: { path: { season_id: seasonId } },
      }))
      currentSeason.value = result.data
      return currentSeason.value
    }, 'Failed to fetch season')
  }

  async function createSeason(seasonData: CreateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    return withActionState(createSeasonState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-seasons', {
        body: seasonData,
      }))
      const newSeason = result.data
      seasons.value = [...seasons.value, newSeason]
      currentSeason.value = newSeason
      return newSeason
    }, 'Failed to create season')
  }

  async function updateSeason(seasonId: string, seasonData: UpdateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    return withActionState(updateSeasonState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/league-seasons/{season_id}', {
        params: { path: { season_id: seasonId } },
        body: seasonData,
      }))
      const updatedSeason = result.data
      replaceById(seasons.value, updatedSeason)
      currentSeason.value = updatedSeason
      return updatedSeason
    }, 'Failed to update season')
  }

  function clearCurrent() {
    currentSeason.value = null
  }

  function clearSeasons() {
    seasons.value = []
    currentSeason.value = null
  }

  return {
    seasons,
    currentSeason,
    loading,
    error,
    fetchSeasons,
    fetchSeason,
    createSeason,
    updateSeason,
    clearCurrent,
    clearSeasons,
    // Per-action states
    fetchSeasonsState,
    fetchSeasonState,
    createSeasonState,
    updateSeasonState,
  }
})

// Re-export types for convenience
export type { LeagueSeasonResponse, CreateLeagueSeasonRequest, UpdateLeagueSeasonRequest }

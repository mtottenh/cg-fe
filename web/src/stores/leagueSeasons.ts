import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

// Use generated types
type LeagueSeasonResponse = components['schemas']['LeagueSeasonResponse']
type CreateLeagueSeasonRequest = components['schemas']['CreateLeagueSeasonRequest']
type UpdateLeagueSeasonRequest = components['schemas']['UpdateLeagueSeasonRequest']

export const useLeagueSeasonsStore = defineStore('leagueSeasons', () => {
  const seasons = ref<LeagueSeasonResponse[]>([])
  const currentSeason = ref<LeagueSeasonResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Per-action states
  const fetchSeasonsState = createActionState()
  const fetchSeasonState = createActionState()
  const createSeasonState = createActionState()
  const updateSeasonState = createActionState()

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
      const index = seasons.value.findIndex(s => s.id === seasonId)
      if (index !== -1) {
        seasons.value[index] = updatedSeason
      }
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

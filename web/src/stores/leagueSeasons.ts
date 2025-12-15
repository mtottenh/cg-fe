import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type LeagueSeasonResponse = components['schemas']['LeagueSeasonResponse']
type CreateLeagueSeasonRequest = components['schemas']['CreateLeagueSeasonRequest']
type UpdateLeagueSeasonRequest = components['schemas']['UpdateLeagueSeasonRequest']
type ApiErrorResponse = components['schemas']['ApiError']

export const useLeagueSeasonsStore = defineStore('leagueSeasons', () => {
  const seasons = ref<LeagueSeasonResponse[]>([])
  const currentSeason = ref<LeagueSeasonResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSeasons(leagueId: string): Promise<LeagueSeasonResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-seasons', {
        params: { query: { league_id: leagueId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      seasons.value = data!.data
      return seasons.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch seasons'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchSeason(seasonId: string): Promise<LeagueSeasonResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/league-seasons/{season_id}', {
        params: { path: { season_id: seasonId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentSeason.value = data!.data
      return currentSeason.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch season'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createSeason(seasonData: CreateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/league-seasons', {
        body: seasonData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newSeason = data!.data
      seasons.value = [...seasons.value, newSeason]
      currentSeason.value = newSeason
      return newSeason
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create season'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateSeason(seasonId: string, seasonData: UpdateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/league-seasons/{season_id}', {
        params: { path: { season_id: seasonId } },
        body: seasonData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const updatedSeason = data!.data
      // Update in list if present
      const index = seasons.value.findIndex(s => s.id === seasonId)
      if (index !== -1) {
        seasons.value[index] = updatedSeason
      }
      currentSeason.value = updatedSeason
      return updatedSeason
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update season'
      }
      throw e
    } finally {
      loading.value = false
    }
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
  }
})

// Re-export types for convenience
export type { LeagueSeasonResponse, CreateLeagueSeasonRequest, UpdateLeagueSeasonRequest }

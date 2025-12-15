import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type LeagueResponse = components['schemas']['LeagueResponse']
type CreateLeagueRequest = components['schemas']['CreateLeagueRequest']
type UpdateLeagueRequest = components['schemas']['UpdateLeagueRequest']
type UserLeagueMembership = components['schemas']['UserLeagueMembershipResponse']
type PaginationMeta = components['schemas']['PaginationMeta']
type ApiErrorResponse = components['schemas']['ApiError']

export const useLeaguesStore = defineStore('leagues', () => {
  const leagues = ref<LeagueResponse[]>([])
  const currentLeague = ref<LeagueResponse | null>(null)
  const myLeagues = ref<UserLeagueMembership[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  async function fetchLeagues(page = 1, perPage = 20, gameId?: string): Promise<LeagueResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/leagues', {
        params: { query: { page, per_page: perPage, game_id: gameId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      leagues.value = data!.data
      pagination.value = data!.pagination
      return leagues.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch leagues'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchLeague(leagueId: string): Promise<LeagueResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentLeague.value = data!.data
      return currentLeague.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchLeagueBySlug(slug: string): Promise<LeagueResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/leagues/by-slug/{slug}', {
        params: { path: { slug } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentLeague.value = data!.data
      return currentLeague.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createLeague(leagueData: CreateLeagueRequest): Promise<LeagueResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/leagues', {
        body: leagueData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newLeague = data!.data
      leagues.value = [...leagues.value, newLeague]
      currentLeague.value = newLeague
      return newLeague
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateLeague(leagueId: string, leagueData: UpdateLeagueRequest): Promise<LeagueResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
        body: leagueData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const updatedLeague = data!.data
      // Update in list if present
      const index = leagues.value.findIndex(l => l.id === leagueId)
      if (index !== -1) {
        leagues.value[index] = updatedLeague
      }
      currentLeague.value = updatedLeague
      return updatedLeague
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMyLeagues(): Promise<UserLeagueMembership[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/users/me/leagues')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      myLeagues.value = data!
      return myLeagues.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch my leagues'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function joinLeague(leagueId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/leagues/{league_id}/join', {
        params: { path: { league_id: leagueId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Refresh my leagues after joining
      await fetchMyLeagues()
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to join league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function leaveLeague(leagueId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.POST('/v1/leagues/{league_id}/leave', {
        params: { path: { league_id: leagueId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Remove from my leagues
      myLeagues.value = myLeagues.value.filter(m => m.league_id !== leagueId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to leave league'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearCurrent() {
    currentLeague.value = null
  }

  return {
    leagues,
    currentLeague,
    myLeagues,
    loading,
    error,
    pagination,
    fetchLeagues,
    fetchLeague,
    fetchLeagueBySlug,
    createLeague,
    updateLeague,
    fetchMyLeagues,
    joinLeague,
    leaveLeague,
    clearCurrent,
  }
})

// Re-export types for convenience
export type { LeagueResponse, CreateLeagueRequest, UpdateLeagueRequest, UserLeagueMembership }

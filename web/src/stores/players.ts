import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type Player = components['schemas']['PlayerResponse']
type PlayerSearchResult = components['schemas']['PlayerSearchResponse']
type SocialLinks = components['schemas']['SocialLinksResponse']
type UpdateProfileRequest = components['schemas']['UpdatePlayerProfileRequest']
type PaginationMeta = components['schemas']['PaginationMeta']
type ApiErrorResponse = components['schemas']['ApiError']

/**
 * @deprecated The old PlayerTeamMembershipResponse type has been replaced with league team memberships.
 * Use /v1/players/me/league-teams for the current player's league team memberships.
 */
interface PlayerTeam {
  team_id: string
  team_name: string
  team_tag: string
  team_logo_url: string | null
  role: string
  joined_at: string
}

export const usePlayersStore = defineStore('players', () => {
  const players = ref<PlayerSearchResult[]>([])
  const currentPlayer = ref<Player | null>(null)
  const playerTeams = ref<PlayerTeam[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  async function fetchPlayers(page = 1, perPage = 20, search?: string) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players', {
        params: { query: { page, per_page: perPage, search } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      players.value = data!.data
      pagination.value = data!.pagination
      return players.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch players'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchPlayer(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/{player_id}', {
        params: { path: { player_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentPlayer.value = data!.data
      return currentPlayer.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch player'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * @deprecated The old /v1/players/{player_id}/teams endpoint has been removed.
   * Use /v1/players/{player_id}/league-teams for league team memberships instead.
   */
  async function fetchPlayerTeams(_playerId: string): Promise<PlayerTeam[]> {
    console.warn('[DEPRECATED] usePlayersStore.fetchPlayerTeams - Use /v1/players/{player_id}/league-teams instead')
    error.value = 'Player teams are now managed through league teams. Please use the new league team endpoints.'
    return []
  }

  async function fetchMyProfile() {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentPlayer.value = data!.data
      return currentPlayer.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch profile'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateMyProfile(profileData: UpdateProfileRequest) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/players/me', {
        body: profileData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentPlayer.value = data!.data
      return currentPlayer.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update profile'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    players,
    currentPlayer,
    playerTeams,
    loading,
    error,
    pagination,
    fetchPlayers,
    fetchPlayer,
    fetchPlayerTeams,
    fetchMyProfile,
    updateMyProfile,
  }
})

// Re-export types for convenience
export type { Player, PlayerSearchResult, PlayerTeam, SocialLinks, UpdateProfileRequest }

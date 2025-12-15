import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type GameSummary = components['schemas']['GameSummaryResponse']
type GameDetail = components['schemas']['GameDetailResponse']
type ApiErrorResponse = components['schemas']['ApiError']

export const useGamesStore = defineStore('games', () => {
  const games = ref<GameSummary[]>([])
  const currentGame = ref<GameDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchGames(): Promise<GameSummary[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/games')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      games.value = data!.data
      return games.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch games'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchGame(gameId: string): Promise<GameDetail> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/games/{game_id}', {
        params: { path: { game_id: gameId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentGame.value = data!.data
      return currentGame.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch game'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function enableGame(gameId: string): Promise<GameSummary> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/games/{game_id}/enable', {
        params: { path: { game_id: gameId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const result = data!.data
      // Update in list if present
      const index = games.value.findIndex(g => g.id === gameId)
      if (index !== -1) {
        games.value[index] = result
      }
      return result
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to enable game'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function disableGame(gameId: string): Promise<GameSummary> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/games/{game_id}/disable', {
        params: { path: { game_id: gameId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const result = data!.data
      // Update in list if present
      const index = games.value.findIndex(g => g.id === gameId)
      if (index !== -1) {
        games.value[index] = result
      }
      return result
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to disable game'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearCurrent() {
    currentGame.value = null
  }

  return {
    games,
    currentGame,
    loading,
    error,
    fetchGames,
    fetchGame,
    enableGame,
    disableGame,
    clearCurrent,
  }
})

// Re-export types for convenience
export type { GameSummary, GameDetail }

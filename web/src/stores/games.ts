import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

// Use generated types
type GameSummary = components['schemas']['GameSummaryResponse']
type GameDetail = components['schemas']['GameDetailResponse']

export const useGamesStore = defineStore('games', () => {
  const games = ref<GameSummary[]>([])
  const currentGame = ref<GameDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchGamesState = createActionState()
  const fetchGameState = createActionState()
  const enableGameState = createActionState()
  const disableGameState = createActionState()

  async function fetchGames(): Promise<GameSummary[]> {
    return withActionState(fetchGamesState, async () => {
      const result = await unwrapApi(api.GET('/v1/games'))
      games.value = result.data
      return games.value
    }, 'Failed to fetch games')
  }

  async function fetchGame(gameId: string): Promise<GameDetail> {
    return withActionState(fetchGameState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}', {
        params: { path: { game_id: gameId } },
      }))
      currentGame.value = result.data
      return currentGame.value
    }, 'Failed to fetch game')
  }

  async function enableGame(gameId: string): Promise<GameSummary> {
    return withActionState(enableGameState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/enable', {
        params: { path: { game_id: gameId } },
      }))
      const item = result.data
      // Update in list if present
      const index = games.value.findIndex(g => g.id === gameId)
      if (index !== -1) {
        games.value[index] = item
      }
      return item
    }, 'Failed to enable game')
  }

  async function disableGame(gameId: string): Promise<GameSummary> {
    return withActionState(disableGameState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/disable', {
        params: { path: { game_id: gameId } },
      }))
      const item = result.data
      // Update in list if present
      const index = games.value.findIndex(g => g.id === gameId)
      if (index !== -1) {
        games.value[index] = item
      }
      return item
    }, 'Failed to disable game')
  }

  function clearCurrent() {
    currentGame.value = null
  }

  return {
    games,
    currentGame,
    loading,
    error,
    fetchGamesState,
    fetchGameState,
    enableGameState,
    disableGameState,
    fetchGames,
    fetchGame,
    enableGame,
    disableGame,
    clearCurrent,
  }
})

// Re-export types for convenience
export type { GameSummary, GameDetail }
